# 0013. Облікові записи працівників — функціями бази, без секретного ключа в застосунку

- Статус: прийнято (план `impl-staff-management`, варіант A — рішення людини)
- Дата: 2026-11-25
- AC: AC-STAFF-01, AC-STAFF-02, AC-STAFF-03, AC-STAFF-08, AC-STAFF-11, AC-STAFF-12, AC-STAFF-13, AC-STAFF-14,
  AC-STAFF-18

## Контекст

Вимога PM 07 (`requirements/07-staff-management.md`): адміністратор створює працівника й дає одноразове посилання, дійсне до
дня створення за Києвом + 7 включно (створене 1 грудня — до 8 грудня включно, AC-STAFF-01), людина за посиланням задає
пароль; адміністратор змінює ім'я й email (вхід — новим
email і тим самим паролем) і деактивує тих, хто йде (не входить, історія лишається). Листів портал не надсилає.

Усі ці дії змінюють облікові записи Supabase Auth. Звичайний шлях — Admin API Auth (`auth.admin.createUser`,
`updateUserById`), але він потребує секретного ключа, а `AGENTS.md` («Секрети») забороняє `SUPABASE_SECRET_KEY` у
Vercel: у застосунку лише `NEXT_PUBLIC_SUPABASE_URL` і `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Відкрите питання з
`docs/decisions/README.md` («Зміна email через Supabase Auth обходить правило…») теж розв'язується тут.

## Рішення

Міграція `supabase/migrations/20261125082128_staff_management.sql` (план — D1–D6 у
`openspec/changes/impl-staff-management/design.md`):

1. **Облікові записи пишуть функції бази.** `private.create_employee`, `private.update_employee`,
   `private.deactivate_employee`, `private.reactivate_employee` і `private.use_one_time_link` — `security definer` у
   схемі `private` з `set search_path = ''`; вони пишуть у `auth.users`, `auth.identities`, `auth.sessions` в одній
   транзакції з `public.profiles`. Рядок `auth.users` — такий, як його читає GoTrue: email у нижньому регістрі,
   підтверджений, порожні рядки (не `null`) у текстових колонках токенів; пароль — `extensions.crypt(…,
   gen_salt('bf', 10))`, той самий bcrypt, що перевіряє GoTrue. Деактивація — `banned_until = now() + 100 років` (не
   `infinity`), видалення сесій, відкликання посилань; реактивація — зворотна дія з тим самим паролем.
2. **Право — лише адміністратор**, першим кроком кожної функції (`private.require_admin`: роль із `profiles.role`
   через `private.current_app_role()`), інакше 42501 «Only an administrator can manage employees» — і в обхід сторінок.
   Собі роль не змінити («You cannot change your own role») і себе не деактивувати — тож єдиний адміністратор
   лишається. Зміни ролі й деактивація серіалізовані спільним advisory lock адміністраторів і повторною перевіркою того,
   хто кличе, після нього: два адміністратори не знімуть роль один з одного одночасно. Перевірка «At least one active
   administrator must remain» лишається в коді лише про всяк випадок — з цими правилами вона недосяжна. Кожна дія над
   людиною бере ще й lock цієї людини (`private.lock_employee` / `private.lock_people`, за зростанням uuid): зміна ролі
   не розминеться з призначенням менеджером посади чи заступником, а видача посилання — з деактивацією.
3. **Одноразове посилання** — `private.one_time_links`: лише SHA-256 токена (32 випадкові байти, base64url), строк
   `valid_until = сьогодні за Києвом + 7` включно, `used_at`, `revoked_at`; нове посилання відкликає невикористані під
   lock працівника. Токен повертається один раз і живе лише у фрагменті адреси (`/auth/set-password#token=…`).
