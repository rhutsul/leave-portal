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
const RECORD_EDIT_DB = "tests/db/leave-record-edit.test.ts";
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
  // Шкільний календар (openspec/changes/impl-school-calendar/design.md D6).
  {
    id: "S11", kind: "sql", ac: "AC-CAL-02", file: CALENDAR, tests: [CALENDAR_DB],
    what: "RLS school_closures: працівник і менеджер більше не бачать закриттів (using → false)",
    find: "  using ((select auth.uid()) is not null);",
    replace: "  using (false);",
  },
  {
    id: "S12", kind: "sql", ac: "AC-CAL-07", file: CALENDAR, tests: [CALENDAR_DB],
    what: "add_school_closure: запис «Approved» більше не блокує закриття",
    find: "     and r.status in ('awaiting', 'returned', 'approved')\n     and (p_closes_at",
    replace: "     and r.status in ('awaiting', 'returned')\n     and (p_closes_at",
  },
  {
    id: "S13", kind: "sql", ac: "AC-CAL-08", file: CALENDAR, tests: [CALENDAR_DB],
    what: "add_school_closure: запис «Rejected» теж блокує закриття",
    find: "     and r.status in ('awaiting', 'returned', 'approved')\n     and (p_closes_at",
    replace: "     and r.status in ('awaiting', 'returned', 'approved', 'rejected')\n     and (p_closes_at",
  },
  {
    id: "S14", kind: "sql", ac: "AC-CAL-07", file: CALENDAR, tests: [CALENDAR_DB],
    what: "скорочений день: запис, що закінчується рівно о часі закриття, теж блокує (> → >=)",
    find: "r.end_min > p_closes_at",
    replace: "r.end_min >= p_closes_at",
  },
  {
    id: "S15", kind: "sql", ac: "AC-CAL-10", file: CALENDAR, tests: [CALENDAR_DB],
    what: "add_school_closure: дата кінця раніше за початок більше не перевіряється (лишається лише обмеження таблиці)",
    find: "  if p_end < p_start then\n    raise exception 'The end date cannot be earlier than the start date';",
    replace: "  if false then\n    raise exception 'The end date cannot be earlier than the start date';",
  },
  {
    id: "S16", kind: "sql", ac: "AC-CAL-11", file: CALENDAR, tests: [CALENDAR_DB],
    what: "add_school_closure: спільна дата більше не шукається (лишається лише обмеження таблиці, без тексту PM)",
    find: "   where daterange(c.start_date, c.end_date, '[]') && daterange(p_start, p_end, '[]')",
    replace: "   where false",
  },
  {
    id: "S17", kind: "sql", ac: "AC-CAL-13", file: CALENDAR, tests: [CALENDAR_DB],
    what: "add_school_closure: перевірка ролі → лише «увійшов» (менеджер додає закриття)",
    find:
      "  if (select auth.uid()) is null or private.current_app_role() is distinct from 'admin' then\n" +
      "    raise exception 'Only an administrator can change the school calendar' using errcode = '42501';\n  end if;\n\n  -- Тексти",
    replace:
      "  if (select auth.uid()) is null then\n" +
      "    raise exception 'Only an administrator can change the school calendar' using errcode = '42501';\n  end if;\n\n  -- Тексти",
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
];
