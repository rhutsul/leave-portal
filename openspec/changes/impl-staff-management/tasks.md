# Tasks

Три PR «Реалізація» від свіжого `main`, по черзі (D14): **PR 1** `task/staff-db` — задачі 1.1–1.5 (одна міграція `npx
supabase migration new staff_management`, лише база й тести бази); **PR 2** `task/staff-people` — задачі 2.1–2.5, коли
`/api/health` проду показує схему PR 1; **PR 3** `task/staff-positions` — задачі 3.1–3.4, після PR 2. Перед міграцією —
перевірити, що інша відкрита гілка не змінює схему (`substitutes`, `on-behalf`), і `node scripts/check-migration-order.mjs`;
перед кожним PR — `npm run gates`, `npm test`, `npm run check:design`, `npm run check:ui`, `npm run check:boundary`.
Задачі вертикальні в межах свого PR: база (чи сторінка), дія і тести своїх AC разом, тести спершу червоні. «Done when»
— AC, які задача доводить; рядки `docs/conformance.md` переходять у `реалізовано`, коли є і код, і тест з AC ID: у
PR 1 — з тестом PGlite, у PR 2/3 додаються e2e.

## PR 1 — база (`task/staff-db`)

- [ ] 1.1 Працівник і одноразове посилання в базі (D1, D2, D3, D11). Міграція: `private.one_time_links` (RLS,
      `revoke`), `profiles` — унікальний індекс `lower(email)`, `private.employee_status`, `create_employee`,
      `issue_one_time_link`, `staff_employees`, `use_one_time_link` (обгортки `public`, гранти: адміністраторські —
      `authenticated`, `use_one_time_link` — ще й `anon`; `grant usage on schema private to anon`),
      `pgcrypto` у `extensions`; нове тіло `on_profile_created_apply_test_assignments` (пропуск за
      `app.skip_test_assignments`). Тести: шим `tests/db/supabase-pglite.ts` (колонки `auth.users`, `auth.identities`,
      `auth.sessions`, `pgcrypto`); `tests/db/staff-employees.test.ts`; розширення `tests/db/schema-version.test.ts`
      (функції, доступні `anon`). ADR `docs/decisions/0013-staff-accounts-in-database.md` і рядок у
      `docs/decisions/README.md`.
      Done when (база): AC-STAFF-01, AC-STAFF-02, AC-STAFF-03

- [ ] 1.2 Ім'я, email, роль і деактивація в базі (D4, D5, D6, D12). Міграція: `update_employee`, тригер
      `guard_auth_email_change` на `auth.users`, `set_employee_role`, `deactivate_employee`, `reactivate_employee`,
      нове тіло `private.current_app_role()` (null для деактивованого); якщо зріз `substitutes` уже злито — фільтр
      `deactivated_at is null` у його функціях вибору заміни. Перевірити, що `tests/e2e/support/admin.ts` і
      `scripts/create-demo-users.mjs` не змінюють email через Auth. Тести PGlite: зміна email у трьох місцях з тим самим
      паролем; працівник не змінює ім'я й email (Data API і роль `supabase_auth_admin`); власна роль; деактивація —
      сесії, бан, записи в `decision_records` і `approved_register`.
      Done when (база): AC-STAFF-08, AC-STAFF-11, AC-STAFF-12, AC-STAFF-18

- [ ] 1.3 Посади й розклад «з дати» в базі (D7, D8). Міграція: `schedule_blocks.valid_from` / `valid_to` і check, нове
      `schedule_blocks_no_overlap` з `daterange`, `private.blocks_in_effect`, нові тіла `blocks_on_date`,
      `working_minutes`, `closed_day_name`, `approved_register`; `create_position`, `set_position_schedule`,
      `set_position_managers`. Тести `tests/db/staff-positions.test.ts`: посада з розкладом з дати й менеджером
      (видимість за RLS, `balance_employees`), друга основна, перетин (текст AC, межа `[)`, перетин версій), новий
      розклад не змінює погодженого запису, а новий запис бере новий; регресія `tests/db/*` (блоки без дат).
      Done when (база): AC-STAFF-04, AC-STAFF-05, AC-STAFF-06, AC-STAFF-07

- [ ] 1.4 Заступники в базі (D9). Міграція: `public.deputy_assignments` (RLS, `revoke`, `grant select`, політика
      адміністратора, обмеження), `private.acting_manager_ids`, нові тіла `manages_position`, `manages_employee`,
      `register_divisions`; `assign_deputy`, `remove_deputy`. Тести `tests/db/staff-deputies.test.ts`: у період —
      черга, рішення, подія з `actor_id` заступника, прохання про скасування, реєстр і залишки; manager1@ теж бачить;
      поза періодом (завтра й учора) — нічого; власний запис заступник не вирішує; менеджер не створює призначення ні
      таблицею, ні функцією; `acting_manager_ids` на датах AC.
      Done when (база): AC-STAFF-09, AC-STAFF-10, AC-STAFF-14

- [ ] 1.5 Мутанти, типи, рев'ю й staging (D14, D15). `scripts/mutants.mjs` — мутанти D15 (`npm run mutation:sql`,
      таблиця в описі PR); `database.types.ts` з Summary `db-check`; рев'ю бази (CodeRabbit або звіт другої думки
      коментарем до злиття); після злиття — `db-deploy-staging`, перевірка на staging (створити працівника, задати
      пароль за посиланням, увійти; деактивувати — вхід відмовлено), потім `db-deploy`; рядки `docs/conformance.md`.
      Done when: AC-STAFF-01…AC-STAFF-14 і AC-STAFF-18 зелені в PGlite і CI, мутанти вбито, staging перевірено

