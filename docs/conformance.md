# Матриця відповідності (AC → код → тест → статус)

<!--
Ваша матриця: один рядок на кожен AC з openspec/specs/** — вашої специфікації, у яку ви перекладаєте вимоги PM
(їхній знімок у requirements/ приносить команда агента /requirements-sync).
Рядок «Вимоги» під цим коментарем заповнює лише /requirements-sync: адреса репо вимог PM, звідки взято вимоги (issues
або файли docs/), і дата знімка, через « · ». Руками його не змінюйте: з нього /requirements-sync знає, звідки брати
вимоги наступного разу, а скіли spec-clarify, spec-review і /conformance — куди ставити питання й яку версію вимог ви
реалізуєте. Рядків таблиці /requirements-sync не додає.
Рядки змінюєте ви:
  PR «Специфікація» — після archive зміни: рядок кожного нового AC зі статусом «відкладено (чекає реалізації)»; рядки AC,
                      прибраних зі специфікації (REMOVED), — видалити;
  PR «Реалізація»   — рядок AC задачі в тому самому PR, що й код і тест.
Перебудувати автоматично: /conformance (Claude Code, Cursor).
Перевірка в CI: npm run ac:coverage — падає, якщо
  NO-ROW     AC є в специфікації, а рядка немає (типово — PR «Специфікація» без нових рядків або рядок видалено);
  MISSING    статус «реалізовано», а непропущеного тесту, назва якого починається з цього AC ID, у файлах
             *.test.ts / *.test.tsx немає (*.spec.ts і допоміжні файли Vitest не запускає — вони не рахуються);
  ORPHAN     тест посилається на AC, якого немає в специфікації (AC прибрано або вимогу PM ще не перекладено);
  BAD-STATUS статус не «реалізовано» і не «відкладено (причина)»;
  WRONG-REF  шляху `src/…`/`tests/…`/`supabase/…` з колонок «Код»/«Тест» немає або тест із цим AC в іншому файлі;
і попереджає, не падаючи: AC з вимог PM (requirements/), якого ще немає в openspec/specs/, — «вимогу PM ще не перекладено
в специфікацію».

Приклад рядків (усередині коментаря — скрипт їх не читає):
| AC-LEAVE-02 | заявка на дві посади дає два записи main і additional | `src/app/requests/actions.ts` (createRequest) | `tests/requests.test.ts` | реалізовано |
| AC-LEAVE-04 | заблоковані дні не рахуються | — | — | відкладено (чекаю відповідь PM на Q2, <pm>/<team-slug>-spec#5) |
| AC-LEAVE-07 | менеджер бачить лише свій відділ | — | — | відкладено (рішення PM: поза зрізом 1, <pm>/<team-slug>-spec#8) |
| AC-LEAVE-10 | діапазон лише із заблокованих днів | — | — | відкладено (чекає реалізації) |
-->

Вимоги: https://github.com/mkozlovskyi-ops/course-staff-management-spec · джерело: docs · знімок 2026-10-20

| AC | Що перевіряє | Код | Тест | Статус |
|---|---|---|---|---|
| AC-LEAVE-01 | Цілий день на основній посаді | `src/lib/leave/request.ts` (buildDayRecords), `supabase/migrations/20261020190045_leave_requests_schema.sql` (submit_leave_request), `src/app/(app)/requests/new/new-request-form.tsx` | `src/lib/leave/request.test.ts`, `tests/db/submit-leave-request.test.ts` | реалізовано |
| AC-LEAVE-02 | Цілий день на двох посадах | `src/lib/leave/request.ts` (buildDayRecords), `supabase/migrations/20261020190045_leave_requests_schema.sql` (submit_leave_request), `src/app/(app)/requests/new/new-request-form.tsx` | `src/lib/leave/request.test.ts`, `tests/db/submit-leave-request.test.ts` | реалізовано |
| AC-LEAVE-03 | Виключена посада | `src/lib/leave/request.ts` (buildDayRecords), `src/app/(app)/requests/new/new-request-form.tsx` | `src/lib/leave/request.test.ts` | реалізовано |
| AC-LEAVE-05 | Дві дати в одній заявці | — | — | відкладено (чекає реалізації) |
| AC-LEAVE-17 | Коментар у кожному записі | — | — | відкладено (чекає реалізації) |
| AC-LEAVE-04 | Частина дня | `src/lib/leave/time.ts` (checkHours, formatDuration), `supabase/migrations/20261020190045_leave_requests_schema.sql` (submit_leave_request) | `src/lib/leave/time.test.ts`, `tests/db/submit-leave-request.test.ts` | реалізовано |
| AC-LEAVE-15 | Години через перерву між блоками | `src/lib/leave/time.ts` (scheduledMinutes), `supabase/migrations/20261020190045_leave_requests_schema.sql` (submit_leave_request) | `src/lib/leave/time.test.ts`, `tests/db/submit-leave-request.test.ts` | реалізовано |
| AC-LEAVE-06 | Субота без розкладу | `src/lib/leave/request.ts` (positionsOnDate), `supabase/migrations/20261020190045_leave_requests_schema.sql` (submit_leave_request) | `src/lib/leave/request.test.ts`, `tests/db/submit-leave-request.test.ts` | реалізовано |
| AC-LEAVE-07 | Початок раніше за розклад | `src/lib/leave/time.ts` (checkHours), `supabase/migrations/20261020190045_leave_requests_schema.sql` (submit_leave_request) | `src/lib/leave/time.test.ts`, `tests/db/submit-leave-request.test.ts` | реалізовано |
| AC-LEAVE-19 | Розклад із кількох блоків | `src/lib/leave/time.ts` (checkHours, formatBlocks), `supabase/migrations/20261020190045_leave_requests_schema.sql` (submit_leave_request) | `src/lib/leave/time.test.ts` | реалізовано |
| AC-LEAVE-08 | Початок о 13:00 | `src/lib/leave/time.ts` (checkHours), `supabase/migrations/20261020190045_leave_requests_schema.sql` (submit_leave_request) | `src/lib/leave/time.test.ts` | реалізовано |
| AC-LEAVE-20 | Початок о кінці першого блоку | `src/lib/leave/time.ts` (checkHours), `supabase/migrations/20261020190045_leave_requests_schema.sql` (submit_leave_request) | `src/lib/leave/time.test.ts`, `tests/db/submit-leave-request.test.ts` | реалізовано |
| AC-LEAVE-09 | Кінець раніше за початок | `src/lib/leave/time.ts` (checkHours), `supabase/migrations/20261020190045_leave_requests_schema.sql` (submit_leave_request) | `src/lib/leave/time.test.ts` | реалізовано |
| AC-LEAVE-10 | Усі посади виключено | `src/lib/leave/request.ts` (buildDayRecords), `supabase/migrations/20261020190045_leave_requests_schema.sql` (submit_leave_request) | `src/lib/leave/request.test.ts`, `tests/db/submit-leave-request.test.ts` | реалізовано |
| AC-LEAVE-11 | Повернення до редагування | — | — | відкладено (чекає реалізації) |
| AC-LEAVE-12 | Без спорідненості | — | — | відкладено (чекає реалізації) |
| AC-LEAVE-13 | Перетин із записом, що чекає рішення | — | — | відкладено (чекає реалізації) |
| AC-LEAVE-16 | Перетин в одній із дат | — | — | відкладено (чекає реалізації) |
| AC-LEAVE-14 | Лише власні записи | `supabase/migrations/20261020190045_leave_requests_schema.sql` (RLS, my_leave_records), `src/app/(app)/requests/page.tsx` | `tests/db/my-requests.test.ts`, `tests/db/submit-leave-request.test.ts` | реалізовано |
| AC-LEAVE-18 | Коментар із 501 символу | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-01 | Лише записи своїх посад | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-11 | Вирішений запис переходить в «History» | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-14 | Порожній список | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-02 | Погоджено один запис із двох | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-03 | Відхилення | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-05 | Повернення з коментарем | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-04 | Повернення без коментаря | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-06 | Повторне подання поверненого запису | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-16 | Зміна годин запису, що чекає рішення | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-12 | Зміна погодженого запису | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-13 | Скасування запису, що чекає рішення | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-17 | Скасування поверненого запису | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-07 | Два менеджери однієї посади | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-08 | Менеджер чужої посади | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-09 | Працівник погоджує власний запис | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-18 | Менеджер погоджує власний запис | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-10 | Адміністратор не є менеджером посади | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-19 | Адміністратор погоджує запис менеджера | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-15 | Рядок історії після погодження | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-20 | Менеджер бачить коментар | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-21 | Спроба змінити тип відпустки | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-22 | Зміна годин перетинає інший запис | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-01 | Залишки без записів | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-02 | Погоджено цілий день | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-04 | Запис чекає рішення | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-07 | Запис відхилено | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-03 | Частина дня на одній посаді | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-05 | Цілий день на двох посадах | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-06 | Цілий день лише на додатковій посаді | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-11 | Перенесення 5 днів | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-08 | Цілий день при залишку 0.50 | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-15 | Частина дня при залишку 0.20 | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-17 | Одне попередження на заявку з трьох днів | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-09 | Менеджер відкриває запис понад залишок | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-14 | Залишок після погодження іншого запису | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-10 | Погоджено з розподілом | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-16 | Спроба погодити без розподілу | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-12 | Менеджер чужих посад | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-13 | Працівник дивиться чужі залишки | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-20 | Менеджер додаткової посади бачить повний залишок | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-18 | Один запис із розподілом у «My requests» | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-19 | Розподіл при нульовому залишку | — | — | відкладено (чекає реалізації) |
