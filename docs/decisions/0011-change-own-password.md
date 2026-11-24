# 0011. Зміна власного пароля: сторінка `/account`, поточний пароль обов'язковий, вихід з інших сесій

- Статус: прийнято — реалізує вимогу PM 07 (частково: AC-STAFF-16, -17). Почато 2026-11-23 як ініціатива розробника
  до вимог PM; 2026-11-24 PM описав фічу в `requirements/07-staff-management.md` (знімок — PR «Оновлення вимог»
  `sync/2026-11-24`), тексти взято звідти.
- Дата: 2026-11-23, оновлено 2026-11-24
- AC: AC-STAFF-16 (правильний поточний пароль і новий на 12 знаків → «Your password has been changed», далі входить
  лише новий пароль), AC-STAFF-17 (неправильний поточний → «The current password is incorrect», старий пароль і далі
  входить). Припущення PM: «A password has at least 8 characters; other password rules are the developer's choice.»
  AC ID у назвах тестів і рядки `docs/conformance.md` — після PR «Специфікація» на зріз 07: доки AC-STAFF-* немає в
  `openspec/specs/`, `ac:coverage` дав би ORPHAN.

## Контекст

Пароль кожному акаунту задає адміністратор (`npm run users:demo`, Admin API); змінити свій пароль користувач не міг.
Спершу людина вирішила реалізувати фічу з дорожньої карти до вимог PM (`requirements/product.md`: матриця прав «Change
own password — own only», статус «later»). Тепер є вимога PM 07: два AC вище й мінімум 8 знаків; решта — за розробником.
Обмеження: без міграцій і змін бази (лише Supabase Auth); листів Auth не надсилає — адреси `*@example.test` пошти не
отримують, а вбудований SMTP шле лише учасникам проєкту (`docs/decisions/README.md`, «Відкрите для WS10»).

## Рішення

Від PM: тексти «Your password has been changed» і «The current password is incorrect» (дослівно, без крапки, як в AC),
перевірка поточного пароля, мінімум 8 знаків. Усе інше нижче — **рішення розробника** в межах «other password rules are
the developer's choice».

1. **Окрема сторінка `/account`** у групі `(app)`, однакова для всіх ролей. У головне меню не додаємо: посилання — блок
   акаунта внизу бічної панелі (ініціали, ім'я, email; у згорнутій панелі — ініціали з підказкою, назва «Account: …»
   для зчитувача екрана й Tab) і той самий блок у мобільному меню поруч із Sign out. Ім'я, email і роль — лише для
   читання: їх змінює адміністратор (матриця прав).
2. **Форма «Change password»**: «Current password», «New password», «Confirm new password» на `PasswordInput`
   (`autocomplete` `current-password` / `new-password`). Перевірка — чиста функція `src/lib/account/password.ts`
   (форма до відправки і server action ще раз): новий пароль **≥ 8 знаків** (як `DEMO_USER_PASSWORD`; Auth сам вимагає
   ≥ 6) і ≤ 72 байти UTF-8 (межа bcrypt в Auth), новий ≠ поточного, підтвердження = новому.
3. **Поточний пароль обов'язковий** і перевіряється входом: server action бере користувача з `getClaims()`, входить
   його email і поточним паролем окремим тимчасовим клієнтом `@supabase/supabase-js` (публічний ключ,
   `persistSession: false`, `autoRefreshToken: false` — куки користувача він не чіпає), звіряє id з токеном і одразу
   закриває тимчасову сесію (`signOut({ scope: "local" })` відкликає лише її). Неправильний пароль — загальний текст
   «The current password is incorrect» (AC-STAFF-17) без подробиць Auth, як на `/login`.
4. **Новий пароль** — `updateUser({ password, current_password })` сесією користувача. `current_password` Auth
   перевіряє, лише якщо в проєкті ввімкнено «Require current password when changing password» (нижче); без цього
   налаштування поле ігнорується, а перевірку робить крок 3.
5. **Успіх** — `Alert` `info` «Your password has been changed» (AC-STAFF-16), форма очищується.
6. **Вихід з інших сесій**: `signOut({ scope: "others" })` — поточна сесія лишається, інші пристрої виходять.
7. Тексти відмов Auth: `weak_password` і `same_password` — під полем нового пароля; ліміт спроб (429,
   `over_*_rate_limit`) — «Too many attempts…»; `reauthentication_needed` — «sign out, sign in again…»; решта —
   загальний текст. Тексту Auth користувачеві не показуємо.

