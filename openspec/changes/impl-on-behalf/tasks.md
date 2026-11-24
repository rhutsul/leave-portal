# Tasks

Гілка `task/on-behalf` і PR «Реалізація» (expand, D9 і D13), потім два малі PR кроків 2 і 3 expand → contract. Починаємо
після злиття реалізацій `cancel-approved` і `substitutes` від свіжого `main`; міграція `npx supabase migration new
on_behalf_and_edit` — першим комітом (мітка пізніша за міграцію `substitutes`, `node scripts/check-migration-order.mjs`;
перед нею — перевірити, що інша відкрита гілка не змінює схему); кожна задача доповнює той самий файл своєю частиною.
Задачі вертикальні: база, дія, сторінка й тести своїх AC разом, тести спершу червоні. «Done when» — AC, які задача
доводить; PR переводить їх у `реалізовано` в `docs/conformance.md` (тест із AC ID + код).

## 1. Менеджер подає за працівника своєї посади, запис погоджено одразу

- [ ] 1.1 База: `private.can_act_for_employee`, `private.decides_for_position` (D1, D2); ядро
      `private.create_leave_request` і тонке `private.submit_leave_request` (D3); `private.approval_split` і нове тіло
      `decide_leave_record` на ньому (D5); `submit_leave_request_on_behalf` з обгорткою; дія `submitted_on_behalf` у
      `leave_record_events_action_check` (D4); `on_behalf_employees`, `on_behalf_positions`, `on_behalf_record_dates`
      (D8); `manager3@example.test` у `supabase/demo-users.json`. Код: `src/lib/leave/on-behalf.ts`; спільний
      `request-payload.ts`; проп `subject` у `NewRequestForm`; сторінки `/on-behalf` і `/on-behalf/[employeeId]` з
      `loading.tsx`, `submitOnBehalf`, пункт меню «On behalf»; `HISTORY_ACTIONS` і `RecordHistory` для нової дії;
      приклади на `/design` (D11). Тести: PGlite `tests/db/on-behalf.test.ts` (погоджено одразу, два рядки історії з
      одним часом, залишок після, понад залишок із розподілом), регресія власної заявки й рішення; e2e
      `tests/e2e/on-behalf.spec.ts` (менеджер подає, працівник бачить «Approved» і рядок історії).
      Done when: AC-BEHALF-01, AC-BEHALF-04

## 2. Посади інших менеджерів чекають рішення, адміністратор погоджує все

- [ ] 2.1 База: погодження за `decides_for_position` по кожному запису (D3, крок 4). Код: колонка «Status after submit»
      у підсумку з `on_behalf_positions.decides`; повідомлення про успіх з лічильниками (D10). Тести: PGlite (основна
      `approved`, додаткова `awaiting` у черзі manager2@ і не в черзі manager1@; адміністратор — обидві `approved`);
      e2e (колонка статусу в підсумку).
      Done when: AC-BEHALF-02, AC-BEHALF-03

## 3. Ті самі перевірки з «this employee»

- [ ] 3.1 База: `private.on_behalf_message` і переклад винятків ядра (D6). Код: `forEmployee` у формі від імені
      (календар, години, попередження понад залишок), нагадування AC-LEAVE-23 дослівно. Тести: unit
      `src/lib/leave/on-behalf.test.ts` (таблиця D6 і збіг із SQL), PGlite (лише субота → текст AC, заявки немає;
      перетин → текст D6), e2e (клік по суботі показує текст AC).
      Done when: AC-BEHALF-05

## 4. Хто може подавати від імені

- [ ] 4.1 База: порядок перевірок D1 у `submit_leave_request_on_behalf` і функціях D8. Код: `EmptyState` відмов і
      порожнього списку на `/on-behalf/**`, пряме посилання на себе → `/requests/new` (D10, D11). Тести: PGlite
      (працівник, менеджер чужих посад, менеджер без посад — тексти й жодного запису); e2e (тексти AC без email; гість
      → сторінка входу без імен і дат).
      Done when: AC-BEHALF-11, AC-BEHALF-12, AC-BEHALF-14, AC-BEHALF-15

## 5. Менеджер змінює дату, тип і заміну запису до рішення

