-- Погодження бере спільний lock календаря (друга думка до #75, знахідка 6:
-- https://github.com/rhutsul/leave-portal/pull/75#issuecomment-6942691638).
--
-- Гонка. private.decide_leave_record брало лише advisory lock працівника, а add_school_closure і remove_school_closure —
-- ексклюзивний lock календаря. У Read Committed кожен оператор plpgsql бачить свій знімок, тож private.record_share
-- (звідки paid_days і unpaid_days для «Sick leave» і «Personal leave») і тригер private.fix_day_share (звідки day_share)
-- могли прочитати календар до і після закриття, закоміченого між ними. Приклад: скорочений день з 12:00, працівник
-- 08:30–15:30, погоджують 08:30–11:00. record_share рахує від 210 хвилин — 0.71; закриття прибрали; тригер рахує від
-- 420 — 0.36. Запис зберігся з day_share 0.36 ≠ paid_days + unpaid_days 0.71, і залишок і розподіл розійшлися.
--
-- Виправлення. Після lock працівника — pg_advisory_xact_lock_shared(private.calendar_lock_key()), як у
-- update_leave_record_hours (20261108165906_school_calendar_requests.sql) і submit_leave_request: календар не
-- змінюється від першого читання частки до кінця транзакції, тож record_share, перевірка залишку й тригер бачать той
-- самий календар. Закриття, додане чи прибране під час рішення, чекає на його кінець (і навпаки) — частку рахує
-- календар на момент рішення, як каже AC-CAL-20.
--
-- Порядок блокувань — той самий, що в update_leave_record_hours: спершу працівник, потім спільний календар.
-- add/remove_school_closure беруть лише ексклюзивний lock календаря, без lock працівника і без блокувань рядків
-- leave_records, тож циклу очікування немає; submit_leave_request бере лише спільний lock календаря, а спільний зі
-- спільним не конфліктують. Обернений порядок (календар, потім працівник) міг би зачепитися за ексклюзивний запит
-- закриття в черзі між двома спільними, тому його не беремо.
--
-- Сигнатура та сама — create or replace зберігає права (revoke від public і anon, grant authenticated); тіло — копія
-- 20261021171135_leave_record_edit.sql з одним новим рядком lock.

create or replace function private.decide_leave_record(
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
  -- Рішення — лише щодо конкретних годин: rpc доступна й напряму, тож без них відмова, а не рішення без перевірки.
  if p_start_min is null or p_end_min is null then
    raise exception 'The reviewed hours are required' using errcode = '22023';
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
  -- Після lock працівника — спільний lock календаря (як update_leave_record_hours): record_share нижче і тригер
  -- private.fix_day_share в update бачать той самий календар, закриття не змінить його посеред рішення (AC-CAL-20).
  perform pg_advisory_xact_lock_shared(private.calendar_lock_key());

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
