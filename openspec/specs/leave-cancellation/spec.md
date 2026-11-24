# leave-cancellation Specification

## Purpose
Дає працівнику скасувати погоджений запис на сьогодні чи пізніше через менеджера, а менеджеру — підтвердити чи
відхилити прохання з причиною або скасувати запис самому з приміткою, щоб дні поверталися в залишок, а день можна було
закрити в шкільному календарі.

Кроки GIVEN, WHEN і THEN — дослівні «Given», «When» і «Then» PM англійською (`requirements/09-cancel-approved.md`).

## Requirements

### Requirement: Прохання про скасування погодженого запису

WHEN працівник просить скасувати свій запис зі статусом «Approved» з датою сьогодні чи пізніше (за Києвом) і вказує причину, the system SHALL залишити запис «Approved» з позначкою «Cancellation requested» і показати його відповідальним менеджерам посади в «Awaiting decision» з рядком "Cancellation requested: <причина>".

#### Scenario: AC-CANCEL-01 Прохання скасувати погоджений запис

- **GIVEN** today is 2026-12-01 and teacher1@example.test has a record 2026-12-10 "Personal leave" 08:30–15:30 with status "Approved"
- **WHEN** teacher1@example.test asks to cancel it with the reason "Plans changed"
- **THEN** teacher1@example.test sees the record with status "Approved" and the mark "Cancellation requested", and manager1@example.test sees it in "Awaiting decision" with "Cancellation requested: Plans changed".

### Requirement: Запис у минулому не скасовується

IF працівник просить скасувати погоджений запис з датою раніше за сьогодні (за Києвом), THEN the system SHALL не створювати прохання, залишити запис «Approved» і показати повідомлення "Records in the past cannot be cancelled".

#### Scenario: AC-CANCEL-05 Прохання для запису в минулому

- **GIVEN** today is 2026-12-01 and teacher1@example.test has a record 2026-11-27 with status "Approved"
- **WHEN** teacher1@example.test tries to ask to cancel it
- **THEN** no cancellation is requested, the record keeps status "Approved", and teacher1@example.test sees the message "Records in the past cannot be cancelled".

### Requirement: Одне прохання на запис

IF працівник просить скасувати запис, що вже має позначку «Cancellation requested», THEN the system SHALL не створювати друге прохання й показати повідомлення "Cancellation has already been requested".

#### Scenario: AC-CANCEL-06 Повторне прохання

- **GIVEN** the record from AC-CANCEL-01 already has "Cancellation requested"
- **WHEN** teacher1@example.test asks to cancel it again
- **THEN** teacher1@example.test sees the message "Cancellation has already been requested", and there is still one request.

### Requirement: Підтвердження скасування

WHEN відповідальний менеджер посади запису (не власного) або адміністратор підтверджує прохання про скасування, the system SHALL змінити статус запису на «Cancelled» і повернути його дні в залишок навчального року дати запису, зокрема обидві частини розділеного запису.

#### Scenario: AC-CANCEL-02 Підтвердження повертає дні в залишок

- **GIVEN** the request from AC-CANCEL-01 and teacher1@example.test's "Personal leave" shows used 3.00, remaining 15.00
- **WHEN** manager1@example.test confirms the cancellation
- **THEN** the record has status "Cancelled", and teacher1@example.test's "Personal leave" shows used 2.00, remaining 16.00.

#### Scenario: AC-CANCEL-07 Скасування розділеного запису

- **GIVEN** a whole-day "Personal leave" record approved with the split "0.50 Personal leave + 0.50 Unpaid leave" (as in AC-BALANCE-10), with a date in the future
- **WHEN** the manager confirms its cancellation
- **THEN** "Personal leave" used decreases by 0.50 and "Unpaid leave" used decreases by 0.50.

### Requirement: Відхилення прохання з коментарем

WHEN відповідальний менеджер посади запису (не власного) або адміністратор відхиляє прохання про скасування з коментарем, the system SHALL залишити запис «Approved» без позначки «Cancellation requested» і показати працівнику на записі "Cancellation declined: <коментар>"; IF коментаря немає, THEN the system SHALL не відхиляти прохання й показати повідомлення "Tell the employee why the cancellation is declined".

