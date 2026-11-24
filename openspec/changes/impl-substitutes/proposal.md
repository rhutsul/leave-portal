# План: заміни для записів і позначка підвищення

## Why

Реалізуємо зріз «заміни й підвищення асистента» за специфікацією `openspec/specs/substitutes/spec.md` (зміна
специфікації `2026-11-24-add-substitutes`, вимога PM `requirements/06-substitutes.md`; рядки «Maintain an employee's
substitute list» і «See own substitutions» матриці прав `requirements/product.md`). Зараз хто замінює відсутнього,
домовляються усно, а про підвищення асистента бухгалтерія дізнається окремо; після зрізу менеджер веде список замін
працівника, працівник вибирає заміну для кожного запису, зайняту заміну портал не приймає, а запис, де асистент замінює
вчителя, має позначку «With upgrade» з хвилинами.

## What Changes

Покриває AC з `openspec/specs/substitutes/spec.md`:

- **Список замін** — нова таблиця `substitute_lists` з RLS і сторінки `/substitutes`, `/substitutes/[employeeId]` для
  менеджера посад працівника й адміністратора; відмова за прямим посиланням і в обхід сторінок: AC-SUBST-01,
  AC-SUBST-12, AC-SUBST-13.
- **Вибір заміни в заявці** — поле «Substitute» на кожному записі кроку «Positions & hours», лише люди зі списку;
  «No substitute» і порожній список: AC-SUBST-02, AC-SUBST-03, AC-SUBST-04, AC-SUBST-11.
- **Зайнятість заміни** — перевірка всередині транзакції `submit_leave_request` (власні записи заміни й інші заміни в
  «Awaiting decision», «Returned for revision», «Approved»; перший за часом): AC-SUBST-05, AC-SUBST-06, AC-SUBST-07.
- **Позначка підвищення** — колонка `upgrade_minutes` запису, яку ставить база; показ у «My requests» і «Decisions»:
  AC-SUBST-08, AC-SUBST-09.
- **«My substitutions»** — нова сторінка `/substitutions` для всіх ролей, порожній стан і гість: AC-SUBST-10,
  AC-SUBST-14, AC-SUBST-15.

Не входить (поза зрізом за вимогою PM чи іншою вимогою): зміна заміни поданого запису менеджером (вимога 08,
AC-BEHALF-08 — окремий зріз; спільну перевірку зайнятості D4 він використає повторно); деактивація працівника
(вимога 07, ще не реалізована — D9); суми грошей за підвищення.

## Impact

- База: одна нова міграція (таблиця `substitute_lists`, колонки `leave_records.substitute_id` і
  `leave_records.upgrade_minutes`, функції читання, нові тіла `private.submit_leave_request` і
  `private.update_leave_record_hours` без зміни сигнатур), тестові призначення `assistant1@` і `teacher3@`.
- Код: форма нової заявки, «My requests», «Decisions», дві нові сторінки, пункти меню, доменний модуль
  `src/lib/leave/substitutes.ts`.
- Сумісність зі зрізом `cancel-approved` (план `openspec/changes/impl-cancel-approved/design.md`, реалізується раніше):
  окрема міграція з міткою, пізнішою за `20261124195428_cancel_approved.sql`, інші назви колонок і функцій, обидві лише додають — D11.
