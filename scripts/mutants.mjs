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
];
