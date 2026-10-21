-- Дії працівника із власним записом до рішення (задача 5 openspec/changes/impl-leave-ws6/tasks.md, D4): зміна годин,
-- повторне подання поверненого запису, скасування; і дата без робочих годин у заявці на кілька дат (AC-LEAVE-21).
-- Ті самі правила — у src/lib/leave/decision.ts і src/lib/leave/request.ts (для повідомлень і кнопок); база — другий рубіж.
--
-- Правила з 20261012000000_profiles_and_roles.sql: security definer — лише в схемі private з `set search_path = ''`,
-- public-обгортки — security invoker; revoke від public і anon, grant execute лише authenticated.
-- Нових таблиць немає; authenticated, як і раніше, не має insert / update / delete на leave_records: працівник не
-- змінить напряму ні тип, ні дату, ні посаду запису (AC-DECIDE-21) — лише години через функцію нижче.

-- ── Години запису за розкладом посади (спільне для подання й зміни годин) ──
-- Ті самі перевірки й тексти PM, що checkHours у src/lib/leave/time.ts, у тому самому порядку: розклад дня
-- (AC-LEAVE-06) → крок 5 хв → кінець блоку лише як кінець (AC-LEAVE-08, AC-LEAVE-20) → кінець пізніше за початок
-- (AC-LEAVE-09) → початок і кінець усередині блоків (AC-LEAVE-07, AC-LEAVE-19). Повертає хвилини всередині блоків
-- (AC-LEAVE-15). Внутрішня: викликають лише security definer функції нижче.
create or replace function private.check_record_hours(p_position_id bigint, p_date date, p_start integer, p_end integer)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_weekday smallint := extract(isodow from p_date)::smallint;
  v_blocks text;
  v_minutes integer;
begin
  if p_date is null or not exists (
    select 1 from public.schedule_blocks as b where b.position_id = p_position_id and b.weekday = v_weekday
  ) then
    raise exception 'You have no working hours on this day';
  end if;

  if p_start is null or p_end is null or p_start < 0 or p_end > 1440 or p_start % 5 <> 0 or p_end % 5 <> 0 then
    raise exception 'Enter times in 5-minute steps';
  end if;

  if not exists (
    select 1 from public.schedule_blocks as b
    where b.position_id = p_position_id and b.weekday = v_weekday and p_start >= b.start_min and p_start < b.end_min
  ) and exists (
    select 1 from public.schedule_blocks as b
    where b.position_id = p_position_id and b.weekday = v_weekday and b.end_min = p_start
  ) then
    raise exception '% is the end of working time and can only be chosen as the end of leave',
      private.format_minutes(p_start);
  end if;

  if p_end <= p_start then
    raise exception 'The end must be later than the start';
  end if;

  if not exists (
    select 1 from public.schedule_blocks as b
    where b.position_id = p_position_id and b.weekday = v_weekday and p_start >= b.start_min and p_start < b.end_min
  ) or not exists (
    select 1 from public.schedule_blocks as b
    where b.position_id = p_position_id and b.weekday = v_weekday and p_end > b.start_min and p_end <= b.end_min
  ) then
    select string_agg(private.format_minutes(b.start_min) || '–' || private.format_minutes(b.end_min), ', '
                      order by b.start_min)
      into v_blocks
      from public.schedule_blocks as b
     where b.position_id = p_position_id and b.weekday = v_weekday;
    raise exception 'Hours must be within your schedule: %', v_blocks;
  end if;

  select sum(greatest(0, least(p_end, b.end_min) - greatest(p_start, b.start_min)))
    into v_minutes
    from public.schedule_blocks as b
   where b.position_id = p_position_id and b.weekday = v_weekday;
  return v_minutes;
end;
$$;

revoke execute on function private.check_record_hours(bigint, date, integer, integer) from public, anon, authenticated;

-- ── Подання заявки: дата без робочих годин не входить у заявку (AC-LEAVE-21) ──
-- Як у 20261020190045_leave_requests_schema.sql, з однією зміною: запис дати, на яку в працівника немає жодного блоку
-- розкладу (усі посади), пропускаємо, а записи інших дат створюємо — «усі або жоден» лише для прийнятих дат
-- (Assumptions 01-leave-request). Якщо не прийнято жодної дати — 'You have no working hours on this day', як раніше.
-- Посада без розкладу в день, коли інші посади працівника працюють, — і далі помилка (форма таку посаду не показує).
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

      -- Лише власна посада: заявку від імені іншого працівника цей зріз не дає (WS11).
      if not exists (select 1 from public.positions as p where p.id = v_position and p.employee_id = v_uid) then
        raise exception 'Position not found' using errcode = '42501';
      end if;

      -- AC-LEAVE-21: дата без робочих годин працівника не приймається, інші дати заявки лишаються.
      if v_date is not null and private.working_minutes(v_uid, v_date) = 0 then
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
    raise exception 'You have no working hours on this day';
  end if;

  return v_request_id;
