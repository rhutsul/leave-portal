# Design: шкільний календар

## Context

- Специфікація — `openspec/specs/school-calendar/spec.md` (AC-CAL-01…15); вимога PM — `requirements/04-school-calendar.md`.
- Що вже є: розклад посади — тижневі блоки `public.schedule_blocks (position_id, employee_id, weekday, start_min,
  end_min)`; одне правило годин для подання й зміни годин — `private.check_record_hours` (остання версія —
  `20261104165058_end_at_next_block.sql`) і його TS-двійник `checkHours` у `src/lib/leave/time.ts`; знаменник частки
  дня — `private.working_minutes` (за днем тижня); залишки рахує `computeBalances` (`src/lib/leave/balance.ts`) із
  `get_balance_inputs`, де робочі хвилини теж беруться за днем тижня; ролі — `profiles.role`, хелпер
  `private.current_app_role()`.
- У дизайн-системі вже є стан дня `closed` у `CalendarDay` (штриховка, легенда «Closed by the school»), але він
  `disabled` — натискання мовчить.
- Рішення, яких дотримуємось: ADR 0001 (тести бази на PGlite), 0003 (права на залишки в базі), 0004 (лише
  компоненти `@/components/ui`, лише токени), 0007 (вигляд v2, спокійні робочі сторінки), 0008 (адаптив від 360 px,
  `<Table stack>`, цілі дотику 44 px). Нових ADR план не потребує.

## Goals / Non-Goals

**Goals:** усі 15 AC на проді, правило кожної відмови — у базі (а не лише на сторінці), той самий розклад дати для
заявки, зміни годин і залишків; тест на кожен AC на правильному рівні й UAT-специфікація на кожен AC.

**Non-Goals:** зміна збереженого закриття, повтори, закриття для підрозділу, листи (Non-goals специфікації);
попередження менеджеру про конфлікт з календарем (власне припущення `add-school-calendar`); тексти повідомлень для
питань #22–#24 до відповіді PM.

## Decisions

### D1. Дані й RLS — таблиця `public.school_closures` (AC-CAL-01, -02, -10, -11, -13, -14)

Колонки: `id bigint identity`, `name text` (`char_length(btrim(name))` 1…100), `start_date date`, `end_date date`,
`closes_at integer null` (хвилини від півночі за Києвом, крок 5, 5…1435; `null` — цілі дні), `created_by uuid`
(`profiles.id`, `on delete set null`), `created_at timestamptz`. Перевірки таблиці: `end_date >= start_date`
(AC-CAL-10), для скороченого дня `start_date = end_date`.

- **Без спільних дат — обмеження бази:** `exclude using gist (daterange(start_date, end_date, '[]') with &&)`
  (AC-CAL-11). Для `daterange` розширення не потрібне. Текст «<дата> is already closed: <назва>» формує функція
  додавання до вставки; обмеження — другий рубіж для одночасних дій.
- **Права:** `enable row level security`; `revoke all … from anon, authenticated`; колонковий
  `grant select (id, name, start_date, end_date, closes_at, created_at)` лише `authenticated` — `created_by` для
  AC-CAL-02 не потрібен і не відкривається; політика `school_closures_select_signed_in for select to authenticated using ((select auth.uid())
  is not null)` (AC-CAL-02). Ні `insert`, ні `update`, ні `delete` для `authenticated` немає: змінювати можна лише
  функціями D2 (AC-CAL-13). Гість (`anon`) не має `select` (AC-CAL-14).

### D2. Додавання й видалення — функції Postgres (AC-CAL-01, -07, -08, -09, -10, -11, -12, -13)

`private.add_school_closure(p_name, p_start, p_end, p_closes_at)` і `private.remove_school_closure(p_id)` —
`security definer`, `set search_path = ''`, обгортки `public.*` (`security invoker`) для `supabase.rpc`, як
`submit_leave_request`. Порядок у додаванні:

1. `auth.uid()` є, `private.current_app_role() = 'admin'`, інакше `42501` «Only an administrator can change the school
   calendar» (AC-CAL-12, -13 — той самий текст і для прямого виклику).
2. Назва 1…100 знаків; дати; крок 5 хв часу (тексти — після відповіді PM на #24; до того — технічна помилка `22023`
   без тексту з AC, форма не дає їх надіслати).
