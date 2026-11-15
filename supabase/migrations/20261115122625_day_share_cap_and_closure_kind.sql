-- Виправлення за рев'ю WS9 (14.11): частка дати не більша за 1.00 і вид закриття в add_school_closure.
--
-- 1. «One date never counts as more than 1.00 day» (requirements/03-leave-balance.md, Assumptions). Частку дня, яку
--    фіксує погодження (AC-CAL-20), рахуємо від календаря на момент рішення. Якщо між двома погодженнями однієї дати
--    календар змінився, сума часток могла перевищити 1.00: скорочений день з 12:00, погоджено 08:30–11:00 (0.71),
--    закриття прибрано, погоджено 11:00–15:30 (0.64) — разом 1.35. Тепер частка нового запису не більша за те, що
--    лишилося від дати: 100 − Σ часток інших погоджених записів працівника на цю дату (усіх типів). Те саме обмеження —
--    у private.record_share, тож рішення щодо «Sick leave» і «Personal leave» (paid_days, AC-BALANCE-10), попередження
--    й панель рішення бачать ту саму частку.
--    Дзеркальний випадок (перший запис погоджено до появи скороченого дня, другий — після: 0.36 + 0.29 = 0.65) не
--    змінюємо: він буквально випливає з AC-CAL-20, а суперечність із «together … count as 1.00» вирішує PM
--    (Open question у openspec/changes/impl-ws9-review-fixes/design.md).
--
-- 2. «Enter the closing time» (Assumptions 04-school-calendar) — у базі. Досі add_school_closure не знала виду
--    закриття: виклик без p_closes_at був законним закриттям цілими днями, тож скорочений день без часу (наприклад,
--    від майбутнього помічника календаря, зріз 4) тихо закрив би цілий день для всієї школи. Тепер вид — перший
--    параметр: 'whole_days' (дати початку й кінця) або 'early_dismissal' (одна дата й час). Сигнатура змінилась —
--    старі функції прибираємо (drop лише функцій, даних не зачіпає) і створюємо нові з тими самими правами.

-- ── 1. Частка дати не більша за 1.00 ────────────────────────────────────────

-- Скільки сотих лишилося від дати працівника: 100 − Σ зафіксованих часток інших погоджених записів на цю дату (усіх
-- типів; p_exclude_id — сам запис, що погоджується). Для записів без day_share (до тригера AC-CAL-20 таких немає) —
-- paid_days + unpaid_days. Не менше 0.
create or replace function private.date_room(p_employee_id uuid, p_date date, p_exclude_id bigint)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(0, 100 - coalesce(sum(round(
           coalesce(o.day_share, coalesce(o.paid_days, 0) + coalesce(o.unpaid_days, 0)) * 100
         )), 0))::integer
  from public.leave_records as o
  where o.employee_id = p_employee_id and o.date = p_date and o.status = 'approved'
    and o.id is distinct from p_exclude_id;
$$;

revoke execute on function private.date_room(uuid, date, bigint) from public, anon, authenticated;

-- Частка запису на момент рішення — нова версія (20261021133002_leave_decisions.sql): та сама різниця «після мінус до»
-- серед погоджених записів того самого типу, але не більша за те, що лишилося від дати.
create or replace function private.record_share(p_record_id bigint)
returns integer
language sql
stable
set search_path = ''
as $$
  select least(
           private.day_share(b.before + r.minutes, w.minutes) - private.day_share(b.before, w.minutes),
           private.date_room(r.employee_id, r.date, r.id)
         )
  from public.leave_records as r
  cross join lateral (select private.working_minutes(r.employee_id, r.date) as minutes) as w
  cross join lateral (
    select coalesce(sum(o.minutes), 0)::integer as before
    from public.leave_records as o
    where o.employee_id = r.employee_id and o.date = r.date and o.leave_type = r.leave_type
      and o.status = 'approved' and o.id <> r.id
  ) as b
  where r.id = p_record_id;
$$;

revoke execute on function private.record_share(bigint) from public, anon, authenticated;

-- Тригер частки — нова версія (20261113145925_school_calendar_clarifications.sql): приріст обмежено тим, що лишилося
-- від дати. Решта — без змін: частку рахуємо, коли запис стає погодженим, і більше не змінюємо.
create or replace function private.fix_day_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_working integer;
  v_before integer;
  v_share integer;
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
  v_share := private.day_share(v_before + new.minutes, v_working) - private.day_share(v_before, v_working);
  -- «One date never counts as more than 1.00 day»: не більше, ніж лишилося від дати.
  v_share := least(v_share, private.date_room(new.employee_id, new.date, new.id));
  new.day_share := v_share / 100.0;
  return new;
