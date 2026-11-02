# QA proof pack: зріз 1 — заявка на відсутність і залишки

<!--
Шаблон з koldovsky/2026-quitcode-08-quality-hw/materials/templates/proof-pack.template.md.
Заповнюємо по кроках WS8 (A → B → C → D). Посилання — на файли на коміті (…/blob/<sha>/…#L<N>), на PR (…/pull/N) і на
прогони (…/actions/runs/N). Жодних паролів і пароля від accounts.zip. Акаунти — лише адреси *@example.test.
Цей файл — вхід для конвеєра WS9: на кожен AC видно, чим він доведений.
Чому зріз 1: зріз 2 PM не опублікував, тож 3 AC — зі зрізу 1, і всі лише читають прод.
-->

- Прод-URL: https://leave-portal-olive.vercel.app
- Вимоги: https://github.com/mkozlovskyi-ops/course-staff-management-spec · джерело: docs · знімок 2026-10-26
- `/api/health` на момент UAT: sha 3a955d4, db ok, 02.11.2026

## 3 AC

| AC | Вид | «Тоді» (дослівно з вимоги PM) |
|---|---|---|
| AC-BALANCE-13 | відмова в браузері: чужі дані за прямим посиланням | Then the balances are not shown. |
| AC-LEAVE-06 | стан інтерфейсу: помилка | Then the date is not accepted, and the employee sees the message "You have no working hours on this day". |
| AC-LEAVE-19 | стан інтерфейсу: помилка поля | Then no request is created, and the employee sees the message "Hours must be within your schedule: 08:30–12:00, 12:30–15:30". |

## A. Ворота

- PR воріт: https://github.com/rhutsul/leave-portal/pull/37 (злито в `3a955d4`)
- Зелений `quality` на `main`: https://github.com/rhutsul/leave-portal/actions/runs/41428498556
- Обов'язкові перевірки в `solo-main` з 02.11.2026: `spec`, `app`, `conformance`, `db-check`, «Ворота: fallow audit»,
  «Покриття: доменна підлога» («Порада: вразливі залежності» — лише порада, не обов'язкова)
- Червоний прогін воріт: https://github.com/rhutsul/leave-portal/actions/runs/41422446090 (коміт ae08d8d — мертвий
  експорт без тесту `shortName` у `src/lib/utils.ts`: «Ворота: fallow audit» ✗ і «Покриття: доменна підлога» ✗);
  зелений після revert: https://github.com/rhutsul/leave-portal/actions/runs/41422759693

Розбір першого повного прогону `fallow` (той самий — в описі PR воріт #37):

| Група знахідок | Скільки | Справжня / навмисна / хибна | Дія і причина |
|---|---|---|---|
| unused export `AC_ID_GLOBAL` (`scripts/lib/spec-lib.mjs`) | 1 | справжня | прибрано в #37: ніхто не імпортує |
| unused file `src/lib/supabase/client.ts` | 1 | навмисна | `ignoreFindings` з причиною: браузерний клієнт шаблону, частина структури зі `AGENTS.md`; лишаємо для першого Client Component із Supabase |
| клон `initials()` — `employee-picker.tsx` ↔ `sidebar.tsx` | 1 група | справжня | виправлено: винесено в `src/lib/utils.ts` з тестом, під підлогою |
| клон у `src/app/globals.css` (56 рядків) | 1 група | навмисна | `ignoredClones` з причиною: два темні блоки токенів мають бути однакові (ADR 0005, `DESIGN.md` §9, `design-system.test.tsx`) |
| клони у вітрині `src/app/(app)/design/page.tsx` | 3 групи | навмисна | `ignoredClones` з причиною: вітрина навмисно показує варіанти тієї самої розмітки |
| клони між `scripts/check-design-tokens.mjs`, `check-server-boundary.mjs`, `check-ui-primitives.mjs` | 8 груп | навмисна | `ignoredClones` з причиною: кожен — самодостатній CLI одним файлом, як у матеріалах курсу |
| складність у скриптах курсу й шаблону | 8 функцій | навмисна | `health.ignore` з причиною: не наш код для перебудови |
| складність у нашому коді (`NewRequestForm`, `DecisionsPage`, `decideRecord`, …) | 52 функції | справжня (успадкована) | лишено з причиною: рефакторинг — окремий PR; `fallow audit` рахує лише нове, тож PR, що додає складність, упаде |
| unused dependencies, правила Next.js | 0 | — | — |

## B. Якість тестів

PR B: `task/test-quality` (Stryker, SQL-мутації, посилені тести). Посилання на код і тести — на коміт `8c131f8`.

### Рівень для кожного AC

| AC | Де живе правило | Рівень | Чому | Тест |
|---|---|---|---|---|
| AC-BALANCE-13 | функція бази `private.can_view_balances` → `get_balance_inputs` ([balance_inputs.sql#L12-L27](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/supabase/migrations/20261020214031_balance_inputs.sql#L12-L27)); TS лише перекладає 42501 у «not shown» ([load-balances.ts#L38](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/src/app/(app)/balances/load-balances.ts#L38)) | база (PGlite) + SQL-мутант S1; unit — переклад; e2e/UAT — сторінка | відмову тримає SQL: TS-копія чи мок `rpc` лишились би зеленими без правила | [balances.test.ts#L164](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/tests/db/balances.test.ts#L164), [#L232](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/tests/db/balances.test.ts#L232); [load-balances.test.ts#L47](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/src/app/(app)/balances/load-balances.test.ts#L47), [#L54](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/src/app/(app)/balances/load-balances.test.ts#L54); [balances.spec.ts#L31](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/tests/e2e/balances.spec.ts#L31) |
| AC-LEAVE-06 | TS: `positionsOnDate` ([request.ts#L104](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/src/lib/leave/request.ts#L104)), `checkHours` ([time.ts#L213](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/src/lib/leave/time.ts#L213)), стан дня `calendarDay`; SQL `check_record_hours` — остання межа | unit + Stryker; база — друга межа; e2e/UAT — дослівний текст на сторінці | правило двічі (TS для повідомлення, SQL для запису) — кожен шар зі своїм тестом | [request.test.ts#L91](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/src/lib/leave/request.test.ts#L91), [time.test.ts#L85](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/src/lib/leave/time.test.ts#L85), [calendar-view.test.tsx#L16](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/src/app/(app)/requests/new/calendar-view.test.tsx#L16); [submit-leave-request.test.ts#L124](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/tests/db/submit-leave-request.test.ts#L124); [new-request.spec.ts#L17](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/tests/e2e/new-request.spec.ts#L17) |
| AC-LEAVE-19 | TS: `checkHours`, `formatBlocks` ([time.ts#L47](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/src/lib/leave/time.ts#L47), [#L213](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/src/lib/leave/time.ts#L213)); SQL `private.check_record_hours` ([leave_record_edit.sql#L15-L72](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/supabase/migrations/20261021171135_leave_record_edit.sql#L15-L72)) | unit (межі) + Stryker; база + SQL-мутанти S7–S9; e2e/UAT | межа «в розкладі» — розрахунок: unit з обома краями; база — що запису справді немає | [time.test.ts#L65](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/src/lib/leave/time.test.ts#L65), [#L73](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/src/lib/leave/time.test.ts#L73); [submit-leave-request.test.ts#L134](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/tests/db/submit-leave-request.test.ts#L134); [new-request.spec.ts#L63](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/tests/e2e/new-request.spec.ts#L63) |
| AC-DECIDE-01 (рев'ю WS7, п. 1) | політика RLS `leave_records_select_own_managed_or_admin` ([leave_requests_schema.sql#L327-L333](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/supabase/migrations/20261020190045_leave_requests_schema.sql#L327-L333)) | база (PGlite) як менеджер, читання таблиці напряму + SQL-мутант S2 | `decision_records()` — `security definer` з власною копією правила, RLS не проходить; через Data API діє лише політика | [leave-decisions.test.ts#L151](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/tests/db/leave-decisions.test.ts#L151); матриця «роль × таблиця» — [table-visibility.test.ts#L110](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/tests/db/table-visibility.test.ts#L110) |

### Покриття

`npm run test:coverage` (v8, 02.11.2026): усього 35,47 % рядків — не поріг, сторінки й дії доводять база й e2e.

| Файл за AC | Рядки | Гілки | Чим доведено, якщо 0 % |
|---|---|---|---|
| `src/lib/leave/time.ts` (AC-LEAVE-19, AC-LEAVE-06) | 98,73 % | 100 % | — (під підлогою `FLOORED`) |
| `src/lib/leave/request.ts` (AC-LEAVE-06) | 98,75 % | 91,93 % | — (під підлогою `FLOORED`) |
| `src/app/(app)/requests/new/calendar-view.ts` (AC-LEAVE-06) | 100 % | 100 % | — |
| `src/app/(app)/balances/load-balances.ts` (AC-BALANCE-13) | 100 % | 100 % | — (до PR B `loadBalances` не викликав жоден тест — Stryker «без покриття») |
| `src/app/(app)/balances/page.tsx` (AC-BALANCE-13) | 0 % | 0 % | e2e/UAT: `tests/e2e/balances.spec.ts` (розділ C) |
| `src/app/(app)/requests/new/new-request-form.tsx` (AC-LEAVE-06, AC-LEAVE-19) | 0 % | 0 % | e2e/UAT: `tests/e2e/new-request.spec.ts` (розділ C) |
| SQL: `can_view_balances`, `check_record_hours`, політики RLS | — | — | JS-покриття не бачить SQL: тести бази (PGlite) + `npm run mutation:sql` (нижче) |

### Доказ мутацією

| Мутант (файл:рядок, що змінено) | AC під загрозою | До | Тест, посилений з тексту AC | Після |
|---|---|---|---|---|
| `time.ts:214` `blocks.length === 0` → `false` | AC-LEAVE-06 | вижив (порожній розклад ніхто не перевіряв) | [time.test.ts#L85](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/src/lib/leave/time.test.ts#L85): день без блоків → «You have no working hours on this day» | убитий |
| `load-balances.ts:44` 42501 → «not-shown» (10 мутантів) | AC-BALANCE-13 | без покриття (жоден тест не викликав `loadBalances`) | [load-balances.test.ts#L47](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/src/app/(app)/balances/load-balances.test.ts#L47): відмова бази → «not shown», інша помилка → «failed» | убиті |
| `load-balances.ts:10` регулярний вираз UUID (12 мутантів) і `:39` | AC-BALANCE-13 | вижили / без покриття | [load-balances.test.ts#L54](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/src/app/(app)/balances/load-balances.test.ts#L54): пряме посилання з не-UUID — без залишків і без запиту до бази | убиті |
| `time.ts:232` `end > b.start` → `>=` | AC-LEAVE-19 | вижив | — **не вбито свідомо**: розходиться лише коли кінець відпустки = початок наступного блоку (09:00–12:30 у 08:30–12:00, 12:30–15:30). Assumptions PM: «кінець — усередині блоку (може дорівнювати кінцю блоку)», а блок містить свій початок — тож 12:30 як кінець можна прочитати обома способами. Це питання до PM, а не тест | вижив (питання PM) |
| SQL S9: `check_record_hours` `order by b.start_min` → `desc` | AC-LEAVE-19 | вижив (на тестах `main`) | [submit-leave-request.test.ts#L134](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/tests/db/submit-leave-request.test.ts#L134): 07:30–09:00 → дослівний текст з блоками в порядку часу, рядків не додано | убитий |
| SQL S2: політика `leave_records` `manages_position(position_id)` → `manages_employee(employee_id)` | AC-DECIDE-01 | вижив (на тестах `main`, як і в rhutsul/leave-portal#34) | [leave-decisions.test.ts#L151](https://github.com/rhutsul/leave-portal/blob/8c131f83ade1c70c22888a57f5beac762df34fa4/tests/db/leave-decisions.test.ts#L151): manager2@ читає з `leave_records` лише запис додаткової посади teacher1@ | убитий |

- Stryker (`npm run mutation:ts`, 4 файли, 630 мутантів): **82,54 % → 92,70 %** (вбито 520 → 584, вижило 57 → 37, без покриття 53 → 9).

  | Файл | До | Після |
  |---|---|---|
  | `src/app/(app)/balances/load-balances.ts` | 32,95 % | 100 % |
  | `src/app/(app)/requests/new/calendar-view.ts` | 100 % | 100 % |
  | `src/lib/leave/request.ts` | 88,00 % | 88,00 % |
  | `src/lib/leave/time.ts` | 92,31 %¹ | 94,14 % |

  ¹ завищено: 7 таймаутів зараховано як вбиті, серед них 5 еквівалентних на `time.ts:70` (див. нижче). На рядках трьох AC
  вижив один мутант — `time.ts:232` (питання PM). Повна таблиця — в описі PR B
- SQL-мутації (`npm run mutation:sql`, PGlite, 9 мутантів): **9 з 9 KILLED** (≈47 с). Таблиця `--markdown` — в описі PR B.
  S1 і S2 — «червоний прогін і зелений revert» в одному прогоні: скрипт спершу ганяє тести на чистій міграції (зелені),
  потім на мутанті (червоні), і повертає файл (`git status` чистий). До PR B (тести `main`): S2 і S9 — SURVIVED.
  - S1 `can_view_balances`: умова доступу → `true` → упали AC-BALANCE-13 «teacher1@ is not shown another employee's
    balances» і AC-BALANCE-12.
  - S2 політика `leave_records` → упав лише новий AC-DECIDE-01 «manager2@ reads from leave_records only teacher1@'s
    additional-position record».
  - S3–S6 — те саме послаблення для `positions`, `schedule_blocks`, `leave_record_events` (`can_see_record`),
    `balance_carryovers` → упала матриця «роль × таблиця» (окремого AC немає — правило з матриці прав `product.md`).
  - S7–S9 — `check_record_hours` (AC-LEAVE-19): початок поза блоком не перевіряється; `>=` → `>` на початку блоку;
    блоки в повідомленні у зворотному порядку.
- Еквівалентні мутанти (не вбиваються жодним входом):
  - `time.ts:70` (`isCalendarDate`): кожна з трьох умов «рік / місяць / день збігаються» окремо зайва — переповнення
    дати (2026-02-30 → 2026-03-02, 2026-13-01 → 2027-01-01) завжди змінює ще одну з них. У прогоні «до» ці 5 мутантів
    стояли як `Timeout` (Stryker рахує його вбитим), у «після» — чесно `Survived`; тому `time.ts` «до» завищено.
- Вижили поза рядками трьох AC (не в цьому PR): `RELATIONSHIP_LABELS` (AC-LEAVE-12, підписи), порядок посад і конфліктів
  (`request.ts:115`, `:232`), текст тижневого розкладу (`:257–272`), `parseTime` (`time.ts:28–32`), вісь смуги дня
  (`:183`), опції `Intl` (`:152`). Список — у звіті `reports/mutation/mutation.html` після `npm run mutation:ts`.

## C. UAT на проді

| AC | Специфікація | Тест (твердження) | Агент | Вердикт | Кадр |
|---|---|---|---|---|---|
| AC-BALANCE-13 | [balances.spec.ts#L31](https://github.com/rhutsul/leave-portal/blob/bec6601ed191343cc9a267c15799fdb422358fcf/tests/e2e/balances.spec.ts#L31) | passed | Haiku: PASS | PASS (R6) | [AC-BALANCE-13-then-1.png](https://github.com/rhutsul/leave-portal/blob/772c91a558405cd65a5e8ab5b4363cf0e68d4654/docs/qa/uat/2026-11-02/frames/AC-BALANCE-13-then-1.png) |
| AC-LEAVE-06 | [new-request.spec.ts#L17](https://github.com/rhutsul/leave-portal/blob/bec6601ed191343cc9a267c15799fdb422358fcf/tests/e2e/new-request.spec.ts#L17) | passed | Haiku: PASS | PASS (R6) | [AC-LEAVE-06-then-1.png](https://github.com/rhutsul/leave-portal/blob/772c91a558405cd65a5e8ab5b4363cf0e68d4654/docs/qa/uat/2026-11-02/frames/AC-LEAVE-06-then-1.png) |
| AC-LEAVE-19 | [new-request.spec.ts#L63](https://github.com/rhutsul/leave-portal/blob/bec6601ed191343cc9a267c15799fdb422358fcf/tests/e2e/new-request.spec.ts#L63) | passed | Haiku: PASS | PASS (R6) | [AC-LEAVE-19-then-1.png](https://github.com/rhutsul/leave-portal/blob/772c91a558405cd65a5e8ab5b4363cf0e68d4654/docs/qa/uat/2026-11-02/frames/AC-LEAVE-19-then-1.png) |

- Звіт: https://github.com/rhutsul/leave-portal/blob/772c91a558405cd65a5e8ab5b4363cf0e68d4654/docs/qa/uat/2026-11-02/report.md
  (прогін 02.11.2026 12:36, код тестів `bec6601`, прод `3a955d4`)
- Відео: вкладення в описі PR UAT (не в git)
- Рецензент: claude-haiku-5-5; суперечки — claude-sonnet-5-5 (у цьому прогоні суперечок не було); $0.0065 за 3 AC за цінами API
- Негативний контроль (`npm run uat:nc`, [negative-controls.spec.ts](https://github.com/rhutsul/leave-portal/blob/bec6601ed191343cc9a267c15799fdb422358fcf/tests/e2e/negative-controls.spec.ts)):
  - NC-1 (AC-LEAVE-06): у твердженні навмисно інший текст («on that day») → твердження впало, Haiku: PASS → **FAIL** (R1:
    агент не перекриває впале твердження);
  - NC-2 (AC-LEAVE-19): текст «Тоді» «уточнено» (`and` замість коми), тест і застосунок — ні → твердження пройшли,
    Haiku: FAIL, Sonnet: FAIL → **NEEDS-HUMAN** (R3).
- Дані: лише читання — нічого не подається; без `SUPABASE_SECRET_KEY`, прибирання не потрібне.
- **AC-BALANCE-13, примітка для PM:** «Тоді» PM — про відсутність залишків, тож дослівної цитати PM на сторінці немає.
  Агент цитує наш текст порожнього стану «These balances are not available to you.», якого в критерії немає, тож його
  вердикт тут слабкий. Відсутність доводять твердження: 0 карток залишків і 0 чисел «… days», немає імені й email
  teacher2@example.test, немає рядка «<ім'я> · School year». Прошу глянути кадр.

### Приймання PM

| AC | Рішення PM | Посилання |
|---|---|---|
| AC-BALANCE-13 | | |
| AC-LEAVE-06 | | |
| AC-LEAVE-19 | | |

## D. Eval рецензента

_Чекає PR D: гілка з вадами, CodeRabbit і `/code-review high`, правило, повторний прогін._

- PR з вадами (не злитий): —
- Ключ і таблиця: —

| # | Вада (ключ) | CodeRabbit | `/code-review high` |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| П | | | |

- Інші знахідки: —
- Правило, що закриває пропуск: —
- Повторний прогін: —
