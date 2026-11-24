# Design: скасування погодженого запису через менеджера

## Контекст

На чому будуємо (стан `main` на d882a69):

- Статуси запису — `leave_records.status` (`awaiting`, `approved`, `rejected`, `returned`, `cancelled`); блокують
  лише `awaiting`, `returned`, `approved` (`leave_records_no_overlap`, `BLOCKING_STATUSES`, `add_school_closure`).
- Рішення менеджера пише лише `private.decide_leave_record` (`20261117083144_decide_calendar_lock.sql`): право
  (адміністратор — будь-який запис; менеджер — посади з `position_managers`, крім власних), lock працівника, потім
  спільний lock календаря; подія в `leave_record_events`. Працівник сам скасовує лише запис до рішення
  (`private.cancel_leave_record`, `20261021171135_leave_record_edit.sql`).
- Залишок: `private.used_hundredths` / `remaining_hundredths` і `get_balance_inputs` → `computeBalances`
  (`src/lib/leave/balance.ts`) рахують лише `status = 'approved'`: без розподілу — зафіксована `day_share`
  (тригер `private.fix_day_share` обнуляє її, щойно статус не `approved`), з розподілом (AC-BALANCE-10) — `paid_days`
  у своєму типі й `unpaid_days` в «Unpaid leave».
- «Decisions» читає `public.decision_records()` (імена, посада, `can_decide`); «My requests» — view
  `public.my_leave_records`; історія — `public.record_histories` і `historyLine` (`src/lib/leave/decision.ts`).
- Дата «сьогодні» за Києвом — `private.kyiv_day(now())` у базі (`20261118083501_ai_quota.sql`) і `kyivDate(new Date())`
  у TS (`src/lib/leave/time.ts`).

Заступники (вимога 07, AC-STAFF-09, -10) ще не реалізовані: у цьому зрізі прохання вирішують лише відповідальні
менеджери посади й адміністратор. Перевірку права винесено в одну внутрішню функцію (D4), тож зріз заступників
змінить її в одному місці.

## Рішення

**D1 — прохання про скасування — колонки запису, а не новий статус (AC-CANCEL-01, -03, -06, -08).**
Нова міграція додає до `public.leave_records`:

| Колонка | Що | Обмеження |
|---|---|---|
| `cancel_reason text` | причина відкритого прохання працівника; `not null` ⇔ позначка «Cancellation requested» | `char_length ≤ 500`; `cancel_reason is null or status = 'approved'` |
| `cancel_declined_comment text` | коментар останнього відхилення — «Cancellation declined: …» | `≤ 500`; `is null or status = 'approved'` |
| `cancel_note text` | примітка менеджера, що скасував запис сам | `≤ 500`; `is null or status = 'cancelled'` |

Чому так: «Cancellation requested» у PM — позначка на записі «Approved», а не статус (AC-CANCEL-01, Assumptions: «still
counts as "Approved"… for overlaps, … for closing a day»). Тож набір статусів, `BLOCKING_STATUSES`,
`leave_records_no_overlap`, залишок і `add_school_closure` не змінюються взагалі — правило AGENTS.md про фільтри
статусів не зачеплено. Одна колонка — одне відкрите прохання на запис за побудовою (AC-CANCEL-06 «there is still one
request»); окрема таблиця прохань дала б ще одну RLS-поверхню без потреби: уся історія прохань — у
`leave_record_events` (D2). Нової таблиці немає, тому RLS, `revoke` і політики лишаються наявні: `authenticated` має
лише `select` на `leave_records` (табличний `grant select` охоплює й нові колонки) під політикою
`leave_records_select_own_managed_or_admin`; `insert` / `update` / `delete` — ні, колонки пишуть лише функції D3–D5.
`tests/db/table-visibility.test.ts` доповнюємо: працівник не може `update` нові колонки напряму.

**D2 — історія (Assumptions PM: «the request, the decision and who made them, to the minute»; AC-CANCEL-01, -02, -03,
-08).** `leave_record_events_action_check` перестворюємо з двома новими діями: `cancellation_requested` (коментар —
причина) і `cancellation_declined` (коментар — коментар менеджера). Підтвердження і скасування менеджером — наявна дія
`cancelled`, `actor_id` — менеджер (у скасування з приміткою коментар — примітка). `HISTORY_ACTIONS`: «Cancellation
requested», «Cancellation declined»; `historyLine` уже дає дату й час до хвилини за Києвом і ім'я.