### Налаштування Auth (перевірено читанням коду `supabase/auth`, `internal/api/user.go`, і документації; Dashboard не змінювали)

- **«Require current password when changing password»** (`Security.UpdatePasswordRequireCurrentPassword`): Auth
  перевіряє `current_password` в `PUT /user`, лише коли налаштування ввімкнено, у користувача вже є пароль і сесія не
  відновлювальна; відмова — 400 `current_password_required` / `current_password_mismatch`. supabase-js підтримує поле
  з 2.102 (у нас 2.117). Ключа в `supabase/config.toml` CLI для нього не знайшли — тож у CI (локальний стек) і, доки
  ніхто не ввімкне його в Dashboard, у хмарі перевірку дає крок 3. Увімкнути в обох проєктах (staging і прод) — рішення
  людини; код готовий до обох станів.
- **«Secure password change»** (`secure_password_change` у `config.toml`, у нас `false`; у хмарі —
  `UpdatePasswordRequireReauthentication`): якщо ввімкнено, а сесії більше 24 год, Auth вимагає `nonce` з
  `reauthenticate()` — код приходить **листом**. Не вмикаємо: `*@example.test` листів не отримують. Якщо його ввімкнуть,
  форма покаже «sign out, sign in again and then change your password» (нова сесія молодша за 24 год).

## Розглянуті варіанти

- **Лише `current_password` в `updateUser`**, без власної перевірки входом — ні: без налаштування Dashboard Auth поле
  ігнорує, а ввімкнути його в CI (локальний стек) нічим; поведінка залежала б від ручного перемикача.
- **`reauthenticate()` з кодом поштою** — ні: синтетичні адреси листів не отримують, вбудований SMTP — 2 листи/год.
- **Перевірка пароля функцією Postgres** (`crypt()` проти `auth.users.encrypted_password`) — ні: потрібна міграція й
  `security definer` з доступом до схеми `auth`; вхід через Auth робить те саме без доступу до хешів.
- **Без виходу з інших сесій** — ні: зміна пароля після витоку має закрити чужу сесію.
- **Форма в діалозі з меню акаунта** замість сторінки — ні: окрема сторінка простіша для менеджера паролів, мобільного
  меню й e2e, і там є місце для інших налаштувань акаунта.

## Ризики

- **Демо-акаунти на staging і проді.** Якщо PM чи хтось на UAT змінить пароль `teacher1@`, `manager1@`, `admin@` …,
  вхід зі спільним `DEMO_USER_PASSWORD` зламається для UAT (`auth.setup.ts`) і для PM. Відновлення — `npm run users:demo`
  (`scripts/create-demo-users.mjs` знову ставить наявним акаунтам `DEMO_USER_PASSWORD` через
  `auth.admin.updateUserById`; staging — з `.env.local`, прод — явно
  `node --env-file=.env.prod.local scripts/create-demo-users.mjs`). e2e змінює
  пароль лише одноразовому користувачу `uat-…-acct-…@example.test` і видаляє його після тесту.
- Перевірка входом рахується в ліміт входів Auth (за IP) — часті спроби отримають «Too many attempts…».

## Наслідки

- Без міграцій: схема й RLS не змінились, `profiles` не чіпаємо.
- e2e перевіряє обидва AC на одноразовому акаунті, а не на `teacher1@example.test` з тексту AC: пароль teacher1
  тримають UAT та інші тести (ризик вище).
- Після PR «Специфікація» на зріз 07 — у PR реалізації: AC ID на початку назв двох e2e-тестів зміни пароля
  (`tests/e2e/account.spec.ts`) і рядки AC-STAFF-16, -17 у `docs/conformance.md`.
- Якщо PM змінить вимогу 07: інша довжина чи склад пароля — `MIN_PASSWORD_LENGTH` і `passwordFieldErrors`
  (+ `minimum_password_length` / `password_requirements` Auth у Dashboard і `config.toml`); тексти AC — дослівно в
  `PASSWORD_MESSAGES` і формі; без поточного пароля — прибрати крок 3 і поле; без виходу з інших сесій — прибрати
  крок 6; скидання пароля поштою — окрема фіча з SMTP.
