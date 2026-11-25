# План: адміністратор керує працівниками, посадами, розкладами, менеджерами й заступниками

## Why

Реалізуємо зріз «керування працівниками» за специфікацією `openspec/specs/staff-management/spec.md` (зміна
специфікації `2026-11-24-add-staff-management` з уточненням `2026-11-24-clarify-new-slices-review`; вимога PM
`requirements/07-staff-management.md`; рядки матриці прав `requirements/product.md` «Create employees, positions,
schedules; assign managers and deputies», «Deactivate an employee», «Decide records of an absent manager's positions as
a deputy», «Change own password», «Change a user's name or email (including own)») і змінені вимоги
`openspec/specs/leave-decision/spec.md` (список «Awaiting decision», «Рішення без права» — з заступником).

Зараз працівників, посади, розклади й менеджерів створює розробник тестовими даними (`npm run users:demo`, таблиці
`private.test_*`), тож школа не може найняти вчителя, змінити розклад, підмінити відсутнього менеджера чи відпустити
людину без розробника. Після зрізу все це робить адміністратор у порталі, а історія відпусток не губиться.

## What Changes

Покриває AC з `openspec/specs/staff-management/spec.md`:

- **Працівник і одноразове посилання** — адміністратор створює працівника (ім'я, email, роль) і бачить посилання для
  входу, дійсне 7 днів включно з днем створення; людина за посиланням задає пароль, входить і бачить «Your password is
  set»; прострочене посилання — текст AC, пароль задати не можна; нове посилання робить попереднє недійсним; статуси
  «Invited» / «Active» / «Deactivated»: AC-STAFF-01, AC-STAFF-02, AC-STAFF-03.
- **Посади й розклади з дати** — посада з типом, підрозділом, назвою, тижневим розкладом «з дати» і відповідальними
  менеджерами; рівно одна основна посада; розклади посад одного працівника не перетинаються на жодну дату; новий
  розклад діє з дати й не змінює наявних записів: AC-STAFF-04, AC-STAFF-05, AC-STAFF-06, AC-STAFF-07.
- **Деактивація** — деактивований не входить (текст AC), його записи лишаються в «History» менеджера, у реєстрі й у
  залишках: AC-STAFF-08.
- **Заступники** — один хелпер прав менеджера в базі (`private.manages_position` і `private.manages_employee` через
  `private.acting_manager_ids`) дає заступнику, поки сьогодні (Київ) у межах періоду, ті самі права на посади
  відсутнього менеджера в КОЖНОМУ шляху: RLS записів, черга «Awaiting decision», рішення, прохання про скасування,
  реєстр, залишки, заявка від імені; поза періодом — нічого; порожній список — текст AC: AC-STAFF-09, AC-STAFF-10,
  AC-STAFF-19.
- **Ім'я й email** — змінює лише адміністратор, вхід з новим email і тим самим паролем; працівник бачить текст AC і
  не може змінити їх ні на сторінці, ні в обхід (Data API, Auth): AC-STAFF-11, AC-STAFF-12.
- **Доступ** — сторінки `/staff/**` для не-адміністратора показують «Only an administrator can manage employees», а
  функції бази відмовляють і в обхід сторінок; гість — сторінка входу; адміністратор не змінює власну роль:
  AC-STAFF-13, AC-STAFF-14, AC-STAFF-15, AC-STAFF-18.
- **Власний пароль** — уже реалізовано на `/account` (ADR 0011): лише AC ID у назвах тестів і рядки матриці:
  AC-STAFF-16, AC-STAFF-17.

Не входить (Out of scope PM): листи новим користувачам (адміністратор передає посилання сам), самореєстрація,
видалення працівників, зміна 18 днів на рік і перенесених днів, імпорт з таблиці, «forgot password» листом (замість
нього — нове одноразове посилання від адміністратора).

## Impact

- **База:** одна міграція `staff_management` (expand, без зміни сигнатур наявних RPC): колонка
  `profiles.deactivated_at`, унікальний email, таблиця `private.one_time_links`, дати дії блоків розкладу
  (`schedule_blocks.valid_from` / `valid_to`) з новим обмеженням перетину, таблиця `public.deputy_assignments`; нові
  тіла `manages_position`, `manages_employee`, `current_app_role`, `blocks_on_date`, `working_minutes`,
  `closed_day_name`, `approved_register`, `register_divisions`; нові RPC адміністратора й одна RPC для гостя за
  посиланням; запобіжник зміни email в обхід (тригер на `auth.users`).
- **Код:** сторінки `/staff`, `/staff/new`, `/staff/[id]`, `/staff/[id]/positions/**`, `/staff/deputies`,
  `/auth/set-password`; пункти меню «Employees» і «Deputies» для адміністратора; повідомлення деактивації на `/login`;
  розклад «з дати» у формі нової заявки, Overview і панелі запису; доменні модулі `src/lib/staff/*.ts` і
  `src/lib/leave/schedule.ts`.
- **Рішення:** новий ADR 0013 «Облікові записи працівників — функціями бази, без секретного ключа в застосунку»
  (D1): `AGENTS.md` забороняє `SUPABASE_SECRET_KEY` у Vercel, тож Admin API Supabase Auth застосунку недоступний.
- **Три PR реалізації** (tasks.md): 1 — база й тести бази; 2 — працівники, вхід і доступ; 3 — посади, розклади й
  заступники. Порядок — D14.
- **Сусідні зрізи:** `check_cancellation_actor` (зріз 09, злито) і `decides_for_position` / `can_act_for_employee`
  (план `impl-on-behalf`) стоять на `manages_position` / `manages_employee` — заступник у них з'являється без змін їхніх
  тіл; зріз `substitutes` (план `impl-substitutes`, D9) — «деактивований не пропонується як заміна» додає той зріз,
  що зливається другим (D12).
