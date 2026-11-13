-- Уточнення шкільного календаря після відповідей PM (openspec/specs/school-calendar/spec.md, AC-CAL-16 … AC-CAL-20;
-- mkozlovskyi-ops/course-staff-management-spec#22 … #26). Нові версії функцій — решта тіла без змін:
--   * AC-CAL-16: private.closed_day_name — дата закрита для працівника, якщо це закриття цілими днями або скорочений
--     день, до часу закриття якого з розкладу всіх його посад нічого не лишається; submit_leave_request відкидає таку
--     дату з повідомленням "The school is closed on this day: <назва>" (як AC-CAL-03). Те саме правило в TS —
--     closedDayName (src/lib/leave/request.ts).
--   * AC-CAL-17, AC-CAL-18, AC-CAL-19: add_school_closure — частина повідомлення на кожне закриття, що перетинається,
--     і тексти PM для порожньої чи задовгої назви та закриття без дат (Assumptions 04-school-calendar).
--   * AC-CAL-20: частка дня погодженого запису фіксується в момент погодження для всіх типів (leave_records.day_share,
--     тригер), а used_hundredths і get_balance_inputs беруть її, а не частку від поточного календаря.

-- ── AC-CAL-16. Закритий для працівника день ─────────────────────────────────
-- Назва закриття, через яке дата для працівника закрита, або null. Розкладу на цей день тижня не було й без закриття —
-- null: це день без робочих годин (AC-LEAVE-06), а не закритий день. Внутрішня: її викликають лише security definer
-- функції.
create or replace function private.closed_day_name(p_employee_id uuid, p_date date)
returns text
language sql
stable
set search_path = ''
as $$
  select c.name
  from public.school_closures as c
  where p_date between c.start_date and c.end_date
    and (
      c.closes_at is null
      or (
        exists (
          select 1 from public.schedule_blocks as b
          where b.employee_id = p_employee_id and b.weekday = extract(isodow from p_date)
        )
        and not exists (
          select 1 from public.schedule_blocks as b
          where b.employee_id = p_employee_id and b.weekday = extract(isodow from p_date)
            and b.start_min < c.closes_at
        )
      )
    );
$$;

revoke execute on function private.closed_day_name(uuid, date) from public, anon, authenticated;

-- submit_leave_request — нова версія (20261108165906_school_calendar_requests.sql). Єдина зміна — закритий день
-- визначає private.closed_day_name (AC-CAL-03 і AC-CAL-16), а не лише закриття цілими днями.
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

  insert into public.leave_requests (employee_id, leave_type, relationship, employee_comment)
  values (v_uid, p_leave_type, p_relationship, v_comment)
  returning id into v_request_id;

  begin
    for v_item in select value from jsonb_array_elements(p_records) loop
      v_position := (v_item ->> 'position_id')::bigint;
      v_date := (v_item ->> 'date')::date;
      v_start := (v_item ->> 'start_min')::integer;
      v_end := (v_item ->> 'end_min')::integer;

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

      insert into public.leave_records (
        request_id, position_id, employee_id, date, start_min, end_min, minutes,
        leave_type, relationship, employee_comment
      )
      values (
        v_request_id, v_position, v_uid, v_date, v_start, v_end, v_minutes,
        p_leave_type, p_relationship, v_comment
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

-- ── AC-CAL-17, AC-CAL-18, AC-CAL-19. Додавання закриття ─────────────────────
-- Нова версія (20261108143021_school_calendar.sql): тексти PM для назви й дат замість технічних помилок і частина
-- повідомлення на кожне закриття, що перетинається. Решта — без змін.
create or replace function private.add_school_closure(
  p_name      text,
  p_start     date,
  p_end       date,
  p_closes_at integer default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_overlaps text;
  v_records text;
  v_id bigint;
begin
  -- AC-CAL-12, AC-CAL-13: лише адміністратор, і на сторінці, і напряму; роль — з profiles, не з user_metadata.
  if (select auth.uid()) is null or private.current_app_role() is distinct from 'admin' then
    raise exception 'Only an administrator can change the school calendar' using errcode = '42501';
  end if;

  -- AC-CAL-18, AC-CAL-19 і Assumptions 04-school-calendar: обов'язкові поля, тексти — як у форми (CALENDAR_MESSAGES).
  -- Час скороченого дня перевіряє форма («Enter the closing time»): без нього виклик — це закриття цілими днями.
  if v_name is null or v_name = '' then
    raise exception 'Enter a name for the closure';
  end if;
  if char_length(v_name) > 100 then
    raise exception 'The name can be at most 100 characters';
  end if;
  if p_start is null or p_end is null then
    raise exception 'Enter the start and end dates';
  end if;

  -- AC-CAL-10.
  if p_end < p_start then
    raise exception 'The end date cannot be earlier than the start date';
  end if;

  if p_closes_at is not null and (p_start <> p_end or p_closes_at not between 5 and 1435 or p_closes_at % 5 <> 0) then
    raise exception 'Invalid early dismissal time' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(private.calendar_lock_key());

  -- AC-CAL-11, AC-CAL-17: частина "<дата> is already closed: <назва>" на кожне закриття, що перетинається, з його
  -- першою спільною датою; частини — за цими датами, через ", ".
  select string_agg(
           to_char(greatest(c.start_date, p_start), 'YYYY-MM-DD') || ' is already closed: ' || c.name,
           ', ' order by greatest(c.start_date, p_start), c.id
         )
    into v_overlaps
    from public.school_closures as c
   where daterange(c.start_date, c.end_date, '[]') && daterange(p_start, p_end, '[]');
  if v_overlaps is not null then
    raise exception '%', v_overlaps;
  end if;

  -- AC-CAL-07, AC-CAL-08: записи, що блокують, — ті самі статуси, що в leave_records_no_overlap
  -- (BLOCKING_STATUSES: awaiting, returned, approved); для скороченого дня — лише записи з хвилинами після closes_at.
  -- Пара «дата email» на кожен запис, через ", ", за датою, а пари однієї дати — за email
  -- (Assumptions 04-school-calendar, mkozlovskyi-ops/course-staff-management-spec#26).
  select string_agg(to_char(r.date, 'YYYY-MM-DD') || ' ' || p.email, ', ' order by r.date, p.email, r.start_min, r.id)
    into v_records
    from public.leave_records as r
    join public.profiles as p on p.id = r.employee_id
   where r.date between p_start and p_end
     and r.status in ('awaiting', 'returned', 'approved')
     and (p_closes_at is null or r.end_min > p_closes_at);
  if v_records is not null then
    raise exception 'These days have leave records and cannot be closed: %', v_records;
  end if;

  insert into public.school_closures (name, start_date, end_date, closes_at, created_by)
  values (v_name, p_start, p_end, p_closes_at, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

-- ── AC-CAL-20. Частка дня, зафіксована при погодженні ───────────────────────
-- Частка дня погодженого запису (у днях, 0.01): хвилини запису ÷ незакриті робочі хвилини працівника на дату в момент
-- погодження, з округленням по даті, як private.record_share. Для «Sick leave» і «Personal leave» дорівнює
-- paid_days + unpaid_days. Пишемо лише тригером; для не погоджених — null.
alter table public.leave_records
  add column day_share numeric(4, 2),
  add constraint leave_records_day_share_check check (day_share >= 0);

comment on column public.leave_records.day_share is
  'Частка дня погодженого запису на момент погодження (AC-CAL-20); закриття, додане чи видалене пізніше, її не змінює.';

-- Наявні погоджені записи: з розподілом — paid_days + unpaid_days; решта — за поточним календарем у порядку
-- погодження (updated_at, id), як рахувала б record_share у момент кожного рішення.
update public.leave_records as r
   set day_share = case
         when r.paid_days is not null then r.paid_days + coalesce(r.unpaid_days, 0)
         else s.share / 100.0
       end
  from (
    select x.id, private.day_share(x.before + x.minutes, x.working) - private.day_share(x.before, x.working) as share
    from (
      select lr.id, lr.minutes, private.working_minutes(lr.employee_id, lr.date) as working,
             coalesce(sum(lr.minutes) over (
               partition by lr.employee_id, lr.date, lr.leave_type
               order by lr.updated_at, lr.id
               rows between unbounded preceding and 1 preceding
             ), 0)::integer as before
      from public.leave_records as lr
      where lr.status = 'approved'
    ) as x
  ) as s
 where s.id = r.id;

-- Тригер: запис стає погодженим (рішення менеджера або тестові дані secret-ключем) — частку рахуємо від чинного
-- календаря й більше не змінюємо; запис не погоджений — частки немає. security definer: тестові дані пише
-- service_role, у якого немає execute на внутрішні private-функції. Викликає лише тригер.
create or replace function private.fix_day_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_working integer;
  v_before integer;
begin
  if new.status is distinct from 'approved' then
    new.day_share := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then
    new.day_share := old.day_share;
    return new;
  end if;
  v_working := private.working_minutes(new.employee_id, new.date);
  select coalesce(sum(o.minutes), 0)::integer
    into v_before
    from public.leave_records as o
   where o.employee_id = new.employee_id and o.date = new.date and o.leave_type = new.leave_type
     and o.status = 'approved' and o.id <> new.id;
  new.day_share := (private.day_share(v_before + new.minutes, v_working) - private.day_share(v_before, v_working)) / 100.0;
  return new;
end;
$$;

revoke execute on function private.fix_day_share() from public, anon, authenticated;

create trigger leave_records_fix_day_share
  before insert or update of status on public.leave_records
  for each row execute function private.fix_day_share();

-- Використано типу за навчальний рік — нова версія (20261021133002_leave_decisions.sql): погоджені з розподілом —
-- paid_days, решта — зафіксована day_share; від поточного календаря — лише погоджені без частки (до тригера таких
-- немає, гілка — запобіжник).
create or replace function private.used_hundredths(p_employee_id uuid, p_leave_type text, p_school_year integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select (
    coalesce((
      select sum(private.day_share(d.minutes, private.working_minutes(p_employee_id, d.date)))
      from (
        select lr.date, sum(lr.minutes)::integer as minutes
        from public.leave_records as lr
        where lr.employee_id = p_employee_id and lr.leave_type = p_leave_type and lr.status = 'approved'
          and lr.paid_days is null and lr.day_share is null
          and lr.date >= make_date(p_school_year, 9, 1) and lr.date < make_date(p_school_year + 1, 9, 1)
        group by lr.date
      ) as d
    ), 0)
    + coalesce((
      select sum(round(coalesce(lr.paid_days, lr.day_share) * 100))
      from public.leave_records as lr
      where lr.employee_id = p_employee_id and lr.leave_type = p_leave_type and lr.status = 'approved'
        and (lr.paid_days is not null or lr.day_share is not null)
        and lr.date >= make_date(p_school_year, 9, 1) and lr.date < make_date(p_school_year + 1, 9, 1)
    ), 0)
  )::integer;
$$;

-- Дані для залишків — нова версія (20261108143021_school_calendar.sql). Нове поле "shares":
-- [{"date", "leave_type", "days"}] — погоджені без розподілу з зафіксованою часткою (AC-CAL-20); "days" лишається для
-- погоджених без частки (запобіжник), "splits" і "carryovers" — без змін. Читає parseBalanceInputs
-- (src/lib/leave/balance.ts).
create or replace function private.get_balance_inputs(p_employee_id uuid, p_school_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_until date;
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- Той самий код, що й для «немає такого працівника»: відповідь не розкриває, чи працівник існує.
  if p_employee_id is null or p_school_year is null or not private.can_view_balances(p_employee_id) then
    raise exception 'Balances are not available' using errcode = '42501';
  end if;

  v_until := make_date(p_school_year + 1, 9, 1);

  select jsonb_build_object(
    'employee', (
      select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email)
      from public.profiles as p
      where p.id = p_employee_id
    ),
    'days', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', to_char(r.date, 'YYYY-MM-DD'),
          'working_minutes', private.working_minutes(p_employee_id, r.date),
          'leave_type', r.leave_type,
          'status', r.status,
          'minutes', r.minutes
        )
        order by r.date, r.leave_type, r.status
      )
      from (
        select lr.date, lr.leave_type, lr.status, sum(lr.minutes)::integer as minutes
        from public.leave_records as lr
        -- Лише погоджені: інші статуси залишок не змінюють (AC-BALANCE-04, AC-BALANCE-07), а менеджер додаткової
        -- посади не має дізнаватися про записи, що чекають рішення чи відхилені на чужих посадах (AC-DECIDE-01).
        where lr.employee_id = p_employee_id and lr.date < v_until and lr.status = 'approved'
          and lr.paid_days is null and lr.day_share is null
        group by lr.date, lr.leave_type, lr.status
      ) as r
    ), '[]'::jsonb),
    'shares', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', to_char(lr.date, 'YYYY-MM-DD'),
          'leave_type', lr.leave_type,
          'days', lr.day_share
        )
        order by lr.date, lr.leave_type, lr.id
      )
      from public.leave_records as lr
      where lr.employee_id = p_employee_id and lr.date < v_until
        and lr.status = 'approved' and lr.paid_days is null and lr.day_share is not null
    ), '[]'::jsonb),
    'splits', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', to_char(lr.date, 'YYYY-MM-DD'),
          'leave_type', lr.leave_type,
          'paid_days', lr.paid_days,
          'unpaid_days', coalesce(lr.unpaid_days, 0)
        )
        order by lr.date
      )
      from public.leave_records as lr
      where lr.employee_id = p_employee_id and lr.date < v_until
        and lr.status = 'approved' and lr.paid_days is not null
    ), '[]'::jsonb),
    'carryovers', coalesce((
      select jsonb_agg(
        jsonb_build_object('school_year', c.school_year, 'leave_type', c.leave_type, 'days', c.days)
        order by c.school_year, c.leave_type
      )
      from public.balance_carryovers as c
      where c.employee_id = p_employee_id and c.school_year <= p_school_year
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function private.get_balance_inputs(uuid, integer) from public, anon;
grant execute on function private.get_balance_inputs(uuid, integer) to authenticated;
