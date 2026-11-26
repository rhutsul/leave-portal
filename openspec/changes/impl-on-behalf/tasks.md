# Tasks

Гілка `task/on-behalf` і PR «Реалізація» (задачі 1–5: expand, D9 і D13), потім три малі PR кроків 2–4 D9 (задачі 6, 7, 8). Починаємо
після злиття реалізацій `cancel-approved` і `substitutes` від свіжого `main`; міграція `npx supabase migration new
on_behalf_and_edit` — першим комітом (мітка пізніша за міграцію `substitutes`, `node scripts/check-migration-order.mjs`;
перед нею — перевірити, що інша відкрита гілка не змінює схему); кожна задача доповнює той самий файл своєю частиною.
Задачі вертикальні: база, дія, сторінка й тести своїх AC разом, тести спершу червоні. «Done when» — AC, які задача
доводить; PR переводить їх у `реалізовано` в `docs/conformance.md` (тест із AC ID + код).

## 1. Менеджер подає за працівника своєї посади, запис погоджено одразу

- [x] 1.1 База: `private.can_act_for_employee`, `private.decides_for_position` (D1, D2); ядро
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

- [x] 2.1 База: погодження за `decides_for_position` по кожному запису (D3, крок 4). Код: колонка «Status after submit»
      у підсумку з `on_behalf_positions.decides`; повідомлення про успіх з лічильниками (D10). Тести: PGlite (основна
      `approved`, додаткова `awaiting` у черзі manager2@ і не в черзі manager1@; адміністратор — обидві `approved`);
      e2e (колонка статусу в підсумку).
      Done when: AC-BEHALF-02, AC-BEHALF-03

## 3. Ті самі перевірки з «this employee»

- [x] 3.1 База: `private.on_behalf_message` і переклад винятків ядра (D6). Код: `forEmployee` у формі від імені
      (календар, години, попередження понад залишок), нагадування AC-LEAVE-23 дослівно. Тести: unit
      `src/lib/leave/on-behalf.test.ts` (таблиця D6 і збіг із SQL), PGlite (лише субота → текст AC, заявки немає;
      перетин → текст D6), e2e (клік по суботі показує текст AC).
      Done when: AC-BEHALF-05

## 4. Хто може подавати від імені

- [x] 4.1 База: порядок перевірок D1 у `submit_leave_request_on_behalf` і функціях D8. Код: `EmptyState` відмов і
      порожнього списку на `/on-behalf/**`, пряме посилання на себе → `/requests/new` (D10, D11). Тести: PGlite
      (працівник, менеджер чужих посад, менеджер без посад — тексти й жодного запису); e2e (тексти AC без email; гість
      → сторінка входу без імен і дат).
      Done when: AC-BEHALF-11, AC-BEHALF-12, AC-BEHALF-14, AC-BEHALF-15

## 5. Правка в базі, закрита до перемикання рішення (крок 1 D9, той самий PR)

- [x] 5.1 База: `edit_leave_record` з обгорткою (D7) **без** `grant execute` для `authenticated`, дія `record_changed`
      (D4), 9-параметрова `decide_leave_record` і стара як обгортка над спільним тілом з `p_check_fields => false` (D9). Код: `HISTORY_ACTIONS` і `RecordHistory` для
      `record_changed`; кнопки «Edit record» ще немає. Тести: PGlite від ролі з правом (дата, тип, заміна — по рядку на
      поле дослівно; кілька полів — у порядку D7; нічого не змінилось — жодного рядка; перетин сам із собою — ні, з
      іншим записом — текст D6; людина поза списком і зайнята заміна — відмова; години поза розкладом; «Approved»,
      «Rejected», «Returned for revision», «Cancelled» — текст AC-BEHALF-10; manager2@ — відмова); від
      `authenticated` — 42501 у кожного (немає гранту), `update leave_records` напряму — 42501, запис і кількість подій
      без змін; старий 6-параметровий виклик рішення працює; SQL-мутанти D12, `npm run mutation:sql`.
      Done when: AC-BEHALF-13

## 6. Рішення бачить чужу правку (крок 2 D9)

