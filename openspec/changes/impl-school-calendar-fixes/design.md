# Design: виправлення шкільного календаря за рев'ю WS9

## Context

Рев'ю викладача WS9 (14.11) знайшло порушення правила PM «One date never counts as more than 1.00 day»
(`requirements/03-leave-balance.md`, Assumptions): тригер `private.fix_day_share` (міграція
`20261113145925_school_calendar_clarifications.sql`, AC-CAL-20) фіксує частку запису за робочими хвилинами, не
закритими на момент погодження. Якщо між двома погодженнями однієї дати календар змінився, суму часток ніщо не обмежує:
скорочений день з 12:00, погоджено 08:30–11:00 (0.71), закриття прибрано, погоджено 11:00–15:30 (0.64) — разом 1.35.
Для «Sick leave» і «Personal leave» те саме давала частка в `paid_days` (`private.record_share` у
`decide_leave_record`). Друге: правило «an early dismissal without a closing time is not saved, with the message
"Enter the closing time"» (Assumptions `requirements/04-school-calendar.md`) перевіряли лише форма й Server Action, а
`add_school_closure` без часу закривала цілий день — помічник календаря зрізу 4 збереже закриття через ту саму функцію.

## Goals / Non-Goals

**Goals:** частка дати ≤ 1.00 за будь-якої послідовності змін календаря й погоджень; вид закриття в базі; UAT
AC-CAL-01…20 на проді з чистого дерева й синтетичним працівником; докази (мутанти, NC) у репо.

**Non-Goals:** переклад «Тоді» англійською в наявних сценаріях (відкладено); дзеркальний випадок 0.65 (чекає PM);
перерахунок уже погоджених записів (AC-CAL-20: частка фіксується при погодженні).

## Decisions

### D1. Частка дати не більша за 1.00 (AC-BALANCE-05, AC-CAL-20)

Нова міграція `day_share_cap_and_closure_kind`. Усе — у сотих дня, як `used_hundredths` і `private.day_share`:
`private.date_room(employee, date, exclude_id)` = 100 − Σ `round(day_share × 100)` (запасний шлях —
`round((paid_days + unpaid_days) × 100)`) інших погоджених записів працівника на дату, усіх типів, не менше 0.
`fix_day_share` і `record_share` беруть `least(приріст у сотих, date_room)`, а `day_share` пишуть як соті ÷ 100: після
0.71 лишається 29 сотих, тож другий запис — 0.29, а не 0.64. `decide_leave_record` бере частку
з `record_share`, тож `paid_days` «Sick leave» і «Personal leave», попередження й панель рішення бачать ту саму частку.
Зафіксовані частки вже погоджених записів не змінюємо (AC-CAL-20). Тест PGlite — на послідовність дій, не на один запис:
`approve(08:30–11:00)` під закриттям з 12:00 → `remove_school_closure` → `approve(11:00–15:30)` → used 1.00 для «Unpaid
leave» і «Sick leave», і для двох різних типів (0.71 + 0.29). Мутанти: S28 (`least` у `fix_day_share`), S29 (`least` у
`record_share`), S31 (`v_paid := null` у `decide_leave_record` — тест AC-CAL-20 для «Sick leave» перевіряє й розподіл).

### D2. Вид закриття в `add_school_closure` (Assumptions 04-school-calendar; AC-CAL-01, -07, -10, -11, -13, -17, -18, -19)

Нова сигнатура `add_school_closure(p_kind, p_name, p_start, p_end default null, p_closes_at default null)`;
`p_kind` — `'whole_days'` або `'early_dismissal'`. Скорочений день без часу → «Enter the closing time»; `p_end` для
скороченого дня — та сама дата або null (помічнику не треба дублювати дату). Тексти для людини — ті самі, що у формі
(`CALENDAR_MESSAGES`), у тому самому порядку: назва, дати, час; технічні відмови (невідомий вид, час для цілих днів) —
`22023`. Старі функції — `drop` і нове `create` з тими самими правами. Мутанти S12–S17, S24–S26 переходять на нову
міграцію (інакше мутували б мертве тіло), новий S30 — перевірка часу. Виклики в TS: `ClosureInput.kind`,
`parseClosureForm`, Server Action `addClosure`, `database.types.ts`; e2e AC-CAL-13 передає `p_kind`.

### D3. Синтетичний працівник для UAT (AC-CAL-06, AC-CAL-16, AC-CAL-20)

`createUatEmployee(schedule)` у `tests/e2e/support/admin.ts`: secret-ключем створює `uat-<run>@example.test` з однією
посадою (менеджер — `manager1@example.test`) і блоками розкладу за днями тижня, повертає id, email і пароль для входу;
прибирання видаляє працівника за id (каскадом — посада, розклад, записи). На ньому e2e AC-CAL-06 і AC-CAL-20 перевіряють
точні числа з «Тоді» від старту 0.00 (`expectStartUsed(0)` без винятку для проду), а AC-CAL-16 отримує свій e2e
(`fri: [[780, 1020]]`).

### D4. UAT з чистого дерева

`scripts/uat/run.mjs` зупиняється, коли `git status --porcelain` не порожній; `gitDirty` пишеться в `manifest.json`.
Один прогін AC-CAL-01…20 на проді з main після злиття D1–D3, з відео; звіт — один `docs/qa/uat/<дата>/report.md`.
Негативний контроль NC-3 на AC зрізу 3 (AC-CAL-17 зі зміненим порядком частин має дати FAIL) — результат у
`manifest.negativeControls`. Таблиця `npm run mutation:sql -- --markdown` — `docs/qa/mutation-sql.md`.

## Risks / Trade-offs

- Обмеження в D1 — для всіх типів разом: два записи різних типів однієї дати з округленням 0.355 + 0.645 тепер дають
  0.36 + 0.64 = 1.00, а не 1.01. Це відповідає правилу PM «never more than 1.00».
- Нова сигнатура `add_school_closure` ламає старий виклик без `p_kind` (PostgREST не знайде функцію) — усі виклики в
  репо оновлено в тому самому PR; помічник зрізу 4 ще не реалізований.

## Open questions

- **Q1 (до PM, дзеркальний випадок AC-CAL-20).** Перший запис погоджено до появи скороченого дня (08:30–11:00, 150 з
  420 = 0.36), другий — після (11:00–12:00, решта 60 з 210 = 0.29): весь скорочений день коштує 0.65 замість 1.00. Це
  буквально випливає з AC-CAL-20 (частка фіксується при погодженні), але суперечить Assumptions 03 «records that
  together cover all those minutes count as 1.00». Питання для вебформи «Питання до вимог» підготовано
  (`docs/spec-reading.md`, 2026-11-15); публікує розробник. Поки відповіді немає — поточна поведінка (0.65), яку закріплює
  тест «used 0.65 (open question to PM)» у `tests/db/school-calendar.test.ts` — його додає задача 2.2 (PR «Реалізація»
  `task/ws9-day-share-closure-kind`).