**D3 — `request_record_cancellation(p_record_id bigint, p_reason text) returns void` (AC-CANCEL-01, -05, -06, -10).**
`private` + `security definer` + `set search_path = ''`, обгортка `public` — `security invoker`; `revoke … from
public, anon`, `grant execute … to authenticated` (як `decide_leave_record`). Перевірки по черзі, тексти — P0001,
доступ — 42501:

1. немає `auth.uid()` → 42501 «Not signed in»;
2. `select … for update` запису з `employee_id = auth.uid()`; немає (чужий чи неіснуючий — однаково) → 42501
   "You can cancel only your own records" (AC-CANCEL-10);
3. статус не `approved` → «Only an approved record can be cancelled through the manager» (власний текст: AC PM немає;
   запис до рішення працівник скасовує сам, AC-DECIDE-13);
4. `date < private.kyiv_day(now())` → "Records in the past cannot be cancelled" (AC-CANCEL-05; «today or later» за
   Києвом, Assumptions);
5. `cancel_reason is not null` → "Cancellation has already been requested" (AC-CANCEL-06);
6. причина після обрізання крайових пробілів порожня → «Tell the manager why you want to cancel the record» (власний
   текст: PM у головному сценарії каже «gives a reason», а AC без причини немає — кандидат у питання PM записуємо в
   `docs/spec-reading.md` у PR реалізації); > 500 → «The comment can be at most 500 characters» (наявний текст);
7. `update … set cancel_reason = v_reason, cancel_declined_comment = null where id = … and status = 'approved' and
   cancel_reason is null` (запис уже заблоковано рядком, умова — запобіжник) і подія `cancellation_requested`.

**D4 — `decide_record_cancellation(p_record_id bigint, p_decision text, p_comment text default null) returns text`
(AC-CANCEL-02, -03, -04, -07, -11).** Ті самі правила оформлення, що в D3. `p_decision` — `'confirm' | 'decline'`.

1. немає `auth.uid()` → 42501;
2. право — внутрішня `private.cancellation_actor_error(r leave_records)` (спільна для D4 і D5; без прав для
   `authenticated`): запис не існує або роль не `admin` і не (`manager` + `private.manages_position`) → 42501
   «You can't decide on this record» (той самий текст і код, що AC-DECIDE-08; AC-CANCEL-11 вимагає лише, щоб нічого не
   змінилось); менеджер і власний запис → «Your own record is decided by an administrator» (Assumptions PM,
   AC-DECIDE-18);
3. невідоме рішення → 22023;
4. `pg_advisory_xact_lock` працівника (той самий ключ і порядок, що `decide_leave_record`: погодження з розподілом
   іншого запису не порахує залишок, поки цей запис скасовують), потім `select … for update` рядка;
5. статус `cancelled` → «This record is already cancelled»; `approved` без `cancel_reason` → «There is no cancellation
   request for this record» (власні тексти; так само відповідає другий менеджер, що вирішує одночасно);
6. відхилення: коментар порожній → "Tell the employee why the cancellation is declined" (AC-CANCEL-04); > 500 —
   наявний текст;
7. підтвердження: `status = 'cancelled'`, `cancel_reason = null`, `cancel_declined_comment = null`, `paid_days = null`,
   `unpaid_days = null` (тригер обнулить `day_share`), подія `cancelled`; відхилення: `cancel_reason = null`,
   `cancel_declined_comment = коментар`, статус лишається `approved`, подія `cancellation_declined`.

Дата запису для підтвердження не перевіряється: прохання подано вчасно (D3, крок 4), а відмова лише через те, що
менеджер не встиг, лишила б працівнику списані дні — власне припущення, у `docs/spec-reading.md` кандидатом у питання.

**D5 — `cancel_approved_record(p_record_id bigint, p_note text) returns void` (AC-CANCEL-08, -09).** Право — та сама
`private.cancellation_actor_error` (менеджер власного запису — ні, як у D4); lock працівника й рядка; статус
`cancelled` → «This record is already cancelled»; не `approved` → «Only an approved record can be cancelled with a
note» (власний текст); `date < kyiv_day(now())` → "Records in the past cannot be cancelled" (Out of scope PM: минуле
виправляє адміністратор поза зрізом); примітка порожня → "Tell the employee why the record is cancelled" (AC-CANCEL-09);
> 500 — наявний текст. Запис: `status = 'cancelled'`, `cancel_note = примітка`, `cancel_reason = null`,
`cancel_declined_comment = null`, `paid_days = null`, `unpaid_days = null`; подія `cancelled` з приміткою. Відкрите
прохання цим теж закривається (менеджер скасовує з приміткою замість підтвердження).

