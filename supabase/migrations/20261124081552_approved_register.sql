-- Реєстр погоджених відсутностей (ініціатива розробника, до вимог PM; docs/decisions/0012-approved-leave-register.md).
-- requirements/product.md: Vision («The register of approved leave is produced without manual copying, separately for
-- each division»), матриця прав «See the register of approved leave — employee: —, manager: only employees of own
-- positions, admin: yes», дорожня карта (later). AC немає.
--
-- Лише нові функції; таблиці, політики й дані не змінюються. Доступ — першим кроком у функціях security definer схеми
-- private (правило docs/decisions/README.md): адміністратор — усі записи підрозділу; менеджер — лише записи посад, які
-- він веде (private.manages_position), а не всі посади працівника; решта — нуль рядків. Публічні обгортки —
-- security invoker, лише для supabase.rpc, як public.decision_records.

-- ── Підрозділи, доступні в реєстрі ──────────────────────────────────────────
-- Адміністратор — усі; менеджер — ті, де веде хоч одну посаду; решта (і без входу) — жодного.
create or replace function private.register_divisions()
returns table (id bigint, code text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.code, d.name
  from public.divisions as d
  where (select auth.uid()) is not null
    and (
      private.current_app_role() = 'admin'
      or (
        private.current_app_role() = 'manager'
        and exists (
          select 1
          from public.positions as p
          join public.position_managers as pm on pm.position_id = p.id
          where p.division_id = d.id and pm.manager_id = (select auth.uid())
        )
      )
    )
  order by d.name, d.id;
$$;

revoke execute on function private.register_divisions() from public, anon;
grant execute on function private.register_divisions() to authenticated;

create or replace function public.register_divisions()
returns table (id bigint, code text, name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.register_divisions();
$$;

revoke execute on function public.register_divisions() from public, anon;
grant execute on function public.register_divisions() to authenticated;

-- ── Реєстр підрозділу за календарний місяць ─────────────────────────────────
-- p_month — будь-яка дата місяця; межі — календарний місяць дати запису (дата запису — за Києвом). Порожній параметр —
-- нуль рядків. Оплачувані й неоплачувані дні:
--   «Sick leave», «Personal leave» — розподіл рішення (paid_days / unpaid_days); без розподілу (тестові дані, погоджені
--   ключем) — уся частка дня day_share оплачувана;
--   «Unpaid leave» — уся частка дня неоплачувана;
--   «Family celebration» — уся частка дня оплачувана (припущення ADR 0012: тип не обмежений і не «Unpaid»).
-- Хто й коли погодив — остання подія «approved» запису (leave_record_events).
create or replace function private.approved_register(p_division_id bigint, p_month date)
returns table (
  record_id bigint,
  employee_id uuid,
  employee_name text,
  employee_email text,
  position_title text,
  position_kind text,
  date date,
  start_min integer,
  end_min integer,
  minutes integer,
  whole_day boolean,
  leave_type text,
  paid_days numeric,
  unpaid_days numeric,
  approved_at timestamptz,
  approved_by_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.employee_id, e.full_name, e.email,
    p.title, p.kind,
    r.date, r.start_min, r.end_min, r.minutes,
    coalesce(r.start_min = day.first_min and r.end_min = day.last_min, false),
    r.leave_type,
    case
      when r.leave_type = 'unpaid' then 0
      when r.leave_type in ('sick', 'personal') then coalesce(r.paid_days, r.day_share, 0)
      else coalesce(r.day_share, 0)
    end,
    case
      when r.leave_type = 'unpaid' then coalesce(r.day_share, 0)
      when r.leave_type in ('sick', 'personal') and r.paid_days is not null then coalesce(r.unpaid_days, 0)
      else 0
    end,
    ev.created_at, a.full_name
  from public.leave_records as r
  join public.positions as p on p.id = r.position_id
  join public.profiles as e on e.id = r.employee_id
  left join lateral (
    select min(b.start_min) as first_min, max(b.end_min) as last_min
    from public.schedule_blocks as b
    where b.position_id = r.position_id and b.weekday = extract(isodow from r.date)
  ) as day on true
  left join lateral (
    select x.created_at, x.actor_id
    from public.leave_record_events as x
    where x.record_id = r.id and x.action = 'approved'
    order by x.created_at desc, x.id desc
    limit 1
  ) as ev on true
  left join public.profiles as a on a.id = ev.actor_id
  where (select auth.uid()) is not null
    and p.division_id = p_division_id
    and r.date >= date_trunc('month', p_month)::date
    and r.date < (date_trunc('month', p_month) + interval '1 month')::date
    -- Лише «Approved»: реєстр погоджених відсутностей (requirements/product.md, Vision і матриця прав). Не набір
    -- BLOCKING_STATUSES: «Awaiting decision» і «Returned for revision» ще не погоджені, а запис, скасований після
    -- погодження, у реєстр не потрапляє (ADR 0012; тест — tests/db/approved-register.test.ts).
    and r.status = 'approved'
    and (
      private.current_app_role() = 'admin'
      or (private.current_app_role() = 'manager' and private.manages_position(r.position_id))
    )
  order by e.full_name, e.email, r.date, r.start_min, r.id;
$$;

revoke execute on function private.approved_register(bigint, date) from public, anon;
grant execute on function private.approved_register(bigint, date) to authenticated;

create or replace function public.approved_register(p_division_id bigint, p_month date)
returns table (
  record_id bigint,
  employee_id uuid,
  employee_name text,
  employee_email text,
  position_title text,
  position_kind text,
  date date,
  start_min integer,
  end_min integer,
  minutes integer,
  whole_day boolean,
  leave_type text,
  paid_days numeric,
  unpaid_days numeric,
  approved_at timestamptz,
  approved_by_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.approved_register(p_division_id, p_month);
$$;

revoke execute on function public.approved_register(bigint, date) from public, anon;
grant execute on function public.approved_register(bigint, date) to authenticated;