- [ ] 6.1 Окремий PR «Реалізація», коли `/api/health` показує схему міграції зрізу чи новішу: `decideRecord` кличе
      9-параметрову `decide_leave_record` (дата й тип — з `decision_records()`, заміна — з `record_substitutes`).
      Тести: PGlite — правка від ролі з правом (дата, тип, заміна `null` → uuid і uuid → `null`), рішення зі старими
      значеннями → текст D9, запис лишається «Awaiting decision»; ті самі значення → рішення проходить; наявні e2e
      рішень зелені.
      Done when: AC-BEHALF-06, AC-BEHALF-07, AC-BEHALF-08

## 7. Contract до відкриття правки (крок 3 D9)

- [ ] 7.1 Окремий PR, коли код 6.1 на проді (`sha` = `main`): міграція `drop` 6-параметрових
      `private.decide_leave_record` і `public.decide_leave_record`; тест старого виклику прибрано в тому самому PR;
      `edit_leave_record` усе ще без гранту.
      Done when: AC-BEHALF-06, AC-BEHALF-07, AC-BEHALF-08

## 8. Менеджер змінює запис у «Decisions» (крок 4 D9)

- [ ] 8.1 Окремий PR «Реалізація», коли contract 7.1 застосовано на проді (`/api/health`): міграція з `grant execute`
      на `edit_leave_record` для `authenticated`; кнопка «Edit record» і `edit-record-form.tsx` у `Sheet` «Decisions»,
      server action `editRecord`, смуга «Cancel» / «Save changes»; приклади на `/design`. Тести: PGlite від
      `authenticated` (manager1@ змінює дату, тип, заміну — рядки дослівно); e2e `tests/e2e/on-behalf-edit.spec.ts`
      (правка в «Decisions», працівник бачить рядок у «My requests»).
      Done when: AC-BEHALF-06, AC-BEHALF-07, AC-BEHALF-08
- [ ] 8.2 Той самий PR: `Alert` з текстом бази над формою правки, межа поля годин. Тести: e2e (години поза розкладом →
      текст AC; запис погоджено `adminClient()` у фоні → текст AC-BEHALF-10;
      `tests/e2e/negative-controls.spec.ts` — RPC `edit_leave_record` сесією manager2@ → відмова, запис без змін).
      Done when: AC-BEHALF-09, AC-BEHALF-10, AC-BEHALF-13

## 9. Телефон, знімки, матриця, archive

- [ ] 9.1 `tests/e2e/on-behalf.mobile.spec.ts` (проєкт `mobile`, 360 і 390 px: список і форма — у PR задач 1–5; панель
      правки на весь екран — у PR 8.1) і знімки станів D11 у світлій і темній темі, 390 і 1280 px —
      `tests/e2e/on-behalf-screenshots.spec.ts` → `docs/img/`.
      Done when: AC-BEHALF-01, AC-BEHALF-02, AC-BEHALF-06, AC-BEHALF-11, AC-BEHALF-15
- [ ] 9.2 Рядки `docs/conformance.md` (`/conformance`) — у PR, що доводить AC: AC-BEHALF-01…05, -11, -12, -14, -15 і
      -13 (база) у першому PR; AC-BEHALF-06…10 — у PR 8.1. Кандидати в питання PM (D13) — у `docs/spec-reading.md`;
      `database.types.ts` із Summary `db-check`; `npm run check:design`, `npm run check:ui`, `npm run ac:coverage`,
      `npm run gates`, `npm test`. PR з міграцією й функціями `security definer` — рев'ю CodeRabbit або звіт другої
      думки до злиття.
      Done when: AC-BEHALF-01, AC-BEHALF-02, AC-BEHALF-03, AC-BEHALF-04, AC-BEHALF-05, AC-BEHALF-06, AC-BEHALF-07, AC-BEHALF-08, AC-BEHALF-09, AC-BEHALF-10, AC-BEHALF-11, AC-BEHALF-12, AC-BEHALF-13, AC-BEHALF-14, AC-BEHALF-15
- [ ] 9.3 У PR 8.1 (останньому PR зрізу): `npx openspec archive impl-on-behalf -y`.
      Done when: AC-BEHALF-01, AC-BEHALF-02, AC-BEHALF-03, AC-BEHALF-04, AC-BEHALF-05, AC-BEHALF-06, AC-BEHALF-07, AC-BEHALF-08, AC-BEHALF-09, AC-BEHALF-10, AC-BEHALF-11, AC-BEHALF-12, AC-BEHALF-13, AC-BEHALF-14, AC-BEHALF-15
