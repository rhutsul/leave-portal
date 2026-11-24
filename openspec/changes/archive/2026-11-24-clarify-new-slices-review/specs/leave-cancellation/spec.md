# Дельта: leave-cancellation

## MODIFIED Requirements

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