- [ ] 5.1 База: `edit_leave_record` з обгорткою (D7), дія `record_changed` (D4). Код: кнопка «Edit record» і
      `edit-record-form.tsx` у `Sheet` «Decisions», server action `editRecord`, смуга «Cancel» / «Save changes»,
      рядки історії в `RecordHistory`; приклади на `/design`. Тести: PGlite (дата, тип, заміна — по рядку на поле,
      дослівно; кілька полів разом — кілька рядків у порядку D7; нічого не змінилось — жодного рядка; перетин сам із
      собою — ні, з іншим записом — текст D6; людина поза списком і зайнята заміна — відмова); e2e
      `tests/e2e/on-behalf-edit.spec.ts` (правка в «Decisions», працівник бачить рядок у «My requests»).
      Done when: AC-BEHALF-06, AC-BEHALF-07, AC-BEHALF-08

## 6. Правку, що порушує правило, не збережено

- [ ] 6.1 База: кроки 1, 3 і 6 `edit_leave_record` (D7). Код: `Alert` з текстом бази над формою правки, межа поля
      годин. Тести: PGlite (години поза розкладом → текст AC; «Approved», «Rejected», «Returned for revision»,
      «Cancelled» → текст AC-BEHALF-10; manager2@ через RPC і `update` напряму → відмова, запис і кількість подій без
      змін), SQL-мутанти D12, `npm run mutation:sql`; e2e (години поза розкладом; запис погоджено у фоні → текст AC;
      `tests/e2e/negative-controls.spec.ts` — RPC сесією manager2@).
      Done when: AC-BEHALF-09, AC-BEHALF-10, AC-BEHALF-13

## 7. Телефон, знімки, матриця

- [ ] 7.1 `tests/e2e/on-behalf.mobile.spec.ts` (проєкт `mobile`, 360 і 390 px: список, форма, панель правки на весь
      екран) і знімки станів D11 у світлій і темній темі, 390 і 1280 px — `tests/e2e/on-behalf-screenshots.spec.ts` →
      `docs/img/`.
      Done when: AC-BEHALF-01, AC-BEHALF-02, AC-BEHALF-06, AC-BEHALF-11, AC-BEHALF-15
- [ ] 7.2 Рядки AC-BEHALF-01…15 у `docs/conformance.md` (`/conformance`); кандидати в питання PM (D13) — у
      `docs/spec-reading.md`; `database.types.ts` із Summary `db-check`; `npm run check:design`, `npm run check:ui`,
      `npm run ac:coverage`, `npm run gates`, `npm test`. PR з міграцією й функціями `security definer` — рев'ю
      CodeRabbit або звіт другої думки до злиття.
      Done when: AC-BEHALF-01, AC-BEHALF-02, AC-BEHALF-03, AC-BEHALF-04, AC-BEHALF-05, AC-BEHALF-06, AC-BEHALF-07, AC-BEHALF-08, AC-BEHALF-09, AC-BEHALF-10, AC-BEHALF-11, AC-BEHALF-12, AC-BEHALF-13, AC-BEHALF-14, AC-BEHALF-15

## 8. Рішення бачить чужу правку (expand → contract, D9)

- [ ] 8.1 Окремий PR «Реалізація», коли `/api/health` показує схему міграції зрізу чи новішу: `decideRecord` кличе
      9-параметрову `decide_leave_record` (дата й тип — з `decision_records()`, заміна — з `record_substitutes`);
      PGlite — правка дати іншим менеджером, рішення зі старою датою → текст D9, запис лишається «Awaiting decision»;
      e2e — `Alert` з текстом D9 у панелі.
      Done when: AC-BEHALF-06, AC-BEHALF-07, AC-BEHALF-08
- [ ] 8.2 Contract — окремий PR, коли код 8.1 на проді (`sha` = `main`): міграція `drop` 6-параметрових
      `private.decide_leave_record` і `public.decide_leave_record`, тест старого виклику прибрано в тому самому PR;
      `npx openspec archive impl-on-behalf -y`.
      Done when: AC-BEHALF-01, AC-BEHALF-02, AC-BEHALF-03, AC-BEHALF-04, AC-BEHALF-05, AC-BEHALF-06, AC-BEHALF-07, AC-BEHALF-08, AC-BEHALF-09, AC-BEHALF-10, AC-BEHALF-11, AC-BEHALF-12, AC-BEHALF-13, AC-BEHALF-14, AC-BEHALF-15
