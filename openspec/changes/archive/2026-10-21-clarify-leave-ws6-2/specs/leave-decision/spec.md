# Дельта: leave-decision

## MODIFIED Requirements

### Requirement: Рішення щодо кожного запису

WHEN менеджер погоджує або відхиляє запис зі статусом «Awaiting decision» — з коментарем або без нього, the system SHALL змінити статус лише цього запису на «Approved» або «Rejected», не змінюючи інших записів тієї самої заявки, і показати новий статус працівнику в «My requests».

#### Scenario: AC-DECIDE-02 Погоджено один запис із двох

- **GIVEN** заявка з 2 записами зі статусом «Awaiting decision»
- **WHEN** менеджер погоджує один із них
- **THEN** цей запис має статус «Approved»
- **AND** інший лишається «Awaiting decision»

#### Scenario: AC-DECIDE-03 Відхилення

- **GIVEN** запис зі статусом «Awaiting decision»
- **WHEN** менеджер відхиляє його
- **THEN** запис має статус «Rejected»
- **AND** працівник бачить цей статус у «My requests»

## ADDED Requirements

### Requirement: Коментар менеджера при погодженні чи відхиленні

WHEN менеджер погоджує або відхиляє запис із коментарем, the system SHALL зберегти коментар на записі й показати його працівнику в «My requests».

#### Scenario: AC-DECIDE-23 Відхилення з коментарем

- **GIVEN** запис зі статусом «Awaiting decision»
- **WHEN** менеджер відхиляє його з коментарем "Not enough staff that day"
- **THEN** запис має статус «Rejected»
- **AND** працівник бачить коментар "Not enough staff that day" у «My requests»

#### Scenario: AC-DECIDE-24 Погодження з коментарем

- **GIVEN** запис зі статусом «Awaiting decision»
- **WHEN** менеджер погоджує його з коментарем "Get well soon"
- **THEN** запис має статус «Approved»
- **AND** працівник бачить коментар "Get well soon" у «My requests»
