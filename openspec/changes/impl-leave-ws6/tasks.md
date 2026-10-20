# Tasks

Кожна група — одна гілка `task/<коротко>` і один PR «Реалізація». Рядок «Done when» — AC, які PR переводить у
`реалізовано` в `docs/conformance.md` (тест із AC ID у `*.test.ts` + код).

## 1. Схема бази й правила часу (`task/leave-schema`)

- [ ] 1.1 Міграція ролей `employee` / `manager` / `admin` (зняти check → дані → default → новий check) і нові
      користувачі в `supabase/demo-users.json`; перевірка: `db-check` зелений, після merge `npm run users:demo` створює
      `teacher1@`, `teacher2@`, `manager1@`, `manager2@`, `admin@example.test` з новими ролями
- [ ] 1.2 Міграція таблиць D2 з RLS, `revoke`, явними `grant`, політиками, обмеженням перетину D3 і функцією
      `submit_leave_request` (D4); перевірка: `db-check` зелений, `database.types.ts` з Summary прогону в PR
- [ ] 1.3 `src/lib/leave/time.ts` — хвилини, крок 5 хв, кінець блоку, години в блоках, тривалість без перерв;
      перевірка: `npm test` — тести AC-LEAVE-04, AC-LEAVE-06, AC-LEAVE-07, AC-LEAVE-08, AC-LEAVE-09, AC-LEAVE-15 зелені
      (у матриці — «відкладено (UI — задача 2)»)

Done when: схему застосовано `db-deploy`; тести правил часу зелені (AC переходять у `реалізовано` в задачі 2).

## 2. Подання заявки й «My requests» (`task/leave-request`)

- [ ] 2.1 Міграція тестових даних: підрозділи, посади й розклади з AC (основна Mon–Fri 08:30–15:30, додаткова
      Mon 15:45–17:00, блоки Tue 08:30–12:00 і 12:30–15:30), відповідальні менеджери, перенесені дні — за email,
      `on conflict do nothing`; перевірка: `db-check` зелений, після merge посади видно на сторінці
- [ ] 2.2 `src/lib/leave/request.ts` — записи з вибору, одна посада мінімум, спорідненість, перетин; перевірка:
      тести AC-LEAVE-01, AC-LEAVE-02, AC-LEAVE-03, AC-LEAVE-05, AC-LEAVE-10, AC-LEAVE-12, AC-LEAVE-13, AC-LEAVE-16
- [ ] 2.3 Сторінка `/requests/new` (дати → посади й години → тип → підсумок) і server action з `submit_leave_request`;
      перевірка: тест AC-LEAVE-11 (підсумок без підтвердження нічого не створює), заявка видна на preview
- [ ] 2.4 Сторінка `/requests` — лише власні записи з датою, годинами, посадою, типом і статусом (`access.ts`);
      перевірка: тест AC-LEAVE-14, `teacher1@` бачить лише свої записи на preview

Done when: AC-LEAVE-01, AC-LEAVE-02, AC-LEAVE-03, AC-LEAVE-04, AC-LEAVE-05, AC-LEAVE-06, AC-LEAVE-07, AC-LEAVE-08,
AC-LEAVE-09, AC-LEAVE-10, AC-LEAVE-11, AC-LEAVE-12, AC-LEAVE-13, AC-LEAVE-14, AC-LEAVE-15, AC-LEAVE-16.

## 3. Залишки (`task/leave-balance`)

- [ ] 3.1 `src/lib/leave/balance.ts` — навчальний рік, частка дня half-up ≤ 1.00, лише погоджені записи, перенесення;
      перевірка: тести AC-BALANCE-01, AC-BALANCE-02, AC-BALANCE-03, AC-BALANCE-04, AC-BALANCE-05, AC-BALANCE-06,
      AC-BALANCE-07, AC-BALANCE-11
- [ ] 3.2 Міграція з функцією `get_balance_inputs` (D4) і сторінка `/balances` (свої; `?employee=` для менеджера своїх
      посад і адміністратора, `access.ts`); перевірка: тести AC-BALANCE-12, AC-BALANCE-13, залишки видно на preview

Done when: AC-BALANCE-01, AC-BALANCE-02, AC-BALANCE-03, AC-BALANCE-04, AC-BALANCE-05, AC-BALANCE-06, AC-BALANCE-07,
AC-BALANCE-11, AC-BALANCE-12, AC-BALANCE-13.

## 4. Рішення менеджера (`task/leave-decision`)

- [ ] 4.1 `src/lib/leave/decision.ts` — хто вирішує, власний запис менеджера, переходи статусів, коментар при
      поверненні; перевірка: тести AC-DECIDE-04, AC-DECIDE-07, AC-DECIDE-08, AC-DECIDE-09, AC-DECIDE-18
- [ ] 4.2 Міграція з функцією `decide_leave_record` (D4) і сторінка `/decisions` («Awaiting decision», «History»,
      погодити / відхилити / повернути, історія запису); перевірка: тести AC-DECIDE-01, AC-DECIDE-02, AC-DECIDE-03,
      AC-DECIDE-05, AC-DECIDE-10, AC-DECIDE-11, AC-DECIDE-14, AC-DECIDE-15, AC-DECIDE-19

Done when: AC-DECIDE-01, AC-DECIDE-02, AC-DECIDE-03, AC-DECIDE-04, AC-DECIDE-05, AC-DECIDE-07, AC-DECIDE-08,
AC-DECIDE-09, AC-DECIDE-10, AC-DECIDE-11, AC-DECIDE-14, AC-DECIDE-15, AC-DECIDE-18, AC-DECIDE-19.

## 5. Зміна, повторне подання й скасування працівником (`task/leave-record-edit`)

- [ ] 5.1 Міграція з функціями `update_leave_record_hours`, `resubmit_leave_record`, `cancel_leave_record` (D4) і дії
      на `/requests`; перевірка: тести AC-DECIDE-06, AC-DECIDE-12, AC-DECIDE-13, AC-DECIDE-16, AC-DECIDE-17

Done when: AC-DECIDE-06, AC-DECIDE-12, AC-DECIDE-13, AC-DECIDE-16, AC-DECIDE-17.

## 6. Перевищення залишку (`task/leave-balance-overflow`)

- [ ] 6.1 Попередження працівнику на підсумку заявки (`balance.ts`, `/requests/new`); перевірка: тести AC-BALANCE-08,
      AC-BALANCE-15
- [ ] 6.2 Попередження, розподіл і погодження лише з розподілом на `/decisions` (`decide_leave_record` перераховує
      залишок на момент рішення); перевірка: тести AC-BALANCE-09, AC-BALANCE-10, AC-BALANCE-14, AC-BALANCE-16

Done when: AC-BALANCE-08, AC-BALANCE-09, AC-BALANCE-10, AC-BALANCE-14, AC-BALANCE-15, AC-BALANCE-16.

## Workflow follow-up

- Кожен PR задачі: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run ac:coverage`,
  `npm run spec:check`; рядки `docs/conformance.md` і галочки цього файлу — у тому самому PR.
- AC, які не встигнемо, — `відкладено (причина)` з посиланням на питання чи рішення PM.
- В останньому PR задачі зрізу: `npx openspec archive impl-leave-ws6 -y` і запис екрана 1–2 хв з прод-URL.
