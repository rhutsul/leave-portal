-- Історія кількох записів (public.record_histories, AC-DECIDE-15): доступ перевіряємо один раз на запис, а не на
-- кожну подію. «My requests» і /decisions передають десятки записів, у кожного — кілька подій, і
-- private.can_see_record рахувався для кожного рядка leave_record_events. Результат той самий: записи, яких
-- користувач не бачить, не потрапляють у вибірку. Обгортка public.record_histories і її права не змінюються.

-- Записи з переданих, які бачить користувач (та сама перевірка, що й у record_history). Внутрішня: викликає лише
-- private.record_histories.
create or replace function private.visible_record_ids(p_record_ids bigint[])
returns setof bigint
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.leave_records as r
  where (select auth.uid()) is not null
    and r.id = any(p_record_ids)
    and private.can_see_record(r.id);
$$;

revoke execute on function private.visible_record_ids(bigint[]) from public, anon, authenticated;

create or replace function private.record_histories(p_record_ids bigint[])
returns table (record_id bigint, created_at timestamptz, action text, comment text, actor_name text)
language sql
stable
security definer
as $$
  select ev.record_id, ev.created_at, ev.action, ev.comment, a.full_name
  from public.leave_record_events as ev
  left join public.profiles as a on a.id = ev.actor_id
  where ev.record_id in (select private.visible_record_ids(p_record_ids))
  order by ev.record_id, ev.created_at, ev.id;
$$;
