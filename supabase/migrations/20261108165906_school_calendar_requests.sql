-- Шкільний календар у заявці (задача 2 openspec/changes/impl-school-calendar/tasks.md, design.md D4).
-- Нові версії private.submit_leave_request і private.update_leave_record_hours (обидві — з
-- 20261021171135_leave_record_edit.sql; решта тіла без змін):
--   * дата, закрита школою цілим днем, відкидається, як дата без робочих годин (AC-LEAVE-21), а якщо не прийнято
--     жодної дати — текст найранішої відкинутої: "The school is closed on this day: <назва>" (AC-CAL-03) чи
--     "You have no working hours on this day" (AC-LEAVE-06); скорочений день обрізає розклад через
--     private.check_record_hours / blocks_on_date (AC-CAL-04, AC-CAL-05) — з 20261108143021_school_calendar.sql;
--   * обидві беруть спільний advisory lock календаря (private.calendar_lock_key), який додавання закриття бере
--     ексклюзивно: закриття й новий чи змінений запис не проскочать одне повз одного. Порядок — спершу lock
--     працівника, потім календаря.
-- Те саме правило в TS — positionsOnDate / buildRequestRecords (src/lib/leave/request.ts).

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

      -- AC-CAL-03: дата, закрита школою цілим днем, не приймається, як і дата без робочих годин (AC-LEAVE-21):
      -- інші дати заявки лишаються. working_minutes уже враховує закриття (20261108143021_school_calendar.sql).
      v_closed := private.closure_on_date(v_date);
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
  -- Після lock працівника — спільний lock календаря (design.md D2): нові години не проскочать повз нове закриття.
  perform pg_advisory_xact_lock_shared(private.calendar_lock_key());
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

