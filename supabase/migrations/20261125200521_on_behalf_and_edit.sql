-- Заявка від імені працівника і правка запису до рішення (вимога PM requirements/08-on-behalf-and-edit.md,
-- AC-BEHALF-01…15; план openspec/changes/impl-on-behalf/design.md, D1–D9, D13).
--
-- Що додає (крок 1 D9 — expand):
--   * D1: private.can_act_for_employee — хто подає від імені кого; private.check_on_behalf — порядок відмов і тексти.
--   * D2: private.decides_for_position — чий запис погоджується одразу; одне місце для заступників: тіло кличе
--     private.manages_position, куди зріз staff-management (20261125082128_staff_management.sql) уже підключив
--     private.acting_manager_ids.
--   * D3: ядро подання private.create_leave_request (тіло private.submit_leave_request зі зрізу substitutes з трьома
--     точковими змінами: власник — p_employee_id, lock busy: — на власника, подія — submitted / submitted_on_behalf);
--     private.submit_leave_request стає тонкою обгорткою з тією самою сигнатурою; нова
--     private.submit_leave_request_on_behalf і обгортка public.
--   * D4: дві нові дії історії — submitted_on_behalf і record_changed; рядок PM — у comment.
--   * D5: private.approval_split — частка й оплачене при погодженні; одне правило для рішення й погодження одразу.
--   * D6: private.on_behalf_message — «this employee» замін «you» (та сама таблиця — forEmployee у
--     src/lib/leave/on-behalf.ts).
--   * D7: private.edit_leave_record і обгортка public — БЕЗ гранту для authenticated до кроку 4 D9.
--   * D8: функції читання on_behalf_employees, on_behalf_positions, on_behalf_record_dates.
--   * D9: decide_leave_record з дев'ятьма параметрами (дата, тип і заміна, які бачив менеджер) над спільним тілом
--     private.decide_leave_record_core; стара шестипараметрова — тонка обгортка з p_check_fields => false.
--
-- Права: security definer — лише в схемі private з `set search_path = ''`; public-обгортки — security invoker;
-- revoke від public і anon, grant execute лише authenticated (крім edit_leave_record). Внутрішні хелпери закриті й
-- від authenticated. Тексти для людини — P0001, відмова в доступі — 42501.
--
-- Порядок викатки (D13, AGENTS.md «Код і схема виходять на прод не разом»): нових таблиць і колонок немає; сигнатури
-- submit_leave_request і шестипараметрової decide_leave_record ті самі, тож код до й після db-deploy працює. Сторінки
-- /on-behalf/** до db-deploy показують «The page could not be loaded. Please try again.».

-- ── D4. Нові дії історії ────────────────────────────────────────────────────
alter table public.leave_record_events drop constraint leave_record_events_action_check;
alter table public.leave_record_events add constraint leave_record_events_action_check check (
  action in (
    'submitted', 'approved', 'rejected', 'returned', 'resubmitted', 'hours_changed', 'cancelled',
    'cancellation_requested', 'cancellation_declined', 'submitted_on_behalf', 'record_changed'
  )
);

-- ── Спільне ─────────────────────────────────────────────────────────────────
-- Назва типу з глосарію (LEAVE_TYPES у src/lib/leave/request.ts); «Family celebration» — зі стосунком у дужках
-- (розробник, D4): без стосунку запис цього типу недійсний.
create function private.leave_type_label(p_leave_type text, p_relationship text default null)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_leave_type
           when 'sick' then 'Sick leave'
           when 'personal' then 'Personal leave'
           when 'unpaid' then 'Unpaid leave'
           when 'family' then 'Family celebration' || coalesce(' (' || p_relationship || ')', '')
           else p_leave_type
         end;
$$;

revoke execute on function private.leave_type_label(text, text) from public, anon, authenticated;

-- ── D6. «this employee» замість «you» ───────────────────────────────────────
-- Замінює лише початок відомих текстів працівника, решту повертає як є. Та сама таблиця — forEmployee у
-- src/lib/leave/on-behalf.ts (тест порівнює обидві на тих самих рядках).
create function private.on_behalf_message(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when p_text = 'You have no working hours on this day'
             then 'This employee has no working hours on this day'
           when starts_with(p_text, 'Hours must be within your schedule: ')
             then 'Hours must be within the schedule: ' || substr(p_text, char_length('Hours must be within your schedule: ') + 1)
           when starts_with(p_text, 'You already have a request for this time: ')
             then 'This employee already has a request for this time: '
                  || substr(p_text, char_length('You already have a request for this time: ') + 1)
           when p_text = 'This substitute is no longer on your substitute list'
             then 'This substitute is no longer on this employee''s substitute list'
           when starts_with(p_text, 'Your ') and strpos(p_text, ' balance is ') > 0
             then 'This employee''s ' || substr(p_text, char_length('Your ') + 1)
           else p_text
         end;
$$;

revoke execute on function private.on_behalf_message(text) from public, anon, authenticated;

-- ── D2. Чий запис погоджується одразу ───────────────────────────────────────
-- Адміністратор — будь-яку посаду; менеджер — посаду, за яку відповідає. Заступника вже рахує
-- private.manages_position (private.acting_manager_ids, staff-management D9) — у дні періоду заступник погоджує
-- одразу, як відповідальний менеджер. p_date — дата запису: правило заступника на дату запису, якщо PM вирішить так,
-- додається лише сюди, і погодження одразу, і правка (D7) отримають його без інших змін.
create function private.decides_for_position(p_position_id bigint, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_date is not null
     and case coalesce(private.current_app_role(), '')
           when 'admin' then true
           when 'manager' then private.manages_position(p_position_id)
           else false
         end;
$$;

revoke execute on function private.decides_for_position(bigint, date) from public, anon, authenticated;

-- ── D1. Хто подає від імені кого ────────────────────────────────────────────
-- Адміністратор — будь-хто, менеджер — працівник будь-якої з посад, за які він відповідає; ніколи не сам користувач
-- (власна заявка — «New request») і не деактивований чи неіснуючий профіль (розробник).
create function private.can_act_for_employee(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_employee_id is not null
     and p_employee_id is distinct from (select auth.uid())
     and exists (select 1 from public.profiles as p where p.id = p_employee_id and p.deactivated_at is null)
     and case coalesce(private.current_app_role(), '')
           when 'admin' then true
           when 'manager' then private.manages_employee(p_employee_id)
           else false
         end;
$$;

revoke execute on function private.can_act_for_employee(uuid) from public, anon, authenticated;

-- Чи може поточний користувач подавати від імені взагалі: не ввійшов, роль employee, менеджер без жодного працівника
-- своїх посад (AC-BEHALF-12, AC-BEHALF-15). Перша умова, що спрацювала, дає текст (D1).
create function private.require_on_behalf_role()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_role text := coalesce(private.current_app_role(), '');
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if v_role not in ('manager', 'admin') then
    raise exception 'Only a manager or an administrator can submit a request on behalf of an employee' using errcode = '42501';
  end if;
  if v_role = 'manager' and not exists (
    select 1 from public.positions as p where p.employee_id <> v_uid and private.manages_position(p.id)
  ) then
    raise exception 'You have no employees to submit requests for' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function private.require_on_behalf_role() from public, anon, authenticated;

-- Перевірки D1 для конкретного працівника — у функціях D3 і D8 однаково. Неіснуючий працівник — той самий текст
-- AC-BEHALF-11: не розкриваємо, чи профіль існує.
create function private.check_on_behalf(p_employee_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_on_behalf_role();
  if p_employee_id = (select auth.uid()) then
    raise exception 'Submit your own leave from New request';
  end if;
  if not private.can_act_for_employee(p_employee_id) then
    raise exception 'You can submit requests only for employees of your positions' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function private.check_on_behalf(uuid) from public, anon, authenticated;

-- ── D5. Частка й оплачене при погодженні ────────────────────────────────────
-- «Sick leave» і «Personal leave»: share — частка дня запису (сотні), paid — скільки з неї покриває залишок; інші типи
-- — null. Те саме правило для decide_leave_record і погодження одразу (AC-BALANCE-10, AC-BEHALF-04).
create function private.approval_split(p_record_id bigint, out share integer, out paid integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_record public.leave_records%rowtype;
begin
  select * into v_record from public.leave_records as r where r.id = p_record_id;
  if not found or v_record.leave_type not in ('sick', 'personal') then
    return;
  end if;
  share := private.record_share(p_record_id);
  paid := least(share, greatest(
    private.remaining_hundredths(v_record.employee_id, v_record.leave_type, private.school_year_of(v_record.date)), 0
  ));
end;
$$;

revoke execute on function private.approval_split(bigint) from public, anon, authenticated;

-- ── D3. Ядро подання ────────────────────────────────────────────────────────
-- Тіло private.submit_leave_request з 20261125000321_substitutes.sql. Відмінності — лише три місця, де воно брало
-- auth.uid(): власник записів — p_employee_id; lock busy: — на p_employee_id і вибраних замін; подія —
-- submitted (сам працівник) або submitted_on_behalf з рядком PM (AC-BEHALF-01). Тексти лишаються «you»-текстами
-- працівника; для менеджера їх перекладає submit_leave_request_on_behalf (D6). Внутрішня: викликають лише функції
-- нижче, які вже перевірили, хто подає.
create function private.create_leave_request(
  p_employee_id  uuid,
  p_actor_id     uuid,
  p_leave_type   text,
  p_records      jsonb,
  p_relationship text,
  p_comment      text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
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
  v_on_behalf  text;
  -- Чому не прийнято найранішу відкинуту дату: текст для заявки, у якій не прийнято жодної.
  v_skip_date  date;
  v_skip_text  text;
begin
  if p_employee_id is null or p_actor_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- Спільний lock календаря (ексклюзивно його бере private.add_school_closure): заявки одна одну не чекають, а нове
  -- закриття не проскочить повз запис, поданий у ту саму мить (design.md D2, D4 impl-school-calendar).
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

  -- Lock зайнятості — на власника (хтось може саме вибирати його заміною) і на всіх вибраних замін.
  perform private.lock_busy(
    array[p_employee_id] || array(
      select nullif(x.item ->> 'substitute_id', '')::uuid from jsonb_array_elements(p_records) as x (item)
    )
  );

  if p_actor_id <> p_employee_id then
    v_on_behalf := 'Submitted by ' || (select p.email from public.profiles as p where p.id = p_actor_id)
      || ' on behalf of ' || (select p.email from public.profiles as p where p.id = p_employee_id);
  end if;

  insert into public.leave_requests (employee_id, leave_type, relationship, employee_comment)
  values (p_employee_id, p_leave_type, p_relationship, v_comment)
  returning id into v_request_id;

  begin
    for v_item in select value from jsonb_array_elements(p_records) loop
      v_position := (v_item ->> 'position_id')::bigint;
      v_date := (v_item ->> 'date')::date;
      v_start := (v_item ->> 'start_min')::integer;
      v_end := (v_item ->> 'end_min')::integer;
      v_substitute := nullif(v_item ->> 'substitute_id', '')::uuid;

      -- Лише посада власника записів.
      if not exists (select 1 from public.positions as p where p.id = v_position and p.employee_id = p_employee_id) then
        raise exception 'Position not found' using errcode = '42501';
      end if;

      -- AC-CAL-03, AC-CAL-16: закрита для працівника дата не приймається, як і дата без робочих годин (AC-LEAVE-21):
      -- інші дати заявки лишаються. working_minutes уже враховує закриття.
      v_closed := case when v_date is null then null else private.closed_day_name(p_employee_id, v_date) end;
      if v_closed is not null or (v_date is not null and private.working_minutes(p_employee_id, v_date) = 0) then
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
          select 1 from public.substitute_lists as s where s.employee_id = p_employee_id and s.substitute_id = v_substitute
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
        v_request_id, v_position, p_employee_id, v_date, v_start, v_end, v_minutes,
        p_leave_type, p_relationship, v_comment, v_substitute, v_upgrade
      )
      returning id into v_record_id;
      v_accepted := v_accepted + 1;

      if v_on_behalf is null then
        insert into public.leave_record_events (record_id, actor_id, action)
        values (v_record_id, p_actor_id, 'submitted');
      else
        insert into public.leave_record_events (record_id, actor_id, action, comment)
        values (v_record_id, p_actor_id, 'submitted_on_behalf', v_on_behalf);
      end if;
    end loop;
  exception
    when exclusion_violation then
      -- Записи цієї заявки вже відкочено: шукаємо перший наявний запис власника, з яким вона перетинається
      -- (AC-LEAVE-13, AC-LEAVE-16). Лише записи власника: інакше текст помилки розкрив би чужий запис.
      select r.date, r.start_min, r.end_min
        into v_conflict
        from public.leave_records as r
        join jsonb_array_elements(p_records) as x (item)
          on r.position_id = (x.item ->> 'position_id')::bigint
         and r.date = (x.item ->> 'date')::date
         and int4range(r.start_min, r.end_min)
             && int4range((x.item ->> 'start_min')::integer, (x.item ->> 'end_min')::integer)
       where r.employee_id = p_employee_id
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

revoke execute on function private.create_leave_request(uuid, uuid, text, jsonb, text, text) from public, anon, authenticated;

-- Власна заявка — та сама сигнатура й поведінка (create or replace зберігає грант authenticated для обгортки).
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
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return private.create_leave_request(v_uid, v_uid, p_leave_type, p_records, p_relationship, p_comment);
end;
$$;

-- ── D3. Подання від імені ───────────────────────────────────────────────────
-- Перевірки D1 → lock працівника (до спільного lock календаря в ядрі: той самий порядок, що в decide_leave_record і
-- update_leave_record_hours) → ядро з перекладом текстів (D6) → погодження записів посад, за які подавач відповідає
-- (D2, D5), по черзі за датою: другий запис бачить залишок після першого (AC-BALANCE-14). Усе в одній транзакції.
create function private.submit_leave_request_on_behalf(
  p_employee_id  uuid,
  p_leave_type   text,
  p_records      jsonb,
  p_relationship text default null,
  p_comment      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_request_id bigint;
  v_record     record;
  v_share      integer;
  v_paid       integer;
  v_approved   integer := 0;
  v_awaiting   integer := 0;
begin
  perform private.check_on_behalf(p_employee_id);
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));

  begin
    v_request_id := private.create_leave_request(
      p_employee_id, v_uid, p_leave_type, p_records, p_relationship, p_comment
    );
  exception
    when raise_exception then
      raise exception '%', private.on_behalf_message(sqlerrm);
  end;

  for v_record in
    select r.id, r.position_id, r.date
    from public.leave_records as r
    where r.request_id = v_request_id
    order by r.date, r.start_min, r.id
  loop
    if private.decides_for_position(v_record.position_id, v_record.date) then
      -- «Approved with the suggested split, as in AC-BALANCE-10» (Assumptions PM): частку фіксує тригер
      -- private.fix_day_share, як у звичайного погодження.
      select s.share, s.paid into v_share, v_paid from private.approval_split(v_record.id) as s;
      update public.leave_records as r
      set status = 'approved',
          paid_days = case when v_paid is null then null else v_paid / 100.0 end,
          unpaid_days = case when v_paid is null then null else (v_share - v_paid) / 100.0 end,
          updated_at = now()
      where r.id = v_record.id;
      insert into public.leave_record_events (record_id, actor_id, action) values (v_record.id, v_uid, 'approved');
      v_approved := v_approved + 1;
    else
      v_awaiting := v_awaiting + 1;
    end if;
  end loop;

  return jsonb_build_object('request_id', v_request_id, 'approved', v_approved, 'awaiting', v_awaiting);
end;
$$;

revoke execute on function private.submit_leave_request_on_behalf(uuid, text, jsonb, text, text) from public, anon;
grant execute on function private.submit_leave_request_on_behalf(uuid, text, jsonb, text, text) to authenticated;

create function public.submit_leave_request_on_behalf(
  p_employee_id  uuid,
  p_leave_type   text,
  p_records      jsonb,
  p_relationship text default null,
  p_comment      text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.require_active();
  select private.submit_leave_request_on_behalf(p_employee_id, p_leave_type, p_records, p_relationship, p_comment);
$$;

revoke execute on function public.submit_leave_request_on_behalf(uuid, text, jsonb, text, text) from public, anon;
grant execute on function public.submit_leave_request_on_behalf(uuid, text, jsonb, text, text) to authenticated;

-- ── D8. Читання для форми від імені ─────────────────────────────────────────
-- Мінімум полів: email, посади з розкладом і дати чинних записів. Ширшої RLS на profiles, positions і leave_records не
-- додаємо: вона віддала б менеджеру чужі посади, типи й коментарі.
create function private.on_behalf_employees()
returns table (employee_id uuid, email text, main_title text, division_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_on_behalf_role();
  return query
    select p.id, p.email, mp.title, d.name
    from public.profiles as p
    left join public.positions as mp on mp.employee_id = p.id and mp.kind = 'main'
    left join public.divisions as d on d.id = mp.division_id
    where private.can_act_for_employee(p.id)
    order by p.email;
end;
$$;

create function private.on_behalf_positions(p_employee_id uuid)
returns table (id bigint, kind text, title text, division_name text, blocks jsonb, decides boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.check_on_behalf(p_employee_id);
  -- Блоки — так само, як читає власні посади loadOwnPositions (src/app/(app)/requests/new/load-positions.ts);
  -- що діє на дату запису, ще раз перевіряє ядро подання. decides — попередній перегляд «Approved» на сьогодні (Київ).
  return query
    select p.id, p.kind, p.title, d.name,
           coalesce((
             select jsonb_agg(
                      jsonb_build_object('weekday', b.weekday, 'start_min', b.start_min, 'end_min', b.end_min)
                      order by b.weekday, b.start_min
                    )
             from public.schedule_blocks as b
             where b.position_id = p.id
           ), '[]'::jsonb),
           private.decides_for_position(p.id, private.kyiv_day(now()))
    from public.positions as p
    join public.divisions as d on d.id = p.division_id
    where p.employee_id = p_employee_id
    order by case p.kind when 'main' then 0 else 1 end, p.id;
end;
$$;

-- Дати чинних записів працівника — календар форми їх зафарбовує. Статуси — той самий явний список, що
-- leave_records_no_overlap (BLOCKING_STATUSES); без типу й посади.
create function private.on_behalf_record_dates(p_employee_id uuid, p_from date, p_to date)
returns table (date date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.check_on_behalf(p_employee_id);
  return query
    select distinct r.date
    from public.leave_records as r
    where r.employee_id = p_employee_id
      and r.status in ('awaiting', 'returned', 'approved')
      and r.date between p_from and p_to
    order by r.date;
end;
$$;

revoke execute on function private.on_behalf_employees() from public, anon;
revoke execute on function private.on_behalf_positions(uuid) from public, anon;
revoke execute on function private.on_behalf_record_dates(uuid, date, date) from public, anon;
grant execute on function private.on_behalf_employees() to authenticated;
grant execute on function private.on_behalf_positions(uuid) to authenticated;
grant execute on function private.on_behalf_record_dates(uuid, date, date) to authenticated;

create function public.on_behalf_employees()
returns table (employee_id uuid, email text, main_title text, division_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.on_behalf_employees();
$$;

create function public.on_behalf_positions(p_employee_id uuid)
returns table (id bigint, kind text, title text, division_name text, blocks jsonb, decides boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.on_behalf_positions(p_employee_id);
$$;

create function public.on_behalf_record_dates(p_employee_id uuid, p_from date, p_to date)
returns table (date date)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.on_behalf_record_dates(p_employee_id, p_from, p_to);
$$;

revoke execute on function public.on_behalf_employees() from public, anon;
revoke execute on function public.on_behalf_positions(uuid) from public, anon;
revoke execute on function public.on_behalf_record_dates(uuid, date, date) from public, anon;
grant execute on function public.on_behalf_employees() to authenticated;
grant execute on function public.on_behalf_positions(uuid) to authenticated;
grant execute on function public.on_behalf_record_dates(uuid, date, date) to authenticated;

-- ── D7. Правка запису до рішення ────────────────────────────────────────────
-- Форма шле всі чотири поля (поточні значення для незмінених). Ті самі перевірки, що в новому записі: розклад,
-- шкільний календар, перетин з іншими записами працівника (сам із собою — ні), список і зайнятість заміни. Подія
-- record_changed — по одній на кожне змінене поле в порядку date, hours, leave type, substitute (AC-BEHALF-06…08).
-- Виняток на будь-якому кроці відкочує все (AC-BEHALF-09, AC-BEHALF-10, AC-BEHALF-13).
create function private.edit_leave_record(
  p_record_id     bigint,
  p_date          date,
  p_start_min     integer,
  p_end_min       integer,
  p_leave_type    text,
  p_relationship  text,
  p_substitute_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_record    public.leave_records%rowtype;
  v_actor     text;
  v_closed    text;
  v_minutes   integer;
  v_busy      record;
  v_conflict  record;
  v_old_sub   text;
  v_new_sub   text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into v_record from public.leave_records as r where r.id = p_record_id;
  -- Неіснуючий запис — та сама відповідь, що й чужий (AC-BEHALF-13): не розкриваємо, чи запис існує.
  if not found
     or not private.decides_for_position(v_record.position_id, v_record.date)
     or not private.decides_for_position(v_record.position_id, p_date) then
    raise exception 'You can''t change this record' using errcode = '42501';
  end if;
  if private.current_app_role() <> 'admin' and v_record.employee_id = v_uid then
    raise exception 'Your own record is decided by an administrator';
  end if;

  -- Порядок блокувань той самий, що в submit_leave_request_on_behalf і decide_leave_record: працівник → спільний
  -- календар → busy: власника, старої й нової заміни.
  perform pg_advisory_xact_lock(hashtextextended(v_record.employee_id::text, 0));
  perform pg_advisory_xact_lock_shared(private.calendar_lock_key());
  perform private.lock_busy(array[v_record.employee_id, v_record.substitute_id, p_substitute_id]);
  select * into v_record from public.leave_records as r where r.id = p_record_id for update;

  -- AC-BEHALF-10: змінювати можна лише запис «Awaiting decision» (розробник: «Returned for revision» теж вирішено).
  if v_record.status <> 'awaiting' then
    raise exception 'This record is already decided and cannot be changed';
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

  if p_date is null or p_start_min is null or p_end_min is null then
    raise exception 'Choose the date and hours' using errcode = '22023';
  end if;
  v_closed := private.closed_day_name(v_record.employee_id, p_date);
  if v_closed is not null then
    raise exception 'The school is closed on this day: %', v_closed;
  end if;
  if private.working_minutes(v_record.employee_id, p_date) = 0 then
    raise exception 'This employee has no working hours on this day';
  end if;

  begin
    v_minutes := private.check_record_hours(v_record.position_id, p_date, p_start_min, p_end_min);
  exception
    when raise_exception then
      raise exception '%', private.on_behalf_message(sqlerrm);
  end;

  if p_substitute_id is not null then
    if not exists (
      select 1 from public.substitute_lists as s
      where s.employee_id = v_record.employee_id and s.substitute_id = p_substitute_id
    ) then
      raise exception 'This substitute is not on this employee''s substitute list';
    end if;
    select c.date, c.start_min, c.end_min
      into v_busy
      from private.substitute_conflict(
        p_substitute_id, v_record.position_id, p_date, p_start_min, p_end_min, p_exclude_record => p_record_id
      ) as c;
    if found then
      raise exception '%', private.substitute_busy_message(p_substitute_id, v_busy.date, v_busy.start_min, v_busy.end_min);
    end if;
  end if;

  -- Нічого не змінилось — жодного рядка історії.
  if v_record.date = p_date and v_record.start_min = p_start_min and v_record.end_min = p_end_min
     and v_record.leave_type = p_leave_type and v_record.relationship is not distinct from p_relationship
     and v_record.substitute_id is not distinct from p_substitute_id then
    return;
  end if;

  begin
    update public.leave_records as r
    set date = p_date,
        start_min = p_start_min,
        end_min = p_end_min,
        minutes = v_minutes,
        leave_type = p_leave_type,
        relationship = p_relationship,
        substitute_id = p_substitute_id,
        upgrade_minutes = case when p_substitute_id is not null and private.upgrade_applies(r.position_id, p_substitute_id)
                               then v_minutes end,
        updated_at = now()
    where r.id = p_record_id;
  exception
    when exclusion_violation then
      -- «The record itself is not checked against itself» (Assumptions PM): шукаємо інший запис працівника.
      select r.date, r.start_min, r.end_min
        into v_conflict
        from public.leave_records as r
       where r.employee_id = v_record.employee_id
         and r.id <> p_record_id
         and r.position_id = v_record.position_id
         and r.date = p_date
         and r.status in ('awaiting', 'returned', 'approved')
         and int4range(r.start_min, r.end_min) && int4range(p_start_min, p_end_min)
       order by r.start_min
       limit 1;
      if found then
        raise exception 'This employee already has a request for this time: % %–%',
          to_char(v_conflict.date, 'YYYY-MM-DD'),
          private.format_minutes(v_conflict.start_min),
          private.format_minutes(v_conflict.end_min);
      end if;
      raise;
  end;

  v_actor := (select p.email from public.profiles as p where p.id = v_uid);

  if v_record.date <> p_date then
    insert into public.leave_record_events (record_id, actor_id, action, comment)
    values (p_record_id, v_uid, 'record_changed',
            v_actor || ' changed the date: ' || to_char(v_record.date, 'YYYY-MM-DD') || ' → ' || to_char(p_date, 'YYYY-MM-DD'));
  end if;
  if v_record.start_min <> p_start_min or v_record.end_min <> p_end_min then
    insert into public.leave_record_events (record_id, actor_id, action, comment)
    values (p_record_id, v_uid, 'record_changed',
            v_actor || ' changed the hours: '
              || private.format_minutes(v_record.start_min) || '–' || private.format_minutes(v_record.end_min) || ' → '
              || private.format_minutes(p_start_min) || '–' || private.format_minutes(p_end_min));
  end if;
  if v_record.leave_type <> p_leave_type or v_record.relationship is distinct from p_relationship then
    insert into public.leave_record_events (record_id, actor_id, action, comment)
    values (p_record_id, v_uid, 'record_changed',
            v_actor || ' changed the leave type: ' || private.leave_type_label(v_record.leave_type, v_record.relationship)
              || ' → ' || private.leave_type_label(p_leave_type, p_relationship));
  end if;
  if v_record.substitute_id is distinct from p_substitute_id then
    v_old_sub := coalesce((select p.email from public.profiles as p where p.id = v_record.substitute_id), 'No substitute');
    v_new_sub := coalesce((select p.email from public.profiles as p where p.id = p_substitute_id), 'No substitute');
    insert into public.leave_record_events (record_id, actor_id, action, comment)
    values (p_record_id, v_uid, 'record_changed', v_actor || ' changed the substitute: ' || v_old_sub || ' → ' || v_new_sub);
  end if;
end;
$$;

create function public.edit_leave_record(
  p_record_id     bigint,
  p_date          date,
  p_start_min     integer,
  p_end_min       integer,
  p_leave_type    text,
  p_relationship  text,
  p_substitute_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.require_active();
  select private.edit_leave_record(p_record_id, p_date, p_start_min, p_end_min, p_leave_type, p_relationship, p_substitute_id);
$$;

-- Крок 1 D9: правка закрита для всіх, поки існує шестипараметрова decide_leave_record, яка не бачить правки. Грант —
-- окремою міграцією кроку 4 разом із кнопкою «Edit record».
revoke execute on function private.edit_leave_record(bigint, date, integer, integer, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.edit_leave_record(bigint, date, integer, integer, text, text, uuid) from public, anon, authenticated;

-- ── D9. Рішення бачить, що бачив менеджер ───────────────────────────────────
-- Тіло 20261117083144_decide_calendar_lock.sql з трьома змінами: після lock запис читається заново; p_check_fields —
-- дата, тип і заміна, які бачив менеджер, мусять збігатися з записом (заміна — is distinct from: null означає
-- «No substitute»); частка й оплачене — private.approval_split (D5).
create function private.decide_leave_record_core(
  p_record_id     bigint,
  p_decision      text,
  p_comment       text,
  p_split         boolean,
  p_start_min     integer,
  p_end_min       integer,
  p_date          date,
  p_leave_type    text,
  p_substitute_id uuid,
  p_check_fields  boolean
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
  -- Усі крайові пробільні символи (переноси рядків, табуляції), як trim() у checkDecision: rpc доступна й напряму.
  v_comment text := nullif(regexp_replace(coalesce(p_comment, ''), '^\s+|\s+$', '', 'g'), '');
  v_share integer;
  v_paid integer;
  v_type_label text;
  v_label constant jsonb := jsonb_build_object(
    'approved', 'Approved', 'rejected', 'Rejected', 'returned', 'Returned for revision'
  );
  v_hours_changed constant text :=
    'The employee has changed the hours of this record. Check them again before deciding';
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
  -- Рішення — лише щодо конкретних годин: rpc доступна й напряму, тож без них відмова, а не рішення без перевірки.
  if p_start_min is null or p_end_min is null then
    raise exception 'The reviewed hours are required' using errcode = '22023';
  end if;
  if p_check_fields and (p_date is null or p_leave_type is null) then
    raise exception 'The reviewed record is required' using errcode = '22023';
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

  -- Той самий lock працівника, що й зміна годин і правка: запис нижче вже не зміниться до кінця транзакції.
  perform pg_advisory_xact_lock(hashtextextended(v_record.employee_id::text, 0));
  -- Після lock працівника — спільний lock календаря: record_share і тригер private.fix_day_share бачать той самий
  -- календар, закриття не змінить його посеред рішення (AC-CAL-20).
  perform pg_advisory_xact_lock_shared(private.calendar_lock_key());

  -- Після lock — заново: правка іншого менеджера могла змінити дату, тип чи заміну, поки цей дивився на панель.
  select * into v_record from public.leave_records as r where r.id = p_record_id;
  if p_check_fields and v_record.status = 'awaiting'
     and (v_record.date <> p_date or v_record.leave_type <> p_leave_type
          or v_record.substitute_id is distinct from p_substitute_id) then
    raise exception 'This record has been changed. Check it again before deciding';
  end if;

  if p_decision = 'approve' then
    select s.share, s.paid into v_share, v_paid from private.approval_split(p_record_id) as s;
    if v_share > v_paid and p_split is not true then
      v_type_label := case v_record.leave_type when 'sick' then 'Sick leave' else 'Personal leave' end;
      raise exception 'The % balance is % day: approve with the suggested split or reject',
        v_type_label, private.format_days(v_paid);
    end if;
  end if;

  -- «Перше рішення» й ті самі години: другий менеджер чи змінені години — 0 рядків (AC-DECIDE-07).
  update public.leave_records as r
  set status = case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'returned' end,
      manager_comment = v_comment,
      paid_days = case when v_paid is null then null else v_paid / 100.0 end,
      unpaid_days = case when v_paid is null then null else (v_share - v_paid) / 100.0 end,
      updated_at = now()
  where r.id = p_record_id and r.status = 'awaiting'
    and r.start_min = p_start_min and r.end_min = p_end_min
  returning r.status into v_status;

  if v_status is null then
    select * into v_record from public.leave_records as r where r.id = p_record_id;
    if v_record.status = 'cancelled' then
      raise exception 'This record was cancelled by the employee';
    elsif v_record.status <> 'awaiting' then
      raise exception 'Another manager has already decided: %', v_label ->> v_record.status;
    end if;
    raise exception '%', v_hours_changed;
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

revoke execute on function private.decide_leave_record_core(bigint, text, text, boolean, integer, integer, date, text, uuid, boolean)
  from public, anon, authenticated;

-- Стара сигнатура — тонка обгортка до contract (крок 3 D9): перевіряє лише години, як раніше. Права ті самі.
create or replace function private.decide_leave_record(
  p_record_id bigint,
  p_decision text,
  p_comment text,
  p_split boolean,
  p_start_min integer,
  p_end_min integer
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.decide_leave_record_core(
    p_record_id, p_decision, p_comment, p_split, p_start_min, p_end_min, null, null, null, false
  );
$$;

create function private.decide_leave_record(
  p_record_id     bigint,
  p_decision      text,
  p_comment       text,
  p_split         boolean,
  p_start_min     integer,
  p_end_min       integer,
  p_date          date,
  p_leave_type    text,
  p_substitute_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.decide_leave_record_core(
    p_record_id, p_decision, p_comment, p_split, p_start_min, p_end_min, p_date, p_leave_type, p_substitute_id, true
  );
$$;

revoke execute on function private.decide_leave_record(bigint, text, text, boolean, integer, integer, date, text, uuid)
  from public, anon;
grant execute on function private.decide_leave_record(bigint, text, text, boolean, integer, integer, date, text, uuid)
  to authenticated;

-- Нова public-сигнатура: p_date, p_leave_type і p_substitute_id обов'язкові (заміну шлемо й null), тож PostgREST
-- розрізняє її за набором назв параметрів зі старою (bigint, text, integer, integer, text, boolean).
create function public.decide_leave_record(
  p_record_id     bigint,
  p_decision      text,
  p_start_min     integer,
  p_end_min       integer,
  p_date          date,
  p_leave_type    text,
  p_substitute_id uuid,
  p_comment       text default null,
  p_split         boolean default false
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.decide_leave_record(
    p_record_id, p_decision, p_comment, p_split, p_start_min, p_end_min, p_date, p_leave_type, p_substitute_id
  );
$$;

revoke execute on function public.decide_leave_record(bigint, text, integer, integer, date, text, uuid, text, boolean)
  from public, anon;
grant execute on function public.decide_leave_record(bigint, text, integer, integer, date, text, uuid, text, boolean)
  to authenticated;