3. AC-CAL-10: «The end date cannot be earlier than the start date».
4. Ексклюзивне `pg_advisory_xact_lock(<ключ календаря>)` до першого читання записів; подання заявки й зміна годин
   (D4) беруть той самий ключ спільно (`pg_advisory_xact_lock_shared`), тож заявки одна одну не чекають, а закриття
   й новий запис не проскочать одне повз одного. Порядок у функціях, що вже беруть lock працівника
   (`hashtextextended(uid)` в `update_leave_record_hours`), — спершу працівник, потім календар.
5. AC-CAL-11: перше закриття, що перетинає діапазон, → «<перша спільна дата> is already closed: <назва>» (формат для
   кількох — після #23).
6. AC-CAL-07/08: записи зі статусами з того самого явного списку, що в `leave_records_no_overlap`
   (`'awaiting', 'returned', 'approved'`, як `BLOCKING_STATUSES`), у діапазоні дат; для скороченого дня — лише записи
   з `end_min > closes_at`. Є хоч один → «These days have leave records and cannot be closed: » + пари
   `YYYY-MM-DD email` через `", "`, порядок — дата, потім email (власне припущення), по парі на запис.
7. Вставка.

Видалення — та сама перевірка ролі; записів не змінює (AC-CAL-09).

### D3. Розклад дати з урахуванням закриттів — одна функція (AC-CAL-03, -04, -05, -06, -09)

`private.blocks_on_date(p_position_id bigint, p_date date) returns table (start_min, end_min)`: блоки посади за днем
тижня; дата в закритті цілими днями — порожньо; скорочений день з `closes_at = X` — блоки з `start_min < X`,
`end_min = least(end_min, X)`. На ній стоять:

- `private.check_record_hours` — нова версія (`create or replace`) читає блоки з `blocks_on_date`, тож подання
  (AC-CAL-05: «Hours must be within your schedule: 08:30–12:00») і зміна годин запису мають одне правило;
- `private.working_minutes(employee, date)` — сума `blocks_on_date` по посадах працівника: знаменник частки дня
  (AC-CAL-06), отже й `record_share`, `used_hundredths`, `remaining_hundredths`;
- `get_balance_inputs` — `working_minutes` за датою замість об'єднання за днем тижня (`computeBalances` бере
  `working_minutes` з даних, тож сторінка залишків змін не потребує). Але TS-попередження про перевищення
  (AC-BALANCE-08, -17: `requestShares` → `workingMinutesOn` у `src/lib/leave/balance.ts`, виклик з
  `requests/new/actions.ts`) рахує знаменник сам за днем тижня — його переводимо на обрізані блоки (D4), інакше в
  скорочений день попередження дасть 0.50 замість 1.00;
- `private.closure_on_date(p_date)` → назва закриття цілими днями або `null`.

**Частка дня — від поточного календаря** (власне припущення специфікації): погоджені записи рахуються наново при
кожному читанні, тож додане чи видалене закриття змінює частку. Межа цього припущення — записи, погоджені з
розподілом на оплачувану й неоплачувану частини (AC-BALANCE-10, AC-BALANCE-18): за AC це дні, які менеджер погодив
у момент рішення (`paid_days`/`unpaid_days`), і їх не перераховуємо — інакше пізніше закриття мовчки змінило б
рішення менеджера. Це уточнення власного припущення, а не нове правило PM: записано в `docs/spec-reading.md`
(«Власні припущення») і в коментарі міграції; у специфікацію — змінами `clarify-school-calendar`, якщо PM
відповість інакше.

### D4. Заявка — закрита дата й скорочений день (AC-CAL-03, -04, -05, -09)

- `private.submit_leave_request` — нова версія: на кожну дату спершу `closure_on_date`; закрита дата пропускається,
  як дата без годин (AC-LEAVE-21), а якщо не прийнято жодної — помилка «The school is closed on this day: <назва>»
  (AC-CAL-03); скорочений день — через `check_record_hours` / `blocks_on_date` (AC-CAL-04, -05). Бере той самий
  advisory lock, що й D2.
- `private.update_leave_record_hours` — уже викликає `check_record_hours`; нова версія лише бере спільний lock
  календаря після lock працівника.
