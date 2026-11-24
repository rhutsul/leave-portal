-- Скасування погодженого запису через менеджера (вимога PM requirements/09-cancel-approved.md, AC-CANCEL-01…13;
-- план openspec/changes/impl-cancel-approved/design.md, D1–D5).
--
-- «Cancellation requested» — позначка на записі «Approved», а не новий статус (D1): набір статусів,
-- leave_records_no_overlap, BLOCKING_STATUSES, залишок і add_school_closure не змінюються. Запис із позначкою далі
-- рахується як «Approved» — у залишку, для перетинів і для закриття дня (Assumptions 09, AC-CAL-07).
--
-- Права. Нової таблиці немає: authenticated, як і раніше, має лише select на leave_records під політикою
-- leave_records_select_own_managed_or_admin (табличний grant select охоплює й нові колонки); insert / update / delete —
-- ні. Нові колонки пишуть лише три функції нижче: security definer у схемі private з `set search_path = ''`,
-- public-обгортки — security invoker; revoke від public і anon, grant execute лише authenticated (як
-- decide_leave_record). Тексти для людини — P0001, відмова в доступі — 42501.
--
-- Порядок викатки (D13): міграція лише додає колонки, обмеження, дві дії історії й нові функції; жодна наявна
-- сигнатура RPC чи view не змінюється, тож код до і після db-deploy працює.

-- ── D1. Прохання, відхилення, примітка ──────────────────────────────────────
alter table public.leave_records
  -- Причина відкритого прохання працівника; not null ⇔ позначка «Cancellation requested» (AC-CANCEL-01, -06).
  add column cancel_reason text,
  -- Подія cancellation_requested відкритого прохання: рішення менеджера стосується саме прохання, яке він бачив (D4).
  add column cancel_request_id bigint references public.leave_record_events (id),
  -- Коментар останнього відхилення — «Cancellation declined: …» (AC-CANCEL-03).
  add column cancel_declined_comment text,
  -- Примітка менеджера, що скасував запис сам (AC-CANCEL-08).
  add column cancel_note text,
  add constraint leave_records_cancel_reason_length_check check (char_length(cancel_reason) <= 500),
  add constraint leave_records_cancel_declined_length_check check (char_length(cancel_declined_comment) <= 500),
  add constraint leave_records_cancel_note_length_check check (char_length(cancel_note) <= 500),
  add constraint leave_records_cancel_reason_status_check check (cancel_reason is null or status = 'approved'),
  add constraint leave_records_cancel_declined_status_check check (cancel_declined_comment is null or status = 'approved'),
  add constraint leave_records_cancel_note_status_check check (cancel_note is null or status = 'cancelled'),
  add constraint leave_records_cancel_request_pair_check check ((cancel_request_id is null) = (cancel_reason is null));

comment on column public.leave_records.cancel_reason is
  'Причина відкритого прохання про скасування погодженого запису; not null — позначка «Cancellation requested».';

-- ── D2. Дії історії ─────────────────────────────────────────────────────────
-- Підтвердження і скасування менеджером — наявна дія cancelled (actor — менеджер).
alter table public.leave_record_events drop constraint leave_record_events_action_check;
alter table public.leave_record_events add constraint leave_record_events_action_check check (
  action in (
    'submitted', 'approved', 'rejected', 'returned', 'resubmitted', 'hours_changed', 'cancelled',
    'cancellation_requested', 'cancellation_declined'
  )
);

-- ── Спільне ─────────────────────────────────────────────────────────────────
-- Текст без крайових пробільних символів, порожній — null (як trim() у src/lib/leave/cancellation.ts).
create function private.trimmed_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(p_text, ''), '^\s+|\s+$', '', 'g'), '');
$$;

revoke execute on function private.trimmed_text(text) from public, anon, authenticated;

-- Хто вирішує прохання й скасовує запис з приміткою (D4, D5): адміністратор — будь-який запис; менеджер — записи
-- посад, за які відповідає, крім власних (Assumptions 09, AC-DECIDE-18). Неіснуючий запис (id null) — та сама
-- відповідь, що й чужий (AC-CANCEL-11). Заступників (вимога 07) ще немає: їхні права додадуться тут.
create function private.check_cancellation_actor(p_record public.leave_records)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Без рядка в profiles current_app_role() — null, і обидві умови нижче стали б null, а IF їх пропустив би:
  -- тож немає ролі — порожній рядок, і доступу немає.
  v_role text := coalesce(private.current_app_role(), '');
