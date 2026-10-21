-- Рішення менеджера (задача 4 openspec/changes/impl-leave-ws6/tasks.md): функція decide_leave_record (D4), розподіл
-- понад залишок, який база рахує сама, і читання для /decisions та історії запису з іменами людей.
-- Ті самі правила доступу й переходів — у src/lib/leave/decision.ts (для повідомлень і кнопок); база — другий рубіж.
--
-- Правила з 20261012000000_profiles_and_roles.sql: security definer — лише в схемі private з `set search_path = ''`,
-- public-обгортки — security invoker; revoke від public і anon, grant execute лише authenticated.
-- Нових таблиць немає; authenticated, як і раніше, не має insert / update / delete на leave_records — рішення пише
-- лише private.decide_leave_record.
--
-- Розподіл (AC-BALANCE-09, -10, -14, -16, -19). Для кожного погодженого запису «Sick leave» чи «Personal leave» функція
-- записує paid_days і unpaid_days: частка запису = використано за дату після рішення мінус до (частка дня
-- округлюється по даті, а не по запису, Assumptions 03-leave-balance), оплачувана частина — до залишку навчального
-- року дати запису (AC-BALANCE-21, -22), решта — «Unpaid leave». Такі записи get_balance_inputs уже віддає в "splits",
-- тож /balances (src/lib/leave/balance.ts) рахує їх без змін: сума різниць по даті дорівнює округленій частці дати.

-- Коментар менеджера — до 500 символів, як коментар працівника (власне припущення: PM межі не задав; захист вводу).
alter table public.leave_records
  add constraint leave_records_manager_comment_length_check check (char_length(manager_comment) <= 500);

-- ── Залишок у базі (та сама формула, що computeBalances у src/lib/leave/balance.ts) ──
-- Усе в сотих дня (integer). Внутрішні функції: викликаються лише з security definer функцій нижче, тож прав
-- authenticated на них немає.

-- Усі робочі хвилини працівника на дату за розкладами всіх посад — знаменник частки дня (AC-BALANCE-05, -06).
create or replace function private.working_minutes(p_employee_id uuid, p_date date)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(b.end_min - b.start_min), 0)::integer
  from public.schedule_blocks as b
  where b.employee_id = p_employee_id and b.weekday = extract(isodow from p_date);
$$;

-- Частка дня в сотих: half-up до 0.01, не більше 1.00 — як dayShare у balance.ts.
create or replace function private.day_share(p_minutes integer, p_working integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_working <= 0 or p_minutes <= 0 then 0
    else least((2 * p_minutes * 100 + p_working) / (2 * p_working), 100)
  end;
$$;

-- Навчальний рік дати — рік його початку (1 вересня — 31 серпня), як schoolYearOf.
create or replace function private.school_year_of(p_date date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select extract(year from p_date)::integer - case when extract(month from p_date) >= 9 then 0 else 1 end;
$$;

-- Використано типу за навчальний рік, як usedDays: погоджені без paid_days — частка по даті; з paid_days — paid_days.
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
          and lr.paid_days is null
          and lr.date >= make_date(p_school_year, 9, 1) and lr.date < make_date(p_school_year + 1, 9, 1)
        group by lr.date
      ) as d
    ), 0)
    + coalesce((
      select sum(round(lr.paid_days * 100))
      from public.leave_records as lr
      where lr.employee_id = p_employee_id and lr.leave_type = p_leave_type and lr.status = 'approved'
        and lr.paid_days is not null
        and lr.date >= make_date(p_school_year, 9, 1) and lr.date < make_date(p_school_year + 1, 9, 1)
    ), 0)
  )::integer;
$$;

-- Залишок «Sick leave» чи «Personal leave» за навчальний рік, як computeBalances: 18.00 + перенесене − використане;
-- перенесене в рік N — залишок року N − 1 (не менше 0); на початок першого року порталу (2026, FIRST_SCHOOL_YEAR) —
-- public.balance_carryovers. Пізнє погодження запису минулого року зменшує й перенесене (AC-BALANCE-21).
create or replace function private.remaining_hundredths(p_employee_id uuid, p_leave_type text, p_school_year integer)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_first integer := least(2026, p_school_year);
  v_carried integer;