- TS — одна чиста функція `clipBlocks(blocks, closure)` у `src/lib/leave/calendar.ts` з тими самими межами, що
  `blocks_on_date` (тести на межах: блок, що триває о X, блок, що починається о X), і `loadClosures(supabase, from,
  to)`. Закриття читає **кожне** місце, що зараз бере блоки за днем тижня:
  - `positionsOnDate` / `buildRequestRecords` (`src/lib/leave/request.ts`): закритий цілий день →
    `{ ok: false, message: "The school is closed on this day: <назва>" }` і пропуск у `skipped` з цим повідомленням;
    скорочений день → обрізані блоки;
  - server action подання `src/app/(app)/requests/new/actions.ts` — сам будує записи `buildRequestRecords`, тож
    читає закриття й передає їх туди ж (інакше «Whole day» на 2026-11-20 стане 08:30–15:30 і база відмовить);
  - попередження про перевищення `requestShares` / `workingMinutesOn` (`src/lib/leave/balance.ts`) — знаменник за
    обрізаними блоками (AC-CAL-06 в попередженні, AC-BALANCE-08, -17);
  - зміна годин запису `src/app/(app)/requests/actions.ts` і «My requests» `src/app/(app)/requests/page.tsx`
    (розклад дня й мітка «Whole day» запису) — обрізані блоки дати;
  - сторінка `/requests/new` (`page.tsx`) вантажить закриття тим самим вікном, що й `recordDates` (навчальні роки
    `year-1 … year+1`), бо місяць у формі перемикається на клієнті.
- `CalendarDay`: стан `closed` стає кнопкою без `disabled` (як `off`): натискання показує повідомлення AC-CAL-03
  замість мовчання; `aria-label` — «…, closed: Winter break». Зміна в `src/components/ui/calendar-day.tsx`, вітрині
  `/design` і `DESIGN.md` (розділ 6, «День календаря»: «закрито школою — … натискання пояснює AC-CAL-03»).

### D5. Сторінки (AC-CAL-01, -02, -09, -10, -11, -12, -14, -15)

- `/calendar` — «School calendar» для всіх ролей: `PageHeader`, перемикач навчального року (`?year=2026`, за
  замовчуванням — поточний рік за Києвом), `<Table stack>` закриттів за датою (назва, дати `2026-12-28 – 2027-01-08`,
  для скороченого дня — дата й «from 12:00»); закриття, що перетинає 31 серпня, потрапляє в обидва роки (фільтр
  перетину діапазонів); порожній рік — `EmptyState` «No closed days in school year 2026–2027» (AC-CAL-15). У адміна
  — основна дія «Add closure» і «⋯» → «Remove closure» у кожному рядку (`RowMenu`, `Dialog` з `RecordSummary`-подібним
  підсумком, кнопка `destructive`).
- `/calendar/manage` — форма адміністратора «Add closure»: назва, тип «Whole days» / «Early dismissal» (`RadioGroup`),
  дати або дата й час (крок 5 хв); помилки з бази — `Alert destructive` над формою з дослівним текстом, введене
  лишається. Не-адмін за прямим посиланням — сторінка відмови «Only an administrator can change the school calendar»
  без форми й даних (AC-CAL-12).
- Server actions `addClosure` / `removeClosure`: `getClaims()`, роль із `profiles` (не з `user_metadata`) до виклику
  `rpc`; база перевіряє вдруге (D2). Після успіху — `Alert info` і спалах нового рядка (`highlight`), як «Request
  submitted».
- Навігація: пункт «School calendar» (`CalendarDays`) у `sidebar-nav.tsx` для всіх ролей, і в `mobile-nav.tsx`.
- Гість: `guestRedirect` у `src/lib/supabase/proxy.ts` уже веде всі шляхи, крім `/`, на `/login` (AC-CAL-14);
  сторінка ще й читає лише через RLS (D1).
- Адаптив (ADR 0008): від 360 px, таблиця — картки нижче `md`, цілі дотику 44 px, `*.mobile.spec.ts`; знімки 390 і
  1280 px у світлій і темній темі в `docs/img/`.

### D6. Тести й доказ, що тест відмови падає

