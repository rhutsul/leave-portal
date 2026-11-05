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
// Чинна версія private.check_record_hours (create or replace поверх 20261021171135_leave_record_edit.sql): мутуємо її,
// бо мутант у старішій копії перезаписала б пізніша міграція — і він «вижив» би без жодного тесту.
const CHECK_HOURS = "supabase/migrations/20261104165058_end_at_next_block.sql";
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
];