**D6 — залишок без нового коду (AC-CANCEL-02, -07).** Усі читачі залишку рахують лише `status = 'approved'`, тож
«Cancelled» повертає дні в навчальний рік дати запису (Assumptions), обидві частини розподілу: `paid_days` у «Personal
leave» і `unpaid_days` в «Unpaid leave» (вони приходять у `splits` лише для погоджених). Запис із «Cancellation
requested» лишається `approved` і далі списаний (Assumptions). Обнулення `paid_days` / `unpaid_days` у D4–D5 — щоб
скасований запис мав ту саму форму, що скасований до рішення, і жоден майбутній читач не врахував його частку.

**D7 — шкільний календар (AC-CANCEL-13; AC-CAL-07, AC-CAL-08).** `add_school_closure` не змінюється: «Cancelled» не
блокує закриття, `approved` із позначкою — блокує. Тести PGlite перевіряють обидва боки.

**D8 — доменні функції TS (усі AC зрізу).** Новий `src/lib/leave/cancellation.ts`: `CANCELLATION_MESSAGES` (тексти AC
і власні тексти D3–D5 — ті самі рядки, що в базі), `cancellationRequestCheck(record, today, reason)`,
`cancellationDecisionCheck(actor, target, decision, comment)`, `managerCancelCheck(actor, target, today, note)` — та
сама черга перевірок, що в D3–D5, для повідомлень і кнопок; `canRequestCancellation(record, today)` — пункт меню;
`cancellationMark(record)` → `{ kind: "requested" | "declined" | "note"; text }` для показу. База — другий рубіж.

**D9 — пряме посилання `/requests/[id]/cancel` (AC-CANCEL-01, -05, -06, -10, -12).** Серверна сторінка: без входу —
`redirect("/login")` (`getClaims`, і `src/proxy.ts` уже веде гостя на вхід — AC-CANCEL-12, жодних даних запису до
перевірки); запис читаємо з `leave_records` з `employee_id = sub`. Немає власного: менеджер чи адміністратор, якому RLS
показує запис, — `redirect("/decisions?tab=history&record=<id>")` (там скасування з приміткою, D11); решта —
`EmptyState` "You can cancel only your own records" з посиланням «Go to My requests» (AC-CANCEL-10), без даних запису.
Власний запис, який не можна скасувати (минуле, прохання вже є, не «Approved»), — `Alert` `destructive` з текстом D3 і
без форми (AC-CANCEL-05, -06). Інакше — форма; server action `requestCancellation` перевіряє D8, кличе rpc, відповідь
P0001 показує дослівно, 42501 — текст AC-CANCEL-10; після успіху — `redirect("/requests?status=approved&record=<id>&cancellation=requested")`.

**D10 — «My requests» (AC-CANCEL-01, -03, -08).** `my_leave_records` не змінюємо (порядок викатки, D13): нові колонки
читаємо окремим запитом `leave_records.select("id, cancel_reason, cancel_declined_comment, cancel_note")` власних
записів; помилка — без позначок, сторінка працює. Пункт меню рядка «Request cancellation» — коли
`canRequestCancellation`. Запис лишається у вкладці «Approved», поки статус `approved`.

**D11 — «Decisions» (AC-CANCEL-01…04, -08, -09; AC-DECIDE-01, -14).** `decision_records()` не змінюємо (AGENTS.md,
expand → contract: тип результату RPC, яку кличе код, не міняємо): окремий запит
`leave_records.select("id, cancel_reason").not("cancel_reason", "is", null)` (RLS — посади менеджера, адміністратору —
усі) і злиття за `id`. Черга «Awaiting decision» = рядки `awaiting` ∪ рядки `approved` з відкритим проханням, у тому
самому порядку (дата, час); порожньо лише коли немає ні тих, ні других (AC-DECIDE-14). Лічильник меню в
`src/app/(app)/layout.tsx` додає прохання, які користувач може вирішити (менеджеру — без власних записів). Server
actions `decideCancellation` і `cancelRecord` у `src/app/(app)/decisions/actions.ts` — як `decideRecord`: D8, rpc,
P0001 дослівно, 42501 — «You can't decide on this record». Після рішення — наступний запис черги (`afterDecision`),
над списком `Alert` `info` («The record is now Cancelled» / «Cancellation declined»).

**D12 — вигляд кожного нового стану за `DESIGN.md` (усі AC з UI).** Лише компоненти `@/components/ui`, кольори —
токени; нових токенів і компонентів-кольорів немає. Перед сторінками — приклади на вітрині `/design`.

