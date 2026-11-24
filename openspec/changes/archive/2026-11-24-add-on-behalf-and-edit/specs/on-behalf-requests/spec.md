# Дельта: on-behalf-requests

## Purpose

Дає менеджеру й адміністратору подати заявку від імені працівника — записи власних посад погоджуються одразу — і
виправити дату, години, тип відпустки чи заміну запису, що чекає рішення, щоб відсутність була записана, а кожну зміну
працівник бачив в історії запису.

Кроки GIVEN, WHEN і THEN — дослівні «Given», «When» і «Then» PM англійською (`requirements/08-on-behalf-and-edit.md`).

## ADDED Requirements

### Requirement: Заявка від імені працівника

WHEN відповідальний менеджер подає заявку від імені працівника своїх посад, the system SHALL створити записи за правилами заявки працівника, записи посад, за які він відповідає, одразу перевести в «Approved», записи інших посад — у «Awaiting decision» у списках їхніх менеджерів, і додати в історію кожного запису рядок "Submitted by <менеджер> on behalf of <працівник>".

#### Scenario: AC-BEHALF-01 Лікарняний від імені працівника

- **GIVEN** manager1@example.test is the manager of teacher1@example.test's main position (schedule Mon–Fri 08:30–15:30)
- **WHEN** manager1@example.test submits on behalf of teacher1@example.test "Sick leave" for the whole day Thursday 2026-12-03 for the main position
- **THEN** teacher1@example.test sees in "My requests" the record 2026-12-03 08:30–15:30 "Sick leave" with status "Approved", and its history has the line "Submitted by manager1@example.test on behalf of teacher1@example.test".

#### Scenario: AC-BEHALF-02 Посада іншого менеджера чекає рішення

- **GIVEN** teacher1@example.test has the main position (manager manager1@example.test, Thu 08:30–15:30) and the additional position (manager manager2@example.test, Thu 15:45–17:00)
- **WHEN** manager1@example.test submits on behalf of teacher1@example.test the whole day 2026-12-03 for both positions
- **THEN** the main-position record has status "Approved", and the additional-position record has status "Awaiting decision" and is in manager2@example.test's "Awaiting decision" list.

### Requirement: Заявка адміністратора від імені працівника

WHEN адміністратор подає заявку від імені будь-якого працівника, the system SHALL одразу перевести всі записи заявки в «Approved».

#### Scenario: AC-BEHALF-03 Адміністратор подає на дві посади

- **GIVEN** the employee and positions from AC-BEHALF-02
- **WHEN** the administrator submits on behalf of teacher1@example.test the whole day 2026-12-03 for both positions
- **THEN** both records have status "Approved".

### Requirement: Погоджений від імені запис у залишку

WHEN запис, поданий від імені працівника, погоджено, the system SHALL рахувати його в залишку працівника так само, як погоджений власний запис.

#### Scenario: AC-BEHALF-04 Залишок після лікарняного від імені

- **GIVEN** the record from AC-BEHALF-01 and teacher1@example.test's "Sick leave" used 0.00 before it
- **WHEN** teacher1@example.test views their balances
- **THEN** "Sick leave" shows used 1.00, remaining 17.00.

### Requirement: Перевірки заявки від імені

IF у заявці від імені працівника вибрано дату, на яку посада працівника не має розкладу, THEN the system SHALL не приймати дату й показати менеджеру повідомлення "This employee has no working hours on this day", а решту перевірок заявки працівника виконати так само, звертаючись до менеджера «this employee» замість «you».

#### Scenario: AC-BEHALF-05 Субота без розкладу

- **GIVEN** teacher1@example.test's position has no Saturday in its schedule
- **WHEN** manager1@example.test tries to choose Saturday 2026-12-05 in a request on behalf of teacher1@example.test
- **THEN** the date is not accepted, and manager1@example.test sees the message "This employee has no working hours on this day".

### Requirement: Правка запису до рішення

WHEN відповідальний менеджер посади запису або адміністратор змінює дату, години, тип відпустки чи заміну запису зі статусом «Awaiting decision» і зміна проходить ті самі перевірки, що й новий запис (розклад, шкільний календар, перетин з іншими записами працівника, зайнятість заміни), the system SHALL зберегти зміну, залишити статус «Awaiting decision» і додати в історію по рядку на кожне змінене поле "<хто> changed the <поле>: <старе значення> → <нове значення>".

#### Scenario: AC-BEHALF-06 Зміна дати

- **GIVEN** teacher1@example.test has a record 2026-12-03 "Sick leave" 08:30–15:30 with status "Awaiting decision" of manager1@example.test's position
- **WHEN** manager1@example.test changes its date to Friday 2026-12-04
- **THEN** the record shows 2026-12-04 08:30–15:30 with status "Awaiting decision", and teacher1@example.test sees in its history the line "manager1@example.test changed the date: 2026-12-03 → 2026-12-04".

