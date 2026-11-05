-- Кінець відпустки може дорівнювати початку наступного блоку розкладу (AC-LEAVE-22, відповідь PM на
-- mkozlovskyi-ops/course-staff-management-spec#21): 09:00–12:30 при блоках 08:30–12:00 і 12:30–15:30 — запис 3 h.
-- Лише одна умова в private.check_record_hours з 20261021171135_leave_record_edit.sql: кінець — у блоці, якщо
-- p_end >= b.start_min (було p_end > b.start_min). Решта тіла — без змін. Функцію викликають і подання заявки
-- (private.submit_leave_request), і зміна годин запису (private.update_leave_record_hours), тож правило однакове
-- для обох. Хвилини рахуються лише в блоках, тож перерва 12:00–12:30 не додається. Те саме правило — checkHours у
-- src/lib/leave/time.ts.

-- ── Години запису за розкладом посади (спільне для подання й зміни годин) ──
-- Ті самі перевірки й тексти PM, що checkHours у src/lib/leave/time.ts, у тому самому порядку: розклад дня
-- (AC-LEAVE-06) → крок 5 хв → кінець блоку лише як кінець (AC-LEAVE-08, AC-LEAVE-20) → кінець пізніше за початок
-- (AC-LEAVE-09) → початок і кінець усередині блоків (AC-LEAVE-07, AC-LEAVE-19; кінець може дорівнювати кінцю блоку
-- або початку наступного, AC-LEAVE-22). Повертає хвилини всередині блоків (AC-LEAVE-15). Внутрішня: викликають лише
-- security definer функції private.submit_leave_request і private.update_leave_record_hours.
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
    where b.position_id = p_position_id and b.weekday = v_weekday and p_end >= b.start_min and p_end <= b.end_min
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
