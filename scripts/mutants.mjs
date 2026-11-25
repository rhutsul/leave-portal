// Мутанти для scripts/mutation-check.mjs (npm run mutation:sql). Мутант = одне правило з AC, навмисно зламане.
// Формат — з матеріалів WS8 курсу (materials/testing/scripts/mutants.mjs); P1 і P2 звідти не беремо: вони перевіряють
// гарнес шаблону (createTestDb), а в нас свій — tests/db/supabase-pglite.ts (createLeaveDb, ADR 0001).
// Поля:
//   id, kind ("sql" | "ts"), ac (який AC це правило доводить), what (що зламано — людською мовою);
//   file — що мутуємо; tests — файли тестів, які мають довести правило (саме їх і запускаємо);
//   find — рядок або RegExp, що трапляється у файлі РІВНО один раз (надійніше за номери рядків, які зсуваються);
//   replace — заміна (вставляється буквально: «$$» у plpgsql лишається «$$»);
//   expect: "survive" + reason — лише для еквівалентного мутанта (поведінка не змінюється) з посиланням на те,
//   що робить його еквівалентним (рядок міграції, інший тест). Без reason скрипт мутант не приймає.
// Новий AC з відмовою, правило якого живе в SQL (політика, grant, функція, тригер), — новий мутант тут.
// Політики послаблюємо (умова → true, посада → будь-яка посада працівника), а не видаляємо: без політики RLS
// забороняє все, і тест відмови лишився б зеленим з неправильної причини.
const SCHEMA = "supabase/migrations/20261020190045_leave_requests_schema.sql";
const BALANCE_INPUTS = "supabase/migrations/20261020214031_balance_inputs.sql";
const BALANCES_DB = "tests/db/balances.test.ts";
const DECISIONS_DB = "tests/db/leave-decisions.test.ts";
const VISIBILITY_DB = "tests/db/table-visibility.test.ts";
const SUBMIT_DB = "tests/db/submit-leave-request.test.ts";
// Чинна версія private.check_record_hours (create or replace поверх 20261104165058_end_at_next_block.sql — тепер блоки
// з private.blocks_on_date, шкільний календар): мутуємо її, бо мутант у старішій копії перезаписала б пізніша
// міграція — і він «вижив» би без жодного тесту.
const CHECK_HOURS = "supabase/migrations/20261108143021_school_calendar.sql";
const CALENDAR = CHECK_HOURS;
const CALENDAR_DB = "tests/db/school-calendar.test.ts";
const CALENDAR_REQUEST_DB = "tests/db/school-calendar-request.test.ts";
// Виправлення за рев'ю WS9: нові версії add_school_closure (вид закриття), fix_day_share і record_share (частка дати не
// більша за 1.00) перекривають копії в CLARIFY і 20261021133002_leave_decisions.sql — їхні мутанти мутують цей файл.
const REVIEW_FIXES = "supabase/migrations/20261115122625_day_share_cap_and_closure_kind.sql";
// Погодження зі спільним lock календаря (друга думка до #75, знахідка 6): чинна версія private.decide_leave_record —
// тут, вона перекриває копію в 20261021171135_leave_record_edit.sql, тож мутанти рішення мутують цей файл.
const DECIDE = "supabase/migrations/20261117083144_decide_calendar_lock.sql";
const RECORD_EDIT_DB = "tests/db/leave-record-edit.test.ts";
// Денний ліміт запитів до моделі (рев'ю WS10, п. 1): лічильник private.ai_quota і private.take_ai_quota.
const AI_QUOTA = "supabase/migrations/20261118083501_ai_quota.sql";
const AI_QUOTA_DB = "tests/db/ai-quota.test.ts";
// Скасування погодженого запису через менеджера (impl-cancel-approved, D3–D5).
const CANCEL = "supabase/migrations/20261124195428_cancel_approved.sql";
const CANCEL_DB = "tests/db/leave-cancellation.test.ts";
// Заміни для записів і позначка підвищення (impl-substitutes, D1–D6). Нова версія private.submit_leave_request і
// private.update_leave_record_hours — тут, вона перекриває копії в CLARIFY і 20261108165906_school_calendar_requests.sql,
// тож мутанти подання (S20, S22) мутують цей файл.
const SUBST = "supabase/migrations/20261125000321_substitutes.sql";
const SUBST_DB = "tests/db/substitutes.test.ts";
// Керування працівниками (impl-staff-management, D1–D11; ADR 0013): функції адміністратора, одноразове посилання,
// деактивація, розклад «з дати» й заступники — усе в одній міграції. Вона ж перекриває blocks_on_date, working_minutes і
// closed_day_name, а також record_minute_ranges зрізу substitutes (блоки — через blocks_in_effect), тож S19, S21, S23
// і S67 мутують чинні версії тут.
const STAFF = "supabase/migrations/20261125082128_staff_management.sql";
const STAFF_EMPLOYEES_DB = "tests/db/staff-employees.test.ts";
const STAFF_POSITIONS_DB = "tests/db/staff-positions.test.ts";
const STAFF_DEPUTIES_DB = "tests/db/staff-deputies.test.ts";
const STAFF_PRIVILEGES_DB = "tests/db/staff-privileges.test.ts";
const STAFF_SUBSTITUTES_DB = "tests/db/staff-substitutes.test.ts";
const START_INSIDE = "p_start >= b.start_min and p_start < b.end_min\n  ) or not exists";

