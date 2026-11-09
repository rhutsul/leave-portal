# Tasks

Кожна група — одна гілка `task/<коротко>` і один PR «Реалізація», вертикальний зріз (сторінка + server action +
таблиця/RLS + тест). Рядок «Done when» — AC, які PR переводить у `реалізовано` в `docs/conformance.md` (тест із AC ID
+ код). Тести кожної задачі пише окрема сесія з тексту AC до коду (maker ≠ checker); у кожному PR — таблиця «AC →
тест → рівень → доказ, що тест відмови падає». Задачі йдуть по черзі: 2 стоїть на функціях бази з 1.

## 1. Закриття: додати, переглянути, видалити (`task/calendar-closures`)

- [x] 1.1 Тести з тексту AC (окрема сесія, спершу червоні): `tests/db/school-calendar.test.ts` — додавання й відмови
      (AC-CAL-01, -07, -08, -10, -11), читання `asUser(teacher1)` / `asUser(manager1)` (AC-CAL-02), роль
      `asUser(manager1)` (AC-CAL-13), `asAnon` (AC-CAL-14), частка дня (AC-CAL-06); рядок `school_closures` у
      `tests/db/table-visibility.test.ts`; unit `src/lib/leave/calendar.test.ts` — навчальний рік (закриття через
      31 серпня — в обох роках), порожній стан (AC-CAL-02, -15); компонент сторінки відмови (AC-CAL-12)
- [x] 1.2 Міграція `school_calendar` (D1–D3): таблиця `public.school_closures` з RLS, колонковим `grant select` і
      обмеженнями; `add_school_closure` / `remove_school_closure` з ексклюзивним lock; `blocks_on_date`,
      `closure_on_date`; нові версії `check_record_hours`, `working_minutes`, `get_balance_inputs`; перевірка:
      `db-check` зелений, `database.types.ts` з Summary прогону
- [x] 1.3 `/calendar` для всіх ролей (`<Table stack>`, перемикач року, `EmptyState`), пункт «School calendar» у
      `sidebar-nav.tsx` і `mobile-nav.tsx`; у адміна — «Add closure» і «⋯» → «Remove closure» з `Dialog`
- [x] 1.4 `/calendar/manage` — форма «Add closure» (цілі дні / скорочений день), server actions `addClosure` /
      `removeClosure` з `getClaims()` і роллю з `profiles`, помилки бази дослівно в `Alert`; сторінка відмови для
      не-адміна
- [x] 1.5 SQL-мутанти в `scripts/mutants.mjs` (D6: AC-CAL-02, -07, -10, -11, -13, -14) → `npm run mutation:sql`
      `KILLED`
- [x] 1.6 Адаптив за ADR 0008: від 360 px, 44 px, `tests/e2e/calendar.mobile.spec.ts`; знімки 390 і 1280 px у
      світлій і темній темах у `docs/img/`

Done when: AC-CAL-01, AC-CAL-02, AC-CAL-06, AC-CAL-07, AC-CAL-08, AC-CAL-10, AC-CAL-11, AC-CAL-12, AC-CAL-13,
AC-CAL-14, AC-CAL-15.

## 2. Заявка в закритий і скорочений день (`task/calendar-request`)

- [x] 2.1 Тести з тексту AC (окрема сесія, спершу червоні): unit `clipBlocks`, `positionsOnDate`,
      `buildRequestRecords`, `requestShares` (межі: блок, що триває о часі закриття, і блок, що з нього починається;
      попередження в скорочений день — частка 1.00); PGlite `submit_leave_request` у закритий і скорочений день і
      після видалення закриття (AC-CAL-03, -04, -05, -09)
- [x] 2.2 Міграція: нові версії `submit_leave_request` (закрита дата — пропуск, як AC-LEAVE-21; жодної — «The school
      is closed on this day: <назва>») і `update_leave_record_hours` (спільний lock календаря після lock працівника)
- [x] 2.3 TS (D4): `clipBlocks` у `src/lib/leave/calendar.ts`; `positionsOnDate` / `buildRequestRecords`
      (`src/lib/leave/request.ts`); `workingMinutesOn` / `requestShares` (`src/lib/leave/balance.ts`); server action
      подання `src/app/(app)/requests/new/actions.ts`; зміна годин `src/app/(app)/requests/actions.ts`; «My requests»
      `src/app/(app)/requests/page.tsx` (розклад дня й «Whole day» запису)
- [x] 2.4 `/requests/new`: закриття тим самим вікном, що `recordDates` (навчальні роки `year-1 … year+1`); стан
      `closed` — кнопка з повідомленням AC-CAL-03 (`CalendarDay`, вітрина `/design`, `DESIGN.md` розділ 6), легенда з
      «Closed by the school»
- [x] 2.5 Stryker `--mutate src/lib/leave/calendar.ts` і SQL-мутант межі скороченого дня (`end_min > closes_at` →
      `>=`) — вижилі мутанти розібрано

Done when: AC-CAL-03, AC-CAL-04, AC-CAL-05, AC-CAL-09.

## 3. UAT на кожен AC (`task/uat-school-calendar`)

- [x] 3.1 Хелпер прибирання глобальних рядків у `tests/e2e/support/` (design, Risks): закриття й запис «Approved»
      `teacher1@example.test` створюються через секретний ключ і видаляються за id в `afterAll` і окремим кроком у
      `scripts/uat/run.mjs`; рядок «закриття й записи, що лишились» у звіті; перевірка «чисто» перед прогоном
- [x] 3.2 `tests/e2e/calendar.spec.ts`: один `test` на кожен з 15 AC, анотація `ac`, тег `@uat`, `given` / `when` /
      `thenStep`, твердження з дослівним текстом AC; AC, що пишуть дані, — `@writes`
- [x] 3.3 Прогін на проді — людина (`npm run uat -- --url https://leave-portal-olive.vercel.app`), негативний
      контроль NC-1; звіт `docs/qa/uat/<дата>/` (`report.md`, `manifest.json`, `frames/`), відео — в описі PR
      (прогону 08.11 — в описі PR proof pack);
      «UAT готовий» у чат команди

Done when: AC-CAL-01, AC-CAL-02, AC-CAL-03, AC-CAL-04, AC-CAL-05, AC-CAL-06, AC-CAL-07, AC-CAL-08, AC-CAL-09,
AC-CAL-10, AC-CAL-11, AC-CAL-12, AC-CAL-13, AC-CAL-14, AC-CAL-15 — кожен з UAT-специфікацією й рядком звіту на проді.

## 4. Proof pack, ретро й закриття плану (`task/proof-pack-ws9`)

- [x] 4.1 `docs/qa/proof-pack.md` за шаблоном WS9 (WS8 — `docs/qa/proof-pack-ws8.md`): рядок на кожен AC і «Не
      перевірено»; заповнює нова сесія лише з того, що є в репо
- [x] 4.2 Ретро «що взяти з фабрики» — `docs/qa/retro-ws9.md`, до 10 рядків по станціях
- [x] 4.3 `npx openspec archive impl-school-calendar -y` — останній PR зрізу

Done when: AC-CAL-01, AC-CAL-02, AC-CAL-03, AC-CAL-04, AC-CAL-05, AC-CAL-06, AC-CAL-07, AC-CAL-08, AC-CAL-09,
AC-CAL-10, AC-CAL-11, AC-CAL-12, AC-CAL-13, AC-CAL-14, AC-CAL-15 — кожен має рядок у proof pack або в «Не перевірено»
з причиною.