end;
$$;

-- ── Власний запис працівника для зміни ──────────────────────────────────────
-- Блокує рядок до кінця транзакції (рішення менеджера чекає й бачить новий статус). Неіснуючий і чужий запис — та
-- сама відповідь (42501), щоб не розкривати, чи запис існує. Внутрішня: викликають лише функції нижче.
create or replace function private.own_record_for_change(p_record_id bigint)
returns public.leave_records
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_record public.leave_records%rowtype;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into v_record
    from public.leave_records as r
   where r.id = p_record_id and r.employee_id = v_uid
     for update;
  if not found then
    raise exception 'Record not found' using errcode = '42501';
  end if;
  return v_record;
end;
$$;

-- Чому запис не можна змінити: «Approved» — текст PM (AC-DECIDE-12); «Rejected» і «Cancelled» — фінальні статуси
-- (Assumptions 02-leave-decision), тексти — власні, як recordLockedMessage у src/lib/leave/decision.ts.
create or replace function private.locked_record_message(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'approved' then 'This record is already approved and cannot be changed'
    when 'rejected' then 'This record is already rejected and cannot be changed'
    when 'cancelled' then 'This record is cancelled and cannot be changed'
    else 'This record cannot be changed'
  end;
$$;

revoke execute on function private.own_record_for_change(bigint) from public, anon, authenticated;
revoke execute on function private.locked_record_message(text) from public, anon, authenticated;

-- ── Зміна годин до рішення (AC-DECIDE-06, -12, -16, -22) ────────────────────
-- Лише власник; лише «Awaiting decision» чи «Returned for revision»; статус не змінюється. Нові години — у розкладі
-- тієї самої посади на ту саму дату (Assumptions 02-leave-decision). Перетин — з іншими записами посади, але не з самим
-- записом: exclusion-обмеження D3 не порівнює рядок із собою; конфлікт — перший інший власний запис.
-- Той самий pg_advisory_xact_lock на працівника, що й decide_leave_record: погодження з розподілом не порахує частку
-- за старими хвилинами, поки працівник змінює години (лок — до блокування рядка, у тому самому порядку, без deadlock).
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
begin
  if (select auth.uid()) is not null then
    perform pg_advisory_xact_lock(hashtextextended((select auth.uid())::text, 0));
  end if;
  v_record := private.own_record_for_change(p_record_id);
  if v_record.status not in ('awaiting', 'returned') then
    raise exception '%', private.locked_record_message(v_record.status);
  end if;

  v_minutes := private.check_record_hours(v_record.position_id, v_record.date, p_start_min, p_end_min);
  if p_start_min = v_record.start_min and p_end_min = v_record.end_min then
    return;
  end if;

  begin
    update public.leave_records as r
       set start_min = p_start_min, end_min = p_end_min, minutes = v_minutes, updated_at = now()
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

revoke execute on function private.update_leave_record_hours(bigint, integer, integer) from public, anon;
grant execute on function private.update_leave_record_hours(bigint, integer, integer) to authenticated;

create or replace function public.update_leave_record_hours(p_record_id bigint, p_start_min integer, p_end_min integer)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_leave_record_hours(p_record_id, p_start_min, p_end_min);
$$;

revoke execute on function public.update_leave_record_hours(bigint, integer, integer) from public, anon;
grant execute on function public.update_leave_record_hours(bigint, integer, integer) to authenticated;

-- ── Повторне подання поверненого запису (AC-DECIDE-06, -17) ─────────────────
-- «Returned for revision» → «Awaiting decision»: запис знову в списку тих самих відповідальних менеджерів посади
-- (Assumptions 02-leave-decision; список рахує decision_records за position_managers). Скасований — фінальний.
-- Коментар повернення прибираємо з запису (він лишається в історії): запис знову чекає нового рішення.
create or replace function private.resubmit_leave_record(p_record_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.leave_records%rowtype;
begin
  v_record := private.own_record_for_change(p_record_id);
  if v_record.status = 'awaiting' then
    raise exception 'Only a record returned for revision can be resubmitted';
  elsif v_record.status <> 'returned' then
    raise exception '%', private.locked_record_message(v_record.status);
  end if;

  update public.leave_records as r
     set status = 'awaiting', manager_comment = null, updated_at = now()
   where r.id = p_record_id;
  insert into public.leave_record_events (record_id, actor_id, action)
  values (p_record_id, v_record.employee_id, 'resubmitted');
end;
$$;

revoke execute on function private.resubmit_leave_record(bigint) from public, anon;
grant execute on function private.resubmit_leave_record(bigint) to authenticated;

create or replace function public.resubmit_leave_record(p_record_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.resubmit_leave_record(p_record_id);
$$;

revoke execute on function public.resubmit_leave_record(bigint) from public, anon;
grant execute on function public.resubmit_leave_record(bigint) to authenticated;

-- ── Скасування (AC-DECIDE-13, -17) ──────────────────────────────────────────
-- Лише власний запис «Awaiting decision» чи «Returned for revision» (Assumptions 02-leave-decision); скасування
-- погодженого запису — WS11. «Cancelled» не блокує ті самі години й зникає зі списку «Awaiting decision».
create or replace function private.cancel_leave_record(p_record_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.leave_records%rowtype;
begin
  v_record := private.own_record_for_change(p_record_id);
  if v_record.status not in ('awaiting', 'returned') then
    raise exception '%', private.locked_record_message(v_record.status);
  end if;

  update public.leave_records as r set status = 'cancelled', updated_at = now() where r.id = p_record_id;
  insert into public.leave_record_events (record_id, actor_id, action)
  values (p_record_id, v_record.employee_id, 'cancelled');
end;
$$;

revoke execute on function private.cancel_leave_record(bigint) from public, anon;
grant execute on function private.cancel_leave_record(bigint) to authenticated;

create or replace function public.cancel_leave_record(p_record_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_leave_record(p_record_id);
$$;

revoke execute on function public.cancel_leave_record(bigint) from public, anon;
grant execute on function public.cancel_leave_record(bigint) to authenticated;

-- ── «My requests»: посада запису — для розкладу дня у формі зміни годин ─────
-- Як у 20261020190045_leave_requests_schema.sql, з новою колонкою position_id наприкінці (create or replace view
-- дозволяє лише додавати колонки в кінець); права й security_invoker лишаються.
create or replace view public.my_leave_records
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
  d.name as division_name,
  r.position_id
from public.leave_records as r
join public.positions as p on p.id = r.position_id
join public.divisions as d on d.id = p.division_id
where r.employee_id = (select auth.uid());

-- ── Рішення менеджера — щодо тих годин, які він бачив ───────────────────────
-- Тепер працівник змінює години запису, що чекає рішення, тож decide_leave_record з 20261021133002_leave_decisions.sql
-- отримує очікувані години (p_start_min, p_end_min — ті, що менеджер бачив на /decisions). Вони перевіряються в тому
-- самому update … where, що й «перше рішення»: рядок блокується, умову перевіряє вже нова версія рядка, тож зміна годин
-- між переглядом і рішенням не пройде навіть одночасно. Порядок блокувань той самий: спершу pg_advisory_xact_lock на
-- працівника (як у update_leave_record_hours), потім рядок. null — без перевірки годин (сумісність викликів без них).
-- Нова сигнатура — тож старі функції прибираємо (drop лише функцій, даних не зачіпає) і створюємо заново з тими самими
-- правами.
drop function public.decide_leave_record(bigint, text, text, boolean);
drop function private.decide_leave_record(bigint, text, text, boolean);

create function private.decide_leave_record(
  p_record_id bigint,
  p_decision text,
  p_comment text,
  p_split boolean,
  p_start_min integer,
  p_end_min integer
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
  v_remaining integer;
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

  -- Той самий лок працівника, що й зміна годин: частка нижче рахується з хвилин, які вже не зміняться до кінця
  -- транзакції; для «Unpaid leave» і «Family celebration» вистачає перевірки годин в update.
  perform pg_advisory_xact_lock(hashtextextended(v_record.employee_id::text, 0));

  if p_decision = 'approve' and v_record.leave_type in ('sick', 'personal') then
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

  -- «Перше рішення» й ті самі години: другий менеджер чи змінені години — 0 рядків (AC-DECIDE-07).
  update public.leave_records as r
  set status = case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'returned' end,
      manager_comment = v_comment,
      paid_days = case when v_paid is null then null else v_paid / 100.0 end,
      unpaid_days = case when v_paid is null then null else (v_share - v_paid) / 100.0 end,
      updated_at = now()
  where r.id = p_record_id and r.status = 'awaiting'
    and (p_start_min is null or r.start_min = p_start_min)
    and (p_end_min is null or r.end_min = p_end_min)
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

revoke execute on function private.decide_leave_record(bigint, text, text, boolean, integer, integer) from public, anon;
grant execute on function private.decide_leave_record(bigint, text, text, boolean, integer, integer) to authenticated;

create function public.decide_leave_record(
  p_record_id bigint,
  p_decision text,
  p_comment text default null,
  p_split boolean default false,
  p_start_min integer default null,
  p_end_min integer default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.decide_leave_record(p_record_id, p_decision, p_comment, p_split, p_start_min, p_end_min);
$$;

revoke execute on function public.decide_leave_record(bigint, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.decide_leave_record(bigint, text, text, boolean, integer, integer) to authenticated;
