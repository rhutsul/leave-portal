-- Шкільний календар (openspec/specs/school-calendar/spec.md; план — openspec/changes/impl-school-calendar/design.md,
-- D1–D3). Адміністратор додає й видаляє закриття: цілі дні або скорочений день із часу X. Усі, хто увійшов, бачать
-- календар; закриті дні й години не входять у розклад дати, тож перевірка годин і знаменник частки дня беруть лише
-- незакриті хвилини. Подання заявки (submit_leave_request) і зміну годин (update_leave_record_hours) з повідомленням
-- AC-CAL-03 і спільним lock оновлює наступна міграція задачі 2.

-- ── D1. Таблиця закриттів ───────────────────────────────────────────────────
create table public.school_closures (
  id         bigint generated always as identity primary key,
  name       text not null,
  start_date date not null,
  end_date   date not null,
  -- Скорочений день: хвилини від півночі за Києвом (Europe/Kyiv), з яких школа закрита; null — цілі дні.
  closes_at  integer,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Назва до 100 знаків (Assumptions 04-school-calendar).
  constraint school_closures_name_check check (char_length(btrim(name)) between 1 and 100),
  -- AC-CAL-10: дата кінця не раніша за дату початку.
  constraint school_closures_dates_check check (end_date >= start_date),
  -- Скорочений день — одна дата, час із кроком 5 хвилин усередині доби.
  constraint school_closures_early_dismissal_check check (
    closes_at is null or (start_date = end_date and closes_at between 5 and 1435 and closes_at % 5 = 0)
  ),
  -- AC-CAL-11: два закриття не мають спільної дати. Тримає й одночасні додавання.
  constraint school_closures_no_shared_date exclude using gist (daterange(start_date, end_date, '[]') with &&)
);

comment on table public.school_closures is
  'Закриття шкільного календаря: цілі дні (start_date…end_date включно) або скорочений день (closes_at); змінює лише адміністратор через private.add_school_closure / remove_school_closure.';

alter table public.school_closures enable row level security;

revoke all on table public.school_closures from anon, authenticated;
-- AC-CAL-02: читають усі, хто увійшов, — лише те, що показує календар; created_by не відкриваємо.
grant select (id, name, start_date, end_date, closes_at, created_at) on table public.school_closures to authenticated;
-- AC-CAL-13: insert/update/delete для authenticated немає — змінюють лише функції нижче. Гість (anon) — нічого (AC-CAL-14).
grant select, insert, update, delete on table public.school_closures to service_role;

create policy school_closures_select_signed_in
  on public.school_closures for select to authenticated
  using ((select auth.uid()) is not null);

-- ── D3. Розклад дати з урахуванням закриттів ────────────────────────────────
-- Блоки посади на дату: закриття цілими днями — жодного; скорочений день із X — блоки, що починаються до X, а блок,
-- що триває о X, закінчується о X (Assumptions 04-school-calendar). Те саме правило — clipBlocks у
-- src/lib/leave/calendar.ts. Внутрішня: її викликають лише security definer функції.
create or replace function private.blocks_on_date(p_position_id bigint, p_date date)
returns table (start_min integer, end_min integer)
language sql
stable
set search_path = ''
as $$
  select b.start_min, case when c.closes_at is null then b.end_min else least(b.end_min, c.closes_at) end
  from public.schedule_blocks as b
  left join public.school_closures as c on p_date between c.start_date and c.end_date
  where b.position_id = p_position_id
    and b.weekday = extract(isodow from p_date)
    and (c.id is null or (c.closes_at is not null and b.start_min < c.closes_at))
  order by b.start_min;
$$;

-- Назва закриття цілими днями на дату або null (AC-CAL-03).
create or replace function private.closure_on_date(p_date date)
returns text
language sql
stable
set search_path = ''
as $$
  select c.name from public.school_closures as c
  where p_date between c.start_date and c.end_date and c.closes_at is null;
$$;

