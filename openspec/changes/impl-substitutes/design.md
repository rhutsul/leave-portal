# Design: заміни для записів і позначка підвищення

## Контекст

На чому будуємо (стан `main` на 1fde195):

- Посади й менеджери — `public.positions` (рівно одна `main` на працівника, `title`, підрозділ) і
  `public.position_managers`; хелпери `private.manages_position`, `private.manages_employee`, `private.can_see_record`,
  `private.current_app_role` (`20261020190045_leave_requests_schema.sql`). Роль — з `profiles.role`.
- Запис — `public.leave_records`; `authenticated` має лише `select` під політикою
  `leave_records_select_own_managed_or_admin`, пишуть лише функції. Перетин власних записів тримає
  `leave_records_no_overlap` (одна посада, статуси `awaiting`, `returned`, `approved` — `BLOCKING_STATUSES`).
- Подання — `private.submit_leave_request(p_leave_type, p_records jsonb, p_relationship, p_comment)`, остання версія
  тіла — `20261113145925_school_calendar_clarifications.sql`: спільний lock календаря, перевірка годин
  `private.check_record_hours`, пропуск закритих і неробочих дат (AC-LEAVE-21, AC-CAL-03), усе або нічого для прийнятих
  дат; обгортка `public.submit_leave_request` — `security invoker`. Зміна годин —
  `private.update_leave_record_hours` (`20261021171135_leave_record_edit.sql`, lock працівника
  `hashtextextended(uid::text, 0)`, потім рядок).
- Профілі інших людей `authenticated` не читає (`profiles_select_own_or_admin`); менеджер бачить імена й email лише
  через `public.decision_records()`; історію — через `public.record_histories(bigint[])`.
- Гостя на `/login` веде `src/proxy.ts` (`PUBLIC_PATHS`) для будь-якого шляху поза публічними.
- Зріз `cancel-approved` (план `openspec/changes/impl-cancel-approved/design.md`, реалізується раніше за цей) додає до
  `leave_records` колонки `cancel_reason`, `cancel_declined_comment`, `cancel_note`, дві дії історії й функції
  `request_record_cancellation`, `decide_record_cancellation`, `cancel_approved_record`; `submit_leave_request`,
  `update_leave_record_hours`, `decision_records()` і `my_leave_records` він не змінює.

Деактивація працівника (вимога 07, `openspec/specs/staff-management/spec.md`, AC-STAFF-08) ще не реалізована: правило
PM «A deactivated employee is not offered as a substitute» у цьому зрізі перевіряти нічим (D9).

## Рішення

**D1 — список замін — окрема таблиця `public.substitute_lists` з RLS (AC-SUBST-01, AC-SUBST-12, AC-SUBST-13).**

| Колонка | Що | Обмеження |
|---|---|---|
| `employee_id uuid` | чий список | `references public.profiles (id) on delete cascade` |
| `substitute_id uuid` | хто може замінювати | `references public.profiles (id) on delete cascade`; `check (substitute_id <> employee_id)` — «An employee cannot be on their own list» |
| `added_by uuid` | хто додав | `default auth.uid()`, `references public.profiles (id) on delete set null` |
| `created_at timestamptz` | коли | `default now()` |

Первинний ключ `(employee_id, substitute_id)` — та сама людина в списку один раз; індекс `(substitute_id)`. Список
належить працівнику, а не посаді (Assumptions PM). Право змінювати — новий хелпер
`private.can_manage_substitutes(p_employee_id uuid)` (`security definer`, `set search_path = ''`, `stable`): роль
`admin`, або роль `manager` і `private.manages_employee(p_employee_id)` — будь-яка посада працівника (матриця прав: «only
employees of own positions»). Окремого винятку для власного списку менеджера немає: PM дає правило «any responsible
manager of any of the employee's positions» без винятків.

Безпека за AGENTS.md: `enable row level security`; `revoke all on table public.substitute_lists from anon,
authenticated`; явні `grant select, delete … to authenticated` і колонковий `grant insert (employee_id, substitute_id)
… to authenticated` (`added_by` ставить `default`, підмінити його не можна); `update` — ні грантом, ні політикою (рядок
лише додають чи прибирають). Політики, кожна `to authenticated` з `(select auth.uid())`:

- `substitute_lists_select_own_managed_or_admin` — `employee_id = (select auth.uid()) or
  private.can_manage_substitutes(employee_id)`;
