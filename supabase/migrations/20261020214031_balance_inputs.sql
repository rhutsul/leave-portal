-- Залишки відпусток (задача 3 openspec/changes/impl-leave-ws6/tasks.md): функція get_balance_inputs (D4), список
-- працівників, чиї залишки можна дивитися, і тестові перенесені дні (D7, AC-BALANCE-11).
-- Формула (частка дня, навчальний рік, перенесення) — у src/lib/leave/balance.ts; база віддає лише підсумки по датах
-- без деталей записів і сама вирішує, кому їх показати (AC-BALANCE-12, AC-BALANCE-13, AC-BALANCE-20).
--
-- Правила з 20261012000000_profiles_and_roles.sql: security definer — лише в схемі private з `set search_path = ''`,
-- public-обгортки — security invoker; revoke від public і anon, grant execute лише authenticated.
-- Нових таблиць у public немає; private.test_balance_carryovers закрита від anon і authenticated.

-- ── Хто бачить залишки працівника ───────────────────────────────────────────
-- Сам працівник; відповідальний менеджер будь-якої його посади — повний залишок (AC-BALANCE-20); адміністратор.
create or replace function private.can_view_balances(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      p_employee_id = (select auth.uid())
      or private.manages_employee(p_employee_id)
      or private.current_app_role() = 'admin'
    );
$$;

revoke execute on function private.can_view_balances(uuid) from public, anon;
grant execute on function private.can_view_balances(uuid) to authenticated;

-- ── Дані для залишків (D4) ──────────────────────────────────────────────────
-- p_school_year — рік початку навчального року (2026 — це 2026–2027). Віддає все до 31 серпня p_school_year + 1:
-- перенесене в рік рахуємо із залишків попередніх років (AC-BALANCE-11).
-- {
--   "employee":   {"id", "full_name", "email"},
--   "days":       [{"date", "working_minutes", "leave_type", "status", "minutes"}]  — записи без розподілу,
--                 сума хвилин за датою, типом і статусом; working_minutes — усі робочі хвилини працівника на дату
--                 за розкладами всіх посад (знаменник частки дня, AC-BALANCE-05, AC-BALANCE-06);
--   "splits":     [{"date", "leave_type", "paid_days", "unpaid_days"}]              — погоджені з розподілом (задача 4);
--   "carryovers": [{"school_year", "leave_type", "days"}]                           — перенесені дні першого року
-- }
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
          'working_minutes', coalesce(w.minutes, 0),
          'leave_type', r.leave_type,
          'status', r.status,
          'minutes', r.minutes
        )
        order by r.date, r.leave_type, r.status
      )
      from (
        select lr.date, lr.leave_type, lr.status, sum(lr.minutes)::integer as minutes
        from public.leave_records as lr
        where lr.employee_id = p_employee_id and lr.date < v_until and lr.paid_days is null
        group by lr.date, lr.leave_type, lr.status
      ) as r
      left join (
        select b.weekday, sum(b.end_min - b.start_min)::integer as minutes
        from public.schedule_blocks as b
        where b.employee_id = p_employee_id
        group by b.weekday
      ) as w on w.weekday = extract(isodow from r.date)
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

create or replace function public.get_balance_inputs(p_employee_id uuid, p_school_year integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_balance_inputs(p_employee_id, p_school_year);
$$;

revoke execute on function public.get_balance_inputs(uuid, integer) from public, anon;
grant execute on function public.get_balance_inputs(uuid, integer) to authenticated;

-- ── Чиї залишки ще можна дивитися (вибір працівника на /balances) ───────────
-- Менеджер — працівники з хоча б однією його посадою; адміністратор — усі. Без себе: свої залишки — окремо.
-- profiles за RLS показує лише власний профіль, тож імена — звідси, після тієї самої перевірки права.
create or replace function private.balance_employees()
returns table (id uuid, full_name text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.email
  from public.profiles as p
  where (select auth.uid()) is not null
    and p.id <> (select auth.uid())
    and (private.manages_employee(p.id) or private.current_app_role() = 'admin')
  order by p.full_name, p.email;
$$;

revoke execute on function private.balance_employees() from public, anon;
grant execute on function private.balance_employees() to authenticated;

create or replace function public.balance_employees()
returns table (id uuid, full_name text, email text)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.balance_employees();
$$;

revoke execute on function public.balance_employees() from public, anon;
grant execute on function public.balance_employees() to authenticated;

-- ── Тестові перенесені дні (D7, AC-BALANCE-11) ──────────────────────────────
-- Як інші private.test_*: за email, застосовуються до наявних профілів зараз і тригером — до нових.
-- teacher2@ переносить 5.00 днів Sick leave на початок першого навчального року 2026–2027: на /balances видно
-- «Carried over 5.00», а 2027–2028 переносить залишок 2026–2027. teacher1@ — без перенесених днів (AC-BALANCE-01).

create table private.test_balance_carryovers (
  email       text not null,
  leave_type  text not null,
  school_year smallint not null,
  days        numeric(5, 2) not null,
  primary key (email, leave_type, school_year)
);

revoke all on table private.test_balance_carryovers from public, anon, authenticated;

insert into private.test_balance_carryovers (email, leave_type, school_year, days)
values ('teacher2@example.test', 'sick', 2026, 5.00);

-- Тіло з 20261020190045_leave_requests_schema.sql без змін + перенесені дні наприкінці.
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

  insert into public.balance_carryovers (employee_id, leave_type, school_year, days)
  select pr.id, c.leave_type, c.school_year, c.days
  from private.test_balance_carryovers as c
  join public.profiles as pr on lower(pr.email) = lower(c.email)
  on conflict do nothing;
end;
$$;

revoke execute on function private.apply_test_assignments() from public, anon, authenticated;

-- Профілі, які вже є (користувачі з попередніх users:demo).
select private.apply_test_assignments();