#### Scenario: AC-BEHALF-07 Зміна типу відпустки

- **GIVEN** the record from AC-BEHALF-06 with type "Sick leave"
- **WHEN** manager1@example.test changes its leave type to "Personal leave"
- **THEN** the record shows "Personal leave", and its history has the line "manager1@example.test changed the leave type: Sick leave → Personal leave".

#### Scenario: AC-BEHALF-08 Додавання заміни

- **GIVEN** a record 2026-12-04 08:30–15:30 with status "Awaiting decision" and no substitute, and teacher2@example.test is on teacher1@example.test's substitute list
- **WHEN** manager1@example.test sets the substitute teacher2@example.test
- **THEN** the record shows the substitute teacher2@example.test, and its history has the line "manager1@example.test changed the substitute: No substitute → teacher2@example.test".

### Requirement: Нові години в межах розкладу

IF менеджер змінює години запису так, що вони виходять за розклад посади на цю дату, THEN the system SHALL не зберігати зміну й показати повідомлення "Hours must be within the schedule: <блоки розкладу>".

#### Scenario: AC-BEHALF-09 Години поза розкладом

- **GIVEN** a record 2026-12-04 of a position with the schedule Fri 08:30–15:30 and status "Awaiting decision"
- **WHEN** manager1@example.test changes its hours to 16:00–17:00
- **THEN** the change is not saved, and manager1@example.test sees the message "Hours must be within the schedule: 08:30–15:30".

### Requirement: Ухвалений запис менеджер не змінює

IF менеджер намагається змінити запис, щодо якого вже ухвалено рішення, THEN the system SHALL не зберігати зміну й показати повідомлення "This record is already decided and cannot be changed".

#### Scenario: AC-BEHALF-10 Зміна погодженого запису

- **GIVEN** a record of teacher1@example.test with status "Approved"
- **WHEN** manager1@example.test tries to change its date
- **THEN** the change is not saved, and manager1@example.test sees the message "This record is already decided and cannot be changed".

### Requirement: Заявка лише для працівників своїх посад

IF менеджер відкриває заявку від імені працівника, жодна посада якого не належить цьому менеджеру, THEN the system SHALL показати повідомлення "You can submit requests only for employees of your positions" і не створювати записів.

#### Scenario: AC-BEHALF-11 Працівник чужих посад

- **GIVEN** teacher3@example.test has no positions managed by manager1@example.test
- **WHEN** manager1@example.test opens the request on behalf of teacher3@example.test by a direct link
- **THEN** manager1@example.test sees the message "You can submit requests only for employees of your positions", and no record of teacher3@example.test is created.

### Requirement: Заявка від імені лише для менеджера чи адміністратора

IF користувач лише з роллю працівника відкриває заявку від імені іншого працівника, THEN the system SHALL показати повідомлення "Only a manager or an administrator can submit a request on behalf of an employee" і не створювати записів.

#### Scenario: AC-BEHALF-12 Працівник за прямим посиланням

- **GIVEN** teacher1@example.test is signed in and has only the employee role
- **WHEN** teacher1@example.test opens the request on behalf of teacher2@example.test by a direct link
- **THEN** teacher1@example.test sees the message "Only a manager or an administrator can submit a request on behalf of an employee", and no record of teacher2@example.test is created.

### Requirement: Правка лише менеджером посади

IF менеджер, що не є менеджером посади запису, намагається змінити запис в обхід сторінок порталу, THEN the system SHALL залишити дату, години, тип відпустки й заміну запису без змін і не додавати рядка в історію.

#### Scenario: AC-BEHALF-13 Менеджер чужої посади в обхід сторінок

- **GIVEN** a record of teacher1@example.test's main position with status "Awaiting decision", and manager2@example.test is not a manager of that position
- **WHEN** manager2@example.test tries to change its date directly, bypassing the portal's pages
- **THEN** the record keeps its date, hours, leave type and substitute, and its history has no new line.

### Requirement: Заявка від імені без входу

IF гість, що не увійшов, відкриває заявку від імені працівника за прямим посиланням, THEN the system SHALL показати сторінку входу без імен і записів.

#### Scenario: AC-BEHALF-14 Гість за прямим посиланням

- **GIVEN** nobody is signed in
- **WHEN** a visitor opens the request on behalf of an employee by a direct link
- **THEN** the visitor sees the sign-in page, and no names or records are shown.

### Requirement: Менеджер без посад

WHEN менеджер, якому не призначено жодної посади, відкриває заявку від імені працівника, the system SHALL показати повідомлення "You have no employees to submit requests for".

#### Scenario: AC-BEHALF-15 Немає працівників для заявки

- **GIVEN** manager3@example.test is a manager but no position is assigned to them
- **WHEN** manager3@example.test opens the request on behalf of an employee
- **THEN** manager3@example.test sees the message "You have no employees to submit requests for".