## PR 2 — працівники, вхід і доступ (`task/staff-people`)

- [ ] 2.1 Створення працівника й посилання (D2, D10, D13). `src/lib/staff/link.ts` (`linkValidUntil`, адреса з
      фрагментом), `src/lib/staff/employee.ts` (перевірка імені й email, тексти); `/staff`, `/staff/new` з картою
      посилання й «Copy link», `/staff/[id]` (картка «Sign-in», «Create a sign-in link»); `EmployeeStatus` у
      `src/components/ui` і приклад на `/design`; `/auth/set-password` (`checkLink`, `setPassword`, спільний
      `newPasswordError` з `password.ts`); `Alert` «Your password is set» на Overview; `loading.tsx`. Тести: unit
      `link.test.ts`, `employee.test.ts`; e2e `tests/e2e/staff.spec.ts` (створення, «Invited», «Valid until …»;
      пароль за посиланням, вхід, «Active»; прострочене); `.mobile.spec.ts` на 390 px.
      Done when: AC-STAFF-01, AC-STAFF-02, AC-STAFF-03

- [ ] 2.2 Доступ і меню (D10). `src/app/(app)/staff/admin-session.ts` (`requireAdmin`), сторінка відмови, пункти
      «Employees» і «Deputies» з прапорцем `admin` у `sidebar-nav.tsx` і мобільному меню, `navSection`. Тести: e2e
      manager1@ на `/staff/new` — текст AC, список без змін; гість на `/staff` — `/login` без email;
      `proxy.test.ts` — `guestRedirect("/staff")`.
      Done when: AC-STAFF-13, AC-STAFF-15

- [ ] 2.3 Деактивація (D6). «Deactivate» / «Reactivate» у `RowMenu` і картці «Sign-in» з `Dialog`; `login()` мапить
      `user_banned` → `?error=deactivated`, текст AC на `/login`; `(app)/layout.tsx` виводить деактивованого. Тести:
      unit мапінгу помилок входу; e2e — деактивований не входить і бачить текст AC, manager1@ бачить його запис у
      «History».
      Done when: AC-STAFF-08

- [ ] 2.4 Ім'я, email і роль (D4, D5, D10). Картки «Details» і «Role» на `/staff/[id]` (для себе — вимкнено з текстом
      AC); `/account` — поля лише для читання й текст AC-STAFF-12. Тести: e2e — адмін змінює ім'я й email, людина
      входить новим email і тим самим паролем; працівник бачить текст AC, `auth.updateUser({ email })` відмовлено,
      ім'я й email ті самі; адмін не змінює власну роль.
      Done when: AC-STAFF-11, AC-STAFF-12, AC-STAFF-18

- [ ] 2.5 Власний пароль — AC ID (ADR 0011). AC ID у назвах двох тестів `tests/e2e/account.spec.ts` («AC-STAFF-16: …»,
      «AC-STAFF-17: …»), коментарі «ще не в openspec/specs» у `password.test.ts` і `change-password-form.test.tsx`
      прибрати; рядки AC-STAFF-16, -17 у `docs/conformance.md` — `реалізовано`.
      Done when: AC-STAFF-16, AC-STAFF-17

## PR 3 — посади, розклади й заступники (`task/staff-positions`)

- [ ] 3.1 Розклад «з дати» в коді (D7). `src/lib/leave/schedule.ts` (`blocksOnDate`, `scheduleVersions`,
      `formatSchedule`) з unit-тестами; `load-positions.ts`, `load-overview.ts`, `load-record-day.ts` — `valid_from`,
      `valid_to` і фільтр за датою; календар нової заявки рахує години дати за її версією; «Your weekly schedule» —
      поточна й наступна версія; `HoursBar` / `RecordDay` обрізають смугу межами дня. Тести: unit; e2e — після нового
      розкладу старий погоджений запис показує свої години, новий цілий день — нові.
      Done when: AC-STAFF-07

- [ ] 3.2 Посади й менеджери (D8, D13). `/staff/[id]/positions/new`, `…/[positionId]/schedule`, `…/managers`: тип
      (`RadioGroup`), підрозділ (`Select`), назва, редактор розкладу, «Applies from» (`DatePickerField` `single`),
      менеджери (`Checkbox`-картки); картки посад на `/staff/[id]`. Тести: e2e `tests/e2e/staff-positions.spec.ts` —
      нова основна посада видна працівнику в «Your weekly schedule» і менеджеру на `/balances`; друга основна й
      перетин — тексти AC; `.mobile.spec.ts` редактора на 360 / 390 px.
      Done when: AC-STAFF-04, AC-STAFF-05, AC-STAFF-06

- [ ] 3.3 Заступники (D9, D13). `/staff/deputies`: список, «No deputies assigned», форма «Assign a deputy» з
      `DatePickerField` `range`, «Remove» з `Dialog`. Тести: e2e `tests/e2e/staff-deputies.spec.ts` — порожній список;
      призначення з періодом із сьогодні → manager2@ бачить і погоджує запис manager1@, manager1@ теж бачить; період
      із завтра — manager2@ не бачить; `negative-controls.spec.ts` — менеджер REST-ом не створює призначення.
      Done when: AC-STAFF-09, AC-STAFF-10, AC-STAFF-14, AC-STAFF-19

- [ ] 3.4 Завершення зрізу (D13, D14). Знімки світлої й темної теми 390 і 1280 px у `docs/img/` (D13), перевірка
      вигляду проти `DESIGN.md`; `/conformance` — усі рядки AC-STAFF `реалізовано`; `npx openspec archive
      impl-staff-management -y`.
      Done when: AC-STAFF-01…AC-STAFF-19 — `реалізовано` в `docs/conformance.md`