end;
$$;

revoke execute on function private.fix_day_share() from public, anon, authenticated;

-- ── 2. Вид закриття в add_school_closure ────────────────────────────────────

drop function public.add_school_closure(text, date, date, integer);
drop function private.add_school_closure(text, date, date, integer);

-- Нова версія (20261113145925_school_calendar_clarifications.sql). p_kind: 'whole_days' — дати p_start і p_end
-- включно, без часу; 'early_dismissal' — одна дата p_start (p_end — та сама або null) і p_closes_at, хвилини від
-- півночі. Повідомлення для людини — тексти PM (CALENDAR_MESSAGES у src/lib/leave/calendar.ts), у тому самому порядку,
-- що у формі: назва, дати, час. Технічні відмови (невідомий вид, час для цілих днів, кілька дат скороченого дня) —
-- errcode 22023: форма таких не надсилає.
create function private.add_school_closure(
  p_kind      text,
  p_name      text,
  p_start     date,
  p_end       date default null,
  p_closes_at integer default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Усі крайові пробільні символи (табуляції, переноси рядків), як trim() у parseClosureForm: rpc доступна й напряму.
  v_name text := regexp_replace(coalesce(p_name, ''), '^\s+|\s+$', '', 'g');
  v_early boolean;
  v_end date := p_end;
  v_overlaps text;
  v_records text;
  v_id bigint;
begin
  -- AC-CAL-12, AC-CAL-13: лише адміністратор, і на сторінці, і напряму; роль — з profiles, не з user_metadata.
  if (select auth.uid()) is null or private.current_app_role() is distinct from 'admin' then
    raise exception 'Only an administrator can change the school calendar' using errcode = '42501';
  end if;

  if p_kind is null or p_kind not in ('whole_days', 'early_dismissal') then
    raise exception 'Unknown closure kind: use whole_days or early_dismissal' using errcode = '22023';
  end if;
  v_early := p_kind = 'early_dismissal';
  if v_early then
    v_end := coalesce(p_end, p_start);
  end if;

  -- AC-CAL-18, AC-CAL-19 і Assumptions 04-school-calendar: обов'язкові поля, тексти — як у форми (CALENDAR_MESSAGES).
  if v_name is null or v_name = '' then
    raise exception 'Enter a name for the closure';
  end if;
  if char_length(v_name) > 100 then
    raise exception 'The name can be at most 100 characters';
  end if;
  if p_start is null or v_end is null then
    raise exception 'Enter the start and end dates';
  end if;
  -- Assumptions 04-school-calendar: скорочений день без часу не зберігається.
  if v_early and p_closes_at is null then
    raise exception 'Enter the closing time';
  end if;

  -- AC-CAL-10.
  if v_end < p_start then
    raise exception 'The end date cannot be earlier than the start date';
  end if;

  if not v_early and p_closes_at is not null then
    raise exception 'A whole-day closure has no closing time' using errcode = '22023';
  end if;
  if v_early and (p_start <> v_end or p_closes_at not between 5 and 1435 or p_closes_at % 5 <> 0) then
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
   where daterange(c.start_date, c.end_date, '[]') && daterange(p_start, v_end, '[]');
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
   where r.date between p_start and v_end
     and r.status in ('awaiting', 'returned', 'approved')
     and (p_closes_at is null or r.end_min > p_closes_at);
  if v_records is not null then
    raise exception 'These days have leave records and cannot be closed: %', v_records;
  end if;

  insert into public.school_closures (name, start_date, end_date, closes_at, created_by)
  values (v_name, p_start, v_end, p_closes_at, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function private.add_school_closure(text, text, date, date, integer) from public, anon;
grant execute on function private.add_school_closure(text, text, date, date, integer) to authenticated;

create function public.add_school_closure(
  p_kind      text,
  p_name      text,
  p_start     date,
  p_end       date default null,
  p_closes_at integer default null
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.add_school_closure(p_kind, p_name, p_start, p_end, p_closes_at);
$$;

revoke execute on function public.add_school_closure(text, text, date, date, integer) from public, anon;
grant execute on function public.add_school_closure(text, text, date, date, integer) to authenticated;