| Стан | Де | Компонент і варіант |
|---|---|---|
| позначка «Cancellation requested» (AC-CANCEL-01, -04, -11) | «My requests» (рядок і картка телефона), «Decisions» (рядок черги і шапка `Sheet`) | `StatusBadge status="approved"` («Approved» словом із крапкою) і поруч `Badge variant="outline"` з іконкою `lucide-react` `Clock` і словом «Cancellation requested» — тег без заливки, не новий статус |
| «Cancellation requested: Plans changed» (AC-CANCEL-01) | панель запису `Sheet` у «Decisions», розділ «Cancellation request» | рядок `Detail` (як «Employee’s comment»), текст дослівно з AC |
| «Cancellation declined: Exam week» (AC-CANCEL-03) | «My requests», під статусом; «View details» | рядок `text-xs text-muted-foreground` під `StatusBadge`, як «Manager: “…”» (DESIGN.md, Do: причина під статусом) |
| примітка менеджера «Event moved to January» (AC-CANCEL-08) | «My requests», під статусом «Cancelled»; «View details» | той самий рядок під `StatusBadge status="cancelled"`: «Manager: “Event moved to January”»; коментар погодження лишається в історії |
| форма прохання (AC-CANCEL-01) | `/requests/[id]/cancel` | `PageHeader` «Request cancellation»; `Card` з `RecordSummary`; `Label` «Reason» + `Textarea` (до 500, лічильник `text-xs text-muted-foreground`); `SubmitButton` `default` «Request cancellation» («Requesting…»), посилання «Back» — `buttonVariants({ variant: "outline" })`. Прохання не незворотне (менеджер вирішує), тому без `Dialog` |
| помилки AC-CANCEL-05, -06 | та сама сторінка | `Alert variant="destructive"` над формою (`role="alert"`), текст дослівно; форма не показується |
| AC-CANCEL-10 | та сама сторінка | `EmptyState` з іконкою `ShieldX` у колі `accent`, текст дослівно, одна дія «Go to My requests» |
| успіх прохання | «My requests» | `Alert variant="info"` з `CircleCheck` «Cancellation requested» над списком; рядок спалахує `highlight` раз |
| пункт «Request cancellation» | «My requests» | пункт `RowMenu` «⋯» рядка (посилання), не окрема кнопка |
| підтвердження (AC-CANCEL-02, -07) | смуга дій `Sheet` | `Button variant="default"` «Confirm cancellation» праворуч (одна основна дія) → `Dialog`: заголовок «Confirm the cancellation?», `RecordSummary`, одне речення «The record becomes Cancelled and its days return to the balance.», `Button variant="destructive"` «Confirm cancellation» і «Back» |
| відхилення (AC-CANCEL-03, -04) | смуга дій `Sheet` | `Button variant="ghost"` з текстом `text-destructive` «Decline cancellation» ліворуч; поле `Label` «Comment for the employee» + `Textarea`, сховане, як у «Return for revision», і відкривається саме, коли натиснуто без коментаря; помилка AC-CANCEL-04 — `FieldError` під полем, межа `destructive`, `aria-describedby` |
| скасування менеджером (AC-CANCEL-08, -09) | `Sheet` погодженого запису з датою сьогодні чи пізніше | `Button variant="ghost"` `text-destructive` «Cancel record» → `Dialog`: «Cancel this record?», `RecordSummary`, `Label` «Note for the employee» + `Textarea`, `FieldError` з текстом AC-CANCEL-09, `Button variant="destructive"` «Cancel record» і «Back» |
| відмова AC-CANCEL-11 на сторінці | `/decisions?record=…` чужої посади | наявний `EmptyState` «You can't decide on this record» |

Телефон (360 і 390 px, DESIGN.md розділ 12): у картці запису «My requests» позначка й рядки під статусом — під
статусом, «⋯» лишається; `Sheet` — на весь екран, смуга дій прикріплена внизу з `env(safe-area-inset-bottom)`:
«Decline cancellation» і «Cancel record» — у два стовпці, «Confirm cancellation» — на всю ширину під ними; на сторінці
`/requests/[id]/cancel` кнопка «Request cancellation» прикріплена внизу, `Textarea` — 16 px на дотику. Темна тема —
лише токени (`outline` бере `border-border` і `text-foreground`), без власних значень; знімки світлої й темної теми
на 390 і 1280 px — у `docs/img/`.

