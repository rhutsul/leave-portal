# Дизайн: реалізація зрізу WS6

## Context

Що будуємо — `openspec/specs/leave-request`, `leave-decision`, `leave-balance` (40 вимог, 62 AC). Шаблон уже має:
вхід email + пароль (`src/app/login`), `src/proxy.ts` для сесії, серверний клієнт Supabase з `getClaims()`
(`src/lib/supabase/server.ts`), таблицю `public.profiles` з ролями `member` / `admin`, хелпер
`private.current_app_role()` і тригер `on_auth_user_created` (`supabase/migrations/20261012000000_profiles_and_roles.sql`).

Обмеження, що формують підхід:

- Стек фіксований (AGENTS.md): Next.js 16 App Router, Supabase (Postgres + Auth + RLS), Vercel, Tailwind 4, Vitest.
  Нових залежностей не додаємо (ні бібліотек дат, ні UI-кітів).
- Схема — лише міграціями в PR; застосовує їх `db-deploy` після merge. Prod, preview і локальний `npm run dev`
  працюють з **однією** базою, тож preview PR із новою міграцією бачить стару схему до merge.
- У supabase-js немає транзакцій: кілька записів або перевірка + запис — однією функцією Postgres через `rpc`.
- Адмінки немає (WS10): працівників, посади, розклади, менеджерів і перенесені дні створює розробник як тестові дані.
- PM відповів на Q1–Q4 (mkozlovskyi-ops/course-staff-management-spec#1, mkozlovskyi-ops/course-staff-management-spec#2, mkozlovskyi-ops/course-staff-management-spec#3, mkozlovskyi-ops/course-staff-management-spec#4) і питання команди mkozlovskyi-ops/course-staff-management-spec#5, mkozlovskyi-ops/course-staff-management-spec#6, mkozlovskyi-ops/course-staff-management-spec#7; зміна
  специфікації `clarify-leave-ws6` додала 11 AC (AC-LEAVE-17…20, AC-DECIDE-20…22, AC-BALANCE-17…20) — план нижче їх
  враховує.

## Goals / Non-Goals

**Goals:**

- Кожне правило часу й балансу — чиста функція TypeScript з тестом, назва якого починається з AC ID.
- Цілісність даних (хто що бачить, переходи статусів, перетин записів, «все або нічого», «перше рішення») тримає база:
  RLS, колонкові права, обмеження й функції — навіть якщо код сторінки помилиться.
- Вертикальні задачі: кожен PR дає видиму поведінку й закриває свої AC.
- Інтерфейс, у якому кожну дію зрізу можна виконати без підказок: послідовна форма заявки з підсумком перед
  підтвердженням, таблиці записів і рішень зі статусами, повідомлення про помилки й попередження — дослівно тексти PM
  з AC, порожні стани («No records awaiting decision»). Оформлення — на Tailwind 4 зі стеку, з єдиними відступами,
  типографікою й навігацією між сторінками, для настільного браузера, як визначив PM.

**Non-Goals:**

- Адмін-інтерфейс для працівників, посад, розкладів (WS10), календар (WS7), замінники (WS8), реєстр (WS9).
- Дизайн-система, фірмовий візуальний стиль і адаптивна верстка для телефона. PM свідомо виключив мобільну верстку
  («Mobile layout: the portal is designed for a computer», Out of scope `requirements/product.md`), а дизайн інтерфейсу
  в цьому зрізі не описаний у вимогах. Його додамо новою зміною специфікації й планом, коли він з'явиться у вимогах
  PM; структура сторінок D6 і чисті функції `src/lib/leave/` від нього не залежать, тож зміниться лише оформлення.
- Листи: лише статус і позначка в застосунку.
- Тести через справжню базу (pglite, Docker) у цьому зрізі — див. «Risks».

## Decisions

### D1. Ролі: `employee` / `manager` / `admin` в `profiles.role`

Нова міграція за порядком із заголовка першої міграції: зняти `profiles_role_check` → `update … set role = 'employee'
where role = 'member'` → default `'employee'` → новий `profiles_role_check`. Роль — одна на людину: `manager` і `admin`
теж є працівниками (матриця прав `requirements/product.md`). Що менеджер відповідає саме за посаду, визначає не роль,
а зв'язок `position_managers` (AC-DECIDE-01, AC-DECIDE-08). `supabase/demo-users.json` — у тому самому PR:
`admin@`, `manager1@`, `manager2@`, `teacher1@`, `teacher2@example.test`.

*Альтернатива:* масив ролей на людину — зайвий: матриця прав PM ієрархічна.

### D2. Модель даних

| Таблиця | Що зберігає | AC |
|---|---|---|
| `divisions` | підрозділ школи (довідник) | AC-LEAVE-01 |
| `positions` | посада працівника: `employee_id`, `division_id`, назва, `kind` main/additional (рівно одна main на працівника) | AC-LEAVE-02, AC-LEAVE-03 |
| `schedule_blocks` | блок розкладу посади: `position_id`, `employee_id` (копія з посади — для обмеження D3), `weekday` 1–7, `start_min`, `end_min` (хвилини від півночі, `start < end`, кратні 5) | AC-LEAVE-06…09, AC-LEAVE-15, AC-BALANCE-03, AC-BALANCE-05, AC-BALANCE-06 |
| `position_managers` | відповідальні менеджери посади (0–2+) | AC-DECIDE-01, AC-DECIDE-07, AC-DECIDE-08 |
| `leave_requests` | заявка: `employee_id`, `leave_type`, `relationship` (лише для «Family celebration»), коментар працівника, час подання | AC-LEAVE-05, AC-LEAVE-12 |
| `leave_records` | запис: `request_id`, `position_id`, `employee_id`, `date`, `start_min`, `end_min`, `minutes`, `status`, `leave_type`, `relationship`, коментар працівника (копії з заявки), `manager_comment`, `paid_days`, `unpaid_days` | AC-LEAVE-01…16, AC-DECIDE-01…19 (AC-DECIDE-01, AC-DECIDE-02, AC-DECIDE-03, AC-DECIDE-04, AC-DECIDE-05, AC-DECIDE-06, AC-DECIDE-07, AC-DECIDE-08, AC-DECIDE-09, AC-DECIDE-10, AC-DECIDE-11, AC-DECIDE-12, AC-DECIDE-13, AC-DECIDE-14, AC-DECIDE-15, AC-DECIDE-16, AC-DECIDE-17, AC-DECIDE-18, AC-DECIDE-19), AC-BALANCE-09, AC-BALANCE-10 |

Тип відпустки, спорідненість і коментар працівника `submit_leave_request` копіює в **кожен** запис заявки (PM:
коментар «is stored on every record of the request», `requirements/01-leave-request.md`). Тоді все, що менеджер має
бачити й рахувати на `/decisions` (тип для залишку й попередження AC-BALANCE-09, коментар), є в записі його посади, і
доступу до заявки чи записів чужих посад йому не потрібно (AC-DECIDE-01). Після подання ці поля не змінюються:
працівник змінює лише години.
| `leave_record_events` | історія: `record_id`, `actor_id`, `action`, `comment`, `created_at` | AC-DECIDE-10, AC-DECIDE-15 |
| `balance_carryovers` | перенесені дні на початок першого навчального року (тестові дані) | AC-BALANCE-11 |

Час зберігаємо як календарну дату + хвилини від півночі за Києвом: усі дати й час PM — Europe/Kyiv, однаково для
всіх, тож конвертації поясів для записів не потрібні. Час рішення — `timestamptz`, показуємо в Europe/Kyiv до хвилини
(`Intl.DateTimeFormat`, без бібліотек).

Статуси — `text` з `check` на 5 значень PM (`awaiting`, `approved`, `rejected`, `returned`, `cancelled` у базі,
англійські назви PM в інтерфейсі). Типи відпустки — `sick`, `personal`, `unpaid`, `family`. Спорідненість — `check` на
5 значень (власне припущення розробника, `docs/spec-reading.md`).

Погоджений із розподілом запис лишається **одним** записом з `paid_days` і `unpaid_days` (рішення PM на Q4,
mkozlovskyi-ops/course-staff-management-spec#4; розподіл показано на записі — AC-BALANCE-18, AC-BALANCE-19).

*Альтернатива:* зберігати час як `timestamptz` — ускладнює «цілий день» і блоки розкладу без жодної користі: PM
працює лише з датами й годинами за Києвом.

### D3. Перетини — обмеження бази

**Блоки розкладу працівника не перетинаються** — ні блоки різних посад, ні два блоки однієї посади:
`exclude using gist (employee_id with =, weekday with =, int4range(start_min, end_min) with &&)` на `schedule_blocks`.
Так база тримає два правила PM: розклади посад одного працівника не перекриваються, тож кожна робоча хвилина дати
належить рівно одній посаді (`requirements/03-leave-balance.md`, mkozlovskyi-ops/course-staff-management-spec#8), а блоки розкладу йдуть «with gaps
between blocks» (глосарій `requirements/product.md`). Тому знаменник частки дня — сума хвилин блоків дати — завжди
дорівнює робочим хвилинам працівника (AC-BALANCE-03, AC-BALANCE-05, AC-BALANCE-06), а адмінка WS10 успадкує
цю перевірку без змін. `employee_id` у блоці заповнює тригер `before insert or update` з посади, тож він завжди збігається з її
власником.

**Записи однієї посади не перетинаються:**

`exclude using gist (position_id with =, date with =, int4range(start_min, end_min) with &&) where (status in
('awaiting', 'returned', 'approved'))` (розширення `btree_gist`). Перетин неможливий навіть за одночасних заявок;
функція подання ловить порушення й повертає перший конфліктний запис для повідомлення AC-LEAVE-13 і AC-LEAVE-16.

*Альтернатива:* лише перевірка в коді — пропускає гонку двох одночасних заявок і неправильні дані розкладу; формула
з об'єднанням інтервалів замість суми — складніша й рахувала б випадок, якого за вимогами PM не буває.

### D4. Зміни даних — лише через функції Postgres (`rpc`)

| Функція | Що робить | AC |
|---|---|---|
| `submit_leave_request(payload)` | перевіряє блоки розкладу, створює заявку й усі записи або жоден (одна транзакція) | AC-LEAVE-01…16 |
| `decide_leave_record(record_id, decision, comment, split)` | право вирішувати, власний запис менеджера, «перше рішення» (`update … where status = 'awaiting'`), рядок історії; коментар обов'язковий лише при поверненні; розподіл — за залишком навчального року дати запису | AC-DECIDE-01…05, 07…11, 14, 15, 18, 19, 23, 24; AC-BALANCE-10, 16, 21, 22 |
| `update_leave_record_hours(record_id, start, end)` / `resubmit_leave_record` / `cancel_leave_record` | зміна годин до рішення, повторне подання, скасування | AC-DECIDE-06, 12, 13, 16, 17 |
| `get_balance_inputs(employee_id, school_year)` | лише підсумки по датах — без деталей чужих записів: усі робочі хвилини працівника дати; хвилини записів за типом і статусом; для погоджених записів — суми `paid_days` і `unpaid_days` за типом; перенесені дні | AC-BALANCE-01…16 |

**Привілейований шлях запису.** `authenticated` не має `insert` / `update` / `delete` на жодній таблиці зрізу —
працівник не змінить собі статус і не запише чужий рядок напряму. Тому **кожна** функція з таблиці вище складається з
двох частин:

- `public.<функція>` — `security invoker`, лише приймає параметри й викликає приватну функцію; `grant execute … to
  authenticated`, `revoke … from public, anon`;
- `private.<функція>` — `security definer`, `set search_path = ''`: перевіряє `(select auth.uid())` і право на
  конкретний запис (власник; відповідальний менеджер посади, не власний запис; адміністратор), статус, розклад і
  перетин, і лише тоді пише в таблиці. `grant execute` на неї має лише `authenticated` (схема `private` не видна через
  Data API).

Таблиці: `enable row level security`, `revoke all … from anon, authenticated`, явні `grant select`, політика `select`
`to authenticated` з `(select auth.uid())`; політик `insert` / `update` / `delete` для `authenticated` немає — запис
іде лише через `private`-функції.

RLS на читання: працівник — свої записи й заявки (AC-LEAVE-14); менеджер — записи посад із `position_managers`
(AC-DECIDE-01); адміністратор — усі (AC-DECIDE-10, власне припущення про список «Awaiting decision»).

### D5. Доменна логіка — чисті функції в `src/lib/leave/`

| Модуль | Що рахує | AC |
|---|---|---|
| `time.ts` | `HH:MM` ↔ хвилини, крок 5 хв, кінець блоку лише як кінець, години в блоках, тривалість без перерв | AC-LEAVE-04, 06, 07, 08, 09, 15, 19, 20 |
| `request.ts` | записи заявки з вибору (дати × посади, цілий день = усі блоки), одна посада мінімум, спорідненість, перетин | AC-LEAVE-01, 02, 03, 05, 10, 12, 13, 16, 17, 18 |
| `balance.ts` | навчальний рік дати запису, частка дня (хвилини ÷ усі хвилини дати, half-up до 0.01, ≤ 1.00), перенесення з погоджених записів попереднього року, попередження, розподіл | AC-BALANCE-01…11, 14, 15, 17, 18, 19, 21, 22 |
| `decision.ts` | хто може вирішувати, власний запис, дозволені переходи статусів, коментар обов'язковий лише при поверненні | AC-DECIDE-04, 07, 08, 09, 12, 17, 18, 21, 22 |
| `access.ts` | хто бачить чиї записи й залишки | AC-LEAVE-14, AC-DECIDE-01, AC-BALANCE-12, 13, 20 |

Server actions викликають ці функції для повідомлень користувачу, а потім `rpc`; функції бази перевіряють те саме
ще раз як другий рубіж. Тести — `src/lib/leave/*.test.ts`, назва кожного починається з AC ID.

*Альтернатива:* усю математику балансу в SQL — важче покрити тестами з AC ID; дублювання двох шарів свідомо лишаємо
лише для правил доступу й переходів статусів.

### D6. Сторінки (Server Components + server actions, Tailwind)

| Шлях | Хто | AC |
|---|---|---|
| `/requests/new` | працівник: дати → посади й години → тип → підсумок → підтвердження | LEAVE-01…13, 15…21; BALANCE-08, 15, 17 |
| `/requests` | «My requests»: записи, статуси, коментар, історія, зміна годин, повторне подання, скасування | LEAVE-14; DECIDE-03, 05, 06, 12, 13, 15…17, 21…24; BALANCE-18 |
| `/decisions` | менеджер / адміністратор: «Awaiting decision» і «History», рішення, попередження й розподіл | DECIDE-01…05, 07…11, 14, 18…20, 23, 24; BALANCE-09, 10, 14, 16, 19 |
| `/balances` | свої залишки; `?employee=` — для менеджера своїх посад і адміністратора | BALANCE-01…07, 11…13, 20…22 |

### D7. Тестові дані — призначення за email

Користувачів створює `npm run users:demo` (Admin API), і запускається він після `db-deploy` — тож міграція не може
просто вставити посади для `teacher1@example.test`: його профілю ще немає. Тому міграція тестових даних кладе
призначення в таблицю `private.test_assignments` (email → підрозділ, посада, тип, блоки розкладу, відповідальні
менеджери, перенесені дні) і:

- одразу застосовує їх до профілів, які вже є;
- додає тригер `after insert on public.profiles`, що застосовує призначення, щойно `users:demo` створить профіль.

Порядок «міграція → users:demo» чи навпаки на результат не впливає; вставки — `on conflict do nothing`. На одноразовій
базі `db-check` профілів немає, тож застосовується нуль рядків. Дані — синтетичні, лише `*@example.test`.

*Альтернатива:* окрема міграція даних після `users:demo` — прив'язує задачу до ручного кроку між двома PR і не дає
першій задачі закрити власні AC.

## Risks / Trade-offs

- [Preview PR з новою міграцією бачить стару схему] → уся схема й тестові дані — у першій задачі; у її PR SQL
  перевіряє `db-check`, поведінку — тести чистих функцій, а сторінки — на проді одразу після merge і `db-deploy`;
  preview наступних задач уже працюють із новою схемою.
- [Тестові посади прив'язані до користувачів, створених скриптом] → призначення за email із тригером (D7).
- [`security definer` обходить RLS] → лише в схемі `private`, з `set search_path = ''`, перевіркою
  `(select auth.uid())` і права на конкретний запис на початку кожної функції; `public`-обгортки — `security invoker`.
- [RLS і функції бази не покриті тестами з AC ID: тестової бази в зрізі немає] → ті самі правила — у чистих функціях
  `decision.ts` / `access.ts` з тестами; SQL перевіряє `db-check` на одноразовій базі; поведінку — вручну на preview і
  проді. Тести через pglite — окремим рішенням (нова залежність).
- [Два менеджери одночасно погоджують записи одного працівника понад залишок] → `decide_leave_record` бере
  `pg_advisory_xact_lock` на працівника й перераховує розподіл на момент рішення (вимога «Погодження з розподілом»).
- [Розклади посад одного працівника перекриваються] → PM визначив, що такого не буває (mkozlovskyi-ops/course-staff-management-spec#8): тестові
  дані D7 створюємо без перекриттів, `balance.ts` рахує знаменник як суму хвилин блоків усіх посад дати.

## Migration Plan

1. Задача 1: міграції ролей, схеми й тестових даних (D7) → `db-check` → merge → `db-deploy` → `npm run users:demo`
   (нові ролі й користувачі; тригер D7 одразу дає їм посади й розклади).
2. Наступні задачі — без змін схеми або з окремою новою міграцією (нові функції D4); застосовані міграції не редагуємо.

Відкат — новою міграцією; деструктивних змін у плані немає.
