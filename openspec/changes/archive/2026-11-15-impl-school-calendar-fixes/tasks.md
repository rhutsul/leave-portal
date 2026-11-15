# Tasks

Кожна група — одна гілка й один PR «Реалізація». Рядок «Done when» — AC, рядки яких у `docs/conformance.md` ведуть до
задачі (тест із AC ID + код). Група 1 фіксує вже злиту реалізацію уточнень AC-CAL-16…20 (PR #75, #76), щоб рядки
conformance вели до задачі; групи 2–4 — виправлення за рев'ю WS9.

## 1. Уточнення AC-CAL-16…20 (злито в PR #75 і #76)

- [x] 1.1 Міграція `school_calendar_clarifications`: `closed_day_name` і `submit_leave_request` (AC-CAL-16), частина
      повідомлення на кожне закриття, що перетинається (AC-CAL-17), тексти PM для назви в `add_school_closure`
      (AC-CAL-18, -19), `leave_records.day_share` і тригер `fix_day_share` (AC-CAL-20)
- [x] 1.2 Форма «Add closure» і Server Action перевіряють поля текстами PM (AC-CAL-18, -19); заявка не приймає
      скорочений день без робочого часу (AC-CAL-16)
- [x] 1.3 Тести PGlite, unit і e2e з AC ID; SQL-мутанти S23–S27

Done when: AC-CAL-16, AC-CAL-17, AC-CAL-18, AC-CAL-19, AC-CAL-20.

## 2. Частка дати й вид закриття в базі (`task/ws9-day-share-closure-kind`)

- [x] 2.1 Міграція `day_share_cap_and_closure_kind` (D1, D2): `date_room`, нові `record_share`, `fix_day_share`,
      `add_school_closure(p_kind, …)`; перевірка — `db-check` зелений
- [x] 2.2 Тести PGlite: послідовність «погодження під закриттям → `remove_school_closure` → друге погодження» дає 1.00
      («Unpaid leave», «Sick leave», різні типи); дзеркальний випадок 0.65 закріплено (Q1); скорочений день без часу —
      «Enter the closing time»
- [x] 2.3 Виклики в TS (`ClosureInput.kind`, Server Action `addClosure`, `database.types.ts`, e2e AC-CAL-13)
- [x] 2.4 SQL-мутанти: S12–S17, S24–S27 на новій міграції; S28–S31 → `KILLED`; таблиця — `docs/qa/mutation-sql.md`

Done when: AC-BALANCE-05, AC-CAL-20.

## 3. Синтетичний працівник, e2e і чисте дерево UAT (`task/ws9-uat-employee`)

- [x] 3.1 `createUatEmployee` у `tests/e2e/support/admin.ts` і прибирання за id (D3)
- [x] 3.2 e2e AC-CAL-06 і AC-CAL-20 на синтетичному працівнику з точними числами «Тоді» від 0.00, без винятку для проду
- [x] 3.3 e2e AC-CAL-16 (`fri: [[780, 1020]]`)
- [x] 3.4 `scripts/uat/run.mjs`: зупинка на брудному дереві, `gitDirty` у manifest (D4); NC-3 на AC-CAL-17

Done when: AC-CAL-06, AC-CAL-16, AC-CAL-20.

## 4. UAT AC-CAL-01…20 на проді й proof pack

- [x] 4.1 Прогін `npm run uat -- --url https://leave-portal-olive.vercel.app` з main, чисте дерево, з відео; один
      `docs/qa/uat/<дата>/report.md` і `manifest.json` з `negativeControls`
- [x] 4.2 Оновити `docs/qa/proof-pack.md`; archive цієї зміни

Done when: AC-CAL-01, AC-CAL-02, AC-CAL-03, AC-CAL-04, AC-CAL-05, AC-CAL-06, AC-CAL-07, AC-CAL-08, AC-CAL-09,
AC-CAL-10, AC-CAL-11, AC-CAL-12, AC-CAL-13, AC-CAL-14, AC-CAL-15, AC-CAL-16, AC-CAL-17, AC-CAL-18, AC-CAL-19,
AC-CAL-20.