| AC | Рівень | Де |
|---|---|---|
| AC-CAL-01, -07, -08, -10, -11 | PGlite (функція додавання) + UAT | `tests/db/school-calendar.test.ts`, `tests/e2e/calendar.spec.ts` |
| AC-CAL-02 | PGlite `asUser(teacher1)` і `asUser(manager1)` бачать закриття (політика select) + рядок `school_closures` у `tests/db/table-visibility.test.ts` + unit фільтра навчального року + UAT | `tests/db/school-calendar.test.ts`, `src/lib/leave/calendar.test.ts` |
| AC-CAL-15 | unit (текст порожнього стану) + UAT | `src/lib/leave/calendar.test.ts` |
| AC-CAL-03, -04, -05 | unit (`positionsOnDate`, `clipBlocks`) + PGlite (`submit_leave_request`) + UAT | `src/lib/leave/calendar.test.ts`, `tests/db/school-calendar.test.ts` |
| AC-CAL-06 | PGlite (`used_hundredths` після погодження) + unit (`computeBalances` з обрізаними хвилинами) + UAT | ті самі |
| AC-CAL-09 | PGlite (видалення → дата знову приймається з 08:30–15:30) + UAT | ті самі |
| AC-CAL-12 | компонент сторінки відмови + UAT | `src/app/(app)/calendar/manage/*.test.tsx` |
| AC-CAL-13 | PGlite `asUser(manager)` — `rpc` відмовляє, `insert` у таблицю відмовляє, календар без змін, дата приймається + UAT «що не змінилося» | `tests/db/school-calendar.test.ts` |
| AC-CAL-14 | PGlite `asAnon` — `select` заборонено + UAT (сторінка входу, жодних назв) | те саме |

Тести пише окрема сесія з тексту AC до коду (maker ≠ checker). Доказ, що тест відмови падає: SQL-мутанти в
`scripts/mutants.mjs` для AC-CAL-02 (політика select → `using (false)`), AC-CAL-07 (статус «Rejected» блокує /
«Approved» не блокує), AC-CAL-10, AC-CAL-11, AC-CAL-13 (перевірка ролі → `true`), AC-CAL-14 (`grant select … to anon`), і для скороченого дня (`end_min > closes_at` →
`>=`) — `npm run mutation:sql` → `KILLED`; для `clipBlocks` — Stryker `--mutate src/lib/leave/calendar.ts`.

## Risks / Trade-offs

- **Два місця правила годин (TS і SQL)** — як у AC-LEAVE-22: `clipBlocks` і `blocks_on_date` мають однакові межі;
  пара тестів на ті самі межі в обох шарах.
- **Знаменник частки дня змінюється заднім числом** (D3) — свідомо, з тексту PM; записи з розподілом не змінюються.
- **UAT на проді змінює спільний календар.** AC-CAL-01, -07…-11 додають закриття для всієї школи, AC-CAL-07 потребує
  запису «Approved» саме `teacher1@example.test` на 2026-12-29 (демо-користувач, не синтетичний `uat-*`). Нинішнє
  прибирання UAT (`deleteUatUsers`, звіт `scripts/uat/report.mjs`) знає лише користувачів `uat-*@example.test`, тож
  потрібен новий хелпер у `tests/e2e/support/`: створити закриття й запис через секретний ключ, запам'ятати id і
  видалити їх в `afterAll`, а також окремим кроком після прогону (`scripts/uat/run.mjs`), щоб упалий тест не лишив
  «Winter break», який заблокує заявки на канікули; у звіті — рядок «закриття й записи, що лишились». Перед прогоном
  тест перевіряє, що на 2026-12-28 – 2027-01-08 і 2026-11-20 немає чужих записів і закриттів. Не вдається безпечно —
  AC у «Не перевірено» proof pack з причиною.
- **`/calendar` і `CalendarDay` поруч із візуальною роботою** — та сесія завершила (#50–#60), сторінки робимо за її
  правилами (ADR 0007, 0008).

## Migration Plan

Дві міграції, по одній на задачу: `school_calendar` (задача 1 — таблиця, RLS, функції D2–D3, нові версії
`check_record_hours`, `working_minutes`, `get_balance_inputs`) і `school_calendar_requests` (задача 2 — нові версії
`submit_leave_request` і `update_leave_record_hours`, D4). Усе — `create or replace`, застосовані файли не редагуємо. Відкат — новою міграцією. `db-deploy` після merge; `database.types.ts` — із Summary
`db-check`.