export const mutants = [
  {
    id: "S1", kind: "sql", ac: "AC-BALANCE-13", file: BALANCE_INPUTS, tests: [BALANCES_DB],
    what: "can_view_balances: «сам, менеджер його посади чи адміністратор» → true (чужі залишки бачить кожен з входом)",
    find:
      "    and (\n      p_employee_id = (select auth.uid())\n      or private.manages_employee(p_employee_id)\n" +
      "      or private.current_app_role() = 'admin'\n    );",
    replace: "    and true;",
  },
  {
    id: "S2", kind: "sql", ac: "AC-DECIDE-01", file: SCHEMA, tests: [DECISIONS_DB],
    what: "RLS leave_records: менеджер посади → менеджер будь-якої посади працівника (manages_employee)",
    find:
      "  on public.leave_records for select to authenticated\n  using (\n    employee_id = (select auth.uid())\n" +
      "    or private.manages_position(position_id)",
    replace:
      "  on public.leave_records for select to authenticated\n  using (\n    employee_id = (select auth.uid())\n" +
      "    or private.manages_employee(employee_id)",
  },
  {
    id: "S3", kind: "sql", ac: "(матриця прав, без AC)", file: SCHEMA, tests: [VISIBILITY_DB],
    what: "RLS positions: менеджер посади → менеджер будь-якої посади працівника",
    find: "    or private.manages_position(id)",
    replace: "    or private.manages_employee(employee_id)",
  },
  {
    id: "S4", kind: "sql", ac: "(матриця прав, без AC)", file: SCHEMA, tests: [VISIBILITY_DB],
    what: "RLS schedule_blocks: менеджер посади → менеджер будь-якої посади працівника",
    find:
      "  on public.schedule_blocks for select to authenticated\n  using (\n    employee_id = (select auth.uid())\n" +
      "    or private.manages_position(position_id)",
    replace:
      "  on public.schedule_blocks for select to authenticated\n  using (\n    employee_id = (select auth.uid())\n" +
      "    or private.manages_employee(employee_id)",
  },
  {
    id: "S5", kind: "sql", ac: "(матриця прав, без AC)", file: SCHEMA, tests: [VISIBILITY_DB],
    what: "can_see_record (RLS leave_record_events): менеджер посади → менеджер будь-якої посади працівника",
    find: "        or private.manages_position(r.position_id)",
    replace: "        or private.manages_employee(r.employee_id)",
  },
  {
    id: "S6", kind: "sql", ac: "(матриця прав, без AC)", file: SCHEMA, tests: [VISIBILITY_DB],
    what: "RLS balance_carryovers: менеджер працівника → true (перенесені дні бачить кожен з входом)",
    find: "    or private.manages_employee(employee_id)",
    replace: "    or true",
  },
  // AC-LEAVE-19 у базі — остання межа (private.check_record_hours, яку викликає submit_leave_request).
  {
    id: "S7", kind: "sql", ac: "AC-LEAVE-19", file: CHECK_HOURS, tests: [SUBMIT_DB],
    what: "check_record_hours: початок поза блоком більше не перевіряється (07:30 приймається)",
    find: START_INSIDE,
    replace: "true\n  ) or not exists",
  },
  {
    id: "S8", kind: "sql", ac: "AC-LEAVE-19", file: CHECK_HOURS, tests: [SUBMIT_DB],
    what: "check_record_hours: початок блоку не входить у блок (>= → >, 08:30 відмовлено)",
    find: START_INSIDE,
    replace: "p_start > b.start_min and p_start < b.end_min\n  ) or not exists",
  },
  {
    id: "S9", kind: "sql", ac: "AC-LEAVE-19", file: CHECK_HOURS, tests: [SUBMIT_DB],
    what: "повідомлення перелічує блоки не в порядку часу (order by start_min desc)",
    find: "order by b.start_min)",
    replace: "order by b.start_min desc)",
  },
  // AC-LEAVE-22: кінець на початку наступного блоку.
  {
    id: "S10", kind: "sql", ac: "AC-LEAVE-22", file: CHECK_HOURS, tests: [SUBMIT_DB, RECORD_EDIT_DB],
    what: "check_record_hours: кінець на початку наступного блоку знову поза розкладом (>= → >, 09:00–12:30 відмовлено)",
    find: "p_end >= b.start_min and p_end <= b.end_min",
    replace: "p_end > b.start_min and p_end <= b.end_min",
  },
  // Шкільний календар (openspec/changes/archive/2026-11-09-impl-school-calendar/design.md D6).
  {
    id: "S11", kind: "sql", ac: "AC-CAL-02", file: CALENDAR, tests: [CALENDAR_DB],
    what: "RLS school_closures: працівник і менеджер більше не бачать закриттів (using → false)",
    find: "  using ((select auth.uid()) is not null);",
    replace: "  using (false);",
  },
  {
    id: "S12", kind: "sql", ac: "AC-CAL-07", file: REVIEW_FIXES, tests: [CALENDAR_DB],
    what: "add_school_closure: запис «Approved» більше не блокує закриття",
    find: "     and r.status in ('awaiting', 'returned', 'approved')\n     and (p_closes_at",
    replace: "     and r.status in ('awaiting', 'returned')\n     and (p_closes_at",
  },
  {
    id: "S13", kind: "sql", ac: "AC-CAL-08", file: REVIEW_FIXES, tests: [CALENDAR_DB],
    what: "add_school_closure: запис «Rejected» теж блокує закриття",
    find: "     and r.status in ('awaiting', 'returned', 'approved')\n     and (p_closes_at",
    replace: "     and r.status in ('awaiting', 'returned', 'approved', 'rejected')\n     and (p_closes_at",
  },
  {
    id: "S14", kind: "sql", ac: "AC-CAL-07", file: REVIEW_FIXES, tests: [CALENDAR_DB],
    what: "скорочений день: запис, що закінчується рівно о часі закриття, теж блокує (> → >=)",
    find: "r.end_min > p_closes_at",
    replace: "r.end_min >= p_closes_at",
  },
  {
    id: "S15", kind: "sql", ac: "AC-CAL-10", file: REVIEW_FIXES, tests: [CALENDAR_DB],
    what: "add_school_closure: дата кінця раніше за початок більше не перевіряється (лишається лише обмеження таблиці)",
    find: "  if v_end < p_start then\n    raise exception 'The end date cannot be earlier than the start date';",
    replace: "  if false then\n    raise exception 'The end date cannot be earlier than the start date';",
  },
  {
    id: "S16", kind: "sql", ac: "AC-CAL-11", file: REVIEW_FIXES, tests: [CALENDAR_DB],
    what: "add_school_closure: спільна дата більше не шукається (лишається лише обмеження таблиці, без тексту PM)",
    find: "   where daterange(c.start_date, c.end_date, '[]') && daterange(p_start, v_end, '[]')",
    replace: "   where false",
  },
  {
    id: "S17", kind: "sql", ac: "AC-CAL-13", file: REVIEW_FIXES, tests: [CALENDAR_DB],
    what: "add_school_closure: перевірка ролі → лише «увійшов» (менеджер додає закриття)",
    find:
      "  if (select auth.uid()) is null or private.current_app_role() is distinct from 'admin' then\n" +
      "    raise exception 'Only an administrator can change the school calendar' using errcode = '42501';\n  end if;\n\n  if p_kind",
    replace:
      "  if (select auth.uid()) is null then\n" +
      "    raise exception 'Only an administrator can change the school calendar' using errcode = '42501';\n  end if;\n\n  if p_kind",
  },
  {
    id: "S18", kind: "sql", ac: "AC-CAL-14", file: CALENDAR, tests: [CALENDAR_DB],
    what: "гість отримує select на school_closures",
    find: "grant select, insert, update, delete on table public.school_closures to service_role;",
    replace:
      "grant select, insert, update, delete on table public.school_closures to service_role;\n" +
      "grant select on table public.school_closures to anon;",
  },
  {
    id: "S19", kind: "sql", ac: "AC-CAL-06", file: STAFF, tests: [CALENDAR_DB],
    what: "working_minutes: скорочений день не обрізає блоки (знаменник частки знову за днем тижня)",
    find: "  select coalesce(sum(\n    case when c.closes_at is null then b.end_min else least(b.end_min, c.closes_at) end - b.start_min",
    replace: "  select coalesce(sum(\n    b.end_min - b.start_min",
  },
  {
    id: "S20", kind: "sql", ac: "AC-CAL-03", file: SUBST, tests: [CALENDAR_REQUEST_DB],
    what: "submit_leave_request: закрита дата пояснюється як день без годин (текст AC-CAL-03 зник)",
    find: "                              then 'The school is closed on this day: ' || v_closed",
    replace: "                              then 'You have no working hours on this day'",
  },
  {
    id: "S21", kind: "sql", ac: "AC-CAL-05", file: STAFF, tests: [CALENDAR_REQUEST_DB],
    what: "blocks_on_date: блок, що триває о часі закриття, не обрізається (13:00–14:00 приймається)",
    find: "  select b.start_min, case when c.closes_at is null then b.end_min else least(b.end_min, c.closes_at) end",
    replace: "  select b.start_min, b.end_min",
  },
  {
    id: "S22", kind: "sql", ac: "AC-CAL-03", file: SUBST, tests: [CALENDAR_REQUEST_DB],
    what: "submit_leave_request: закрита дата більше не відкидається з заявки на кілька дат (уся заявка падає)",
    find: "      if v_closed is not null or (v_date is not null and private.working_minutes(v_uid, v_date) = 0) then",
    replace: "      if v_date is not null and private.working_minutes(v_uid, v_date) = 0 and v_closed is null then",
  },
  {
    id: "S23", kind: "sql", ac: "AC-CAL-16", file: STAFF, tests: [CALENDAR_REQUEST_DB],
    what: "closed_day_name: скорочений день без робочого часу більше не закритий (лише закриття цілими днями)",
    find: "      c.closes_at is null\n      or (",
    replace: "      c.closes_at is null\n      or false and (",
  },
  {
    id: "S24", kind: "sql", ac: "AC-CAL-17", file: REVIEW_FIXES, tests: [CALENDAR_DB],
    what: "add_school_closure: у повідомленні лише закриття, що почалось до нового (друге перетнуте зникає)",
    find: "           ', ' order by greatest(c.start_date, p_start), c.id\n         )",
    replace: "           ', ' order by greatest(c.start_date, p_start), c.id\n         ) filter (where c.start_date <= p_start)",
  },
  {
    id: "S25", kind: "sql", ac: "AC-CAL-18", file: REVIEW_FIXES, tests: [CALENDAR_DB],
    what: "add_school_closure: порожня назва більше не перевіряється (лишається лише обмеження таблиці, без тексту PM)",
    find: "  if v_name is null or v_name = '' then",
    replace: "  if false then",
  },
  {
    id: "S26", kind: "sql", ac: "AC-CAL-19", file: REVIEW_FIXES, tests: [CALENDAR_DB],
    what: "add_school_closure: межа назви 100 → 101 знак (101 проходить до обмеження таблиці, без тексту PM)",
    find: "  if char_length(v_name) > 100 then",
    replace: "  if char_length(v_name) > 101 then",
  },
  {
    id: "S27", kind: "sql", ac: "AC-CAL-20", file: REVIEW_FIXES, tests: [CALENDAR_DB],
    what: "fix_day_share: частку при погодженні не фіксуємо — залишки знову рахують її від поточного календаря",
    find: "  v_working := private.working_minutes(new.employee_id, new.date);",
    replace: "  return new;\n  v_working := private.working_minutes(new.employee_id, new.date);",
  },
  // Виправлення за рев'ю WS9 (14.11).
  {
    id: "S28", kind: "sql", ac: "AC-BALANCE-05", file: REVIEW_FIXES, tests: [CALENDAR_DB],
    what: "fix_day_share: частку не обмежено залишком дати (календар змінився між погодженнями — дата коштує 1.35)",
    find: "  v_share := least(v_share, private.date_room(new.employee_id, new.date, new.id));",
    replace: "",
  },
  {
    id: "S29", kind: "sql", ac: "AC-BALANCE-05", file: REVIEW_FIXES, tests: [CALENDAR_DB],
    what: "record_share: частку «Sick leave» / «Personal leave» при рішенні не обмежено залишком дати (paid_days 0.64)",
    find: "           private.date_room(r.employee_id, r.date, r.id)\n         )",
    replace: "           100\n         )",
  },
  {
    id: "S30", kind: "sql", ac: "(Assumptions 04-school-calendar, без AC)", file: REVIEW_FIXES, tests: [CALENDAR_DB],
    what: "add_school_closure: скорочений день без часу більше не відмовляє — закривається цілий день",
    find: "  if v_early and p_closes_at is null then",
    replace: "  if false then",
  },
  {
    id: "S31", kind: "sql", ac: "AC-CAL-20", file: DECIDE, tests: [CALENDAR_DB],
    what: "decide_leave_record: «Sick leave» / «Personal leave» більше не фіксують частку в paid_days при погодженні",
    find: "    v_paid := least(v_share, greatest(v_remaining, 0));",
    replace: "    v_paid := null;",
  },
  {
    id: "S32", kind: "sql", ac: "AC-CAL-18", file: REVIEW_FIXES, tests: [CALENDAR_DB],
    what: "add_school_closure: назва обрізається лише від пробілів (btrim) — назва з табуляції зберігається порожньою на вигляд",
    find: "  v_name text := regexp_replace(coalesce(p_name, ''),",
    replace: "  v_name text := btrim(p_name); -- ",
  },
  {
    id: "S33", kind: "sql", ac: "AC-CAL-20", file: DECIDE, tests: [CALENDAR_DB],
    what: "decide_leave_record: без спільного lock календаря — закриття, закомічене посеред рішення, розводить paid_days і day_share",
    find: "  perform pg_advisory_xact_lock_shared(private.calendar_lock_key());",
    replace: "  -- без lock календаря",
  },
  // Рев'ю викладача WS9 (16.11): по мутанту на AC-CAL-01, -09 і -15, щоб «здатен упасти» було на всіх 20 AC календаря.
  {
    id: "S34", kind: "sql", ac: "AC-CAL-01", file: REVIEW_FIXES, tests: [CALENDAR_DB],
    what: "add_school_closure: закриття цілими днями зберігається лише першим днем (кінець = початок)",
    find: "  values (v_name, p_start, v_end, p_closes_at, (select auth.uid()))",
    replace: "  values (v_name, p_start, p_start, p_closes_at, (select auth.uid()))",
  },
  {
    // Не «delete … and false»: тоді «Closure not found» уронив би тест з іншої причини. Тут рядок знайдено, помилки
    // немає, а закриття лишається — день не стає робочим.
    id: "S35", kind: "sql", ac: "AC-CAL-09", file: CALENDAR, tests: [CALENDAR_DB, CALENDAR_REQUEST_DB],
    what: "remove_school_closure: закриття не видаляється, хоч помилки немає — дата не стає робочою",
    find: "  delete from public.school_closures as c where c.id = p_id;",
    replace: "  update public.school_closures as c set name = c.name where c.id = p_id;",
  },
  {
    // Не «where q.used < 21»: тоді 21-й запит упав би на check (used between 1 and 20), і тест зловив би помилку, а не
    // відповідь. Тут лічильник лишається на 20, а функція все одно каже «можна».
    id: "S36", kind: "sql", ac: "AC-ASSIST-09", file: AI_QUOTA, tests: [AI_QUOTA_DB],
    what: "take_ai_quota: понад 20 запитів на добу теж «можна» — модель кличуть без межі",
    find: "  return v_used is not null;",
    replace: "  return true;",
  },
  {
    id: "S37", kind: "sql", ac: "AC-ASSIST-09", file: AI_QUOTA, tests: [AI_QUOTA_DB],
    what: "take_ai_quota: доба одна на весь час — учорашні запити рахуються сьогодні",
    find: "  values (v_user, private.kyiv_day(now()), 1)",
    replace: "  values (v_user, date '2000-01-01', 1)",
  },
  {
    id: "S38", kind: "sql", ac: "AC-ASSIST-09", file: AI_QUOTA, tests: [AI_QUOTA_DB],
    what: "kyiv_day: доба за часовим поясом сесії (UTC), а не за Києвом — з 22:00 UTC лічильник учорашній",
    find: "  select (p_at at time zone 'Europe/Kyiv')::date;",
    replace: "  select p_at::date;",
  },
  // Скасування погодженого запису (requirements/09-cancel-approved.md): функції з 20261124195428_cancel_approved.sql.
  {
    id: "S39", kind: "sql", ac: "AC-CANCEL-10", file: CANCEL, tests: [CANCEL_DB],
    what: "request_record_cancellation: прохання щодо будь-якого запису, а не лише власного",
    find: "   where r.id = p_record_id and r.employee_id = v_uid\n     for update;",
    replace: "   where r.id = p_record_id\n     for update;",
  },
  {
    id: "S40", kind: "sql", ac: "AC-CANCEL-05", file: CANCEL, tests: [CANCEL_DB],
    what: "request_record_cancellation: запис у минулому теж можна попросити скасувати",
    find:
      "  if v_record.date < private.kyiv_day(now()) then\n    raise exception 'Records in the past cannot be cancelled';\n" +
      "  end if;\n  if v_record.cancel_reason is not null then",
    replace: "  if v_record.cancel_reason is not null then",
  },
  {
    // Не «if false»: тоді update з умовою cancel_reason is null (запобіжник) відповів би тим самим текстом.
    id: "S41", kind: "sql", ac: "AC-CANCEL-06", file: CANCEL, tests: [CANCEL_DB],
    what: "request_record_cancellation: повторне прохання мовчки «приймається» без повідомлення",
    find: "  if v_record.cancel_reason is not null then\n    raise exception 'Cancellation has already been requested';\n  end if;",
    replace: "  if v_record.cancel_reason is not null then\n    return;\n  end if;",
  },
  {
    id: "S42", kind: "sql", ac: "AC-CANCEL-11", file: CANCEL, tests: [CANCEL_DB],
    what: "check_cancellation_actor: менеджер будь-якої посади вирішує прохання (немає перевірки посади)",
    find: "(v_role = 'manager' and private.manages_position(p_record.position_id))",
    replace: "(v_role = 'manager')",
  },
  {
    id: "S43", kind: "sql", ac: "AC-CANCEL-02", file: CANCEL, tests: [CANCEL_DB],
    what: "decide_record_cancellation: підтвердження лишає запис «Approved» — дні не повертаються",
    find: "       set status = 'cancelled', cancel_reason = null, cancel_request_id = null, cancel_declined_comment = null,",
    replace: "       set status = 'approved', cancel_reason = null, cancel_request_id = null, cancel_declined_comment = null,",
  },
  {
    id: "S44", kind: "sql", ac: "AC-CANCEL-02", file: CANCEL, tests: [CANCEL_DB],
    what: "decide_record_cancellation: рішення не прив'язане до прохання — застарілий request_id вирішує нове",
    find: "  if v_record.cancel_request_id is distinct from p_request_id then",
    replace: "  if false then",
  },
  {
    id: "S45", kind: "sql", ac: "AC-CANCEL-03", file: CANCEL, tests: [CANCEL_DB],
    what: "decide_record_cancellation: коментар відхилення не зберігається — працівник не бачить «Cancellation declined»",
    find: "cancel_declined_comment = v_comment, updated_at = now()",
    replace: "cancel_declined_comment = 'Declined', updated_at = now()",
  },
  {
    id: "S46", kind: "sql", ac: "AC-CANCEL-04", file: CANCEL, tests: [CANCEL_DB],
    what: "decide_record_cancellation: відхилення без коментаря приймається",
    find: "    if v_comment is null then\n      raise exception 'Tell the employee why the cancellation is declined';",
    replace: "    if false then\n      raise exception 'Tell the employee why the cancellation is declined';",
  },
  {
    id: "S47", kind: "sql", ac: "AC-CANCEL-09", file: CANCEL, tests: [CANCEL_DB],
    what: "cancel_approved_record: скасування без примітки приймається",
    find: "  if v_note is null then\n    raise exception 'Tell the employee why the record is cancelled';",
    replace: "  if false then\n    raise exception 'Tell the employee why the record is cancelled';",
  },
  {
    // Правило з Assumptions 09 (не з окремого AC): менеджер ніколи не вирішує прохання щодо власного запису.
    id: "S48", kind: "sql", ac: "AC-CANCEL-11", file: CANCEL, tests: [CANCEL_DB],
    what: "check_cancellation_actor: менеджер вирішує прохання щодо власного запису",
    find: "  if v_role <> 'admin' and p_record.employee_id = (select auth.uid()) then",
    replace: "  if false then",
  },
  {
    id: "S49", kind: "sql", ac: "AC-CANCEL-05", file: CANCEL, tests: [CANCEL_DB],
    what: "cancel_approved_record: менеджер скасовує з приміткою й запис у минулому",
    find:
      "  if v_record.date < private.kyiv_day(now()) then\n    raise exception 'Records in the past cannot be cancelled';\n" +
      "  end if;\n  if v_note is null then",
    replace: "  if v_note is null then",
  },
  {
    id: "S50", kind: "sql", ac: "AC-CANCEL-11", file: CANCEL, tests: [CANCEL_DB],
    what: "check_cancellation_actor: без рядка в profiles (роль null) перевірку права пропущено",
    find: "  v_role text := coalesce(private.current_app_role(), '');",
    replace: "  v_role text := private.current_app_role();",
  },
  {
    id: "S51", kind: "sql", ac: "AC-SUBST-07", file: SUBST, tests: [SUBST_DB],
    what: "substitute_conflict: «Rejected» і «Cancelled» теж займають заміну",
    find: "    and r.status in ('awaiting', 'returned', 'approved')\n    and r.id is distinct from p_exclude_record",
    replace:
      "    and r.status in ('awaiting', 'returned', 'approved', 'rejected', 'cancelled')\n    and r.id is distinct from p_exclude_record",
  },
  {
    id: "S52", kind: "sql", ac: "AC-SUBST-06", file: SUBST, tests: [SUBST_DB],
    what: "substitute_conflict: заміна в іншому записі не займає людину (лише власні записи)",
    find: "    and (r.employee_id = p_person or r.substitute_id = p_person)",
    replace: "    and r.employee_id = p_person",
  },
  {
    id: "S53", kind: "sql", ac: "AC-SUBST-05", file: SUBST, tests: [SUBST_DB],
    what: "substitute_conflict: власний запис заміни не займає її",
    find: "    and (r.employee_id = p_person or r.substitute_id = p_person)",
    replace: "    and r.substitute_id = p_person",
  },
  {
    id: "S54", kind: "sql", ac: "AC-SUBST-07", file: SUBST, tests: [SUBST_DB],
    what: "substitute_conflict: перерва між блоками розкладу теж рахується хвилинами запису",
    find: "        on mine.span && theirs.span",
    replace: "        on true",
  },
  {
    id: "S55", kind: "sql", ac: "AC-SUBST-06", file: SUBST, tests: [SUBST_DB],
    what: "substitute_conflict: повідомлення називає не перший за часом запис",
    find: "  order by r.start_min, r.end_min, r.id\n  limit 1;",
    replace: "  order by r.start_min desc, r.end_min, r.id\n  limit 1;",
  },
  {
    id: "S56", kind: "sql", ac: "AC-SUBST-04", file: SUBST, tests: [SUBST_DB],
    what: "submit_leave_request: заміна не зі списку працівника приймається",
    find: "        if not exists (\n          select 1 from public.substitute_lists as s where s.employee_id = v_uid and s.substitute_id = v_substitute\n        ) then",
    replace: "        if false then",
  },
  {
    id: "S57", kind: "sql", ac: "AC-SUBST-08", file: SUBST, tests: [SUBST_DB],
    what: "upgrade_applies: лише назва «Teacher», а не будь-яка з «teacher» («Math teacher»)",
    find: "where p.id = p_position_id and strpos(lower(p.title), 'teacher') > 0",
    replace: "where p.id = p_position_id and p.title = 'Teacher'",
  },
  {
    id: "S58", kind: "sql", ac: "AC-SUBST-09", file: SUBST, tests: [SUBST_DB],
    what: "upgrade_applies: позначка для будь-якої основної посади заміни, не лише «Assistant»",
    find: "and lower(btrim(s.title)) = 'assistant'",
    replace: "and true",
  },
  {
    id: "S59", kind: "sql", ac: "AC-SUBST-12", file: SUBST, tests: [SUBST_DB],
    what: "substitute_lists: insert без перевірки права (будь-хто додає до будь-чийого списку)",
    find: "  with check (added_by = (select auth.uid()) and private.can_manage_substitutes(employee_id));",
    replace: "  with check (added_by = (select auth.uid()));",
  },
  {
    id: "S60", kind: "sql", ac: "AC-SUBST-12", file: SUBST, tests: [SUBST_DB],
    what: "substitute_lists: delete без перевірки права",
    find: "  using ((select auth.uid()) is not null and private.can_manage_substitutes(employee_id));",
    replace: "  using ((select auth.uid()) is not null);",
  },
  {
    id: "S61", kind: "sql", ac: "AC-SUBST-13", file: SUBST, tests: [SUBST_DB],
    what: "can_manage_substitutes: менеджер будь-яких посад веде список будь-якого працівника",
    find: "           when 'manager' then private.manages_employee(p_employee_id)",
    replace: "           when 'manager' then true",
  },
  {
    id: "S62", kind: "sql", ac: "AC-SUBST-15", file: SUBST, tests: [SUBST_DB],
    what: "my_substitutions: записи «Rejected» і «Cancelled» теж показуються",
    find: "  where r.substitute_id = (select auth.uid())\n    and r.status in ('awaiting', 'returned', 'approved')",
    replace: "  where r.substitute_id = (select auth.uid())",
  },
  {
    id: "S63", kind: "sql", ac: "AC-SUBST-05", file: SUBST, tests: [SUBST_DB],
    what: "update_leave_record_hours: нові години не перевіряються на зайнятість заміни",
    find: "    if found then\n      raise exception '%', private.substitute_busy_message(\n        v_record.substitute_id",
    replace: "    if false then\n      raise exception '%', private.substitute_busy_message(\n        v_record.substitute_id",
  },
  {
    id: "S64", kind: "sql", ac: "AC-SUBST-02", file: SUBST, tests: [SUBST_DB],
    what: "record_substitutes: заміну запису бачить і той, кому запис не видно",
    find: "    and private.can_see_record(r.id)",
    replace: "    and true",
  },
  {
    id: "S65", kind: "sql", ac: "AC-SUBST-08", file: SUBST, tests: [SUBST_DB],
    what: "update_leave_record_hours: позначка підвищення лишає старі хвилини після зміни годин",
    find: "           upgrade_minutes = case when r.upgrade_minutes is not null then v_minutes end,\n",
    replace: "",
  },
  {
    id: "S66", kind: "sql", ac: "AC-SUBST-05", file: SUBST, tests: [SUBST_DB],
    what: "record_minute_ranges: запис поза чинними блоками розкладу знову рахується всім проміжком",
    find: "  select int4range(p_start, p_end) where not exists (select 1 from blocks);",
    replace: "  select int4range(p_start, p_end) where not exists (select 1 from blocks where not isempty(span));",
  },
  {
    id: "S67", kind: "sql", ac: "AC-SUBST-05", file: STAFF, tests: [SUBST_DB],
    what: "record_minute_ranges: без розкладу на цей день запис не має хвилин і нікого не займає",
    find: "  union all\n  select int4range(p_start, p_end) where not exists (select 1 from blocks);",
    replace: "",
  },
  {
    id: "S68", kind: "sql", ac: "AC-STAFF-13", file: STAFF, tests: [STAFF_PRIVILEGES_DB, STAFF_EMPLOYEES_DB],
    what: "require_admin: роль не перевіряється — менеджер і працівник виконують функції адміністратора",
    find: "  if (select auth.uid()) is null or private.current_app_role() is distinct from 'admin' then\n" +
      "    raise exception 'Only an administrator can manage employees' using errcode = '42501';",
    replace: "  if (select auth.uid()) is null then\n" +
      "    raise exception 'Only an administrator can manage employees' using errcode = '42501';",
  },
  {
    id: "S69", kind: "sql", ac: "AC-STAFF-03", file: STAFF, tests: [STAFF_EMPLOYEES_DB],
    what: "use_one_time_link: прострочене посилання ще день працює",
    find: "  if private.kyiv_day(now()) > v_link.valid_until then",
    replace: "  if private.kyiv_day(now()) > v_link.valid_until + 1 then",
  },
  {
    id: "S70", kind: "sql", ac: "AC-STAFF-03", file: STAFF, tests: [STAFF_EMPLOYEES_DB],
    what: "use_one_time_link: останній дійсний день уже вважається простроченим (7 днів не включно)",
    find: "  if private.kyiv_day(now()) > v_link.valid_until then",
    replace: "  if private.kyiv_day(now()) >= v_link.valid_until then",
  },
  {
    id: "S71", kind: "sql", ac: "AC-STAFF-02", file: STAFF, tests: [STAFF_EMPLOYEES_DB],
    what: "use_one_time_link: використане чи замінене посилання працює ще раз",
    find: "  if not found or v_link.used_at is not null or v_link.revoked_at is not null then",
    replace: "  if not found then",
  },
  {
    id: "S72", kind: "sql", ac: "AC-STAFF-02", file: STAFF, tests: [STAFF_EMPLOYEES_DB],
    what: "new_one_time_link: нове посилання не відкликає попереднє",
    find: "   where l.employee_id = p_employee_id and l.used_at is null and l.revoked_at is null;\n" +
      "  insert into private.one_time_links",
    replace: "   where false;\n  insert into private.one_time_links",
  },
  {
    id: "S73", kind: "sql", ac: "AC-STAFF-08", file: STAFF, tests: [STAFF_EMPLOYEES_DB],
    what: "use_one_time_link: деактивований задає пароль за старим посиланням",
    find: "  if v_deactivated is not null then\n    return query select 'invalid'::text, null::text;",
    replace: "  if false then\n    return query select 'invalid'::text, null::text;",
  },
  {
    id: "S74", kind: "sql", ac: "AC-STAFF-18", file: STAFF, tests: [STAFF_EMPLOYEES_DB],
    what: "set_employee_role: адміністратор знімає роль сам собі",
    find: "  if p_employee_id = (select auth.uid()) then\n    raise exception 'You cannot change your own role';",
    replace: "  if false then\n    raise exception 'You cannot change your own role';",
  },
  {
    id: "S75", kind: "sql", ac: "AC-STAFF-12", file: STAFF, tests: [STAFF_EMPLOYEES_DB],
    what: "guard_auth_email_change: працівник змінює собі email через Auth",
    find: "  if current_user = 'supabase_auth_admin'",
    replace: "  if false",
  },
  {
    id: "S76", kind: "sql", ac: "AC-STAFF-08", file: STAFF, tests: [STAFF_EMPLOYEES_DB],
    what: "deactivate_employee: без бану Auth — деактивований далі входить паролем",
    find: "set banned_until = now() + interval '100 years', updated_at = now()",
    replace: "set banned_until = null, updated_at = now()",
  },
  {
    id: "S77", kind: "sql", ac: "AC-STAFF-08", file: STAFF, tests: [STAFF_EMPLOYEES_DB],
    what: "current_app_role: деактивований з чинним токеном зберігає роль",
    find: "  select case when p.deactivated_at is null then p.role else '' end",
    replace: "  select p.role",
  },
  {
    id: "S78", kind: "sql", ac: "AC-STAFF-08", file: STAFF, tests: [STAFF_EMPLOYEES_DB],
    what: "acting_manager_ids: деактивований менеджер з чинним токеном бачить записи своїх посад",
    find: "  where p.id = (select auth.uid()) and p.deactivated_at is null\n  union",
    replace: "  where p.id = (select auth.uid())\n  union",
  },
  {
    id: "S79", kind: "sql", ac: "AC-STAFF-10", file: STAFF, tests: [STAFF_DEPUTIES_DB],
    what: "acting_manager_ids: перший день періоду не входить",
    find: "    and p_day between d.start_date and d.end_date",
    replace: "    and p_day > d.start_date and p_day <= d.end_date",
  },
  {
    id: "S80", kind: "sql", ac: "AC-STAFF-10", file: STAFF, tests: [STAFF_DEPUTIES_DB],
    what: "acting_manager_ids: заступник має права й поза періодом",
    find: "    and p_day between d.start_date and d.end_date",
    replace: "    and true",
  },
  {
    id: "S81", kind: "sql", ac: "AC-STAFF-09", file: STAFF, tests: [STAFF_DEPUTIES_DB],
    what: "manages_position: заступник не отримує прав відсутнього менеджера (лише власні посади)",
    find: "    where pm.position_id = p_position_id\n" +
      "      and pm.manager_id in (select private.acting_manager_ids(private.kyiv_day(now())))",
    replace: "    where pm.position_id = p_position_id\n      and pm.manager_id = (select auth.uid())",
  },
  {
    id: "S82", kind: "sql", ac: "AC-STAFF-19", file: STAFF, tests: [STAFF_DEPUTIES_DB],
    what: "RLS deputy_assignments: призначення бачить кожен, хто увійшов",
    find: "  using ((select auth.uid()) is not null and (select private.current_app_role()) = 'admin');",
    replace: "  using (true);",
  },
  {
    id: "S83", kind: "sql", ac: "AC-STAFF-06", file: STAFF, tests: [STAFF_POSITIONS_DB],
    what: "put_position_schedule: перетин перевіряється без дат дії — версії різних дат конфліктують",
    find: "     and daterange(b.valid_from, b.valid_to, '[)') && daterange(p_valid_from, v_next, '[)')",
    replace: "     and true",
  },
  {
    id: "S84", kind: "sql", ac: "AC-STAFF-06", file: STAFF, tests: [STAFF_POSITIONS_DB],
    what: "put_position_schedule: перетин з іншою посадою без тексту AC (лише обмеження бази)",
    find: "  if found then\n    raise exception 'This schedule overlaps the position % / %: % %–%',",
    replace: "  if false then\n    raise exception 'This schedule overlaps the position % / %: % %–%',",
  },
  {
    id: "S85", kind: "sql", ac: "AC-STAFF-07", file: STAFF, tests: [STAFF_POSITIONS_DB],
    what: "blocks_in_effect: розклад діє й до своєї дати — новий розклад змінює дні до неї",
    find: "    and (b.valid_from is null or b.valid_from <= p_date)",
    replace: "    and true",
  },
  {
    id: "S86", kind: "sql", ac: "AC-STAFF-07", file: STAFF, tests: [STAFF_POSITIONS_DB],
    what: "put_position_schedule: попередня версія не обрізається — старий розклад діє разом із новим",
    find: "     set valid_to = p_valid_from\n",
    replace: "     set valid_to = b.valid_to\n",
  },
  {
    id: "S87", kind: "sql", ac: "AC-STAFF-04", file: STAFF, tests: [STAFF_EMPLOYEES_DB],
    what: "on_profile_created_apply_test_assignments: новий працівник адміністратора отримує тестові посади",
    find: "  if current_setting('app.skip_test_assignments', true) is distinct from 'on' then",
    replace: "  if true then",
  },
  {
    id: "S88", kind: "sql", ac: "AC-STAFF-05", file: STAFF, tests: [STAFF_POSITIONS_DB],
    what: "create_position: друга основна посада без перевірки до вставки",
    find: "  if p_kind = 'main' and exists (",
    replace: "  if false and exists (",
  },
  {
    id: "S89", kind: "sql", ac: "AC-STAFF-08", file: STAFF, tests: [STAFF_EMPLOYEES_DB],
    what: "require_active: деактивований із чинним токеном далі подає й змінює свої записи",
    find: "    select 1 from public.profiles as p where p.id = (select auth.uid()) and p.deactivated_at is not null",
    replace: "    select 1 where false",
  },
  {
    id: "S90", kind: "sql", ac: "AC-STAFF-08", file: STAFF, tests: [STAFF_SUBSTITUTES_DB],
    what: "my_substitute_options: деактивований далі пропонується заміною в новій заявці",
    find: "  where s.employee_id = (select auth.uid())\n    and p.deactivated_at is null\n",
    replace: "  where s.employee_id = (select auth.uid())\n",
  },
  {
    id: "S91", kind: "sql", ac: "AC-STAFF-08", file: STAFF, tests: [STAFF_SUBSTITUTES_DB],
    what: "check_substitute_active: деактивованого можна вибрати заміною в поданні",
    find: "     and exists (select 1 from public.profiles as p where p.id = new.substitute_id and p.deactivated_at is not null) then",
    replace: "     and false then",
  },
  {
    id: "S92", kind: "sql", ac: "AC-STAFF-08", file: STAFF, tests: [STAFF_SUBSTITUTES_DB],
    what: "substitute_candidates: деактивований далі серед кандидатів у список замін",
    find: "    where p.id <> p_employee_id\n      and p.deactivated_at is null\n",
    replace: "    where p.id <> p_employee_id\n",
  },
  {
    // Правило AC-CAL-15 живе в TS, а не в SQL: рік на /calendar — це closuresInSchoolYear над рядками бази.
    id: "T1", kind: "ts", ac: "AC-CAL-15", file: "src/lib/leave/calendar.ts", tests: ["src/lib/leave/calendar.test.ts"],
    what: "closuresInSchoolYear: закриття наступних років теж потрапляють у рік (немає межі 31 серпня)",
    find: ".filter((c) => c.startDate <= to && c.endDate >= from)",
    replace: ".filter((c) => c.endDate >= from)",
  },
];
