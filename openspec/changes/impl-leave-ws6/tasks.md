# Tasks

Кожна група — одна гілка `task/<коротко>` і один PR «Реалізація». Рядок «Done when» — AC, які PR переводить у
`реалізовано` в `docs/conformance.md` (тест із AC ID у `*.test.ts` + код).

## 1. Заявка на одну дату й «My requests» (`task/leave-request-day`)

- [x] 1.1 Міграція ролей `employee` / `manager` / `admin` (зняти check → дані → default → новий check) і нові
      користувачі в `supabase/demo-users.json`; перевірка: `db-check` зелений, після merge `npm run users:demo` створює
      `teacher1@`, `teacher2@`, `manager1@`, `manager2@`, `admin@example.test` з новими ролями
- [x] 1.2 Міграція таблиць D2 з RLS і політиками `select`, обмеженнями D3 (блоки розкладу працівника не
      перетинаються; записи однієї посади не перетинаються), функцією `submit_leave_request`
      (`public`-обгортка + `private` `security definer`, D4) і тестовими даними за email (D7: основна Mon–Fri
      08:30–15:30, додаткова Mon 15:45–17:00, блоки Tue 08:30–12:00 і 12:30–15:30, відповідальні менеджери);
      перевірка: `db-check` зелений (тестові дані D7 проходять обидва обмеження), `database.types.ts` з Summary
      прогону в PR
- [x] 1.3 `src/lib/leave/time.ts` — хвилини, крок 5 хв, кінець блоку лише як кінець, години в блоках, тривалість без
      перерв, повідомлення з усіма блоками дня; перевірка: тести AC-LEAVE-04, AC-LEAVE-06, AC-LEAVE-07, AC-LEAVE-08,
      AC-LEAVE-09, AC-LEAVE-15, AC-LEAVE-19, AC-LEAVE-20
- [x] 1.4 `src/lib/leave/request.ts` для однієї дати — записи з вибору посад, цілий день = усі блоки, одна посада
      мінімум; перевірка: тести AC-LEAVE-01, AC-LEAVE-02, AC-LEAVE-03, AC-LEAVE-10
- [x] 1.5 Сторінка `/requests/new` для однієї дати (посади й години → тип → підтвердження) і server action з
      `submit_leave_request`; сторінка `/requests` — лише власні записи з датою, годинами, посадою, типом і статусом
      (`access.ts`); перевірка: тест AC-LEAVE-14 на фіксованих даних — 2 записи `teacher1@example.test` і 3 записи
      `teacher2@example.test`, `teacher1@` бачить рівно свої 2; після merge заявка `teacher1@` видна на проді лише йому

Done when: AC-LEAVE-01, AC-LEAVE-02, AC-LEAVE-03, AC-LEAVE-04, AC-LEAVE-06, AC-LEAVE-07, AC-LEAVE-08, AC-LEAVE-09,
AC-LEAVE-10, AC-LEAVE-14, AC-LEAVE-15, AC-LEAVE-19, AC-LEAVE-20.

## 2. Кілька дат, підсумок, коментар, сімейне свято й перетин (`task/leave-request-multi`)

- [x] 2.1 `src/lib/leave/request.ts` — кілька дат в одній заявці, спорідненість для «Family celebration», перетин із
      записами посади й «заявка цілком», коментар до 500 символів у кожному записі; перевірка: тести AC-LEAVE-05,
      AC-LEAVE-12, AC-LEAVE-13, AC-LEAVE-16, AC-LEAVE-17, AC-LEAVE-18
- [x] 2.2 `/requests/new`: вибір кількох дат, необов'язковий коментар, крок підсумку з поверненням до редагування без втрати введеного,
      повідомлення про перетин із бази; перевірка: тест AC-LEAVE-11, заявка на 2 дати видна на preview

Done when: AC-LEAVE-05, AC-LEAVE-11, AC-LEAVE-12, AC-LEAVE-13, AC-LEAVE-16, AC-LEAVE-17, AC-LEAVE-18.

## 3. Залишки (`task/leave-balance`)

- [x] 3.1 `src/lib/leave/balance.ts` — навчальний рік, частка дня half-up ≤ 1.00, лише погоджені записи, перенесення;
      перевірка: тести AC-BALANCE-01, AC-BALANCE-04, AC-BALANCE-11; тести формули частки дня (AC-BALANCE-02, 03, 05,
      06) і «відхилене не рахується» (AC-BALANCE-07) теж тут, але їхні рядки в матриці лишаються
      «відкладено (рішення менеджера — задача 4)»: дія цих AC — погодження чи відхилення менеджером
- [x] 3.2 Міграція з функцією `get_balance_inputs` (D4) і сторінка `/balances` (свої; `?employee=` — повний залишок
      для менеджера будь-якої посади працівника й адміністратора, `access.ts`); перевірка: тести AC-BALANCE-12,
      AC-BALANCE-13, AC-BALANCE-20, залишки видно на preview

Done when: AC-BALANCE-01, AC-BALANCE-04, AC-BALANCE-11, AC-BALANCE-12, AC-BALANCE-13, AC-BALANCE-20.

## 4. Рішення менеджера (`task/leave-decision`)