**D13 — порядок викатки (AGENTS.md, «Код і схема виходять на прод не разом»).** Міграція лише додає колонки, обмеження,
дві дії історії й три нові функції; жодна наявна сигнатура RPC і жоден наявний view не змінюються, тож expand →
contract не потрібен. Код, що вийде до `db-deploy`: окремі запити нових колонок падають (колонки ще немає) — сторінки
показують записи без позначок; дії скасування відповідають «The change could not be saved. Please try again.». Тому
один PR реалізації з міграцією першим комітом. `database.types.ts` — з Summary `db-check`.

## Тести

| AC | Рівень | Як доводимо |
|---|---|---|
| AC-CANCEL-01 | PGlite `tests/db/leave-cancellation.test.ts` | власний `approved` запис на `kyiv_day(now()) + 9` → `cancel_reason = 'Plans changed'`, статус `approved`, подія `cancellation_requested` з actor; менеджер бачить рядок через `decision_records` і `cancel_reason` |
| AC-CANCEL-01 | unit `src/lib/leave/cancellation.test.ts`, e2e `tests/e2e/cancel-approved.spec.ts` | `cancellationMark`; працівник через меню «⋯» → форма → позначка в «My requests»; менеджер бачить «Cancellation requested: Plans changed» у «Awaiting decision» |
| AC-CANCEL-02 | PGlite + e2e | підтвердження → `cancelled`; `get_balance_inputs` → `computeBalances`: used 3.00 → 2.00, remaining 15.00 → 16.00; e2e — картка «Personal leave» на /balances |
| AC-CANCEL-03 | PGlite + e2e | відхилення «Exam week» → `approved`, `cancel_reason` null, `cancel_declined_comment`; у «My requests» «Cancellation declined: Exam week» |
| AC-CANCEL-04 | PGlite + unit + e2e | без коментаря → P0001 з текстом AC, `cancel_reason` не змінено; у панелі `FieldError` |
| AC-CANCEL-05 | PGlite + unit + e2e | запис на `kyiv_day(now()) - 4` → текст AC, без `cancel_reason`; сторінка показує `Alert` |
| AC-CANCEL-06 | PGlite + unit | друге прохання → текст AC, одна подія `cancellation_requested` |
| AC-CANCEL-07 | PGlite | цілий день із розподілом 0.50 + 0.50 (погодження `decide_leave_record` з `p_split`) → підтвердження → used «Personal leave» −0.50 і «Unpaid leave» −0.50 |
| AC-CANCEL-08 | PGlite + e2e | `cancel_approved_record` з приміткою → `cancelled`, `cancel_note`; у «My requests» «Manager: “Event moved to January”» |
| AC-CANCEL-09 | PGlite + unit + e2e | без примітки → текст AC, статус `approved`; у `Dialog` `FieldError` |
| AC-CANCEL-10 | PGlite + e2e | teacher2 → rpc 42501 з текстом AC; `/requests/<id>/cancel` показує текст AC, без даних запису; запис без прохання |
| AC-CANCEL-11 | PGlite | manager2 (не менеджер посади) кличе `decide_record_cancellation` напряму → 42501; статус, `cancel_reason` і `get_balance_inputs` без змін; ще — менеджер власного запису |
| AC-CANCEL-12 | e2e | гість на `/requests/<id>/cancel` → сторінка входу, у DOM немає дати запису |
| AC-CANCEL-13 | PGlite (+ AC-CAL-07) | після підтвердження `add_school_closure('whole_days', 'Staff day', …)` зберігає закриття; поки прохання відкрите — відмова з текстом AC-CAL-07 |

Знімки станів D12 — `tests/e2e/cancel-approved-screenshots.spec.ts` (без AC ID, як інші `*-screenshots`): позначка,
«Cancellation declined», примітка, форма й помилки, `Sheet` з проханням, обидва `Dialog`, у світлій і темній темі, 390
і 1280 px; телефон — ще й `tests/e2e/cancel-approved.mobile.spec.ts` (проєкт `mobile`). Дані e2e — синтетичний
працівник (`createUatEmployee`) і `addRecord` зі статусом `approved` на дати після сьогодні (і одна в минулому для
AC-CANCEL-05); прибирає `cleanupRemembered`.

## Ризики

- Дата «сьогодні» в e2e — справжня (листопад–грудень 2026): дати записів рахуємо від `kyivDate(new Date())`, а не
  сталими рядками AC.
- Підтвердження прохання на запис, дата якого вже минула, дозволене (D4) — якщо PM вирішить інакше, змінюється одна
  перевірка в D4 і D8.
- Заступники (вимога 07) змінять лише `private.cancellation_actor_error` і D8.