4. **Гість має рівно один вхід** — `public.use_one_time_link` (`security invoker`) → `private.use_one_time_link`:
   без пароля каже стан (`valid` з email, `expired`, `invalid`), з паролем — задає його (≥ 8 знаків, ≤ 72 байти) і
   позначає посилання використаним. Для цього `anon` отримує `usage` на схему `private` і `execute` лише на цю функцію.
   Це другий свідомий виняток після `public.schema_version()`; тест `tests/db/staff-privileges.test.ts` перевіряє, що
   `anon` може виконати рівно ці функції, що кожна функція, яка пише в `auth.*`, — `security definer` у `private` з
   порожнім `search_path`, і що внутрішні хелпери закриті від `authenticated`.
5. **Email не змінити в обхід.** Тригер `guard_auth_email_change` (`before update of email, email_change on
   auth.users`) відкидає зміну, коли її робить GoTrue (`current_user = 'supabase_auth_admin'`: `updateUser`,
   підтвердження зміни, Admin API), з текстом «Only an administrator can change names and emails». Наші функції
   працюють як власник `postgres` і проходять. `profiles` і далі без `update` для `authenticated`.
6. **Деактивований із чинним токеном.** Видалення `auth.sessions` не робить недійсним уже виданий access-JWT — він
   діє до свого строку (до 1 год). Тому:
   - права ролі закриваються одразу: `private.current_app_role()` дає `''` (порожній рядок, а не `null` — наявні
     перевірки виду `not (v_role = 'admin' or …)` з `null` пропустили б IF), а `private.acting_manager_ids` не додає
     його `auth.uid()`, тож `manages_position` і `manages_employee` — `false`;
   - власні дії працівника закриває `private.require_active()` у публічних обгортках `submit_leave_request`,
     `update_leave_record_hours`, `resubmit_leave_record`, `cancel_leave_record`, `request_record_cancellation`
     (42501 «Your account is deactivated. Contact the administrator»); інших шляхів запису для `authenticated` немає —
     таблиці лише на читання, схема `private` закрита Data API;
   - читання власних записів і залишків за RLS (`auth.uid()`) лишається до кінця строку токена — свідомо: це його ж
     дані, а оболонка `(app)/layout.tsx` (PR 2) виводить деактивованого з сесії на першій же сторінці.

## Розглянуті варіанти

- **Admin API у server action на Vercel** — найпростіше в коді, але потребує `SUPABASE_SECRET_KEY` у Vercel:
  заборона `AGENTS.md`; ключ відкриває всю базу повз RLS.
- **Edge Function із секретом Supabase** — ключ лишається в Supabase, але це новий рантайм, деплой і секрети поза CI
  курсу (`db-deploy` уміє лише міграції).
- **Запрошення листом Supabase (`inviteUserByEmail`)** — PM: листів немає; вбудований SMTP шле лише учасникам проєкту.

## Наслідки

- Простіше: жодного секретного ключа в застосунку (`check:boundary` не змінюється); усі права — в одному місці, у
  базі, і їх перевіряють тести PGlite і SQL-мутанти (`scripts/mutants.mjs`, S68–S92).
- Ризик: функції залежать від внутрішньої схеми GoTrue (`auth.users`, `auth.identities`, `auth.sessions`) і прав
  `postgres` на DML у `auth.*`. Захист: `tests/e2e/staff-auth.spec.ts` на справжньому Supabase в job `e2e` (створення →
  пароль за посиланням → вхід; новий email з тим самим паролем; `user_banned` після деактивації; вхід після
  реактивації; `updateUser({ email })` відмовлено) має бути зеленим до злиття, далі `db-deploy-staging` і перевірка на
  staging до `db-deploy`. Якщо оновлення Supabase змінить схему Auth — ці тести впадуть першими; виправлення — новою
  міграцією.
- Пароль за посиланням оминає налаштування паролів Auth (наприклад, перевірку злитих паролів); правила — наші й ті
  самі, що на `/account` (ADR 0011).
- Якщо GoTrue перевіряє бан раніше за пароль, текст деактивації видно й з неправильним паролем. Приймаємо: власна
  перевірка пароля в базі для гостя відкрила б перебір паролів повз обмеження Auth.
- PGlite має лише шим Auth (`tests/db/supabase-pglite.ts`): колонки, які пишуть наші функції, і `pgcrypto`.
