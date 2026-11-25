-- Заміни для записів і позначка підвищення (вимога PM requirements/06-substitutes.md, AC-SUBST-01…15;
-- план openspec/changes/impl-substitutes/design.md, D1–D6, D9, D11).
--
-- Що додає:
--   * D1: таблиця public.substitute_lists — список замін працівника; змінює лише менеджер будь-якої посади працівника
--     або адміністратор (private.can_manage_substitutes), і на сторінках, і напряму (AC-SUBST-12, AC-SUBST-13).
--   * D2: колонки leave_records.substitute_id і upgrade_minutes; пишуть їх лише функції нижче.
--   * D3: private.upgrade_applies — посада запису містить «teacher», основна посада заміни — «Assistant».
--   * D4: private.substitute_conflict — заміна зайнята, коли хоча б одна хвилина запису (лише всередині блоків
--     розкладу посади, AC-LEAVE-15) перетинається з хвилинами її власного запису чи запису, де вона вже заміна, зі
--     статусом «Awaiting decision», «Returned for revision» чи «Approved» (той самий список, що leave_records_no_overlap).
--   * D5: нові тіла private.submit_leave_request і private.update_leave_record_hours — сигнатури ті самі (заміна —
--     необов'язковий ключ substitute_id у елементі p_records), тож expand → contract не потрібен.
--   * D6: функції читання з мінімумом полів (my_substitute_options, record_substitutes, my_substitutions,
--     manageable_employees, substitute_list, substitute_candidates).
--   * D9: тестові assistant1@ і teacher3@.
--
-- Права: security definer — лише в схемі private з `set search_path = ''`; public-обгортки — security invoker;
-- revoke від public і anon, grant execute лише authenticated. Тексти для людини — P0001, відмова в доступі — 42501.
--
-- Порядок викатки (D11): міграція лише додає таблицю, колонки, обмеження й функції та замінює тіла двох функцій без
-- зміни сигнатур; жоден наявний view і тип результату RPC не змінюється. Код, що вийде раніше за db-deploy, не
-- показує вибору заміни (my_substitute_options ще немає), тож старе тіло submit_leave_request нічого не загубить.

-- ── D9. Тестові дані: асистент і третій вчитель ─────────────────────────────
-- Хвилини від півночі: 08:30 = 510, 15:30 = 930. Відповідального менеджера посад немає (їхні записи вирішує
-- адміністратор): так дані інших AC (AC-BALANCE-12, AC-BALANCE-20 — хто кого бачить) лишаються такими, як у PM.
insert into private.test_positions (email, division_code, title, kind)
values
  ('assistant1@example.test', 'elementary', 'Assistant', 'main'),
  ('teacher3@example.test', 'elementary', 'Teacher', 'main');

insert into private.test_schedule_blocks (email, division_code, title, weekday, start_min, end_min)
select e.email, 'elementary', e.title, d.weekday, 510, 930
from (values ('assistant1@example.test', 'Assistant'), ('teacher3@example.test', 'Teacher')) as e (email, title)
cross join generate_series(1, 5) as d (weekday);

-- Профілі, які вже є (користувачі з попередніх users:demo).
select private.apply_test_assignments();

-- ── D1. Право вести список замін ────────────────────────────────────────────
-- Адміністратор — будь-який працівник; менеджер — працівник будь-якої з посад, за які він відповідає (матриця прав
-- requirements/product.md, «Maintain an employee's substitute list»). Роль — з profiles; без профілю — жодного права.
create function private.can_manage_substitutes(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case coalesce(private.current_app_role(), '')
           when 'admin' then true
           when 'manager' then private.manages_employee(p_employee_id)
           else false
         end;
$$;

revoke execute on function private.can_manage_substitutes(uuid) from public, anon;
grant execute on function private.can_manage_substitutes(uuid) to authenticated;

-- ── D1. Список замін ────────────────────────────────────────────────────────
create table public.substitute_lists (
  employee_id   uuid not null references public.profiles (id) on delete cascade,
  substitute_id uuid not null references public.profiles (id) on delete cascade,
  added_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (employee_id, substitute_id),
  -- «An employee cannot be on their own list» (Assumptions 06).
  constraint substitute_lists_not_self_check check (substitute_id <> employee_id)
);

comment on table public.substitute_lists is
  'Список замін працівника (06-substitutes): з нього працівник вибирає заміну для запису; веде менеджер посади чи адміністратор.';

create index substitute_lists_substitute_id_idx on public.substitute_lists (substitute_id);

alter table public.substitute_lists enable row level security;

revoke all on table public.substitute_lists from anon, authenticated;
-- Рядок лише додають чи прибирають: update немає ні в гранті, ні в політиці; added_by ставить default.
grant select, delete on table public.substitute_lists to authenticated;
grant insert (employee_id, substitute_id) on table public.substitute_lists to authenticated;
grant select, insert, update, delete on table public.substitute_lists to service_role;

create policy substitute_lists_select_own_managed_or_admin
  on public.substitute_lists for select to authenticated
  using (employee_id = (select auth.uid()) or private.can_manage_substitutes(employee_id));

create policy substitute_lists_insert_manager_or_admin
  on public.substitute_lists for insert to authenticated
  with check (added_by = (select auth.uid()) and private.can_manage_substitutes(employee_id));

create policy substitute_lists_delete_manager_or_admin
  on public.substitute_lists for delete to authenticated
  using ((select auth.uid()) is not null and private.can_manage_substitutes(employee_id));

-- ── D2. Заміна й підвищення запису ──────────────────────────────────────────
-- substitute_id без on delete: людину, що замінює в записах, не видаляють, а деактивують (вимога 07); запис зберігає
-- заміну й після прибирання людини зі списку (Assumptions 06).
alter table public.leave_records
  add column substitute_id uuid references public.profiles (id),
  add column upgrade_minutes integer,
  add constraint leave_records_substitute_not_self_check check (substitute_id is distinct from employee_id),
  -- «The minutes are the record's minutes inside the schedule, the same as its duration» (Assumptions 06).
  add constraint leave_records_upgrade_minutes_check
    check (upgrade_minutes is null or (substitute_id is not null and upgrade_minutes = minutes));

comment on column public.leave_records.substitute_id is 'Заміна запису (06-substitutes); null — «No substitute».';
comment on column public.leave_records.upgrade_minutes is
  'Хвилини позначки «With upgrade» (асистент замінює вчителя); null — позначки немає.';

create index leave_records_substitute_date_idx on public.leave_records (substitute_id, date)
  where substitute_id is not null;

-- ── D3. Правило підвищення ──────────────────────────────────────────────────
-- Посада запису має назву з «teacher» (будь-який регістр, «Math teacher» теж), а основна посада заміни — «Assistant»
-- (точний збіг без урахування регістру й крайових пробілів). Те саме правило — upgradeApplies у
-- src/lib/leave/substitutes.ts. Внутрішня: викликають лише security definer функції.
create function private.upgrade_applies(p_position_id bigint, p_substitute_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
           select 1 from public.positions as p
           where p.id = p_position_id and strpos(lower(p.title), 'teacher') > 0
         )
     and exists (
           select 1 from public.positions as s
           where s.employee_id = p_substitute_id and s.kind = 'main' and lower(btrim(s.title)) = 'assistant'
         );
$$;

revoke execute on function private.upgrade_applies(bigint, uuid) from public, anon, authenticated;

-- ── D4. Зайнятість заміни ───────────────────────────────────────────────────
-- Хвилини запису — лише всередині блоків розкладу посади на цей день тижня: перерва між блоками до запису не входить
-- (AC-LEAVE-15, AC-LEAVE-22). Відрізки [start, end). Якщо на цей день у посади блоків немає (розклад змінено після
-- запису), — весь проміжок запису: краще вважати людину зайнятою, ніж загубити запис.
create function private.record_minute_ranges(p_position_id bigint, p_date date, p_start integer, p_end integer)
returns setof int4range
language sql
stable
set search_path = ''
as $$
  with blocks as (
    select int4range(p_start, p_end) * int4range(b.start_min, b.end_min) as span
    from public.schedule_blocks as b
    where b.position_id = p_position_id and b.weekday = extract(isodow from p_date)
  )
  select span from blocks where not isempty(span)
  union all
  select int4range(p_start, p_end) where not exists (select 1 from blocks where not isempty(span));
$$;

revoke execute on function private.record_minute_ranges(bigint, date, integer, integer) from public, anon, authenticated;

-- Перший за часом запис дати, що займає людину в хвилини нового запису (AC-SUBST-05, AC-SUBST-06): її власний запис
-- будь-якої посади або запис, де вона вже заміна. Статуси — той самий явний список, що leave_records_no_overlap
-- (BLOCKING_STATUSES): «Rejected» і «Cancelled» не займають (AC-SUBST-07). p_exclude_record — сам запис, якому
-- змінюють години (його не порівнюємо з собою).
create function private.substitute_conflict(
  p_person         uuid,
  p_position_id    bigint,
  p_date           date,
  p_start          integer,
  p_end            integer,
  p_exclude_record bigint default null
)
returns table (date date, start_min integer, end_min integer)
language sql
stable
set search_path = ''
as $$
  select r.date, r.start_min, r.end_min
  from public.leave_records as r
  where r.date = p_date
    and (r.employee_id = p_person or r.substitute_id = p_person)
    and r.status in ('awaiting', 'returned', 'approved')
    and r.id is distinct from p_exclude_record
    and int4range(r.start_min, r.end_min) && int4range(p_start, p_end)
    and exists (
      select 1
      from private.record_minute_ranges(p_position_id, p_date, p_start, p_end) as mine (span)
      join private.record_minute_ranges(r.position_id, r.date, r.start_min, r.end_min) as theirs (span)
        on mine.span && theirs.span
    )
  order by r.start_min, r.end_min, r.id
  limit 1;
$$;

revoke execute on function private.substitute_conflict(uuid, bigint, date, integer, integer, bigint)
  from public, anon, authenticated;

-- Lock зайнятості людини (D4): одночасні заявки з тією самою заміною і власна заявка заміни не проскочать одна повз
-- одну. Ключ із префіксом busy: — не той, що lock працівника hashtextextended(uid::text, 0); береться останнім, у
-- порядку зростання uuid.
create function private.lock_busy(p_people uuid[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_person uuid;
begin
  for v_person in select distinct x from unnest(p_people) as x where x is not null order by x loop
    perform pg_advisory_xact_lock(hashtextextended('busy:' || v_person::text, 0));
  end loop;
end;
$$;

revoke execute on function private.lock_busy(uuid[]) from public, anon, authenticated;

-- Текст відмови: "<email заміни> is not available at this time: <дата> <години першого такого запису>".
create function private.substitute_busy_message(p_person uuid, p_date date, p_start integer, p_end integer)
returns text
language sql
stable
set search_path = ''
as $$
  select (select p.email from public.profiles as p where p.id = p_person)
    || ' is not available at this time: ' || to_char(p_date, 'YYYY-MM-DD') || ' '
    || private.format_minutes(p_start) || '–' || private.format_minutes(p_end);
$$;

revoke execute on function private.substitute_busy_message(uuid, date, integer, integer) from public, anon, authenticated;

-- ── D5. Подання заявки з заміною ────────────────────────────────────────────
-- Нова версія (20261113145925_school_calendar_clarifications.sql). Нове: lock зайнятості, перевірка, що заміна є в
-- списку працівника, перевірка зайнятості й позначка підвищення. Решта — без змін.
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
  v_minutes    integer;
  v_record_id  bigint;
  v_accepted   integer := 0;
  v_conflict   record;
  v_closed     text;
  v_substitute uuid;
  v_upgrade    integer;
  v_busy       record;
  -- Чому не прийнято найранішу відкинуту дату: текст для заявки, у якій не прийнято жодної.
  v_skip_date  date;
  v_skip_text  text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- Спільний lock календаря (ексклюзивно його бере private.add_school_closure): заявки одна одну не чекають, а нове
  -- закриття не проскочить повз запис, поданий у ту саму мить (design.md D2, D4).
  perform pg_advisory_xact_lock_shared(private.calendar_lock_key());

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

  -- D4: lock зайнятості — на себе (хтось може саме вибирати мене заміною) і на всіх вибраних замін.
  perform private.lock_busy(
    array[v_uid] || array(
      select nullif(x.item ->> 'substitute_id', '')::uuid from jsonb_array_elements(p_records) as x (item)
    )
  );

  insert into public.leave_requests (employee_id, leave_type, relationship, employee_comment)
  values (v_uid, p_leave_type, p_relationship, v_comment)
  returning id into v_request_id;

  begin
    for v_item in select value from jsonb_array_elements(p_records) loop
      v_position := (v_item ->> 'position_id')::bigint;
      v_date := (v_item ->> 'date')::date;
      v_start := (v_item ->> 'start_min')::integer;
      v_end := (v_item ->> 'end_min')::integer;
      v_substitute := nullif(v_item ->> 'substitute_id', '')::uuid;

      -- Лише власна посада: заявку від імені іншого працівника цей зріз не дає (WS11).
      if not exists (select 1 from public.positions as p where p.id = v_position and p.employee_id = v_uid) then
        raise exception 'Position not found' using errcode = '42501';
      end if;

      -- AC-CAL-03, AC-CAL-16: закрита для працівника дата не приймається, як і дата без робочих годин (AC-LEAVE-21):
      -- інші дати заявки лишаються. working_minutes уже враховує закриття (20261108143021_school_calendar.sql).
      v_closed := case when v_date is null then null else private.closed_day_name(v_uid, v_date) end;
      if v_closed is not null or (v_date is not null and private.working_minutes(v_uid, v_date) = 0) then
        if v_skip_date is null or v_date < v_skip_date then
          v_skip_date := v_date;
          v_skip_text := case when v_closed is not null
                              then 'The school is closed on this day: ' || v_closed
                              else 'You have no working hours on this day' end;
        end if;
        continue;
      end if;

      v_minutes := private.check_record_hours(v_position, v_date, v_start, v_end);

      -- AC-SUBST-04: лише людина зі списку замін працівника; AC-SUBST-05, AC-SUBST-06: зайнята заміна — відмова
      -- всієї заявки; AC-SUBST-08, AC-SUBST-09: позначка підвищення — хвилини запису.
      v_upgrade := null;
      if v_substitute is not null then
        if not exists (
          select 1 from public.substitute_lists as s where s.employee_id = v_uid and s.substitute_id = v_substitute
        ) then
          raise exception 'This substitute is no longer on your substitute list';
        end if;
        select c.date, c.start_min, c.end_min
          into v_busy
          from private.substitute_conflict(v_substitute, v_position, v_date, v_start, v_end) as c;
        if found then
          raise exception '%', private.substitute_busy_message(v_substitute, v_busy.date, v_busy.start_min, v_busy.end_min);
        end if;
        if private.upgrade_applies(v_position, v_substitute) then
          v_upgrade := v_minutes;
        end if;
      end if;

      insert into public.leave_records (
        request_id, position_id, employee_id, date, start_min, end_min, minutes,
        leave_type, relationship, employee_comment, substitute_id, upgrade_minutes
      )
      values (
        v_request_id, v_position, v_uid, v_date, v_start, v_end, v_minutes,
        p_leave_type, p_relationship, v_comment, v_substitute, v_upgrade
      )
      returning id into v_record_id;
      v_accepted := v_accepted + 1;

      insert into public.leave_record_events (record_id, actor_id, action) values (v_record_id, v_uid, 'submitted');
    end loop;
  exception
    when exclusion_violation then
      -- Записи цієї заявки вже відкочено: шукаємо перший наявний запис, з яким вона перетинається
      -- (AC-LEAVE-13, AC-LEAVE-16). Лише власні записи: інакше текст помилки розкрив би чужий запис.
      select r.date, r.start_min, r.end_min
        into v_conflict
        from public.leave_records as r
        join jsonb_array_elements(p_records) as x (item)
          on r.position_id = (x.item ->> 'position_id')::bigint
         and r.date = (x.item ->> 'date')::date
         and int4range(r.start_min, r.end_min)
             && int4range((x.item ->> 'start_min')::integer, (x.item ->> 'end_min')::integer)
       where r.employee_id = v_uid
         and r.status in ('awaiting', 'returned', 'approved')
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

  -- Жодної прийнятої дати — заявки немає (виняток відкочує й рядок leave_requests).
  if v_accepted = 0 then
    raise exception '%', coalesce(v_skip_text, 'You have no working hours on this day');
  end if;

  return v_request_id;
end;
$$;

-- ── D5. Зміна годин запису із заміною ───────────────────────────────────────
-- Нова версія (20261108165906_school_calendar_requests.sql). Нове: якщо в запису є заміна, нові години перевіряються
-- на її зайнятість (сам запис не рахується), а позначка підвищення отримує нові хвилини (обмеження
-- leave_records_upgrade_minutes_check). Решта — без змін.
create or replace function private.update_leave_record_hours(p_record_id bigint, p_start_min integer, p_end_min integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.leave_records%rowtype;
  v_minutes integer;
  v_conflict record;
  v_busy record;
begin
  if (select auth.uid()) is not null then
    perform pg_advisory_xact_lock(hashtextextended((select auth.uid())::text, 0));
  end if;
  -- Після lock працівника — спільний lock календаря (design.md D2): нові години не проскочать повз нове закриття.
  perform pg_advisory_xact_lock_shared(private.calendar_lock_key());
  v_record := private.own_record_for_change(p_record_id);
  if v_record.status not in ('awaiting', 'returned') then
    raise exception '%', private.locked_record_message(v_record.status);
  end if;

  v_minutes := private.check_record_hours(v_record.position_id, v_record.date, p_start_min, p_end_min);
  if p_start_min = v_record.start_min and p_end_min = v_record.end_min then
    return;
  end if;

  -- D4, D5: заміна має бути вільна й у нові години (AC-SUBST-05, AC-SUBST-06); lock — останнім.
  if v_record.substitute_id is not null then
    perform private.lock_busy(array[v_record.employee_id, v_record.substitute_id]);
    select c.date, c.start_min, c.end_min
      into v_busy
      from private.substitute_conflict(
        v_record.substitute_id, v_record.position_id, v_record.date, p_start_min, p_end_min, p_record_id
      ) as c;
    if found then
      raise exception '%', private.substitute_busy_message(
        v_record.substitute_id, v_busy.date, v_busy.start_min, v_busy.end_min
      );
    end if;
  end if;

  begin
    update public.leave_records as r
       set start_min = p_start_min, end_min = p_end_min, minutes = v_minutes,
           upgrade_minutes = case when r.upgrade_minutes is not null then v_minutes end,
           updated_at = now()
     where r.id = p_record_id;
  exception
    when exclusion_violation then
      select r.date, r.start_min, r.end_min
        into v_conflict
        from public.leave_records as r
       where r.employee_id = v_record.employee_id
         and r.position_id = v_record.position_id
         and r.date = v_record.date
         and r.id <> p_record_id
         and r.status in ('awaiting', 'returned', 'approved')
         and int4range(r.start_min, r.end_min) && int4range(p_start_min, p_end_min)
       order by r.start_min
       limit 1;
      if found then
        raise exception 'You already have a request for this time: % %–%',
          to_char(v_conflict.date, 'YYYY-MM-DD'),
          private.format_minutes(v_conflict.start_min),
          private.format_minutes(v_conflict.end_min);
      end if;
      raise;
  end;

  -- Історія: попередні й нові години (менеджер бачить, що змінилось).
  insert into public.leave_record_events (record_id, actor_id, action, comment)
  values (
    p_record_id, v_record.employee_id, 'hours_changed',
    private.format_minutes(v_record.start_min) || '–' || private.format_minutes(v_record.end_min) || ' → '
      || private.format_minutes(p_start_min) || '–' || private.format_minutes(p_end_min)
  );
end;
$$;

-- ── D6. Читання для сторінок ────────────────────────────────────────────────
-- Профілі інших людей authenticated не читає (profiles_select_own_or_admin), а записи — лише свої й своїх посад. Тому
-- кожна сторінка отримує лише потрібні поля через функцію, а не ширшу політику.

-- Власний список замін — вибір у формі нової заявки (AC-SUBST-04, AC-SUBST-11).
create function private.my_substitute_options()
returns table (substitute_id uuid, email text, main_title text, division_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.substitute_id, p.email, mp.title, d.name
  from public.substitute_lists as s
  join public.profiles as p on p.id = s.substitute_id
  left join public.positions as mp on mp.employee_id = s.substitute_id and mp.kind = 'main'
  left join public.divisions as d on d.id = mp.division_id
  where s.employee_id = (select auth.uid())
  order by p.email;
$$;

-- Заміна й позначка записів, які користувач і так бачить: власник, менеджер посади, адміністратор
-- (AC-SUBST-02, AC-SUBST-03, AC-SUBST-08, AC-SUBST-09).
create function private.record_substitutes(p_record_ids bigint[])
returns table (record_id bigint, substitute_email text, upgrade_minutes integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, p.email, r.upgrade_minutes
  from public.leave_records as r
  join public.profiles as p on p.id = r.substitute_id
  where r.id = any (p_record_ids)
    and (select auth.uid()) is not null
    and private.can_see_record(r.id)
  order by r.id;
$$;

-- «My substitutions» (AC-SUBST-10, AC-SUBST-15): записи, де користувач — заміна, у статусах, що займають заміну.
-- Без типу відсутності й коментарів: заміні вони не потрібні (тип може бути «Sick leave»).
create function private.my_substitutions()
returns table (
  record_id bigint, date date, start_min integer, end_min integer, status text, employee_email text,
  upgrade_minutes integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.date, r.start_min, r.end_min, r.status, p.email, r.upgrade_minutes
  from public.leave_records as r
  join public.profiles as p on p.id = r.employee_id
  where r.substitute_id = (select auth.uid())
    and r.status in ('awaiting', 'returned', 'approved')
  order by r.date, r.start_min, r.id;
$$;

-- Працівники, чий список користувач може вести: адміністратор — усі, менеджер — працівники його посад.
create function private.manageable_employees()
returns table (employee_id uuid, email text, main_title text, division_name text, substitute_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.email, mp.title, d.name,
         (select count(*)::integer from public.substitute_lists as s where s.employee_id = p.id)
  from public.profiles as p
  left join public.positions as mp on mp.employee_id = p.id and mp.kind = 'main'
  left join public.divisions as d on d.id = mp.division_id
  where (select auth.uid()) is not null and private.can_manage_substitutes(p.id)
  order by p.email;
$$;

-- Список замін працівника для редактора (AC-SUBST-01); без права — 42501 з текстом AC-SUBST-12.
create function private.substitute_list(p_employee_id uuid)
returns table (substitute_id uuid, email text, main_title text, division_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.can_manage_substitutes(p_employee_id) then
    raise exception 'Only the manager of this employee''s position can change the substitute list' using errcode = '42501';
  end if;
  return query
    select s.substitute_id, p.email, mp.title, d.name
    from public.substitute_lists as s
    join public.profiles as p on p.id = s.substitute_id
    left join public.positions as mp on mp.employee_id = s.substitute_id and mp.kind = 'main'
    left join public.divisions as d on d.id = mp.division_id
    where s.employee_id = p_employee_id
    order by p.email;
end;
$$;

-- Кого можна додати: усі профілі, крім самого працівника і тих, хто вже в списку. Деактивованих (вимога 07) ще немає.
create function private.substitute_candidates(p_employee_id uuid)
returns table (profile_id uuid, email text, main_title text, division_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.can_manage_substitutes(p_employee_id) then
    raise exception 'Only the manager of this employee''s position can change the substitute list' using errcode = '42501';
  end if;
  return query
    select p.id, p.email, mp.title, d.name
    from public.profiles as p
    left join public.positions as mp on mp.employee_id = p.id and mp.kind = 'main'
    left join public.divisions as d on d.id = mp.division_id
    where p.id <> p_employee_id
      and not exists (
        select 1 from public.substitute_lists as s where s.employee_id = p_employee_id and s.substitute_id = p.id
      )
    order by p.email;
end;
$$;

revoke execute on function private.my_substitute_options() from public, anon;
revoke execute on function private.record_substitutes(bigint[]) from public, anon;
revoke execute on function private.my_substitutions() from public, anon;
revoke execute on function private.manageable_employees() from public, anon;
revoke execute on function private.substitute_list(uuid) from public, anon;
revoke execute on function private.substitute_candidates(uuid) from public, anon;
grant execute on function private.my_substitute_options() to authenticated;
grant execute on function private.record_substitutes(bigint[]) to authenticated;
grant execute on function private.my_substitutions() to authenticated;
grant execute on function private.manageable_employees() to authenticated;
grant execute on function private.substitute_list(uuid) to authenticated;
grant execute on function private.substitute_candidates(uuid) to authenticated;

-- Точки входу для supabase.rpc: security invoker, лише передають виклик.
create function public.my_substitute_options()
returns table (substitute_id uuid, email text, main_title text, division_name text)
language sql
security invoker
set search_path = ''
as $$
  select * from private.my_substitute_options();
$$;

create function public.record_substitutes(p_record_ids bigint[])
returns table (record_id bigint, substitute_email text, upgrade_minutes integer)
language sql
security invoker
set search_path = ''
as $$
  select * from private.record_substitutes(p_record_ids);
$$;

create function public.my_substitutions()
returns table (
  record_id bigint, date date, start_min integer, end_min integer, status text, employee_email text,
  upgrade_minutes integer
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.my_substitutions();
$$;

create function public.manageable_employees()
returns table (employee_id uuid, email text, main_title text, division_name text, substitute_count integer)
language sql
security invoker
set search_path = ''
as $$
  select * from private.manageable_employees();
$$;

create function public.substitute_list(p_employee_id uuid)
returns table (substitute_id uuid, email text, main_title text, division_name text)
language sql
security invoker
set search_path = ''
as $$
  select * from private.substitute_list(p_employee_id);
$$;

create function public.substitute_candidates(p_employee_id uuid)
returns table (profile_id uuid, email text, main_title text, division_name text)
language sql
security invoker
set search_path = ''
as $$
  select * from private.substitute_candidates(p_employee_id);
$$;

revoke execute on function public.my_substitute_options() from public, anon;
revoke execute on function public.record_substitutes(bigint[]) from public, anon;
revoke execute on function public.my_substitutions() from public, anon;
revoke execute on function public.manageable_employees() from public, anon;
revoke execute on function public.substitute_list(uuid) from public, anon;
revoke execute on function public.substitute_candidates(uuid) from public, anon;
grant execute on function public.my_substitute_options() to authenticated;
grant execute on function public.record_substitutes(bigint[]) to authenticated;
grant execute on function public.my_substitutions() to authenticated;
grant execute on function public.manageable_employees() to authenticated;
grant execute on function public.substitute_list(uuid) to authenticated;
grant execute on function public.substitute_candidates(uuid) to authenticated;