#### Scenario: AC-CANCEL-03 Відхилення з коментарем

- **GIVEN** the request from AC-CANCEL-01
- **WHEN** manager1@example.test declines it with the comment "Exam week"
- **THEN** the record keeps status "Approved" without the mark "Cancellation requested", and teacher1@example.test sees "Cancellation declined: Exam week" on it.

#### Scenario: AC-CANCEL-04 Відхилення без коментаря

- **GIVEN** the request from AC-CANCEL-01
- **WHEN** manager1@example.test declines it without a comment
- **THEN** the record still shows "Cancellation requested", and manager1@example.test sees the message "Tell the employee why the cancellation is declined".

### Requirement: Скасування менеджером з приміткою

WHEN відповідальний менеджер посади запису або адміністратор скасовує запис зі статусом «Approved» з приміткою для працівника, the system SHALL змінити статус на «Cancelled», повернути дні в залишок і показати примітку працівнику на записі в «My requests»; IF примітки немає, THEN the system SHALL залишити запис «Approved» і показати повідомлення "Tell the employee why the record is cancelled".

#### Scenario: AC-CANCEL-08 Скасування з приміткою

- **GIVEN** today is 2026-12-01 and teacher1@example.test has a record 2026-12-10 with status "Approved"
- **WHEN** manager1@example.test cancels it with the note "Event moved to January"
- **THEN** the record has status "Cancelled", and teacher1@example.test sees the note "Event moved to January" on it in "My requests".

#### Scenario: AC-CANCEL-09 Скасування без примітки

- **GIVEN** the record from AC-CANCEL-08 with status "Approved"
- **WHEN** manager1@example.test tries to cancel it without a note
- **THEN** the record keeps status "Approved", and manager1@example.test sees the message "Tell the employee why the record is cancelled".

### Requirement: Прохання лише для власних записів

IF користувач, що не є власником запису, відповідальним менеджером його посади чи адміністратором, відкриває скасування цього запису за прямим посиланням, THEN the system SHALL показати повідомлення "You can cancel only your own records" і не створювати прохання.

#### Scenario: AC-CANCEL-10 Чужий запис за прямим посиланням

- **GIVEN** teacher1@example.test has a record 2026-12-10 with status "Approved"
- **WHEN** teacher2@example.test opens the cancellation of that record by a direct link
- **THEN** teacher2@example.test sees the message "You can cancel only your own records", and the record keeps status "Approved" without a cancellation request.

### Requirement: Рішення щодо прохання лише з правом

IF менеджер, що не є відповідальним менеджером посади запису, намагається підтвердити прохання про скасування в обхід сторінок порталу, THEN the system SHALL залишити запис «Approved» з «Cancellation requested» і не змінювати залишки працівника.

#### Scenario: AC-CANCEL-11 Менеджер чужої посади в обхід сторінок

- **GIVEN** the request from AC-CANCEL-01, and manager2@example.test is not a manager of that record's position
- **WHEN** manager2@example.test tries to confirm the cancellation directly, bypassing the portal's pages
- **THEN** the record keeps status "Approved" with "Cancellation requested", and teacher1@example.test's balances are unchanged.

### Requirement: Скасування без входу

IF гість, що не увійшов, відкриває скасування запису за прямим посиланням, THEN the system SHALL показати сторінку входу й не показати жодного запису.

#### Scenario: AC-CANCEL-12 Гість за прямим посиланням

- **GIVEN** nobody is signed in
- **WHEN** a visitor opens the cancellation of a record by a direct link
- **THEN** the visitor sees the sign-in page, and no record is shown.

### Requirement: Закриття дня після скасування

WHEN єдиний запис дати скасовано і адміністратор додає закриття на цю дату, the system SHALL зберегти закриття й показати його в шкільному календарі.

#### Scenario: AC-CANCEL-13 Закриття дня скасованого запису

- **GIVEN** the record 2026-12-10 was cancelled in AC-CANCEL-02 and there are no other records on 2026-12-10
- **WHEN** the administrator adds the closure "Staff day" for 2026-12-10
- **THEN** the closure is saved, and the school calendar shows "Staff day" on 2026-12-10.