-- Незакриті робочі хвилини працівника на дату за розкладами всіх посад — знаменник частки дня (AC-BALANCE-05, -06,
-- AC-CAL-06). На ній стоять record_share, used_hundredths, remaining_hundredths і get_balance_inputs. Частку
-- погоджених записів без розподілу рахуємо від поточного календаря; записи з розподілом (paid_days, AC-BALANCE-10)
-- лишаються такими, як погодив менеджер (design.md D3, docs/spec-reading.md).
create or replace function private.working_minutes(p_employee_id uuid, p_date date)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(
    case when c.closes_at is null then b.end_min else least(b.end_min, c.closes_at) end - b.start_min
  ), 0)::integer
  from public.schedule_blocks as b
  left join public.school_closures as c on p_date between c.start_date and c.end_date
  where b.employee_id = p_employee_id
    and b.weekday = extract(isodow from p_date)
    and (c.id is null or (c.closes_at is not null and b.start_min < c.closes_at));
$$;

revoke execute on function private.blocks_on_date(bigint, date) from public, anon, authenticated;
revoke execute on function private.closure_on_date(date) from public, anon, authenticated;
revoke execute on function private.working_minutes(uuid, date) from public, anon, authenticated;

-- Години запису за розкладом дати — нова версія private.check_record_hours (20261104165058_end_at_next_block.sql):
-- блоки беремо з private.blocks_on_date, а закритий цілий день дає текст AC-CAL-03. Порядок перевірок і тексти PM —
-- як раніше й як checkHours у src/lib/leave/time.ts. Скорочений день: «Hours must be within your schedule:
-- 08:30–12:00» (AC-CAL-05). Викликають подання заявки й зміна годин запису.
create or replace function private.check_record_hours(p_position_id bigint, p_date date, p_start integer, p_end integer)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_closed text;
  v_blocks text;
  v_minutes integer;
begin
  v_closed := private.closure_on_date(p_date);
  if v_closed is not null then
    raise exception 'The school is closed on this day: %', v_closed;
  end if;

  if p_date is null or not exists (select 1 from private.blocks_on_date(p_position_id, p_date)) then
    raise exception 'You have no working hours on this day';
  end if;

  if p_start is null or p_end is null or p_start < 0 or p_end > 1440 or p_start % 5 <> 0 or p_end % 5 <> 0 then
    raise exception 'Enter times in 5-minute steps';
  end if;

  if not exists (
    select 1 from private.blocks_on_date(p_position_id, p_date) as b where p_start >= b.start_min and p_start < b.end_min
  ) and exists (
    select 1 from private.blocks_on_date(p_position_id, p_date) as b where b.end_min = p_start
  ) then
    raise exception '% is the end of working time and can only be chosen as the end of leave',
      private.format_minutes(p_start);
  end if;

  if p_end <= p_start then
    raise exception 'The end must be later than the start';
  end if;

  if not exists (
    select 1 from private.blocks_on_date(p_position_id, p_date) as b where p_start >= b.start_min and p_start < b.end_min
  ) or not exists (
    select 1 from private.blocks_on_date(p_position_id, p_date) as b where p_end >= b.start_min and p_end <= b.end_min
  ) then
    select string_agg(private.format_minutes(b.start_min) || '–' || private.format_minutes(b.end_min), ', '
                      order by b.start_min)
      into v_blocks
      from private.blocks_on_date(p_position_id, p_date) as b;
    raise exception 'Hours must be within your schedule: %', v_blocks;
  end if;

  select sum(greatest(0, least(p_end, b.end_min) - greatest(p_start, b.start_min)))
    into v_minutes
    from private.blocks_on_date(p_position_id, p_date) as b;
  return v_minutes;
end;
$$;

revoke execute on function private.check_record_hours(bigint, date, integer, integer) from public, anon, authenticated;

-- Залишки: get_balance_inputs — нова версія (20261020214031_balance_inputs.sql). Єдина зміна — working_minutes
-- кожної дати з private.working_minutes (з урахуванням закриттів) замість суми блоків за днем тижня (AC-CAL-06).
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
        where lr.employee_id = p_employee_id and lr.date < v_until and lr.status = 'approved' and lr.paid_days is null
        group by lr.date, lr.leave_type, lr.status
      ) as r
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

