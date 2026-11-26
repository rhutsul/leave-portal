# Дизайн: керування працівниками, посадами, розкладами, менеджерами й заступниками

Вимога PM — `requirements/07-staff-management.md`; специфікація — `openspec/specs/staff-management/spec.md` і змінені
вимоги `openspec/specs/leave-decision/spec.md` (AC-DECIDE-01, -08, -09, -14: заступник у дні призначення). Тексти AC у
лапках — дослівно з PM; усе, чого PM не каже, позначено **(розробник)**.

## Контекст

На чому будуємо (стан `main` після #129):

- **Профілі й ролі** — `public.profiles` (`id`, `email`, `full_name`, `role` з `profiles_role_check` = employee /
  manager / admin), профіль створює тригер `on_auth_user_created` → `private.handle_new_user()`; `authenticated` не має
  `update` на `profiles` (міграція `20261026181152_profiles_name_admin_only.sql`), тож ім'я й email уже змінює лише
  `service_role`. Роль — `private.current_app_role()`.
- **Користувачі Auth** зараз створює лише `scripts/create-demo-users.mjs` (Admin API, секретний ключ у `.env.local`).
  `AGENTS.md`, «Секрети»: у Vercel лише `NEXT_PUBLIC_SUPABASE_URL` і `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY` — **ніколи**. Тож застосунок не може кликати Admin API Auth (D1).
- **Вхід** — `src/app/login/actions.ts` (`signInWithPassword`, помилки `?error=missing|invalid`), сесію оновлює
  `src/proxy.ts` → `src/lib/supabase/proxy.ts` (`getClaims()`; публічні шляхи `/login`, `/auth`, `/api/health`,
  `/status` і точно `/welcome`), оболонка `src/app/(app)/layout.tsx` читає профіль і будує меню
  (`src/components/sidebar-nav.tsx`, прапорець `deciders`).
- **Власний пароль** — `/account` (ADR 0011, `src/lib/account/password.ts`, `src/app/(app)/account/**`,
  `tests/e2e/account.spec.ts`): тексти AC-STAFF-16, -17 уже дослівні, AC ID у назвах тестів ще немає.
- **Посади й розклад** — `public.positions` (`kind` main / additional, унікальний індекс
  `positions_one_main_per_employee`), `public.schedule_blocks` (`weekday`, `start_min`, `end_min`, **без дат**;
  обмеження `schedule_blocks_no_overlap` на `employee_id, weekday, int4range`), `public.position_managers`. Розклад на
  дату читають: SQL — `private.blocks_on_date` (на ньому `check_record_hours`, а отже подання й зміна годин),
  `private.working_minutes` (частка дня, залишки, рішення), `private.closed_day_name`, `private.approved_register`;
  TS — `requests/new/load-positions.ts` («Your weekly schedule» і календар форми), `(overview)/load-overview.ts`,
  `decisions/load-record-day.ts`.
- **Права менеджера** — `private.manages_position(position_id)` і `private.manages_employee(employee_id)`
  (`pm.manager_id = auth.uid()`); на них стоять RLS `positions`, `schedule_blocks`, `leave_records`,
  `balance_carryovers`, `private.can_see_record` (історія), `private.can_decide_record` і `private.decision_records`
  (черга й рішення), `private.check_cancellation_actor` (зріз 09), `private.approved_register` (реєстр, ADR 0012),
  `private.can_view_balances` і `private.balance_employees` (залишки), а за планом `impl-on-behalf` — ще
  `private.decides_for_position` і `private.can_act_for_employee`. Окремо, повз хелпер: `private.register_divisions`
  (`pm.manager_id = auth.uid()`) і політика `position_managers_select_own_or_admin`.
- **Тестові дані** — `private.test_positions` / `test_schedule_blocks` / `test_position_managers` і тригер
  `on_profile_created_apply_test_assignments`: призначає посади кожному новому профілю з таким email. План
  `impl-substitutes` (D9) додає туди `teacher3@example.test` — того самого, якого AC-STAFF-01 створює «з нуля».
- **Дата «сьогодні»** — `private.kyiv_day(timestamptz)` у SQL, `kyivDate(now)` у `src/lib/leave/time.ts`.

## Рішення

**D1 — облікові записи Auth створює й змінює база, а не Admin API (AC-STAFF-01, AC-STAFF-02, AC-STAFF-08,
AC-STAFF-11).** Секретного ключа в застосунку немає й не буде (`AGENTS.md`), тому всі зміни облікових записів — функції
`security definer` у схемі `private` (власник — `postgres`, як у міграціях), що пишуть у `auth.users` і
`auth.identities` в одній транзакції з `public.profiles`:

- створення: рядок `auth.users` (`instance_id` нулі, `aud`/`role` = `authenticated`, email у нижньому регістрі,
  `encrypted_password` = `''`, `email_confirmed_at = now()`, `raw_app_meta_data = {"provider":"email","providers":["email"]}`,
  `raw_user_meta_data = {"full_name": …}`, порожні рядки — не `null` — у текстових колонках токенів, які читає GoTrue)
  і рядок `auth.identities` (`provider = 'email'`, `provider_id = id`, `identity_data = {sub, email, email_verified}`);
  профіль, як і досі, вставляє `on_auth_user_created`;
- пароль за посиланням: `encrypted_password = extensions.crypt(p, extensions.gen_salt('bf', 10))` — той самий bcrypt
  `$2a$`, який перевіряє GoTrue, тож далі людина входить звичайним `signInWithPassword`;
- зміна email: `auth.users.email`, `auth.identities.identity_data.email` і `profiles.email` разом; `encrypted_password`
  не чіпаємо — «the same password» (AC-STAFF-11);
- деактивація: `profiles.deactivated_at = now()`, `auth.users.banned_until = now() + interval '100 years'` (не
  `infinity`: Go-сканер GoTrue його не читає), видалення рядків `auth.sessions` людини (каскадом — її refresh-токени);
- реактивація — зворотна дія в одній транзакції: `profiles.deactivated_at = null` і `auth.users.banned_until = null`;
  пароль не змінюється, тож людина знову входить тим самим паролем (тест PGlite і e2e: деактивація → вхід відмовлено →
  реактивація → вхід тим самим паролем).

Ризик і перевірка: права `postgres` на DML в `auth.*` і поведінку GoTrue з такими рядками доводить job `e2e` (справжній
Supabase у раннері, вхід паролем після створення за посиланням) ще до злиття, а потім `db-deploy-staging` і UAT на
staging — до `db-deploy` у прод. Відкинуті варіанти: Admin API на сервері Vercel (секретний ключ у Vercel — заборона
`AGENTS.md`); Edge Function із секретом Supabase (новий рантайм і деплой поза CI курсу); листи-запрошення Supabase (PM:
листів немає). Рішення фіксує новий **ADR 0013** «Облікові записи працівників — функціями бази» (у PR 1; «спитай
спершу» — це питання в описі PR плану).

**D2 — одноразове посилання: власна таблиця з хешем, один виклик для гостя (AC-STAFF-01, AC-STAFF-02, AC-STAFF-03).**

- Таблиця `private.one_time_links` (схема `private` не відкрита Data API; `enable row level security` і `revoke all …
  from public, anon, authenticated` все одно): `id bigint identity`, `employee_id uuid not null references
  public.profiles (id) on delete cascade`, `token_hash bytea not null unique` (SHA-256), `valid_until date not null`,
  `created_by uuid references public.profiles (id)`, `created_at`, `used_at`, `revoked_at`.
- Токен — 32 випадкові байти (`extensions.gen_random_bytes`) у base64url, 43 знаки; у базі лише хеш. Відкритий токен
  повертає один раз функція видачі, і він живе лише у відповіді server action на екрані адміністратора: ні в URL
  сторінок адміністратора, ні в базі, ні в журналах.
- `valid_until = private.kyiv_day(now()) + 7`: створено 2026-12-01 → дійсне до 2026-12-08 включно (Assumptions PM,
  AC-STAFF-01). Те саме правило в TS — `linkValidUntil(day)` у `src/lib/staff/link.ts` (для тексту на екрані й тестів).
- Видача нового посилання спершу бере `pg_advisory_xact_lock` на працівника (той самий ключ, що в
  `set_position_schedule`), а потім у тій самій транзакції ставить `revoked_at` усім невикористаним посиланням людини й
  вставляє нове — дві одночасні видачі не лишать двох дійсних посилань: «A new link makes the previous one invalid».
- Адреса — `<origin>/auth/set-password#token=<токен>`: токен у фрагменті, тож браузер не шле його на сервер у запиті
  сторінки, у `Referer` і журнали запитів Vercel. `/auth/**` уже публічний у `src/proxy.ts`. Адресу складає клієнтський
  компонент адміністратора з `window.location.origin` (preview і прод — кожен свою).
- Гість має лише одну функцію: `private.use_one_time_link(p_token text, p_password text default null) returns table
  (state text, email text)`, обгортка `public.use_one_time_link` (`security invoker`); `grant execute` — `anon` і
  `authenticated`, `grant usage on schema private to anon`. Без пароля функція лише каже стан; з паролем — під `for
  update` рядка посилання перевіряє стан, довжину пароля (≥ 8 знаків, ≤ 72 байти — як `src/lib/account/password.ts`),
  ставить пароль (D1), `used_at = now()`, видаляє сесії людини й повертає email. Стан: `valid` (лише тоді й email),
  `expired` (`kyiv_day(now()) > valid_until`), `invalid` (немає такого хешу, використане, замінене новим, людину
  деактивовано). Порядок: немає хешу → `invalid`; використане чи замінене → `invalid`; деактивований → `invalid`;
  прострочене → `expired`.
- Це другий після `public.schema_version()` виняток із правила «security definer закритий від anon»: виконати його
  `anon` може лише через обгортку з токеном на 256 біт, тож перебір не має сенсу, а без токена функція не відкриває
  нічого. Тест `tests/db/schema-version.test.ts` розширюємо: множина функцій, які `anon` може виконати й які є
  `security definer` або кличуть такі, — рівно `public.schema_version()`, обгортка `public.use_one_time_link` і
  `private.use_one_time_link` (ADR 0013).
- Сторінка `/auth/set-password` (клієнтський компонент) читає `location.hash`, одразу прибирає фрагмент з історії
  (`history.replaceState`) і кличе server action `checkLink(token)`; форма «Set your password» — `PasswordInput`
  «New password» і «Repeat the new password», правила й тексти — спільні з `/account` (винести `newPasswordError` у
  експорт `password.ts`). `setPassword` → `use_one_time_link(token, password)` → `signInWithPassword(email,
  password)` клієнтом SSR (cookie сесії) → `redirect("/?notice=password-set")`; Overview показує `Alert` `info`
  «Your password is set» (AC-STAFF-02). Стан `expired` — `Alert` `destructive` «This link has expired. Ask the
  administrator for a new one» без форми (AC-STAFF-03); `invalid` — «This link is no longer valid. Ask the
  administrator for a new one» **(розробник)**; без JavaScript — `noscript` з тим самим проханням.
- Пароль іде в RPC параметром (зв'язаний параметр PostgREST, не текст SQL); правила Auth «leaked password protection»
  до нього не застосовуються — лише наші ≥ 8 і ≤ 72 байти **(розробник; припущення PM дозволяє)**.

**D3 — статуси «Invited», «Active», «Deactivated» без окремої колонки статусу (AC-STAFF-01, AC-STAFF-02,
AC-STAFF-08).** `private.employee_status(p_employee_id)`: `profiles.deactivated_at is not null` → `deactivated`; інакше
`coalesce(auth.users.encrypted_password, '') = ''` → `invited`; інакше `active`. Наявні користувачі `users:demo` мають
пароль — `active` без перенесення даних. Нове посилання для вже активної людини (замість «forgot password», Out of
scope PM) статусу не змінює. Слова в інтерфейсі — «Invited», «Active» (AC) і «Deactivated» **(розробник, з глосарію
«Deactivated employee»)**.

**D4 — функції адміністратора: перевірка ролі першим кроком, тексти PM (AC-STAFF-01, AC-STAFF-11, AC-STAFF-13,
AC-STAFF-14, AC-STAFF-18).** Кожна — `private.<назва>` (`security definer`, `set search_path = ''`, `revoke execute …
from public, anon`, `grant execute … to authenticated`) і `public.<назва>` (`security invoker`, лише передає
параметри), як `decide_leave_record`. Перший крок кожної: `private.current_app_role() = 'admin'`, інакше `42501`
«Only an administrator can manage employees» (AC-STAFF-13, AC-STAFF-14 — той самий текст і в обхід сторінок).

| Функція | Що робить | Відмови (код, текст) |
|---|---|---|
| `staff_employees()` → `id, full_name, email, role, status, main_position, deactivated_at` | список для `/staff` | не адмін — 42501 |
| `create_employee(p_full_name, p_email, p_role)` → `employee_id, token, valid_until` | D1 + D2 в одній транзакції; `set_config('app.skip_test_assignments', 'on', true)` (D11) | ім'я порожнє чи > 200 знаків — P0001 «Enter a name of up to 200 characters» **(розробник)**; email не за формою — P0001 «Enter a valid email» **(розробник)**; email уже є (`lower(email)` серед УСІХ профілів і `auth.users`, Assumptions PM) — P0001 «An employee with this email already exists» **(розробник)**; невідома роль — 22023 |
| `issue_one_time_link(p_employee_id)` → `token, valid_until` | D2; для деактивованого — відмова | немає профілю — 42501 (той самий текст, що й чужий доступ); деактивований — P0001 «Reactivate this employee first» **(розробник)** |
| `update_employee(p_employee_id, p_full_name, p_email)` | D1, зміна email у трьох місцях; записи не змінюються — вони показують поточне ім'я й email із `profiles` (Assumptions PM) | ті самі тексти, що в створенні |
| `set_employee_role(p_employee_id, p_role)` | лише employee / manager / admin | `p_employee_id = auth.uid()` — P0001 «You cannot change your own role» (AC-STAFF-18); зняти `manager` з того, хто відповідає за посади чи є заступником у поточному або майбутньому призначенні, — P0001 «Remove this person from the managers of positions and deputies first» **(розробник)** |
| `deactivate_employee(p_employee_id)` / `reactivate_employee(p_employee_id)` | D1; невикористані посилання — `revoked_at`; записи, залишки й посади не змінюються (Assumptions PM: «Awaiting decision» і «Returned for revision» лишаються менеджеру) | себе — P0001 «You cannot deactivate yourself» **(розробник)** |
| `set_employee_role`, `deactivate_employee` — спільне | серіалізація змін адміністраторів (нижче) | — (перевірка «At least one active administrator must remain» лишається в коді лише про всяк випадок: з правилами нижче вона недосяжна) |

Набір ролей не змінюється, тож порядок `profiles_role_check` → дані → `default` → новий check (`AGENTS.md`) тут не
потрібен; `set_employee_role` лише оновлює значення в межах чинного check. «Єдиний адміністратор» (AC-STAFF-18) завжди
лишається, і навіть за одночасних дій: собі роль не змінити й себе не деактивувати, а `set_employee_role` і
`deactivate_employee` (1) беруть один спільний `pg_advisory_xact_lock` адміністраторів (`private.lock_admins()`),
(2) після блокування ще раз перевіряють, що той, хто кличе, — активний адміністратор, (3) лише тоді оновлюють. Тож два
адміністратори, що одночасно знімають роль чи деактивують один одного, не залишать порталу без адміністратора — другий
після lock уже не адміністратор. Справжній захист — lock і повторна перевірка. Кожна дія над людиною бере ще й lock
цієї людини (`private.lock_employee`, для кількох — `private.lock_people` за зростанням uuid): зміна ролі не
розминеться з призначенням менеджером посади чи заступником, видача й використання посилання — з деактивацією.

**D5 — ім'я й email не змінити в обхід (AC-STAFF-12).** Три шляхи, три замки: (1) Data API — `authenticated` і далі
без `update` на `profiles` (не змінюємо); (2) Auth — `supabase.auth.updateUser({ email })` публічним ключем: новий
тригер `before update of email, email_change on auth.users` → `private.guard_auth_email_change()` відкидає зміну
`email` чи непорожній `email_change`, коли `current_user = 'supabase_auth_admin'` (так працює GoTrue), з 42501 «Only an
administrator can change names and emails»; наші функції працюють як `postgres` і проходять. Побічно тригер закриває й
зміну email через Admin API — зміна email лише функцією `update_employee` (D4); (3) сторінка `/account` — ім'я й email
у полях лише для читання (`Input readOnly`), під ними текст «Only an administrator can change names and emails» з
`aria-describedby`, замість нинішнього опису картки. Тест AC-STAFF-12 перевіряє всі три шляхи.

**D6 — деактивований не входить (AC-STAFF-08).**

- Вхід: GoTrue відмовляє забаненому з `code = 'user_banned'`; `login()` мапить його на `?error=deactivated`, а
  `ERRORS.deactivated` на `/login` — «Your account is deactivated. Contact the administrator» (`Alert` `destructive`).
- Уже відкриті сесії: рядки `auth.sessions` видалено (D1), тож оновити токен не вийде; поки чинний access-токен (≤ 1
  год), доступ закриває база, а не інтерфейс: `private.current_app_role()` для деактивованого повертає порожній рядок `''`, а не `null`: перевірки виду `not (v_role = 'admin' or …)` з `null` пропустили б IF (права
  ролі менеджера й адміністратора), а `private.acting_manager_ids` (D9) додає `auth.uid()` у набір лише тоді, коли
  профіль не деактивований, — тож `manages_position` і `manages_employee` дають `false`, і RLS записів, черга,
  рішення, реєстр і залишки закриті одразу. Власні дії працівника (подання, зміна годин, повторне подання,
  скасування, прохання про скасування) закриває `private.require_active()` у публічних обгортках цих RPC (42501 «Your
  account is deactivated. Contact the administrator»). Читання власних даних за RLS лишається до кінця строку токена
  (≤ 1 год) — свідомо. Оболонка `(app)/layout.tsx` додатково робить `signOut()` і веде на `/login?error=deactivated`.
  Тест AC-STAFF-08: деактивований manager1@ із чинною сесією (PGlite — той самий `sub`) не бачить записів своїх посад і
  не може погодити; деактивований працівник не подає й не змінює своїх записів.
- Ризик **(розробник)**: якщо GoTrue перевіряє бан до пароля, текст AC видно й з неправильним паролем — тобто видно,
  що email колись належав працівнику. Приймаємо: PM вимагає саме цей текст, а альтернатива (власна перевірка пароля в
  базі для гостя) відкрила б перебір паролів повз обмеження Auth.
- Історія: записи, події, залишки й реєстр не змінюються, `decision_records` і `approved_register` показують
  деактивованих, як і досі (без фільтра за `deactivated_at`). Тест — «History» manager1@ після деактивації.

**D7 — розклад «з дати»: дати дії на блоках (AC-STAFF-04, AC-STAFF-06, AC-STAFF-07).**

- `schedule_blocks` отримує `valid_from date` (null — «від початку», так прочитаються всі наявні блоки) і `valid_to
  date` (не включно; null — без кінця), `check (valid_from is null or valid_to is null or valid_from < valid_to)`.
  Версія розкладу посади — блоки з однаковим `valid_from`.
- Обмеження перетину замінюємо: `drop constraint schedule_blocks_no_overlap` → нове з тим самим ім'ям `exclude using
  gist (employee_id with =, weekday with =, int4range(start_min, end_min) with &&, daterange(valid_from, valid_to,
  '[)') with &&)` — «never overlap at any date» (Assumptions PM, AC-STAFF-06) тримає база навіть за одночасних змін.
  Нове обмеження суворе для тієї самої дати й слабше лише там, де версії не діють одночасно.
- Новий хелпер `private.blocks_in_effect(p_employee_id uuid, p_date date) returns setof public.schedule_blocks`
  (`stable`, внутрішній): блоки працівника на день тижня дати, для яких `valid_from <= p_date < valid_to` (null —
  відкрита межа). Нові тіла без зміни сигнатур: `blocks_on_date`, `working_minutes`, `closed_day_name`,
  `approved_register` (межі робочого дня) читають блоки лише через нього. `check_record_hours`, подання, зміна годин,
  рішення й залишки отримують розклад дати через ці функції без змін.
- Записи зберігають свої `start_min`, `end_min`, `minutes` — новий розклад їх не змінює (AC-STAFF-07: запис
  2026-12-08 лишається 08:30–15:30, хоча з 2026-12-07 діє 08:30–12:30). Наявні частки дня тримає обмеження частки
  (`20261115122625_day_share_cap_and_closure_kind.sql`); `HoursBar` / `RecordDay` такого запису обрізають смугу межами
  дня й показують години текстом із запису.
- `set_position_schedule(p_position_id, p_valid_from date, p_blocks jsonb)` (D4-перевірка адміністратора): під
  `pg_advisory_xact_lock` на працівника (як рішення) — (1) перевірка блоків: кроки 5 хв, `start < end`, у межах доби,
  без перетину між собою, хоча б один блок — P0001 «Add at least one working period» **(розробник)**; (2) межа версії:
  наступна версія цієї посади після `p_valid_from` — `v_next` (або null); блоки з `valid_from = p_valid_from`
  видаляємо (заміна версії того самого дня), блокам, що діють на `p_valid_from`, ставимо `valid_to = p_valid_from`;
  нові блоки — `[p_valid_from, v_next)`; (3) перед вставкою шукаємо перший блок ІНШОЇ посади працівника, що перетинає
  новий на ту саму дату дії й день тижня, і даємо P0001 «This schedule overlaps the position <Division> / <Title>:
  <Day> <HH:MM>–<HH:MM>» — день і години конфліктного блоку іншої посади, як у AC-STAFF-06 («Elementary school /
  Teacher: Mon 08:30–15:30»); кілька — перший за `weekday, start_min` **(розробник)**; `exclusion_violation` (гонка)
  мапимо на той самий текст. Дата дії може бути будь-якою, зокрема минулою: записи однаково не змінюються
  **(розробник)**.
- TS: `src/lib/leave/schedule.ts` — `blocksOnDate(blocks, date)` з тим самим правилом, `scheduleVersions(blocks)` і
  `formatSchedule(blocks)` («Mon–Fri 08:30–15:30»); читачі `load-positions.ts`, `load-overview.ts`,
  `load-record-day.ts` додають `valid_from, valid_to` у select і фільтрують через `blocksOnDate` (календар нової заявки
  рахує години кожної дати за її версією). «Your weekly schedule» показує версію, що діє сьогодні, і наступну —
  «From Mon, 7 Dec 2026: Mon–Fri 08:30–12:30» (AC-STAFF-04: розклад «from 2026-12-07» видно й до цієї дати).

**D8 — посада й менеджери (AC-STAFF-04, AC-STAFF-05, AC-STAFF-06).** `create_position(p_employee_id, p_kind,
p_division_id, p_title, p_valid_from, p_blocks jsonb, p_manager_ids uuid[]) returns bigint` в одній транзакції:
перевірка адміністратора → працівник існує й не деактивований (P0001 «Reactivate this employee first») → `p_kind =
'main'` і основна вже є — P0001 «An employee has exactly one main position» (AC-STAFF-05; `unique_violation` індексу
`positions_one_main_per_employee` у гонці — той самий текст) → назва порожня чи > 120 знаків, та сама посада в тому
самому підрозділі (`positions_employee_division_title_key`) — P0001 «This employee already has this position»
**(розробник)** → менеджери: активні, роль `manager` чи `admin` (інакше 22023) → посада, блоки (D7, разом із текстом
перетину AC-STAFF-06), `position_managers`. Менеджерів може бути нуль — тоді записи вирішує адміністратор, як і зараз
(AC-DECIDE-19) **(розробник)**. `set_position_managers(p_position_id, p_manager_ids uuid[])` замінює набір. Підрозділи —
лише наявні (`public.divisions`); керування підрозділами, перейменування й видалення посад — поза зрізом (AC немає;
видалення посади каскадом стерло б записи) **(розробник)**. Після AC-STAFF-04 працівник бачить посаду й розклад у
«Your weekly schedule» (`/requests/new`), а manager1@ — працівника серед «employees of their positions» у виборі
працівника на `/balances` (`balance_employees` через `manages_employee`).

**D9 — заступник: одне місце в базі для всіх шляхів (AC-STAFF-09, AC-STAFF-10, AC-STAFF-14, AC-STAFF-19; AC-DECIDE-01,
-08, -09, -14).**

- Таблиця `public.deputy_assignments`: `id bigint identity`, `manager_id uuid not null references public.profiles
  (id)` (відсутній), `deputy_id uuid not null references public.profiles (id)`, `start_date date not null`, `end_date
  date not null`, `created_by uuid references public.profiles (id)`, `created_at`; `check (end_date >= start_date)`,
  `check (deputy_id <> manager_id)`; `exclude using gist (manager_id with =, deputy_id with =, daterange(start_date,
  end_date, '[]') with &&)`; індекс `(deputy_id, start_date, end_date)`. RLS: `enable row level security`; `revoke all
  … from anon, authenticated`; `grant select … to authenticated`; політика `deputy_assignments_select_admin` `for select
  to authenticated using ((select private.current_app_role()) = 'admin')`; `grant select, insert, update, delete … to
  service_role`. Ні `insert`, ні `update`, ні `delete` для `authenticated` — лише функції адміністратора (AC-STAFF-14).
- `private.acting_manager_ids(p_day date) returns setof uuid` (`security definer`, `stable`): сам `auth.uid()`, якщо
  його профіль не деактивований (D6), і
  `manager_id` призначень, де `deputy_id = auth.uid()`, `p_day between start_date and end_date` (обидві дати включно,
  Assumptions PM), заступник має роль `manager` і не деактивований. Без ланцюжків (заступник заступника — ні)
  **(розробник)**.
- Нові тіла без зміни сигнатур: `private.manages_position(p)` — `exists (… position_managers pm where pm.position_id =
  p and pm.manager_id in (select private.acting_manager_ids(private.kyiv_day(now()))))`; так само
  `private.manages_employee(e)`; `private.register_divisions()` переходить на `private.manages_position(p.id)`. Отже
  заступник у дні періоду має ті самі права, що відсутній менеджер, у КОЖНОМУ шляху: RLS `positions`,
  `schedule_blocks`, `leave_records`, історія (`can_see_record`), черга й лічильник «Awaiting decision»
  (`decision_records`, AC-STAFF-09, AC-DECIDE-01), рішення (`can_decide_record` → `decide_leave_record`, AC-DECIDE-08),
  прохання про скасування (`check_cancellation_actor`, зріз 09), реєстр (`approved_register`, `register_divisions`),
  залишки (`can_view_balances`, `balance_employees`), заявка від імені й «погоджено одразу» (`can_act_for_employee`,
  `decides_for_position` плану `impl-on-behalf`). Наявні умови «не власний запис» (`r.employee_id <> auth.uid()`) і
  ролі `manager` лишаються — «never deciding their own records». Коментар «Заступників ще немає: їхні права додадуться
  тут» біля `check_cancellation_actor` лишається в застосованій міграції (її не редагуємо); заголовок нової міграції
  пояснює, що заступник приходить через `manages_position`, а тіло `check_cancellation_actor` не змінюється.
- Рішення заступника — звичайні події `leave_record_events` з `actor_id` заступника: після кінця періоду лишаються, а
  «History» показує його ім'я («Approved by Manager Two») — «the history shows that the deputy decided».
- Поза періодом (AC-STAFF-10) `acting_manager_ids` не дає `manager_id`, тож заступник не бачить ні запису, ні черги.
  Увага до тестових даних: у демоданих manager2@ веде додаткову посаду teacher1@ «High school / Math teacher», тож
  тести AC-STAFF-09/-10 у підготовці приводять дані до «Given» («a position whose only manager is manager1»): прибирають
  manager2@ з посад teacher1@ (так само робить D9 плану `impl-substitutes`).
- Функції: `assign_deputy(p_manager_id, p_deputy_id, p_start date, p_end date) returns bigint` — відсутній має бути
  відповідальним менеджером хоча б однієї посади (P0001 «Choose a manager of at least one position»), заступник —
  активний з роллю `manager` (P0001 «A deputy must be a manager»), не той самий (P0001 «A manager can't be their own
  deputy»), `p_end >= p_start` (P0001 «The end date must be on or after the start date»), перетин того самого пари —
  P0001 «This deputy is already assigned to this manager for these dates» (усі **(розробник)**);
  `remove_deputy(p_assignment_id)` — видаляє призначення; ухвалені рішення лишаються **(розробник)**. Список —
  `select` таблиці з іменами через `profiles` (адміністратору RLS їх відкриває); порожній — «No deputies assigned»
  (AC-STAFF-19).

**D10 — сторінки й доступ (AC-STAFF-01, -04, -11, -13, -15, -18, -19).**

- `/staff` — «Employees»: `PageHeader` з основною дією «Add employee»; таблиця: ім'я й email, роль, основна посада,
  статус (D3), «⋯» (`RowMenu`: «Open», «Create a sign-in link», після розділювача `destructive` «Deactivate» чи
  «Reactivate»). Деактивовані — унизу списку.
- `/staff/new` — форма «Name», «Email», «Role» (`Select`, за замовчуванням Employee); після збереження — на тій самій
  сторінці `Alert` `info` «Employee created» і картка «One-time sign-in link»: `Input readOnly` з адресою, `Button`
  `secondary` «Copy link» (стан «Link copied» у `role="status"`), рядок «Valid until Tue, 8 Dec 2026» (AC-STAFF-01) і
  посилання «Open employee». Токен живе лише в стані `useActionState`: оновлення сторінки його прибирає, новий —
  «Create a sign-in link».
- `/staff/[id]` — картки «Details» (ім'я й email, «Save changes», AC-STAFF-11), «Role» (`Select`; для себе —
  `disabled` і поруч «You cannot change your own role», а та сама відповідь бази — `Alert` `destructive`, AC-STAFF-18),
  «Sign-in» (статус, «Create a sign-in link», «Deactivate» через `Dialog` чи «Reactivate»), «Positions» (картка на
  посаду: «Elementary school / Teacher», Main / Additional, менеджери, розклад зараз і наступна версія; «⋯» — «Change
  schedule», «Change managers»; «Add position»).
- `/staff/[id]/positions/new`, `/staff/[id]/positions/[positionId]/schedule`, `…/managers` — форми D7/D8 окремими
  сторінками (працюють і на телефоні, без вкладених `Sheet`).
- `/staff/deputies` — «Deputies»: список (відсутній менеджер, заступник, період «Mon, 7 Dec 2026 – Fri, 11 Dec 2026»,
  стан словом «Current» / «Upcoming» / «Ended» за сьогодні **(розробник)**, «⋯» → «Remove» через `Dialog`); порожній —
  `EmptyState` «No deputies assigned» (AC-STAFF-19); форма «Assign a deputy»: два `Select` і `DatePickerField`
  `range`.
- Доступ: кожна сторінка `/staff/**` першою кличе `requireAdmin()` (`src/app/(app)/staff/admin-session.ts`, як
  `calendar/admin-session.ts`): `getClaims()` → роль із `profiles`; не адміністратор — сторінка відмови з текстом «Only
  an administrator can manage employees» і посиланням на Overview, без даних (AC-STAFF-13). Server actions
  перевіряють те саме, а база — ще раз (D4). Гостя `src/proxy.ts` уже веде на `/login` — `/staff` не в публічних
  шляхах (AC-STAFF-15; тест без змін коду проксі).
- Меню: у `LINKS` прапорець `admin: true` — «Employees» (`/staff`, іконка `Users`) і «Deputies» (`/staff/deputies`,
  `UserRoundCheck`); `layout.tsx` передає `isAdmin`; `navSection` підсвічує «Employees» на `/staff/**`, крім
  `/staff/deputies`.
- Тексти помилок полів — під полем (`FieldError`, `aria-describedby`); помилка дії — `Alert` `destructive` над формою,
  введене лишається.

**D11 — тестові дані не чіпляються до нових працівників (AC-STAFF-01, AC-STAFF-04, AC-STAFF-05).** Тригер
`on_profile_created_apply_test_assignments` призначає посади з `private.test_*` кожному профілю з тестовим email — тож
створений адміністратором teacher3@ одразу мав би основну посаду (план `impl-substitutes`, D9), і AC-STAFF-04 («without
positions») та AC-STAFF-05 зламались би. Нове тіло `private.on_profile_created_apply_test_assignments()`: нічого не
робить, коли `current_setting('app.skip_test_assignments', true) = 'on'` — це ставить лише `create_employee` (`set_config
… true`, до кінця транзакції). `users:demo` працює як і раніше. `authenticated` не може змінити GUC через Data API.

**D12 — сусідні зрізи (AC-STAFF-08, AC-STAFF-09).** `check_cancellation_actor` (злито) і `decides_for_position`,
`can_act_for_employee` (`impl-on-behalf`) отримують заступника через D9 без змін тіл — порядок злиття неважливий.
Зріз `substitutes`: «A deactivated employee is not offered as a substitute» (Assumptions PM 07) — якщо його міграцію
злито до PR 1 цього зрізу, PR 1 додає `and pr.deactivated_at is null` у `my_substitute_options`, `substitute_candidates`
і перевірку заміни в `submit_leave_request` (нові тіла без зміни сигнатур, тест PGlite); якщо ні — рядок переходить у
його план, а `deactivated_at` уже буде в базі. Реєстр (ADR 0012) і `decision_records` деактивованих не відкидають (D6).

**D13 — вигляд кожного стану (DESIGN.md, AC-STAFF-01…19).** Лише `@/components/ui`, семантичні токени, іконки
`lucide-react`; без сирих `<button>`, `<input>`, `<select>`, `<table>` (`check:ui`) і без нових токенів.

| Стан | Компонент і варіант | Телефон 360 / 390 px | Темна тема |
|---|---|---|---|
| список працівників | `Table` (ім'я + email другим рядком, роль, посада, статус, «⋯» `RowMenu`) | `Table` → картки: ім'я, email, статус словом, посада, «⋯» | токени `card`, `border`, `muted-foreground` |
| статус працівника | новий доменний `EmployeeStatus` у `src/components/ui`: крапка + слово, як `StatusBadge` (Invited — `status-awaiting-foreground`, Active — `status-approved-foreground`, Deactivated — `status-cancelled-foreground`), слово — `foreground` | без змін | ті самі токени темного блоку |
| основна дія сторінки | `Button` `default` («Add employee», «Create employee», «Save position», «Assign deputy») | прикріплена внизу (`env(safe-area-inset-bottom)`) у формах, на всю ширину | — |
| посилання створено | `Alert` `info` з галочкою + `Card` «One-time sign-in link»: `Input readOnly` `font-mono`, `Button` `secondary` «Copy link», `text-xs text-muted-foreground` «Valid until …» | поле й кнопка — одна під одною, поле переносить адресу без горизонтальної прокрутки (`break-all`) | — |
| статус копіювання | текст у `role="status"` поруч із кнопкою | — | — |
| помилка дії (email зайнятий, перетин розкладу, друга основна посада) | `Alert` `destructive`, текст дослівно; введене лишається | над формою | `destructive` темного блоку |
| помилка поля | межа `destructive`, `FieldError` під полем, `aria-describedby` | — | — |
| власна роль | `Select` `disabled` + `text-xs text-muted-foreground` «You cannot change your own role» поруч | під полем | — |
| деактивація | `Button` `outline` у картці «Sign-in» → `Dialog`: заголовок-питання «Deactivate Teacher Three?», одне речення наслідку, `destructive` «Deactivate», «Back» | `Dialog` як є | `scrim` |
| відмова в доступі | сторінка: `EmptyState` з іконкою `ShieldOff`, «Only an administrator can manage employees», `Button` `link` «Go to Overview» | ті самі поля сторінки | — |
| порожні заступники | `EmptyState` «No deputies assigned» і одна дія `Button` `secondary` «Assign a deputy» (фокус на форму) | — | — |
| список заступників | `Table` (менеджер, заступник, період `tabular-nums`, стан словом, «⋯») | картки | — |
| період заступника | `DatePickerField` `range` | панель на всю ширину, клітинка 44 px (ADR 0008) | — |
| дата дії розкладу | `DatePickerField` `single` «Applies from» | так само | — |
| редактор розкладу | `Card` з рядком на день тижня Mon…Sun: `Label` дня, періоди `Input type="time" step=300` «Start» / «End» (як `closure-form.tsx`), `Button` `ghost` `icon-sm` «Remove period» з `aria-label`, `Button` `ghost` `sm` «Add period»; «Copy Monday to Tue–Fri» — `Button` `link` **(розробник)** | день — блоком: назва над періодами, поля на всю ширину по два в рядку | — |
| менеджери посади | `Checkbox`-картки з ім'ям і email | одна колонка | — |
| тип посади | `RadioGroup` «Main» / «Additional»; «Main» вимкнено з поясненням, якщо основна вже є (і база відмовляє, AC-STAFF-05) | — | — |
| розклад у картці посади | `formatSchedule` текстом + «From …» наступної версії, `tabular-nums` | переносяться лише назви | — |
| сторінка посилання | `Card` входу як на `/login` (без поля частинок): `PasswordInput` ×2, `SubmitButton` «Set password» зі спінером | картка на всю ширину, `p-4` | — |
| посилання прострочене / недійсне | `Alert` `destructive` з текстом AC / розробника, посилання «Go to sign in» | — | — |
| деактивований на вході | `Alert` `destructive` над формою входу | — | — |
| пароль задано | `Alert` `info` на Overview «Your password is set» | — | — |
| завантаження | `loading.tsx` зі `Skeleton` у формі таблиці / карток для `/staff`, `/staff/[id]`, `/staff/deputies` | — | — |
| «Account» | ім'я й email — `Input readOnly` з `Label`, під ними `text-xs text-muted-foreground` «Only an administrator can change names and emails» | поля на всю ширину | — |

Перевірка вигляду: знімки `/staff`, `/staff/new` з посиланням, `/staff/[id]`, редактор розкладу, `/staff/deputies`
(порожній і з рядками), `/auth/set-password` (форма й «expired») — 390 і 1280 px, світла й темна тема, у `docs/img/`;
приклади `EmployeeStatus` і порожнього стану — на `/design`.

**D14 — порядок викатки (AGENTS.md, «Код і схема виходять на прод не разом»; AC-STAFF-01…19).**

1. **PR 1 «База»** — одна міграція `staff_management` (expand): лише нові колонки (nullable), таблиці, функції, тригер і
   нові тіла наявних функцій з тими самими сигнатурами; наявний код її не помічає (усі блоки мають `valid_from` /
   `valid_to` null, заступників і деактивованих немає). Тести PGlite, SQL-мутанти, ADR 0013 і інтеграційний тест на
   справжньому Supabase у job `e2e` без інтерфейсу (`tests/e2e/staff-auth.spec.ts`, supabase-js із публічним ключем):
   `create_employee` → `use_one_time_link` → `signInWithPassword` успішний; `update_employee` → вхід новим email і тим
   самим паролем; `deactivate_employee` → `user_banned`; `reactivate_employee` → вхід; `auth.updateUser({ email })`
   працівника відмовлено. PR 1 не зливаємо, доки цей тест не зелений. Рев'ю бази обов'язкове
   (CodeRabbit або звіт другої думки — коментарем до злиття). Після злиття: `db-deploy-staging` → UAT-перевірка на
   staging (створення працівника функцією й вхід паролем) → `db-deploy`.
2. **PR 2 «Працівники й вхід»** — лише коли `/api/health` проду показує `schema` ≥ версії міграції PR 1: сторінки й
   дії, що читають `deactivated_at` і кличуть нові RPC.
3. **PR 3 «Посади, розклади й заступники»** — читачі розкладу з `valid_from` / `valid_to` і сторінки посад і
   заступників; той самий поріг схеми. Останній PR зрізу — `npx openspec archive impl-staff-management -y`.

Contract-кроку немає: жодна сигнатура RPC чи колонка, яку читає код, не зникає.

**D15 — тести (AC-STAFF-01…19).** Дати AC — фіксовані дати сценаріїв: у PGlite «сьогодні» не підмінити, тож правило
дати перевіряємо на функціях з явною датою (`private.kyiv_day`, `private.acting_manager_ids(p_day)`, `linkValidUntil`),
а сценарії — з датами відносно справжнього сьогодні (період заступника, що включає сьогодні, і що почнеться завтра;
`valid_until` вчора). Email у e2e — унікальні `teacher3-<run>@example.test` (у демоданих teacher3@ може вже бути,
D11), прибирає `cleanup.teardown.ts`. Шим PGlite (`tests/db/supabase-pglite.ts`) отримує колонки `auth.users`, які
пишуть функції D1 (`encrypted_password`, `email_confirmed_at`, `banned_until`, `instance_id`, `aud`, `role`,
`raw_app_meta_data`, рядки токенів, `created_at`, `updated_at`), таблиці `auth.identities`, `auth.sessions` і
розширення `pgcrypto` (`@electric-sql/pglite/contrib/pgcrypto`); справжню поведінку GoTrue доводить e2e.

| AC | Тест | Рівень |
|---|---|---|
| AC-STAFF-01 | `tests/db/staff-employees.test.ts`: `create_employee` → профіль, статус `invited`, `valid_until = сьогодні + 7`, токен один раз, у базі лише хеш; унікальність email (і з деактивованим). `src/lib/staff/link.test.ts`: `linkValidUntil("2026-12-01") = "2026-12-08"`. `tests/e2e/staff.spec.ts`: адмін створює — список «Invited», картка посилання «Valid until …» | PGlite + unit + e2e |
| AC-STAFF-02 | PGlite: `use_one_time_link(token, пароль 10 знаків)` → email, `active`, `used_at`; повторно — `invalid`; новий токен робить старий `invalid`. e2e: гість відкриває посилання, задає пароль, Overview «Your password is set», вихід і вхід цим паролем, у списку «Active» | PGlite + e2e |
| AC-STAFF-03 | PGlite: `valid_until` = вчора → `expired`, пароль не змінено. e2e: прострочене (через `tests/e2e/support/admin.ts`) — текст AC, форми немає | PGlite + e2e |
| AC-STAFF-04 | PGlite `tests/db/staff-positions.test.ts`: `create_position` з розкладом з дати й manager1@ → працівник бачить посаду й блоки за RLS, manager1@ — у `balance_employees`. unit `src/lib/leave/schedule.test.ts`: `blocksOnDate`, «From …». e2e `tests/e2e/staff-positions.spec.ts`: «Your weekly schedule» працівника, `/balances` менеджера | PGlite + unit + e2e |
| AC-STAFF-05 | PGlite: друга основна — текст AC, посад не додалось. e2e: `Alert` з текстом | PGlite + e2e |
| AC-STAFF-06 | PGlite: Mon 15:00–17:00 проти Mon 08:30–15:30 — текст AC дослівно; межа `[)` 15:30–17:00 проходить; перетин версій на іншу дату — відмова, на неперетинні дати — ні; пряма вставка — `exclusion_violation`. e2e: текст під формою | PGlite + e2e |
| AC-STAFF-07 | PGlite: запис 08:30–15:30 погоджено, новий розклад 08:30–12:30 з дати перед ним → запис без змін; новий цілий день після — 08:30–12:30 (`check_record_hours`, `working_minutes`); дата до межі — старий розклад. e2e: «My requests» показує обидва запису | PGlite + e2e |
| AC-STAFF-08 | PGlite: `deactivate_employee` → `banned_until`, сесій немає, `current_app_role()` — порожній рядок, записи й `decision_records` manager1@ з «approved» на місці, `approved_register` теж. unit `src/app/login/login-errors.test.ts`: `user_banned` → `deactivated`. e2e: вхід деактивованого — текст AC, не ввійшов; manager1@ бачить запис у «History» | PGlite + unit + e2e |
| AC-STAFF-09 | PGlite `tests/db/staff-deputies.test.ts`: період із сьогодні — manager2@ бачить запис у `decision_records` (`can_decide`), погоджує, подія з його `actor_id`; manager1@ теж бачить; `acting_manager_ids('2026-12-08')` при періоді 07–11.12 містить manager1@; реєстр, прохання про скасування й залишки — через той самий хелпер. e2e: черга й «Approve» заступника | PGlite + e2e |
| AC-STAFF-10 | PGlite: період почнеться завтра (і закінчився вчора) — жодного запису teacher1@ у `decision_records`, `leave_records` за RLS; `acting_manager_ids('2026-12-14')` без manager1@. e2e: черга порожня для цього працівника | PGlite + e2e |
| AC-STAFF-11 | PGlite: `update_employee` — нові ім'я й email у `profiles`, `auth.users`, `auth.identities`, `encrypted_password` той самий; записи без змін. e2e: адмін змінює, людина входить новим email і тим самим паролем | PGlite + e2e |
| AC-STAFF-12 | PGlite: `update public.profiles` від працівника — відмова прав; `update auth.users set email` як `supabase_auth_admin` — текст AC. e2e: `/account` показує текст AC, поля лише для читання; `supabase.auth.updateUser({ email })` — помилка, email той самий | PGlite + e2e |
| AC-STAFF-13 | e2e: manager1@ відкриває `/staff/new` — текст AC, список без змін; unit сторінки відмови. PGlite: `create_employee` від менеджера — 42501 | e2e + PGlite |
| AC-STAFF-14 | PGlite: manager1@ `insert into deputy_assignments` — відмова прав, `assign_deputy` — 42501, рядків немає, видимі записи не змінились. e2e `tests/e2e/negative-controls.spec.ts`: REST-виклик із сесією менеджера | PGlite + e2e |
| AC-STAFF-15 | e2e: гість на `/staff` → `/login`, у HTML немає email працівників; `src/lib/supabase/proxy.test.ts` — `guestRedirect("/staff")` | e2e + unit |
| AC-STAFF-16 | наявні тести `tests/e2e/account.spec.ts` — AC ID у назві | e2e |
| AC-STAFF-17 | так само | e2e |
| AC-STAFF-18 | PGlite: `set_employee_role(себе)` — текст AC, роль та сама. e2e: на власній картці — `Select` вимкнено й текст AC | PGlite + e2e |
| AC-STAFF-19 | e2e: порожній список — текст AC (prod-подібна база без призначень; тест прибирає призначення, які створив сам); PGlite: `select` адміністратора — нуль рядків | e2e + PGlite |

Також без AC ID (поведінка інструментів і безпеки): множина функцій, доступних `anon` (D2); `create_employee` не
отримує тестових посад (D11); регресія наявних наборів `tests/db/*` (розклад без дат читається як раніше). SQL-мутанти
`scripts/mutants.mjs`: межі періоду заступника (`between` → `>`), строк посилання (`<=` → `<`), друга основна посада,
перетин версій розкладу, перевірка власної ролі.

## Ризики й компроміси

- **Запис в `auth.*` з бази** (D1) — залежить від внутрішньої схеми GoTrue; доводимо e2e на справжньому Supabase у CI
  і на staging до проду; при зміні схеми Auth — ADR 0013 і тести покажуть, що ламається. Відкат — нова міграція.
- **Обхід правил пароля Auth** (D2) — посилання ставить пароль повз налаштування Auth; правила — наші (≥ 8 знаків,
  ≤ 72 байти), як і в PM.
- **Текст деактивації до пароля** (D6) — може показати, що email колись був працівником; свідомо.
- **Слабше обмеження перетину** (D7) — нове обмеження дозволяє однакові години на неперетинних датах дії; це і є
  правило PM «at any date».
- **Запис ширший за новий розклад** (D7, AC-STAFF-07) — показ і частка дня обрізаються межами дня; години запису —
  як збережено.
- **Тригер на `auth.users`** (D5) — закриває й зміну email через Admin API; `scripts/create-demo-users.mjs` email не
  змінює, `tests/e2e/support/admin.ts` перевіряємо в PR 1.
- **Розмір зрізу** — три PR (tasks.md); база першою, щоб код не випередив схему.