- `substitute_lists_insert_manager_or_admin` — `with check (private.can_manage_substitutes(employee_id) and added_by =
  (select auth.uid()))`;
- `substitute_lists_delete_manager_or_admin` — `using (private.can_manage_substitutes(employee_id))`.

AC-SUBST-13 («directly, bypassing the portal's pages») — це `insert` через PostgREST: RLS відкидає його з 42501, список
лишається тим самим. Прибирання зі списку записів не змінює (Assumptions PM): `leave_records.substitute_id` не
посилається на список.

**D2 — заміна й підвищення — колонки запису (AC-SUBST-02, AC-SUBST-03, AC-SUBST-08, AC-SUBST-09).** Та сама міграція
додає до `public.leave_records`:

| Колонка | Що | Обмеження |
|---|---|---|
| `substitute_id uuid` | заміна запису; `null` — «No substitute» | `references public.profiles (id)` (без `on delete`: людину, що замінює в записах, не видаляють — її деактивують, вимога 07); `check (substitute_id is distinct from employee_id)` |
| `upgrade_minutes integer` | хвилини позначки «With upgrade»; `null` — позначки немає | `check (upgrade_minutes is null or (substitute_id is not null and upgrade_minutes = minutes))` |

Індекс `leave_records_substitute_date_idx (substitute_id, date) where substitute_id is not null` — для перевірки
зайнятості й «My substitutions». Обмеження `upgrade_minutes = minutes` тримає «The minutes are the record's minutes
inside the schedule, the same as its duration» на рівні бази: функція, що змінює `minutes`, мусить змінити й позначку
(D5). Табличний `grant select` на `leave_records` охоплює нові колонки, а `insert` / `update` в `authenticated` як не
було, так і немає — заміну пишуть лише функції. Назви не перетинаються з колонками зрізу `cancel-approved` (D11).

**D3 — правило підвищення — одне в SQL і TS (AC-SUBST-08, AC-SUBST-09).** Позначка ставиться, коли назва посади
запису (`positions.title` відсутнього) містить «teacher», а назва основної посади заміни (`kind = 'main'`) — «Assistant»
(Assumptions PM). Порівняння — без урахування регістру; «Assistant» — точний збіг після обрізання пробілів, бо PM дає для
неї лише точну назву (власне припущення розробника з `add-substitutes`). SQL: внутрішня
`private.upgrade_applies(p_position_id bigint, p_substitute_id uuid) returns boolean` (без прав для `authenticated`).
TS: `upgradeApplies(positionTitle, substituteMainTitle)` і `upgradeMinutes(...)` у новому `src/lib/leave/substitutes.ts`
— для попереднього перегляду в підсумку заявки; що записано, вирішує база. Позначку фіксуємо в момент подання («The
upgrade mark is set automatically»): пізніша зміна назви посади записаного запису не змінює. AC-SUBST-09: «Math
teacher» у заміни — не «Assistant», позначки немає.

**D4 — зайнятість заміни — в одній транзакції з поданням (AC-SUBST-05, AC-SUBST-06, AC-SUBST-07).** Внутрішня
`private.substitute_conflict(p_person uuid, p_date date, p_start integer, p_end integer, p_exclude_record bigint default
null) returns table (date date, start_min integer, end_min integer)` (`stable`, `set search_path = ''`, без прав для
`authenticated`) повертає перший за часом (`order by start_min, end_min, id`) запис дати, де людина
`employee_id = p_person` (власний запис будь-якої посади) **або** `substitute_id = p_person` (замінює іншого), зі
статусом у тому самому явному списку, що `leave_records_no_overlap` — `('awaiting', 'returned', 'approved')`
(`BLOCKING_STATUSES`, AGENTS.md: змінюються лише разом), і `int4range(start_min, end_min) && int4range(p_start, p_end)`
— «at any minute of the record», межі `[start, end)` як у всіх перетинах порталу (запис, що закінчується о 10:00, і
запис від 10:00 не перетинаються). «Rejected» і «Cancelled» не займають (AC-SUBST-07). `p_exclude_record` — щоб зміна
годин (D5) і майбутня зміна заміни менеджером (вимога 08, AC-BEHALF-08) не порівнювали запис із самим собою: ту саму
функцію вони використають без змін.

Порівнюємо весь проміжок `[start, end)` запису, разом із перервою між блоками розкладу всередині нього: заміна, що в
перерву має власний запис, теж зайнята (власне припущення — PM каже «any minute of the record», а хвилини перерви в
межах запису; кандидат у питання PM, `docs/spec-reading.md` у PR реалізації).

Гонка: двоє одночасно вибирають ту саму заміну, або заміна саме подає власну заявку. Exclusion-обмеження тут не
допоможе (різні працівники й посади), тому функції, що створюють чи змінюють зайнятість людини, беруть
`pg_advisory_xact_lock(hashtextextended('busy:' || <uuid>, 0))` на кожну причетну людину в порядку зростання uuid і лише
після всіх інших своїх lock (календар, працівник): `submit_leave_request` — на себе й на всіх вибраних замін,
`update_leave_record_hours` — на власника й заміну запису. Ключ має префікс `busy:`, тож не збігається з lock
працівника `hashtextextended(uid::text, 0)`; однаковий порядок взяття — без deadlock.

**D5 — `submit_leave_request` і `update_leave_record_hours` — нові тіла без зміни сигнатур (AC-SUBST-02…09,
AC-SUBST-11).** Кожен елемент `p_records` отримує необов'язковий ключ `substitute_id` (uuid або відсутній / `null`);
параметри, їхні типи й тип результату не змінюються, тож expand → contract (AGENTS.md) не потрібен: старий код, що не
передає ключа, працює і до, і після міграції. Нове в тілі `private.submit_leave_request` (решта — дослівно з
`20261113145925_school_calendar_clarifications.sql`):

1. після lock календаря — lock `busy:` на себе й на всі різні `substitute_id` заявки (D4);
2. для кожного прийнятого запису з заміною, після `private.check_record_hours`: заміни немає в
   `substitute_lists (employee_id = v_uid)` → P0001 «This substitute is no longer on your substitute list» (власний
   текст: AC PM немає; так буває, коли менеджер прибрав людину, поки форма була відкрита; email людини поза списком не
   розкриваємо); `private.substitute_conflict(...)` знайшов запис → P0001
   `'<email заміни> is not available at this time: YYYY-MM-DD HH:MM–HH:MM'` (AC-SUBST-05, AC-SUBST-06; формат дати й
   годин — `to_char` і `private.format_minutes`, як у «You already have a request for this time»). Виняток відкочує всю
   заявку — «no request is created»; якщо зайнятими є заміни кількох записів, повідомлення — про перший запис у порядку
   `p_records` (форма шле їх за датою);
3. `insert` запису з `substitute_id` і `upgrade_minutes = case when private.upgrade_applies(...) then v_minutes end`.

`private.update_leave_record_hours` (зміна годин працівником до рішення, AC-DECIDE-21): після нових годин — lock
`busy:` власника й заміни, `private.substitute_conflict(..., p_exclude_record => запис)` для заміни (той самий текст) і
`upgrade_minutes = case when upgrade_minutes is not null then <нові хвилини> end` — інакше обмеження D2 відкине зміну.
Цього правила PM прямо не формулює («any minute of the record» стосується й нових годин) — власне припущення, у
`docs/spec-reading.md`. Повторне подання (`resubmit_leave_record`) зайнятості не змінює: «Returned for revision» уже
займає заміну.

Чого не перевіряємо (Out of scope PM): розклад самої заміни; чи не стане заміна зайнятою пізніше — її власна заявка на
ці години приймається (PM перевіряє лише вибір заміни, кандидат у питання PM).

**D6 — читання для сторінок — функції з мінімумом полів, а не ширша RLS на профілі й записи (AC-SUBST-02, -03, -04,
-08, -10, -11, -12, -15).** Кожна — `private` + `security definer` + `set search_path = ''`, обгортка `public` —
`security invoker` (як `submit_leave_request`); `revoke execute … from public, anon`, `grant execute … to
authenticated`:

| Функція | Повертає | Хто і що |
|---|---|---|
| `my_substitute_options()` | `substitute_id, email, main_title` | власний список (`employee_id = auth.uid()`), за email — вибір у формі (AC-SUBST-04, AC-SUBST-11) |
| `record_substitutes(p_record_ids bigint[])` | `record_id, substitute_email, upgrade_minutes` | лише записи, які `private.can_see_record` дає бачити: власник, менеджер посади, адміністратор (AC-SUBST-02, -03, -08, -09) |
| `my_substitutions()` | `record_id, date, start_min, end_min, status, employee_email, upgrade_minutes` | записи з `substitute_id = auth.uid()` і статусом `('awaiting', 'returned', 'approved')` (AC-SUBST-10, AC-SUBST-15); без типу відсутності й коментарів — заміні вони не потрібні («Sick leave» — чутливі дані) |
| `manageable_employees()` | `employee_id, email, main_title, division_name, substitute_count` | адміністратору — усі профілі, менеджеру — працівники його посад (індекс `/substitutes`) |
| `substitute_list(p_employee_id uuid)` | `substitute_id, email, main_title, division_name` | список працівника, лише коли `private.can_manage_substitutes`; інакше 42501 `Only the manager of this employee's position can change the substitute list` (AC-SUBST-01, AC-SUBST-12) |
| `substitute_candidates(p_employee_id uuid)` | `profile_id, email, main_title, division_name` | усі профілі, крім самого працівника й тих, хто вже в списку; та сама перевірка і 42501 |

Чому не політика на `profiles` чи `leave_records`: ширший `select` віддав би заміні тип, коментарі й решту полів
чужого запису, а працівнику — email усіх колег. `decision_records()` і view `my_leave_records` не змінюємо (expand →
contract для типу результату, який читає код): заміну й позначку сторінки беруть окремим викликом
`record_substitutes` за `id` показаних записів.

**D7 — сторінки й дії (AC-SUBST-01…04, AC-SUBST-08, AC-SUBST-10…15).**

- `/substitutes` (менеджер і адміністратор; пункт меню «Substitutes» поруч із «Register», лише `deciders`):
  `manageable_employees()` — таблиця працівників (email, основна посада й підрозділ, кількість замін), рядок — посилання
  на редактор. Для ролі `employee` за прямим посиланням — `EmptyState` з текстом AC-SUBST-12 (сторінка перевіряє роль із
  `profiles.role`, а функція й так нічого не поверне).
- `/substitutes/[employeeId]` — редактор списку: `substitute_list` + `substitute_candidates`; 42501 → лише `EmptyState`
  з текстом AC-SUBST-12, без імен і без форми (AC-SUBST-12). Server actions `addSubstitute` / `removeSubstitute` у
  `src/app/(app)/substitutes/actions.ts`: `getClaims()`, `insert` / `delete` у `substitute_lists` під RLS (одна
  операція — одна транзакція, RPC не потрібен); 42501 від RLS → той самий текст AC-SUBST-12, список не змінено
  (AC-SUBST-13 — та сама база); дубль (23505) — «This person is already on the list» (власний текст);
  `revalidatePath`.
- Нова заявка (`src/app/(app)/requests/new/**`): `page.tsx` читає `my_substitute_options()`; крок «Positions & hours» —
  поле «Substitute» на кожній картці посади й дати (`PositionChoice.substituteId` у `src/lib/leave/draft.ts`, «No
  substitute» — за замовчуванням); порожній список — замість полів одне повідомлення «Your manager has not added
  substitutes for you yet», заявка подається з «No substitute» (AC-SUBST-11); підсумок — колонка «Substitute» і
  попередній перегляд «With upgrade: N min» (D3). `submitLeaveRequest` перевіряє, що кожен вибраний `substitute_id` є в
  `my_substitute_options()` (інакше текст D5), і передає його в `toRpcRecords`; P0001 бази (зайнятість, AC-SUBST-05,
  AC-SUBST-06) — дослівно в `Alert` над підсумком, введене лишається.
- «My requests» і «View details»: заміна й позначка запису під годинами (`record_substitutes`).
- «Decisions»: рядок черги й панель запису `Sheet` — заміна й позначка (`record_substitutes` для показаних `id`;
  AC-SUBST-02, AC-SUBST-03).
- `/substitutions` — «My substitutions» для всіх ролей (пункт меню після «My requests»): `my_substitutions()`, таблиця
  дата, години, працівник, статус (AC-SUBST-10), порожньо — `EmptyState` «You are not covering for anyone»
  (AC-SUBST-15). Гість — `src/proxy.ts` веде на `/login` до рендеру, і сторінка ще раз перевіряє `getClaims()`
  (AC-SUBST-14).

**D8 — вигляд кожного нового стану за `DESIGN.md` (AC-SUBST-01…04, AC-SUBST-08, AC-SUBST-10…12, AC-SUBST-15).** Лише
компоненти `@/components/ui`, кольори — токени; нових токенів немає. Новий доменний компонент
`src/components/ui/substitute-note.tsx` (`SubstituteNote`): іконка `lucide-react` `UserRound` і «Substitute:
<email>» або «No substitute» (`text-xs text-muted-foreground`, email — `text-foreground`), за потреби поруч позначка
підвищення. Перед сторінками — приклади на вітрині `/design`.

| Стан | Де | Компонент і варіант |
|---|---|---|
| заміна запису / «No substitute» (AC-SUBST-02, AC-SUBST-03) | «My requests» (рядок, картка телефона, «View details»), «Decisions» (рядок черги, `Sheet` — розділ запису під `RecordDay`) | `SubstituteNote`; у `Sheet` — рядок `Detail` «Substitute» |
| позначка «With upgrade: 210 min» (AC-SUBST-08) | там само й у підсумку заявки | `Badge variant="secondary"` з іконкою `ArrowUpRight`, текст дослівно; немає позначки — нічого не показуємо (AC-SUBST-09) |
| поле «Substitute» (AC-SUBST-02, AC-SUBST-04) | картка посади в кроці «Positions & hours» | `Label` «Substitute» + `Select` (`SelectTrigger` на всю ширину, на дотику 44 px; перший пункт «No substitute», далі email і основна посада `text-muted-foreground`); вимкнена картка (посаду не включено) — поле `disabled` |
| порожній список (AC-SUBST-11) | крок «Positions & hours», над картками | `Alert variant="info"` з `Info`, текст дослівно «Your manager has not added substitutes for you yet»; полів вибору немає |
| зайнята заміна (AC-SUBST-05, AC-SUBST-06) | підсумок заявки | наявний `Alert variant="destructive"` (`role="alert"`) з текстом бази дослівно |
| колонка «Substitute» у підсумку | крок «Summary» | колонка `Table stack` з `SubstituteNote`; позначка — `Badge` поруч |
| «My substitutions» (AC-SUBST-10) | `/substitutions` | `PageHeader` «My substitutions» з описом «Records where you cover for someone»; `Table stack`: дата (`Tue, 2 Dec 2026`), години (`08:30–15:30`, `tabular-nums`, без переносу), працівник (email), статус `StatusBadge`, позначка `Badge`; групування за місяцем, як у «My requests»; без «⋯» (дій немає) |
| немає замін (AC-SUBST-15) | `/substitutions` | `EmptyState` з іконкою `UserRound` у колі `accent`, текст дослівно «You are not covering for anyone», без дії |
| список працівників | `/substitutes` | `PageHeader` «Substitutes»; `Table stack`: email, посада й підрозділ, «2 substitutes»; рядок — посилання, праворуч стрілка `ChevronRight` (як черга «Decisions»); порожньо — `EmptyState` «No employees in your positions» (власний текст) |
| редактор списку (AC-SUBST-01) | `/substitutes/[employeeId]` | `PageHeader` з email працівника й посиланням «Back to substitutes» (`buttonVariants({ variant: "outline" })`); `Card` «Substitute list»: `Table stack` (email, посада, `RowMenu` «⋯» з одним пунктом «Remove from list» `destructive` — прибирання оборотне, тому без `Dialog`); порожньо — `EmptyState` «No substitutes yet» (власний текст); `Card` «Add a substitute»: `Label` + `Select` кандидатів і `SubmitButton` `default` «Add to list» («Adding…»); успіх — `Alert` `info` «<email> added» над списком, новий рядок спалахує `highlight` |
| відмова (AC-SUBST-12, AC-SUBST-13 на сторінці) | `/substitutes`, `/substitutes/[employeeId]` | `EmptyState` з іконкою `ShieldX` у колі `accent`, текст дослівно «Only the manager of this employee's position can change the substitute list», одна дія «Go to Overview»; жодних імен і email |
| пункти меню | `AppNav` | «My substitutions» (`UserRoundCheck`), «Substitutes» (`UsersRound`, лише manager і admin); згорнута панель — `Tooltip`, як решта |
| завантаження | `/substitutions`, `/substitutes/**` | `loading.tsx` зі `Skeleton` у формі таблиці |

Телефон (360 і 390 px, DESIGN.md розділ 12): таблиці — картки `Table stack` (дата й години, працівник, статус словом,
позначка під ним); у редакторі — «⋯» у кожній картці, форма додавання під списком, `SubmitButton` на всю ширину;
`Select` у картці посади — на всю ширину картки, шрифт 16 px на дотику; `Alert` порожнього списку — над картками кроку.
Темна тема — лише токени (`secondary`, `muted-foreground`, `accent`), без власних значень. Знімки світлої й темної
теми на 390 і 1280 px — у `docs/img/` (D10).

**D9 — тестові дані й деактивація (AC-SUBST-01…15).** Міграція додає до `private.test_positions` /
`test_schedule_blocks` / `test_position_managers` і `supabase/demo-users.json`: `assistant1@example.test` — основна
посада «Elementary school / Assistant» (Assumptions PM), `teacher3@example.test` — «Elementary school / Teacher»; обидва
Mon–Fri 08:30–15:30, менеджер `manager1@`; і викликає `private.apply_test_assignments()` для вже створених профілів.
Розбіжність із демоданими: у них `teacher1@` має додаткову посаду «High school / Math teacher» з менеджером
`manager2@`, а `teacher2@` — основну «High school / Teacher»; AC-SUBST-13 і AC-SUBST-09 кажуть інакше. Тож тести
PGlite у своїй підготовці приводять дані до «Given» AC (прибирають `manager2@` з посад `teacher1@`, перейменовують
посаду `teacher2@` на «Math teacher»), а демодані не змінюємо, щоб не зламати AC інших зрізів. Деактивацію (вимога 07)
ще не реалізовано: коли вона з'явиться, `my_substitute_options`, `substitute_candidates` і перевірка в
`submit_leave_request` відкинуть деактивованих в одному місці — це рядок у плані зрізу `staff-management`, не тут.

**D10 — тести (AC-SUBST-01…15).**

| AC | Тест | Рівень |
|---|---|---|
| AC-SUBST-01 | `tests/db/substitutes.test.ts` — manager1@ додає двох, `select` списку = рівно ці двоє; власний email у власний список — відмова обмеження. `tests/e2e/substitutes.spec.ts` — редактор: дві «Add to list», у таблиці рівно двоє | PGlite + e2e |
| AC-SUBST-02 | PGlite — запис 2026-12-02 08:30–15:30 `awaiting` із `substitute_id`; manager1@ через `record_substitutes` бачить email. e2e — заявка з заміною, у «Decisions» «Substitute: …» | PGlite + e2e |
| AC-SUBST-03 | PGlite — без ключа `substitute_id` запис без заміни; unit `src/lib/leave/substitutes.test.ts` — `substituteLabel(null)` = «No substitute»; e2e — «No substitute» у «My requests» і «Decisions» | PGlite + unit + e2e |
| AC-SUBST-04 | PGlite — `my_substitute_options()` = рівно assistant1@, teacher2@; `submit_leave_request` із teacher3@ → текст D5. e2e — пункти `Select` | PGlite + e2e |
| AC-SUBST-05 | PGlite — власний запис assistant1@ 09:00–11:00 `awaiting` → P0001 з текстом AC, `leave_requests` без нового рядка. e2e — `Alert` у підсумку з текстом AC, у «My requests» запису немає | PGlite + e2e |
| AC-SUBST-06 | PGlite — assistant1@ заміна в `approved` записі teacher2@ 10:00–12:00 → текст AC; ще — перший за часом із двох; зміна годин (D5) | PGlite |
| AC-SUBST-07 | PGlite — єдиний запис assistant1@ `rejected` (і окремо `cancelled`) → запис створено із заміною; межа `[start, end)` | PGlite |
| AC-SUBST-08 | PGlite — `upgrade_minutes = 210`; unit `upgradeApplies` / `upgradeMinutes` (регістр, «Math teacher», « Assistant »); e2e — «With upgrade: 210 min» | PGlite + unit + e2e |
| AC-SUBST-09 | PGlite — заміна з основною «Math teacher» → `upgrade_minutes is null`; unit | PGlite + unit |
| AC-SUBST-10 | PGlite — `my_substitutions()` assistant1@ = 1 рядок (дата, години, email teacher1@, `awaiting`), без типу. e2e — один рядок на `/substitutions` | PGlite + e2e |
| AC-SUBST-11 | unit (`src/lib/leave/substitutes.ts`, вибір стану поля) + e2e — `Alert` з текстом AC і подання з «No substitute» | unit + e2e |
| AC-SUBST-12 | PGlite — teacher1@ `insert` / `delete` у список teacher2@ → 42501, `substitute_list(teacher2)` → 42501 з текстом; e2e — `/substitutes/<id>` показує текст AC, без email | PGlite + e2e |
| AC-SUBST-13 | PGlite — manager2@ (не менеджер жодної посади teacher1@) `insert` teacher3@ напряму → 42501, список = рівно двоє; e2e `tests/e2e/negative-controls.spec.ts` — запит PostgREST з сесією manager2@ | PGlite + e2e |
| AC-SUBST-14 | e2e — гість на `/substitutions` → сторінка входу, у DOM немає email і дат | e2e |
| AC-SUBST-15 | PGlite — лише `rejected` / `cancelled` → `my_substitutions()` порожньо; e2e — `EmptyState` з текстом AC | PGlite + e2e |

Ще без AC ID: `tests/db/table-visibility.test.ts` — `anon` нічого не бачить у `substitute_lists`, працівник не робить
`update` і не підмінює `added_by`; `tests/db/schema-version.test.ts` лишається зеленим (нових `security definer` у
`public` немає). Знімки станів D8 — `tests/e2e/substitutes-screenshots.spec.ts` (без AC ID, як інші `*-screenshots`):
поле вибору, порожній список, зайнята заміна, підсумок із позначкою, «My substitutions» і порожня, редактор і відмова —
світла й темна теми, 390 і 1280 px; телефон — `tests/e2e/substitutes.mobile.spec.ts` (проєкт `mobile`). Дані e2e —
синтетичні працівники (`createUatEmployee`), список — через `adminClient()`; дати — від `kyivDate(new Date())`, а не
сталими рядками AC. SQL-мутанти `scripts/mutants.mjs` для D4 (набір статусів, `&&` замість `-|-`, `p_exclude_record`) і
D3 (`ilike '%teacher%'`), `npm run mutation:sql`.

**D11 — порядок викатки й сумісність (AC-SUBST-02, AC-SUBST-03, AC-SUBST-10; AGENTS.md, «Код і схема виходять на прод не разом»).** Одна міграція
`npx supabase migration new substitutes`, з міткою, новішою за міграцію `cancel_approved` (реалізується раніше;
`node scripts/check-migration-order.mjs`). Вона лише додає таблицю, дві колонки, обмеження, функції й тестові дані та
замінює тіла двох функцій без зміни сигнатур; жоден наявний view і тип результату RPC не змінюється — expand → contract
не потрібен, тож код і міграція — в одному PR, міграція першим комітом. Код, що вийде до `db-deploy`: виклики
`my_substitute_options` / `record_substitutes` / `my_substitutions` падають (функцій ще немає) → форма не показує
поля «Substitute» (і не шле `substitute_id`, тож стара функція нічого мовчки не загубить), «My requests» і «Decisions»
показують записи без рядка заміни, нові сторінки — «The page could not be loaded. Please try again.»; smoke
(`scripts/smoke.mjs`) чекає `db-deploy`. Сумісність із `cancel-approved`: його колонки `cancel_*` і наші
`substitute_id`, `upgrade_minutes` не перетинаються; він не змінює `submit_leave_request` і
`update_leave_record_hours`, а ми — `leave_record_events_action_check` і його функції. `database.types.ts` — із Summary
`db-check`.

## Ризики

- Прибирання e2e: `leave_records.substitute_id` без `on delete`, тож синтетичну заміну видаляємо після записів, де вона
  заміна (спершу відсутній працівник — його записи йдуть каскадом). `cleanupRemembered` отримує цей порядок.
- Підсумок «Your request» з десятками записів і полем на кожному — довгий; якщо це заважатиме, наступний крок — «Same
  substitute for all records» (не в цьому плані: AC про нього немає).
- Реєстр погоджених `/register` (ініціатива розробника, ADR 0012) — природне місце для бухгалтерії; колонки «Substitute» і
  «Upgrade, min» там змінили б тип результату його функції — окремим PR за expand → contract, якщо PM попросить.