- [ ] 4.1 `src/lib/leave/decision.ts` — хто вирішує, власний запис менеджера, переходи статусів, коментар
      обов'язковий лише при поверненні (при погодженні й відхиленні — необов'язковий); перевірка: тести AC-DECIDE-04,
      AC-DECIDE-07, AC-DECIDE-08, AC-DECIDE-09, AC-DECIDE-18
- [ ] 4.2 Міграція з функцією `decide_leave_record` (D4) і сторінка `/decisions` («Awaiting decision», «History»,
      погодити / відхилити з необов'язковим коментарем, повернути з коментарем, коментар працівника, історія запису);
      коментар менеджера видно працівнику в «My requests»; перевірка: тести AC-DECIDE-01, AC-DECIDE-02, AC-DECIDE-03,
      AC-DECIDE-05, AC-DECIDE-10, AC-DECIDE-11, AC-DECIDE-14, AC-DECIDE-15, AC-DECIDE-19, AC-DECIDE-20, AC-DECIDE-23,
      AC-DECIDE-24; після погодження чи відхилення залишок на `/balances` змінюється за формулою задачі 3 — тести
      AC-BALANCE-02, AC-BALANCE-03, AC-BALANCE-05, AC-BALANCE-06, AC-BALANCE-07 переходять у «реалізовано»; запис
      зменшує залишок навчального року своєї дати, хоч би коли його погоджено, а перенесення наступного року
      перераховується — тести AC-BALANCE-21, AC-BALANCE-22
- [ ] 4.3 Погодження понад залишок — у тому самому PR, щоб погодження без розподілу ніколи не потрапило на прод:
      `balance.ts` рахує попередження й пропонований розподіл; `decide_leave_record` під `pg_advisory_xact_lock` на
      працівника **сам** визначає `paid_days` і `unpaid_days` за актуальним залишком навчального року дати запису на
      момент рішення (розподіл із форми не приймає) і відхиляє погодження понад залишок без розподілу; `/decisions`
      показує попередження й погоджує лише з розподілом; перевірка: тести AC-BALANCE-09, AC-BALANCE-10,
      AC-BALANCE-14 (між відкриттям і рішенням погоджено інший запис — розподіл рахується за новим залишком),
      AC-BALANCE-16; запис лишається одним записом свого типу з розподілом на ньому (у «My requests» теж) — тести
      AC-BALANCE-18, AC-BALANCE-19

Done when: AC-DECIDE-01, AC-DECIDE-02, AC-DECIDE-03, AC-DECIDE-04, AC-DECIDE-05, AC-DECIDE-07, AC-DECIDE-08,
AC-DECIDE-09, AC-DECIDE-10, AC-DECIDE-11, AC-DECIDE-14, AC-DECIDE-15, AC-DECIDE-18, AC-DECIDE-19, AC-DECIDE-20,
AC-DECIDE-23, AC-DECIDE-24, AC-BALANCE-02, AC-BALANCE-03, AC-BALANCE-05, AC-BALANCE-06, AC-BALANCE-07, AC-BALANCE-09,
AC-BALANCE-10, AC-BALANCE-14, AC-BALANCE-16, AC-BALANCE-18, AC-BALANCE-19, AC-BALANCE-21, AC-BALANCE-22.

## 5. Зміна, повторне подання й скасування працівником (`task/leave-record-edit`)

- [ ] 5.1 Міграція з функціями `update_leave_record_hours`, `resubmit_leave_record`, `cancel_leave_record` (D4) і дії
      на `/requests` — змінюються лише години, перетин перевіряється з іншими записами посади, але не з самим записом;
      перевірка: тести AC-DECIDE-06, AC-DECIDE-12, AC-DECIDE-13, AC-DECIDE-16, AC-DECIDE-17, AC-DECIDE-21,
      AC-DECIDE-22
- [ ] 5.2 `/requests/new` і подання заявки на кілька дат: дату без робочих годин не прийнято з повідомленням
      "You have no working hours on this day", а записи інших дат створено («усі або жоден» — для прийнятих дат);
      перевірка: тест AC-LEAVE-21

Done when: AC-DECIDE-06, AC-DECIDE-12, AC-DECIDE-13, AC-DECIDE-16, AC-DECIDE-17, AC-DECIDE-21, AC-DECIDE-22,
AC-LEAVE-21.

## 6. Попередження працівнику про перевищення залишку (`task/leave-balance-warning`)

- [ ] 6.1 Одне попередження працівнику на підсумку заявки — на суму всієї заявки за залишком на момент подання
      (`balance.ts`, `/requests/new`); заявка все одно створюється; перевірка: тести AC-BALANCE-08, AC-BALANCE-15,
      AC-BALANCE-17

Done when: AC-BALANCE-08, AC-BALANCE-15, AC-BALANCE-17.

## Workflow follow-up

- Кожен PR задачі: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run ac:coverage`,
  `npm run spec:check`; рядки `docs/conformance.md` і галочки цього файлу — у тому самому PR.
- AC, які не встигнемо, — `відкладено (причина)` з посиланням на питання чи рішення PM.
- В останньому PR задачі зрізу: `npx openspec archive impl-leave-ws6 -y` і запис екрана 1–2 хв з прод-URL.
