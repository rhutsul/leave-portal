# Дельта: on-behalf-requests

## MODIFIED Requirements

### Requirement: Заявка від імені працівника

WHEN менеджер подає заявку від імені працівника своїх посад, the system SHALL створити записи за правилами заявки працівника, записи посад, де він відповідальний чи сьогодні заступник, одразу погодити, решту — передати їхнім менеджерам як «Awaiting decision», і в історії кожного запису показати "Submitted by <менеджер> on behalf of <працівник>", а в погодженого — ще й "Approved by <менеджер>" з тим самим часом.

#### Scenario: AC-BEHALF-01 Лікарняний від імені працівника

- **GIVEN** manager1@example.test is the manager of teacher1@example.test's main position (schedule Mon–Fri 08:30–15:30)
- **WHEN** manager1@example.test submits on behalf of teacher1@example.test "Sick leave" for the whole day Thursday 2026-12-03 for the main position
- **THEN** teacher1@example.test sees in "My requests" the record 2026-12-03 08:30–15:30 "Sick leave" with status "Approved", and its history has the line "Submitted by manager1@example.test on behalf of teacher1@example.test".

#### Scenario: AC-BEHALF-02 Посада іншого менеджера чекає рішення

- **GIVEN** teacher1@example.test has the main position (manager manager1@example.test, Thu 08:30–15:30) and the additional position (manager manager2@example.test, Thu 15:45–17:00)
- **WHEN** manager1@example.test submits on behalf of teacher1@example.test the whole day 2026-12-03 for both positions
- **THEN** the main-position record has status "Approved", and the additional-position record has status "Awaiting decision" and is in manager2@example.test's "Awaiting decision" list.

### Requirement: Заявка адміністратора від імені працівника

WHEN адміністратор подає заявку від імені будь-якого працівника, the system SHALL одразу перевести всі записи заявки в «Approved» з рядками історії "Submitted by <адміністратор> on behalf of <працівник>" і "Approved by <адміністратор>" з тим самим часом.

#### Scenario: AC-BEHALF-03 Адміністратор подає на дві посади

- **GIVEN** the employee and positions from AC-BEHALF-02
- **WHEN** the administrator submits on behalf of teacher1@example.test the whole day 2026-12-03 for both positions
- **THEN** both records have status "Approved".
