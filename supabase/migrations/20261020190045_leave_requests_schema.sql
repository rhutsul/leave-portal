-- Схема зрізу WS6: підрозділи, посади, розклади, відповідальні менеджери, заявки й записи відпустки,
-- історія записів, перенесені дні; функція подання заявки; тестові дані за email.
-- План: openspec/changes/impl-leave-ws6/design.md — D2 (модель), D3 (перетини), D4 (зміни лише через функції),
-- D7 (тестові дані). Уся схема — в одній задачі: preview наступних PR бачить лише злиту схему (Risks).
--
-- Правила з 20261012000000_profiles_and_roles.sql: RLS на кожній таблиці, revoke all from anon, authenticated,
-- явні grant, політики `to authenticated` з `(select auth.uid())`, security definer — лише в схемі private
-- з `set search_path = ''`.
-- authenticated має лише SELECT: insert / update / delete — тільки через private-функції (D4), тож працівник
-- не змінить собі статус і не запише чужий рядок напряму.
--
-- Час — календарна дата + хвилини від півночі за Києвом (усі дати й час PM — Europe/Kyiv).
-- Статуси в базі: awaiting / approved / rejected / returned / cancelled («Awaiting decision», «Approved», «Rejected»,
-- «Returned for revision», «Cancelled» в інтерфейсі). Типи: sick / personal / unpaid / family.

-- Exclusion-обмеження з `=` на uuid і bigint потребують btree_gist (D3).
create extension if not exists btree_gist with schema extensions;

-- ── Таблиці ─────────────────────────────────────────────────────────────────

create table public.divisions (
  id   bigint generated always as identity primary key,
  code text not null unique,
  name text not null
);

comment on table public.divisions is 'Підрозділ школи (довідник; керує ним адміністратор у WS10).';

create table public.positions (
  id          bigint generated always as identity primary key,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  division_id bigint not null references public.divisions (id),
  title       text not null,
  kind        text not null,
  constraint positions_kind_check check (kind in ('main', 'additional')),
  constraint positions_employee_division_title_key unique (employee_id, division_id, title)
);

comment on table public.positions is 'Посада працівника: основна (рівно одна) або додаткова, у підрозділі, з власним розкладом.';

-- Не більше однієї основної посади на працівника.
create unique index positions_one_main_per_employee on public.positions (employee_id) where kind = 'main';

