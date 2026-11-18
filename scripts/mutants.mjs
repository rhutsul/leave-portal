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
// Уточнення календаря (AC-CAL-16…20): нові версії add_school_closure і submit_leave_request перекривають старі копії
// у CALENDAR і 20261108165906_school_calendar_requests.sql — мутанти цих функцій мутують чинну версію тут, інакше «вижили» б без жодного тесту.
const CLARIFY = "supabase/migrations/20261113145925_school_calendar_clarifications.sql";
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
    id: "S19", kind: "sql", ac: "AC-CAL-06", file: CALENDAR, tests: [CALENDAR_DB],
    what: "working_minutes: скорочений день не обрізає блоки (знаменник частки знову за днем тижня)",
    find: "  select coalesce(sum(\n    case when c.closes_at is null then b.end_min else least(b.end_min, c.closes_at) end - b.start_min",
    replace: "  select coalesce(sum(\n    b.end_min - b.start_min",
  },
  {
    id: "S20", kind: "sql", ac: "AC-CAL-03", file: CLARIFY, tests: [CALENDAR_REQUEST_DB],
    what: "submit_leave_request: закрита дата пояснюється як день без годин (текст AC-CAL-03 зник)",
    find: "                              then 'The school is closed on this day: ' || v_closed",
    replace: "                              then 'You have no working hours on this day'",
  },
  {
    id: "S21", kind: "sql", ac: "AC-CAL-05", file: CALENDAR, tests: [CALENDAR_REQUEST_DB],
    what: "blocks_on_date: блок, що триває о часі закриття, не обрізається (13:00–14:00 приймається)",
    find: "  select b.start_min, case when c.closes_at is null then b.end_min else least(b.end_min, c.closes_at) end",
    replace: "  select b.start_min, b.end_min",
  },
  {
    id: "S22", kind: "sql", ac: "AC-CAL-03", file: CLARIFY, tests: [CALENDAR_REQUEST_DB],
    what: "submit_leave_request: закрита дата більше не відкидається з заявки на кілька дат (уся заявка падає)",
    find: "      if v_closed is not null or (v_date is not null and private.working_minutes(v_uid, v_date) = 0) then",
    replace: "      if v_date is not null and private.working_minutes(v_uid, v_date) = 0 and v_closed is null then",
  },
  {
    id: "S23", kind: "sql", ac: "AC-CAL-16", file: CLARIFY, tests: [CALENDAR_REQUEST_DB],
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
  {
    // Правило AC-CAL-15 живе в TS, а не в SQL: рік на /calendar — це closuresInSchoolYear над рядками бази.
    id: "T1", kind: "ts", ac: "AC-CAL-15", file: "src/lib/leave/calendar.ts", tests: ["src/lib/leave/calendar.test.ts"],
    what: "closuresInSchoolYear: закриття наступних років теж потрапляють у рік (немає межі 31 серпня)",
    find: ".filter((c) => c.startDate <= to && c.endDate >= from)",
    replace: ".filter((c) => c.endDate >= from)",
  },
];