-- ── D2. Додавання й видалення закриття ──────────────────────────────────────
-- Ключ advisory lock календаря: додавання й видалення беруть його ексклюзивно, подання заявки й зміна годин (задача 2)
-- — спільно, тож закриття й новий запис не проскочать одне повз одного, а заявки одна одну не чекають.
create or replace function private.calendar_lock_key()
returns bigint
language sql
immutable
set search_path = ''
as $$
  select hashtextextended('school_calendar', 0);
$$;

revoke execute on function private.calendar_lock_key() from public, anon, authenticated;

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
  v_conflict record;
  v_records text;
  v_id bigint;
begin
  -- AC-CAL-12, AC-CAL-13: лише адміністратор, і на сторінці, і напряму; роль — з profiles, не з user_metadata.
  if (select auth.uid()) is null or private.current_app_role() is distinct from 'admin' then
    raise exception 'Only an administrator can change the school calendar' using errcode = '42501';
  end if;

  -- Тексти для порожньої чи задовгої назви й неповних даних — питання PM
  -- (mkozlovskyi-ops/course-staff-management-spec#24); до відповіді форма їх не надсилає, а база відмовляє технічно.
  if v_name is null or char_length(v_name) not between 1 and 100 then
    raise exception 'Invalid closure name' using errcode = '22023';
  end if;
  if p_start is null or p_end is null then
    raise exception 'Invalid closure dates' using errcode = '22023';
  end if;

  -- AC-CAL-10.
  if p_end < p_start then
    raise exception 'The end date cannot be earlier than the start date';
  end if;

  if p_closes_at is not null and (p_start <> p_end or p_closes_at not between 5 and 1435 or p_closes_at % 5 <> 0) then
    raise exception 'Invalid early dismissal time' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(private.calendar_lock_key());

  -- AC-CAL-11: перша спільна дата з першим закриттям, що перетинається (формат для кількох — питання PM
  -- mkozlovskyi-ops/course-staff-management-spec#23).
  select greatest(c.start_date, p_start) as shared_date, c.name
    into v_conflict
    from public.school_closures as c
   where daterange(c.start_date, c.end_date, '[]') && daterange(p_start, p_end, '[]')
   order by c.start_date
   limit 1;
  if found then
    raise exception '% is already closed: %', to_char(v_conflict.shared_date, 'YYYY-MM-DD'), v_conflict.name;
  end if;

  -- AC-CAL-07, AC-CAL-08: записи, що блокують, — ті самі статуси, що в leave_records_no_overlap
  -- (BLOCKING_STATUSES: awaiting, returned, approved); для скороченого дня — лише записи з хвилинами після closes_at.
  -- Пара «дата email» на кожен запис, через ", ", за датою, потім email (власне припущення, docs/spec-reading.md).
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

-- AC-CAL-09: видалення не змінює жодного запису — дні знову стають робочими за розкладами.
create or replace function private.remove_school_closure(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.current_app_role() is distinct from 'admin' then
    raise exception 'Only an administrator can change the school calendar' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(private.calendar_lock_key());

  delete from public.school_closures as c where c.id = p_id;
  if not found then
    raise exception 'Closure not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function private.add_school_closure(text, date, date, integer) from public, anon;
revoke execute on function private.remove_school_closure(bigint) from public, anon;
grant execute on function private.add_school_closure(text, date, date, integer) to authenticated;
grant execute on function private.remove_school_closure(bigint) to authenticated;

-- Точки входу для supabase.rpc: security invoker, лише передають параметри.
create or replace function public.add_school_closure(
  p_name      text,
  p_start     date,
  p_end       date,
  p_closes_at integer default null
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.add_school_closure(p_name, p_start, p_end, p_closes_at);
$$;

create or replace function public.remove_school_closure(p_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.remove_school_closure(p_id);
$$;

revoke execute on function public.add_school_closure(text, date, date, integer) from public, anon;
revoke execute on function public.remove_school_closure(bigint) from public, anon;
grant execute on function public.add_school_closure(text, date, date, integer) to authenticated;
grant execute on function public.remove_school_closure(bigint) to authenticated;