begin
  if p_record.id is null
     or not (v_role = 'admin' or (v_role = 'manager' and private.manages_position(p_record.position_id))) then
    raise exception 'You can''t decide on this record' using errcode = '42501';
  end if;
  if v_role <> 'admin' and p_record.employee_id = (select auth.uid()) then
    raise exception 'Your own record is decided by an administrator';
  end if;
end;
$$;

revoke execute on function private.check_cancellation_actor(public.leave_records) from public, anon, authenticated;

-- ── D3. Прохання працівника (AC-CANCEL-01, -05, -06, -10) ───────────────────
create function private.request_record_cancellation(p_record_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_record public.leave_records%rowtype;
  v_reason text := private.trimmed_text(p_reason);
  v_request_id bigint;
  v_updated bigint;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- Чужий і неіснуючий запис — однаково (AC-CANCEL-10).
  select * into v_record
    from public.leave_records as r
   where r.id = p_record_id and r.employee_id = v_uid
     for update;
  if not found then
    raise exception 'You can cancel only your own records' using errcode = '42501';
  end if;

  if v_record.status <> 'approved' then
    raise exception 'Only an approved record can be cancelled through the manager';
  end if;
  -- «Today or later» — дата за Києвом (Assumptions 09).
  if v_record.date < private.kyiv_day(now()) then
    raise exception 'Records in the past cannot be cancelled';
  end if;
  if v_record.cancel_reason is not null then
    raise exception 'Cancellation has already been requested';
  end if;
  if v_reason is null then
    raise exception 'Tell the manager why you want to cancel the record';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'The comment can be at most 500 characters';
  end if;

  -- Спершу подія, потім один update обох колонок: обмеження leave_records_cancel_request_pair_check не порушується.
  insert into public.leave_record_events (record_id, actor_id, action, comment)
  values (p_record_id, v_uid, 'cancellation_requested', v_reason)
  returning id into v_request_id;

  update public.leave_records as r
     set cancel_reason = v_reason, cancel_request_id = v_request_id, cancel_declined_comment = null, updated_at = now()
   where r.id = p_record_id and r.status = 'approved' and r.cancel_reason is null
  returning r.id into v_updated;
  -- Рядок заблоковано вище, тож це запобіжник; виняток відкочує й подію.
  if v_updated is null then
    raise exception 'Cancellation has already been requested';
  end if;
end;
$$;

revoke execute on function private.request_record_cancellation(bigint, text) from public, anon;
grant execute on function private.request_record_cancellation(bigint, text) to authenticated;

create function public.request_record_cancellation(p_record_id bigint, p_reason text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.request_record_cancellation(p_record_id, p_reason);
$$;

revoke execute on function public.request_record_cancellation(bigint, text) from public, anon;
grant execute on function public.request_record_cancellation(bigint, text) to authenticated;

-- ── D4. Рішення щодо прохання (AC-CANCEL-02, -03, -04, -07, -11) ────────────
-- p_request_id — cancel_request_id, який бачив менеджер: рішення лише щодо того самого прохання.
create function private.decide_record_cancellation(
  p_record_id bigint,
  p_request_id bigint,
  p_decision text,
  p_comment text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_record public.leave_records%rowtype;
  v_comment text := private.trimmed_text(p_comment);
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into v_record from public.leave_records as r where r.id = p_record_id;
  perform private.check_cancellation_actor(v_record);

  if p_decision is null or p_decision not in ('confirm', 'decline') or p_request_id is null then
    raise exception 'Unknown decision' using errcode = '22023';
  end if;

  -- Той самий lock працівника, що й decide_leave_record: погодження іншого запису з розподілом не порахує залишок,
  -- поки цей запис скасовують. Потім — рядок; далі всі перевірки читають заблокований рядок.
  perform pg_advisory_xact_lock(hashtextextended(v_record.employee_id::text, 0));
  select * into v_record from public.leave_records as r where r.id = p_record_id for update;

  if v_record.status = 'cancelled' then
    raise exception 'This record is already cancelled';
  end if;
  -- Рішення лише щодо відкритого прохання: водночас approved і cancel_reason (зокрема awaiting — ні).
  if v_record.status <> 'approved' or v_record.cancel_reason is null then
    raise exception 'There is no cancellation request for this record';
  end if;
  if v_record.cancel_request_id is distinct from p_request_id then
    raise exception 'The employee has changed the cancellation request. Check it again before deciding';
  end if;

  if p_decision = 'decline' then
    if v_comment is null then
      raise exception 'Tell the employee why the cancellation is declined';
    end if;
    if char_length(v_comment) > 500 then
      raise exception 'The comment can be at most 500 characters';
    end if;
    update public.leave_records as r
       set cancel_reason = null, cancel_request_id = null, cancel_declined_comment = v_comment, updated_at = now()
     where r.id = p_record_id and r.status = 'approved' and r.cancel_request_id = p_request_id
    returning r.status into v_status;
    insert into public.leave_record_events (record_id, actor_id, action, comment)
    values (p_record_id, v_uid, 'cancellation_declined', v_comment);
  else
    -- «Cancelled» повертає дні в залишок: усі читачі рахують лише approved (D6); тригер fix_day_share обнуляє day_share.
    update public.leave_records as r
       set status = 'cancelled', cancel_reason = null, cancel_request_id = null, cancel_declined_comment = null,
           paid_days = null, unpaid_days = null, updated_at = now()
     where r.id = p_record_id and r.status = 'approved' and r.cancel_request_id = p_request_id
    returning r.status into v_status;
    insert into public.leave_record_events (record_id, actor_id, action)
    values (p_record_id, v_uid, 'cancelled');
  end if;

  if v_status is null then
    raise exception 'There is no cancellation request for this record';
  end if;
  return v_status;
end;
$$;

revoke execute on function private.decide_record_cancellation(bigint, bigint, text, text) from public, anon;
grant execute on function private.decide_record_cancellation(bigint, bigint, text, text) to authenticated;

create function public.decide_record_cancellation(
  p_record_id bigint,
  p_request_id bigint,
  p_decision text,
  p_comment text default null
)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.decide_record_cancellation(p_record_id, p_request_id, p_decision, p_comment);
$$;

revoke execute on function public.decide_record_cancellation(bigint, bigint, text, text) from public, anon;
grant execute on function public.decide_record_cancellation(bigint, bigint, text, text) to authenticated;

-- ── D5. Скасування менеджером з приміткою (AC-CANCEL-08, -09) ───────────────
create function private.cancel_approved_record(p_record_id bigint, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_record public.leave_records%rowtype;
  v_note text := private.trimmed_text(p_note);
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into v_record from public.leave_records as r where r.id = p_record_id;
  perform private.check_cancellation_actor(v_record);

  perform pg_advisory_xact_lock(hashtextextended(v_record.employee_id::text, 0));
  select * into v_record from public.leave_records as r where r.id = p_record_id for update;

  if v_record.status = 'cancelled' then
    raise exception 'This record is already cancelled';
  end if;
  if v_record.status <> 'approved' then
    raise exception 'Only an approved record can be cancelled with a note';
  end if;
  -- Минуле виправляє адміністратор поза зрізом (Out of scope 09).
  if v_record.date < private.kyiv_day(now()) then
    raise exception 'Records in the past cannot be cancelled';
  end if;
  if v_note is null then
    raise exception 'Tell the employee why the record is cancelled';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'The comment can be at most 500 characters';
  end if;

  -- Відкрите прохання цим теж закривається: обидві колонки прохання — разом.
  update public.leave_records as r
     set status = 'cancelled', cancel_note = v_note, cancel_reason = null, cancel_request_id = null,
         cancel_declined_comment = null, paid_days = null, unpaid_days = null, updated_at = now()
   where r.id = p_record_id;
  insert into public.leave_record_events (record_id, actor_id, action, comment)
  values (p_record_id, v_uid, 'cancelled', v_note);
end;
$$;

revoke execute on function private.cancel_approved_record(bigint, text) from public, anon;
grant execute on function private.cancel_approved_record(bigint, text) to authenticated;

create function public.cancel_approved_record(p_record_id bigint, p_note text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_approved_record(p_record_id, p_note);
$$;

revoke execute on function public.cancel_approved_record(bigint, text) from public, anon;
grant execute on function public.cancel_approved_record(bigint, text) to authenticated;
