-- Гонка «відкликання права менеджера ↔ заявка від імені» (знахідка сесії зрізу 08 до #136; план impl-staff-management,
-- D4/D9, і impl-on-behalf, D1). Подання від імені (20261125200521_on_behalf_and_edit.sql) перевіряє право до й після
-- lock працівника і тримає рядки position_managers (for share). Але:
--   (а) private.set_position_managers видаляє й вставляє рядки менеджерів — свіжий рядок lock не тримає;
--   (б) private.remove_deputy знімає заступника, не торкаючись position_managers.
-- Тож відкликання, що завершилось між повторною перевіркою і створенням записів, пропускало одну заявку.
--
-- Виправлення — той самий ключ lock людини, що в рішеннях і поданні (hashtextextended(uid::text, 0)), через
-- private.lock_people (кілька людей — одним викликом за зростанням uuid, щоб не було взаємного блокування):
--   * set_position_managers бере lock працівника посади разом із менеджерами;
--   * remove_deputy бере lock відсутнього менеджера, якого заступник заміщав;
--   * подання від імені бере lock працівника, самого подавача і відсутніх менеджерів, від імені яких сьогодні діє
--     заступник. Подавач — бо його право теж можна відкликати: set_employee_role і deactivate_employee беруть lock цієї
--     людини, тож зміна ролі чи деактивація подавача не проскочить між повторною перевіркою і погодженням (друга думка
--     щодо бази).
-- Нові тіла без зміни сигнатур (expand); код нічого не помічає.

-- ── (а) Відповідальні менеджери посади ──────────────────────────────────────
-- Нове тіло (20261125082128_staff_management.sql): lock працівника посади — заявка від імені, що вже тримає його, дійде
-- до кінця раніше, а наступна повторна перевірка побачить новий набір менеджерів.
create or replace function private.set_position_managers(p_position_id bigint, p_manager_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_employee uuid;
begin
  perform private.require_admin();
  select p.employee_id into v_employee from public.positions as p where p.id = p_position_id;
  if not found then
    raise exception 'Position not found';
  end if;
  perform private.lock_people(array[v_employee] || coalesce(p_manager_ids, '{}'));
  perform private.check_position_managers(p_manager_ids);
  -- Рядок посади — окремим оператором до delete: одночасна заміна чекає тут і далі бачить свіжий набір менеджерів.
  perform 1 from public.positions as p where p.id = p_position_id for update;
  delete from public.position_managers as pm where pm.position_id = p_position_id;
  insert into public.position_managers (position_id, manager_id)
  select p_position_id, m.id from (select distinct unnest(coalesce(p_manager_ids, '{}')) as id) as m;
end;
$$;

-- ── (б) Зняття заступника ───────────────────────────────────────────────────
-- Нове тіло: lock відсутнього менеджера — його бере й заявка від імені, яку подає заступник (нижче).
create or replace function private.remove_deputy(p_assignment_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_manager uuid;
begin
  perform private.require_admin();
  select d.manager_id into v_manager from public.deputy_assignments as d where d.id = p_assignment_id;
  if not found then
    raise exception 'Deputy assignment not found';
  end if;
  perform private.lock_people(array[v_manager]);
  delete from public.deputy_assignments as d where d.id = p_assignment_id;
  if not found then
    raise exception 'Deputy assignment not found';
  end if;
end;
$$;

-- ── Подання від імені ───────────────────────────────────────────────────────
-- Нове тіло (20261125200521_on_behalf_and_edit.sql); єдина зміна — lock: працівник разом із відсутніми менеджерами, від
-- імені яких сьогодні діє заступник (private.acting_manager_ids без себе), одним викликом lock_people. Після lock —
-- повторна перевірка права, як і раніше: зняття заступника чи менеджера, закомічене до lock, вона бачить, а те, що
-- почнеться після, чекає кінця цієї транзакції.
create or replace function private.submit_leave_request_on_behalf(
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
  v_absent     uuid[];
begin
  perform private.check_on_behalf(p_employee_id);
  select coalesce(array_agg(a.id), '{}')
    into v_absent
    from private.acting_manager_ids(private.kyiv_day(now())) as a (id)
   where a.id is distinct from v_uid;
  perform private.lock_people(array[p_employee_id, v_uid] || v_absent);
  -- Право менеджера тримається на рядках position_managers посад працівника: for share не дає зняти менеджера, поки
  -- заявка не закомічена, а зняття, закомічене раніше, бачить повторна перевірка нижче (рев'ю CodeRabbit).
  perform 1
    from public.position_managers as pm
    join public.positions as p on p.id = pm.position_id
   where p.employee_id = p_employee_id
     for share of pm;
  perform private.check_on_behalf(p_employee_id);

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