create table public.schedule_blocks (
  id          bigint generated always as identity primary key,
  position_id bigint not null references public.positions (id) on delete cascade,
  -- Копія власника посади: потрібна обмеженню нижче; заповнює тригер, а не клієнт.
  employee_id uuid not null references public.profiles (id) on delete cascade,
  weekday     smallint not null,
  start_min   integer not null,
  end_min     integer not null,
  constraint schedule_blocks_weekday_check check (weekday between 1 and 7),
  constraint schedule_blocks_time_check check (
    start_min >= 0 and end_min <= 1440 and start_min < end_min
    and start_min % 5 = 0 and end_min % 5 = 0
  ),
  -- D3: блоки розкладу працівника не перетинаються — ні різних посад, ні однієї посади
  -- (mkozlovskyi-ops/course-staff-management-spec#8). Межі [start, end): блок може починатися там, де закінчився інший.
  constraint schedule_blocks_no_overlap exclude using gist (
    employee_id with =, weekday with =, int4range(start_min, end_min) with &&
  )
);

comment on table public.schedule_blocks is 'Блок тижневого розкладу посади: weekday 1 = понеділок … 7 = неділя, хвилини від півночі.';

create table public.position_managers (
  position_id bigint not null references public.positions (id) on delete cascade,
  manager_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (position_id, manager_id)
);

comment on table public.position_managers is 'Відповідальні менеджери посади: отримують її записи (02-leave-decision).';

create index position_managers_manager_id_idx on public.position_managers (manager_id);

create table public.leave_requests (
  id               bigint generated always as identity primary key,
  employee_id      uuid not null references public.profiles (id) on delete cascade,
  leave_type       text not null,
  relationship     text,
  employee_comment text,
  created_at       timestamptz not null default now(),
  constraint leave_requests_leave_type_check check (leave_type in ('sick', 'personal', 'unpaid', 'family')),
  constraint leave_requests_relationship_check check (
    relationship in ('sibling', 'child', 'parent', 'grandchild', 'grandparent')
  ),
  constraint leave_requests_relationship_family_check check ((leave_type = 'family') = (relationship is not null)),
  constraint leave_requests_comment_length_check check (char_length(employee_comment) <= 500)
);

comment on table public.leave_requests is 'Заявка: одне подання працівника — одна чи кілька дат і посад, один тип відпустки.';

create index leave_requests_employee_id_idx on public.leave_requests (employee_id);

create table public.leave_records (
  id               bigint generated always as identity primary key,
  request_id       bigint not null references public.leave_requests (id) on delete cascade,
  position_id      bigint not null references public.positions (id) on delete cascade,
  employee_id      uuid not null references public.profiles (id) on delete cascade,
  date             date not null,
  start_min        integer not null,
  end_min          integer not null,
  -- Хвилини всередині блоків розкладу (проміжок між блоками не рахується, AC-LEAVE-15).
  minutes          integer not null,
  status           text not null default 'awaiting',
  -- Копії з заявки в кожному записі (D2): менеджер бачить свій запис без доступу до заявки й чужих посад.
  leave_type       text not null,
  relationship     text,
  employee_comment text,
  manager_comment  text,
  paid_days        numeric(4, 2),
  unpaid_days      numeric(4, 2),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint leave_records_status_check check (status in ('awaiting', 'approved', 'rejected', 'returned', 'cancelled')),
  constraint leave_records_leave_type_check check (leave_type in ('sick', 'personal', 'unpaid', 'family')),
  constraint leave_records_relationship_check check (
    relationship in ('sibling', 'child', 'parent', 'grandchild', 'grandparent')
  ),
  constraint leave_records_relationship_family_check check ((leave_type = 'family') = (relationship is not null)),
  constraint leave_records_comment_length_check check (char_length(employee_comment) <= 500),
  constraint leave_records_time_check check (
    start_min >= 0 and end_min <= 1440 and start_min < end_min
    and start_min % 5 = 0 and end_min % 5 = 0
  ),
  constraint leave_records_minutes_check check (minutes > 0 and minutes <= end_min - start_min),
  constraint leave_records_days_check check (paid_days >= 0 and unpaid_days >= 0),
  -- D3: записи однієї посади не перетинаються, поки вони «Awaiting decision», «Returned for revision» чи «Approved»;
  -- «Rejected» і «Cancelled» не блокують (Assumptions 01-leave-request). Тримає навіть одночасні заявки.
  constraint leave_records_no_overlap exclude using gist (
    position_id with =, date with =, int4range(start_min, end_min) with &&
  ) where (status in ('awaiting', 'returned', 'approved'))
);

comment on table public.leave_records is 'Запис відпустки: одна посада на одну дату з годинами; рішення ухвалюють щодо записів.';

create index leave_records_employee_id_date_idx on public.leave_records (employee_id, date);
create index leave_records_request_id_idx on public.leave_records (request_id);

create table public.leave_record_events (
  id         bigint generated always as identity primary key,
  record_id  bigint not null references public.leave_records (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  comment    text,
  created_at timestamptz not null default now(),
  constraint leave_record_events_action_check check (
    action in ('submitted', 'approved', 'rejected', 'returned', 'resubmitted', 'hours_changed', 'cancelled')
  )
);

comment on table public.leave_record_events is 'Історія запису: хто, що і коли зробив (AC-DECIDE-10, AC-DECIDE-15).';

create index leave_record_events_record_id_idx on public.leave_record_events (record_id);

create table public.balance_carryovers (
  employee_id     uuid not null references public.profiles (id) on delete cascade,
  leave_type      text not null,
  -- Рік початку навчального року: 2026 — це 2026–2027 (1 вересня — 31 серпня).
  school_year     smallint not null,
  days            numeric(5, 2) not null,
  primary key (employee_id, leave_type, school_year),
  constraint balance_carryovers_leave_type_check check (leave_type in ('sick', 'personal')),
  constraint balance_carryovers_days_check check (days >= 0)
);

comment on table public.balance_carryovers is 'Перенесені дні на початок першого навчального року (тестові дані, AC-BALANCE-11).';

-- ── employee_id блоку розкладу — завжди власник посади ──────────────────────

create or replace function private.schedule_block_set_employee()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select p.employee_id into new.employee_id from public.positions as p where p.id = new.position_id;
  return new;
end;
$$;

revoke execute on function private.schedule_block_set_employee() from public, anon, authenticated;

create trigger schedule_blocks_set_employee
  before insert or update on public.schedule_blocks
  for each row execute function private.schedule_block_set_employee();

-- ── Хелпери доступу (security definer: читають таблиці в обхід RLS, тож політики не зациклюються, 42P17) ──

create or replace function private.manages_position(p_position_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.position_managers as pm
    where pm.position_id = p_position_id and pm.manager_id = (select auth.uid())
  );
$$;

create or replace function private.owns_position(p_position_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.positions as p
    where p.id = p_position_id and p.employee_id = (select auth.uid())
  );
$$;

-- Менеджер будь-якої посади працівника бачить його повний залишок (AC-BALANCE-20).
create or replace function private.manages_employee(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.positions as p
    join public.position_managers as pm on pm.position_id = p.id
    where p.employee_id = p_employee_id and pm.manager_id = (select auth.uid())
  );
$$;

create or replace function private.can_see_record(p_record_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.leave_records as r
    where r.id = p_record_id
      and (
        r.employee_id = (select auth.uid())
        or private.manages_position(r.position_id)
        or private.current_app_role() = 'admin'
      )
  );
$$;

revoke execute on function private.manages_position(bigint) from public, anon;
revoke execute on function private.owns_position(bigint) from public, anon;
revoke execute on function private.manages_employee(uuid) from public, anon;
revoke execute on function private.can_see_record(bigint) from public, anon;
grant execute on function private.manages_position(bigint) to authenticated;
grant execute on function private.owns_position(bigint) to authenticated;
grant execute on function private.manages_employee(uuid) to authenticated;
grant execute on function private.can_see_record(bigint) to authenticated;

-- ── RLS і права ─────────────────────────────────────────────────────────────

alter table public.divisions enable row level security;
alter table public.positions enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.position_managers enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_records enable row level security;
alter table public.leave_record_events enable row level security;
alter table public.balance_carryovers enable row level security;

revoke all on table
  public.divisions, public.positions, public.schedule_blocks, public.position_managers,
  public.leave_requests, public.leave_records, public.leave_record_events, public.balance_carryovers
  from anon, authenticated;

-- authenticated — лише читання під політиками нижче; запис — лише private-функції (D4).
grant select on table
  public.divisions, public.positions, public.schedule_blocks, public.position_managers,
  public.leave_requests, public.leave_records, public.leave_record_events, public.balance_carryovers
  to authenticated;

-- Серверні скрипти й тестові дані (service_role) — повний доступ.
grant select, insert, update, delete on table
  public.divisions, public.positions, public.schedule_blocks, public.position_managers,
  public.leave_requests, public.leave_records, public.leave_record_events, public.balance_carryovers
  to service_role;

-- Довідник підрозділів бачить кожен, хто увійшов.
create policy divisions_select_signed_in
  on public.divisions for select to authenticated
  using ((select auth.uid()) is not null);

-- Посади й розклад: власні; посади, за які відповідає менеджер; адміністратор — усі.
create policy positions_select_own_managed_or_admin
  on public.positions for select to authenticated
  using (
    employee_id = (select auth.uid())
    or private.manages_position(id)
    or (select private.current_app_role()) = 'admin'
  );

create policy schedule_blocks_select_own_managed_or_admin
  on public.schedule_blocks for select to authenticated
  using (
    employee_id = (select auth.uid())
    or private.manages_position(position_id)
    or (select private.current_app_role()) = 'admin'
  );

-- Менеджер бачить свої призначення; працівник — менеджерів своїх посад.
create policy position_managers_select_own_or_admin
  on public.position_managers for select to authenticated
  using (
    manager_id = (select auth.uid())
    or private.owns_position(position_id)
    or (select private.current_app_role()) = 'admin'
  );

-- Заявки: лише свої (AC-LEAVE-14); менеджеру заявка не потрібна — усе потрібне скопійовано в запис (D2).
create policy leave_requests_select_own_or_admin
  on public.leave_requests for select to authenticated
  using (
    employee_id = (select auth.uid())
    or (select private.current_app_role()) = 'admin'
  );

-- Записи: свої (AC-LEAVE-14); записи посад, за які відповідає менеджер (AC-DECIDE-01); адміністратор — усі.
create policy leave_records_select_own_managed_or_admin
  on public.leave_records for select to authenticated
  using (
    employee_id = (select auth.uid())
    or private.manages_position(position_id)
    or (select private.current_app_role()) = 'admin'
  );

create policy leave_record_events_select_visible_record
  on public.leave_record_events for select to authenticated
  using (private.can_see_record(record_id));

create policy balance_carryovers_select_own_managed_or_admin
  on public.balance_carryovers for select to authenticated
  using (
    employee_id = (select auth.uid())
    or private.manages_employee(employee_id)
    or (select private.current_app_role()) = 'admin'
  );

-- «My requests» (AC-LEAVE-14): лише власні записи — і для менеджера, якому RLS показує ще й записи його посад.
-- security_invoker: view читає таблиці з правами й RLS того, хто запитує.
create view public.my_leave_records
with (security_invoker = true)
as
select
  r.id,
  r.request_id,
  r.date,
  r.start_min,
  r.end_min,
  r.minutes,
  r.status,
  r.leave_type,
  r.relationship,
  r.employee_comment,
  r.manager_comment,
  r.paid_days,
  r.unpaid_days,
  r.created_at,
  p.kind as position_kind,
  p.title as position_title,
  d.name as division_name
from public.leave_records as r
join public.positions as p on p.id = r.position_id
join public.divisions as d on d.id = p.division_id
where r.employee_id = (select auth.uid());

revoke all on table public.my_leave_records from anon, authenticated;
grant select on table public.my_leave_records to authenticated;

-- ── Подання заявки (D4): усе або нічого, одна транзакція ────────────────────

create or replace function private.format_minutes(p_minutes integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select lpad((p_minutes / 60)::text, 2, '0') || ':' || lpad((p_minutes % 60)::text, 2, '0');
$$;

revoke execute on function private.format_minutes(integer) from public, anon;
grant execute on function private.format_minutes(integer) to authenticated;

-- Перевіряє кожен запис за розкладом посади (ті самі правила й тексти PM, що src/lib/leave/time.ts — другий рубіж),
-- створює заявку й усі записи або жоден. Тексти помилок для працівника — errcode P0001; решта — інші коди.
-- p_records: [{"position_id": 1, "date": "2026-11-02", "start_min": 510, "end_min": 930}, …]
create or replace function private.submit_leave_request(
  p_leave_type   text,
  p_records      jsonb,
  p_relationship text default null,
  p_comment      text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_comment    text := nullif(btrim(p_comment), '');
  v_request_id bigint;
  v_item       jsonb;
  v_position   bigint;
  v_date       date;
  v_start      integer;
  v_end        integer;
  v_weekday    smallint;
  v_minutes    integer;
  v_blocks     text;
  v_record_id  bigint;
  v_conflict   record;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if p_leave_type is null or p_leave_type not in ('sick', 'personal', 'unpaid', 'family') then
    raise exception 'Unknown leave type' using errcode = '22023';
  end if;

  if p_leave_type = 'family' then
    if p_relationship is null or p_relationship not in ('sibling', 'child', 'parent', 'grandchild', 'grandparent') then
      raise exception 'State your relationship to this person: sibling, child, parent, grandchild or grandparent. Not applicable to cousins, friends, neighbours or siblings-in-law';
    end if;
  else
    p_relationship := null;
  end if;

  if char_length(v_comment) > 500 then
    raise exception 'The comment can be at most 500 characters';
  end if;

  if p_records is null or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'Choose at least one position';
  end if;

  insert into public.leave_requests (employee_id, leave_type, relationship, employee_comment)
  values (v_uid, p_leave_type, p_relationship, v_comment)
  returning id into v_request_id;

  begin
    for v_item in select value from jsonb_array_elements(p_records) loop
      v_position := (v_item ->> 'position_id')::bigint;
      v_date := (v_item ->> 'date')::date;
      v_start := (v_item ->> 'start_min')::integer;
      v_end := (v_item ->> 'end_min')::integer;
      v_weekday := extract(isodow from v_date)::smallint;

      -- Лише власна посада: заявку від імені іншого працівника цей зріз не дає (WS11).
      if not exists (select 1 from public.positions as p where p.id = v_position and p.employee_id = v_uid) then
        raise exception 'Position not found' using errcode = '42501';
      end if;

      if not exists (
        select 1 from public.schedule_blocks as b where b.position_id = v_position and b.weekday = v_weekday
      ) then
        raise exception 'You have no working hours on this day';
      end if;

      if v_start is null or v_end is null or v_start < 0 or v_end > 1440 or v_start % 5 <> 0 or v_end % 5 <> 0 then
        raise exception 'Enter times in 5-minute steps';
      end if;

      -- Кінець блоку — лише кінець відпустки (AC-LEAVE-08, AC-LEAVE-20), якщо там не починається інший блок.
      if not exists (
        select 1 from public.schedule_blocks as b
        where b.position_id = v_position and b.weekday = v_weekday and v_start >= b.start_min and v_start < b.end_min
      ) and exists (
        select 1 from public.schedule_blocks as b
        where b.position_id = v_position and b.weekday = v_weekday and b.end_min = v_start
      ) then
        raise exception '% is the end of working time and can only be chosen as the end of leave',
          private.format_minutes(v_start);
      end if;

      if v_end <= v_start then
        raise exception 'The end must be later than the start';
      end if;

      -- Початок і кінець — кожен усередині блоку (кінець може збігатися з кінцем блоку), AC-LEAVE-07, AC-LEAVE-19.
      if not exists (
        select 1 from public.schedule_blocks as b
        where b.position_id = v_position and b.weekday = v_weekday and v_start >= b.start_min and v_start < b.end_min
      ) or not exists (
        select 1 from public.schedule_blocks as b
        where b.position_id = v_position and b.weekday = v_weekday and v_end > b.start_min and v_end <= b.end_min
      ) then
        select string_agg(private.format_minutes(b.start_min) || '–' || private.format_minutes(b.end_min), ', '
                          order by b.start_min)
          into v_blocks
          from public.schedule_blocks as b
         where b.position_id = v_position and b.weekday = v_weekday;
        raise exception 'Hours must be within your schedule: %', v_blocks;
      end if;

      -- Лише хвилини всередині блоків (AC-LEAVE-15).
      select sum(greatest(0, least(v_end, b.end_min) - greatest(v_start, b.start_min)))
        into v_minutes
        from public.schedule_blocks as b
       where b.position_id = v_position and b.weekday = v_weekday;

      insert into public.leave_records (
        request_id, position_id, employee_id, date, start_min, end_min, minutes,
        leave_type, relationship, employee_comment
      )
      values (
        v_request_id, v_position, v_uid, v_date, v_start, v_end, v_minutes,
        p_leave_type, p_relationship, v_comment
      )
      returning id into v_record_id;

      insert into public.leave_record_events (record_id, actor_id, action) values (v_record_id, v_uid, 'submitted');
    end loop;
  exception
    when exclusion_violation then
      -- Записи цієї заявки вже відкочено: шукаємо перший наявний запис, з яким вона перетинається
      -- (AC-LEAVE-13, AC-LEAVE-16).
      select r.date, r.start_min, r.end_min
        into v_conflict
        from public.leave_records as r
        join jsonb_array_elements(p_records) as x (item)
          on r.position_id = (x.item ->> 'position_id')::bigint
         and r.date = (x.item ->> 'date')::date
         and int4range(r.start_min, r.end_min)
             && int4range((x.item ->> 'start_min')::integer, (x.item ->> 'end_min')::integer)
       where r.status in ('awaiting', 'returned', 'approved')
       order by r.date, r.start_min
       limit 1;
      if found then
        raise exception 'You already have a request for this time: % %–%',
          to_char(v_conflict.date, 'YYYY-MM-DD'),
          private.format_minutes(v_conflict.start_min),
          private.format_minutes(v_conflict.end_min);
      end if;
      raise exception 'Records of this request overlap each other' using errcode = '23P01';
  end;

  return v_request_id;
end;
$$;

revoke execute on function private.submit_leave_request(text, jsonb, text, text) from public, anon;
grant execute on function private.submit_leave_request(text, jsonb, text, text) to authenticated;

-- Точка входу для supabase.rpc: security invoker, лише передає параметри (D4).
create or replace function public.submit_leave_request(
  p_leave_type   text,
  p_records      jsonb,
  p_relationship text default null,
  p_comment      text default null
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.submit_leave_request(p_leave_type, p_records, p_relationship, p_comment);
$$;

revoke execute on function public.submit_leave_request(text, jsonb, text, text) from public, anon;
grant execute on function public.submit_leave_request(text, jsonb, text, text) to authenticated;

-- ── Тестові дані за email (D7) ──────────────────────────────────────────────
-- Користувачів створює npm run users:demo після db-deploy, тож посади не можна вставити напряму: призначення
-- лежать у private.test_* і застосовуються до наявних профілів зараз і до кожного нового профілю тригером.
-- Порядок «міграція → users:demo» чи навпаки на результат не впливає; вставки — on conflict do nothing.
-- Розклади одного працівника не перетинаються (mkozlovskyi-ops/course-staff-management-spec#8). Лише *@example.test.

insert into public.divisions (code, name)
values
  ('elementary', 'Elementary school'),
  ('high', 'High school'),
  ('administration', 'Administration')
on conflict (code) do nothing;

create table private.test_positions (
  email         text not null,
  division_code text not null,
  title         text not null,
  kind          text not null,
  primary key (email, division_code, title)
);

create table private.test_schedule_blocks (
  email         text not null,
  division_code text not null,
  title         text not null,
  weekday       smallint not null,
  start_min     integer not null,
  end_min       integer not null,
  primary key (email, division_code, title, weekday, start_min)
);

create table private.test_position_managers (
  email         text not null,
  division_code text not null,
  title         text not null,
  manager_email text not null,
  primary key (email, division_code, title, manager_email)
);

revoke all on table private.test_positions, private.test_schedule_blocks, private.test_position_managers
  from public, anon, authenticated;

insert into private.test_positions (email, division_code, title, kind)
values
  -- AC-LEAVE-01…05, AC-DECIDE-01, AC-BALANCE-20: основна (manager1@) і додаткова (manager2@) посади.
  ('teacher1@example.test', 'elementary', 'Teacher', 'main'),
  ('teacher1@example.test', 'high', 'Math teacher', 'additional'),
  -- AC-LEAVE-15, AC-LEAVE-19, AC-LEAVE-20: у вівторок два блоки з перервою 12:00–12:30.
  ('teacher2@example.test', 'high', 'Teacher', 'main'),
  -- Менеджери й адміністратор — теж працівники зі своїми посадами (матриця прав requirements/product.md).
  ('manager1@example.test', 'elementary', 'Head of elementary school', 'main'),
  ('manager2@example.test', 'high', 'Head of high school', 'main'),
  ('admin@example.test', 'administration', 'School administrator', 'main');

-- Хвилини від півночі: 08:30 = 510, 09:00 = 540, 12:00 = 720, 12:30 = 750, 15:30 = 930, 15:45 = 945, 17:00 = 1020.
insert into private.test_schedule_blocks (email, division_code, title, weekday, start_min, end_min)
select e.email, e.division_code, e.title, d.weekday, e.start_min, e.end_min
from (
  values
    ('teacher1@example.test', 'elementary', 'Teacher', 510, 930),
    ('manager1@example.test', 'elementary', 'Head of elementary school', 510, 930),
    ('manager2@example.test', 'high', 'Head of high school', 510, 930),
    ('admin@example.test', 'administration', 'School administrator', 540, 1020)
) as e (email, division_code, title, start_min, end_min)
cross join generate_series(1, 5) as d (weekday);

insert into private.test_schedule_blocks (email, division_code, title, weekday, start_min, end_min)
values
  ('teacher1@example.test', 'high', 'Math teacher', 1, 945, 1020),
  ('teacher2@example.test', 'high', 'Teacher', 1, 510, 930),
  ('teacher2@example.test', 'high', 'Teacher', 2, 510, 720),
  ('teacher2@example.test', 'high', 'Teacher', 2, 750, 930),
  ('teacher2@example.test', 'high', 'Teacher', 3, 510, 930),
  ('teacher2@example.test', 'high', 'Teacher', 4, 510, 930),
  ('teacher2@example.test', 'high', 'Teacher', 5, 510, 930);

insert into private.test_position_managers (email, division_code, title, manager_email)
values
  ('teacher1@example.test', 'elementary', 'Teacher', 'manager1@example.test'),
  ('teacher1@example.test', 'high', 'Math teacher', 'manager2@example.test'),
  ('teacher2@example.test', 'high', 'Teacher', 'manager2@example.test'),
  -- AC-DECIDE-18: manager1@ відповідає і за власну основну посаду; свій запис вирішує адміністратор.
  ('manager1@example.test', 'elementary', 'Head of elementary school', 'manager1@example.test'),
  ('manager2@example.test', 'high', 'Head of high school', 'manager2@example.test');

create or replace function private.apply_test_assignments()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.positions (employee_id, division_id, title, kind)
  select pr.id, d.id, t.title, t.kind
  from private.test_positions as t
  join public.profiles as pr on lower(pr.email) = lower(t.email)
  join public.divisions as d on d.code = t.division_code
  on conflict do nothing;

  insert into public.schedule_blocks (position_id, employee_id, weekday, start_min, end_min)
  select p.id, p.employee_id, b.weekday, b.start_min, b.end_min
  from private.test_schedule_blocks as b
  join public.profiles as pr on lower(pr.email) = lower(b.email)
  join public.divisions as d on d.code = b.division_code
  join public.positions as p on p.employee_id = pr.id and p.division_id = d.id and p.title = b.title
  where not exists (
    select 1 from public.schedule_blocks as s
    where s.position_id = p.id and s.weekday = b.weekday and s.start_min = b.start_min and s.end_min = b.end_min
  );

  insert into public.position_managers (position_id, manager_id)
  select p.id, m.id
  from private.test_position_managers as t
  join public.profiles as pr on lower(pr.email) = lower(t.email)
  join public.divisions as d on d.code = t.division_code
  join public.positions as p on p.employee_id = pr.id and p.division_id = d.id and p.title = t.title
  join public.profiles as m on lower(m.email) = lower(t.manager_email)
  on conflict do nothing;
end;
$$;

revoke execute on function private.apply_test_assignments() from public, anon, authenticated;

create or replace function private.on_profile_created_apply_test_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.apply_test_assignments();
  return null;
end;
$$;

revoke execute on function private.on_profile_created_apply_test_assignments() from public, anon, authenticated;

create trigger on_profile_created_apply_test_assignments
  after insert on public.profiles
  for each row execute function private.on_profile_created_apply_test_assignments();

-- Профілі, які вже є (користувачі з попередніх users:demo).
select private.apply_test_assignments();