begin
  select coalesce(round(c.days * 100), 0)::integer into v_carried
  from public.balance_carryovers as c
  where c.employee_id = p_employee_id and c.leave_type = p_leave_type and c.school_year = v_first;
  v_carried := coalesce(v_carried, 0);
  for v_year in v_first .. p_school_year - 1 loop
    v_carried := greatest(0, 1800 + v_carried - private.used_hundredths(p_employee_id, p_leave_type, v_year));
  end loop;
  return 1800 + v_carried - private.used_hundredths(p_employee_id, p_leave_type, p_school_year);
end;
$$;

-- Частка запису на момент рішення: використано за дату після мінус до — серед погоджених записів того самого типу.
create or replace function private.record_share(p_record_id bigint)
returns integer
language sql
stable
set search_path = ''
as $$
  select private.day_share(b.before + r.minutes, w.minutes) - private.day_share(b.before, w.minutes)
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

-- Соті → "0.50".
create or replace function private.format_days(p_hundredths integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select (p_hundredths / 100)::text || '.' || lpad((p_hundredths % 100)::text, 2, '0');
$$;

revoke execute on function private.working_minutes(uuid, date) from public, anon, authenticated;
revoke execute on function private.day_share(integer, integer) from public, anon, authenticated;
revoke execute on function private.school_year_of(date) from public, anon, authenticated;
revoke execute on function private.used_hundredths(uuid, text, integer) from public, anon, authenticated;
revoke execute on function private.remaining_hundredths(uuid, text, integer) from public, anon, authenticated;
revoke execute on function private.record_share(bigint) from public, anon, authenticated;
revoke execute on function private.format_days(integer) from public, anon, authenticated;

-- ── Хто вирішує запис ───────────────────────────────────────────────────────
-- Адміністратор — будь-який запис (AC-DECIDE-10, -19; власний теж — матриця прав requirements/product.md);
-- менеджер — записи посад, за які відповідає, крім власних (AC-DECIDE-08, -18); працівник — жодного (AC-DECIDE-09).
-- Як checkAccess у src/lib/leave/decision.ts.
create or replace function private.can_decide_record(p_record_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.leave_records as r
    where r.id = p_record_id
      and (
        private.current_app_role() = 'admin'
        or (
          private.current_app_role() = 'manager'
          and private.manages_position(r.position_id)
          and r.employee_id <> (select auth.uid())
        )
      )
  );
$$;

revoke execute on function private.can_decide_record(bigint) from public, anon;
grant execute on function private.can_decide_record(bigint) to authenticated;

-- ── Рішення (D4) ────────────────────────────────────────────────────────────
-- p_decision: 'approve' | 'reject' | 'return'. p_split — менеджер погоджує з пропонованим розподілом; чисел із
-- форми функція не приймає: розподіл рахує сама за залишком на момент рішення під pg_advisory_xact_lock на працівника,
-- тож два одночасні погодження не витратять той самий залишок двічі (AC-BALANCE-14). Тексти для менеджера — P0001.
create or replace function private.decide_leave_record(
  p_record_id bigint,
  p_decision text,
  p_comment text,
  p_split boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
  v_record public.leave_records%rowtype;
  v_status text;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_share integer;
  v_remaining integer;
  v_paid integer;
  v_type_label text;
  v_label constant jsonb := jsonb_build_object(
    'approved', 'Approved', 'rejected', 'Rejected', 'returned', 'Returned for revision'
  );
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  v_role := private.current_app_role();
  select * into v_record from public.leave_records as r where r.id = p_record_id;
  -- Неіснуючий запис — та сама відповідь, що й чужий: не розкриваємо, чи запис існує.
  if not found
     or not (v_role = 'admin' or (v_role = 'manager' and private.manages_position(v_record.position_id))) then
    raise exception 'You can''t decide on this record' using errcode = '42501';
  end if;
  if v_role <> 'admin' and v_record.employee_id = v_uid then
    raise exception 'Your own record is decided by an administrator';
  end if;

  if p_decision is null or p_decision not in ('approve', 'reject', 'return') then
    raise exception 'Unknown decision' using errcode = '22023';
  end if;
  if v_record.status = 'cancelled' then
    raise exception 'This record was cancelled by the employee';
  elsif v_record.status <> 'awaiting' then
    raise exception 'Another manager has already decided: %', v_label ->> v_record.status;
  end if;
  if char_length(v_comment) > 500 then
    raise exception 'The comment can be at most 500 characters';
  end if;
  if p_decision = 'return' and v_comment is null then
    raise exception 'Tell the employee what to fix';
  end if;

  if p_decision = 'approve' and v_record.leave_type in ('sick', 'personal') then
    perform pg_advisory_xact_lock(hashtextextended(v_record.employee_id::text, 0));
    v_share := private.record_share(p_record_id);
    v_remaining := private.remaining_hundredths(
      v_record.employee_id, v_record.leave_type, private.school_year_of(v_record.date)
    );
    if v_share > v_remaining and p_split is not true then
      v_type_label := case v_record.leave_type when 'sick' then 'Sick leave' else 'Personal leave' end;
      raise exception 'The % balance is % day: approve with the suggested split or reject',
        v_type_label, private.format_days(greatest(v_remaining, 0));
    end if;
    v_paid := least(v_share, greatest(v_remaining, 0));
  end if;

  -- «Перше рішення»: другий менеджер, що вирішує той самий запис одночасно, оновить 0 рядків (AC-DECIDE-07).
  update public.leave_records as r
  set status = case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'returned' end,
      manager_comment = v_comment,
      paid_days = case when v_paid is null then null else v_paid / 100.0 end,
      unpaid_days = case when v_paid is null then null else (v_share - v_paid) / 100.0 end,
      updated_at = now()
  where r.id = p_record_id and r.status = 'awaiting'
  returning r.status into v_status;

  if v_status is null then
    select r.status into v_status from public.leave_records as r where r.id = p_record_id;
    if v_status = 'cancelled' then
      raise exception 'This record was cancelled by the employee';
    end if;
    raise exception 'Another manager has already decided: %', v_label ->> v_status;
  end if;

  insert into public.leave_record_events (record_id, actor_id, action, comment)
  values (p_record_id, v_uid, v_status, v_comment);

  return jsonb_build_object(
    'status', v_status,
    'paid_days', case when v_paid is null then null else v_paid / 100.0 end,
    'unpaid_days', case when v_paid is null then null else (v_share - v_paid) / 100.0 end
  );
end;
$$;

revoke execute on function private.decide_leave_record(bigint, text, text, boolean) from public, anon;
grant execute on function private.decide_leave_record(bigint, text, text, boolean) to authenticated;

create or replace function public.decide_leave_record(
  p_record_id bigint,
  p_decision text,
  p_comment text default null,
  p_split boolean default false
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.decide_leave_record(p_record_id, p_decision, p_comment, p_split);
$$;

revoke execute on function public.decide_leave_record(bigint, text, text, boolean) from public, anon;
grant execute on function public.decide_leave_record(bigint, text, text, boolean) to authenticated;

-- ── Попередження й розподіл для менеджера, коли він відкриває запис (AC-BALANCE-09, -14) ──
-- Ті самі числа, що рахує decide_leave_record: частка запису й залишок навчального року його дати на цей момент.
-- Лише для того, хто може вирішити запис; для «Unpaid leave» і «Family celebration» ліміту немає — null.
create or replace function private.decision_balance(p_record_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_record public.leave_records%rowtype;
begin
  if not private.can_decide_record(p_record_id) then
    raise exception 'You can''t decide on this record' using errcode = '42501';
  end if;
  select * into v_record from public.leave_records as r where r.id = p_record_id;
  if v_record.leave_type not in ('sick', 'personal') then
    return null;
  end if;
  return jsonb_build_object(
    'leave_type', v_record.leave_type,
    'share', private.record_share(p_record_id) / 100.0,
    'remaining', private.remaining_hundredths(
      v_record.employee_id, v_record.leave_type, private.school_year_of(v_record.date)
    ) / 100.0
  );
end;
$$;

revoke execute on function private.decision_balance(bigint) from public, anon;
grant execute on function private.decision_balance(bigint) to authenticated;

create or replace function public.decision_balance(p_record_id bigint)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.decision_balance(p_record_id);
$$;

revoke execute on function public.decision_balance(bigint) from public, anon;
grant execute on function public.decision_balance(bigint) to authenticated;

-- ── Записи для /decisions з іменами (profiles за RLS показує лише власний профіль) ──
-- Менеджер — записи посад, за які відповідає (AC-DECIDE-01; власні теж видно, вирішує адміністратор, AC-DECIDE-18),
-- адміністратор — усі. Останнє рішення (хто й коли) — для «History» (AC-DECIDE-11).
create or replace function private.decision_records()
returns table (
  id bigint,
  request_id bigint,
  employee_id uuid,
  employee_name text,
  employee_email text,
  position_kind text,
  position_title text,
  division_name text,
  date date,
  start_min integer,
  end_min integer,
  minutes integer,
  status text,
  leave_type text,
  relationship text,
  employee_comment text,
  manager_comment text,
  paid_days numeric,
  unpaid_days numeric,
  created_at timestamptz,
  decided_at timestamptz,
  decided_by_name text,
  can_decide boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.request_id, r.employee_id, e.full_name, e.email,
    p.kind, p.title, d.name,
    r.date, r.start_min, r.end_min, r.minutes, r.status, r.leave_type, r.relationship,
    r.employee_comment, r.manager_comment, r.paid_days, r.unpaid_days, r.created_at,
    ev.created_at, a.full_name,
    private.can_decide_record(r.id)
  from public.leave_records as r
  join public.profiles as e on e.id = r.employee_id
  join public.positions as p on p.id = r.position_id
  join public.divisions as d on d.id = p.division_id
  left join lateral (
    select x.created_at, x.actor_id
    from public.leave_record_events as x
    where x.record_id = r.id and x.action in ('approved', 'rejected', 'returned')
    order by x.created_at desc, x.id desc
    limit 1
  ) as ev on true
  left join public.profiles as a on a.id = ev.actor_id
  where (select auth.uid()) is not null
    and (private.manages_position(r.position_id) or private.current_app_role() = 'admin')
  order by r.date, r.start_min, r.id;
$$;

revoke execute on function private.decision_records() from public, anon;
grant execute on function private.decision_records() to authenticated;

create or replace function public.decision_records()
returns table (
  id bigint,
  request_id bigint,
  employee_id uuid,
  employee_name text,
  employee_email text,
  position_kind text,
  position_title text,
  division_name text,
  date date,
  start_min integer,
  end_min integer,
  minutes integer,
  status text,
  leave_type text,
  relationship text,
  employee_comment text,
  manager_comment text,
  paid_days numeric,
  unpaid_days numeric,
  created_at timestamptz,
  decided_at timestamptz,
  decided_by_name text,
  can_decide boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.decision_records();
$$;

revoke execute on function public.decision_records() from public, anon;
grant execute on function public.decision_records() to authenticated;

-- ── Історія запису з іменами (AC-DECIDE-10, -15) ────────────────────────────
-- Працівнику — його записи, менеджеру — записи його посад, адміністратору — усі (private.can_see_record).
-- Неіснуючий чи чужий запис — порожньо, однаково.
create or replace function private.record_history(p_record_id bigint)
returns table (created_at timestamptz, action text, comment text, actor_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select ev.created_at, ev.action, ev.comment, a.full_name
  from public.leave_record_events as ev
  left join public.profiles as a on a.id = ev.actor_id
  where (select auth.uid()) is not null
    and ev.record_id = p_record_id
    and private.can_see_record(p_record_id)
  order by ev.created_at, ev.id;
$$;

revoke execute on function private.record_history(bigint) from public, anon;
grant execute on function private.record_history(bigint) to authenticated;

create or replace function public.record_history(p_record_id bigint)
returns table (created_at timestamptz, action text, comment text, actor_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.record_history(p_record_id);
$$;

revoke execute on function public.record_history(bigint) from public, anon;
grant execute on function public.record_history(bigint) to authenticated;
