# Дельта: leave-decision

## MODIFIED Requirements

### Requirement: Зміна годин запису до рішення

WHEN працівник змінює години свого запису зі статусом «Awaiting decision» або «Returned for revision» в межах розкладу тієї самої посади на ту саму дату, the system SHALL зберегти нові години й показати їх менеджеру, перевіряючи перетин лише з іншими записами посади, а поданий знову повернений запис перевести в «Awaiting decision» у списку тих самих менеджерів.

#### Scenario: AC-DECIDE-06 Повторне подання поверненого запису

- **GIVEN** запис зі статусом «Returned for revision»
- **WHEN** працівник змінює години з 08:30–15:30 на 09:00–12:00 і подає запис знову
- **THEN** запис має години 09:00–12:00 і статус «Awaiting decision»
- **AND** запис знову в списку «Awaiting decision» того самого менеджера

#### Scenario: AC-DECIDE-16 Зміна годин запису, що чекає рішення

- **GIVEN** запис 2026-11-02 08:30–15:30 зі статусом «Awaiting decision»
- **WHEN** працівник змінює години на 09:00–12:00
- **THEN** запис має години 09:00–12:00 і зберігає статус «Awaiting decision»
- **AND** менеджер бачить 09:00–12:00 у списку «Awaiting decision»

## ADDED Requirements

### Requirement: Коментар працівника для менеджера

WHEN менеджер відкриває запис, the system SHALL показати менеджеру коментар працівника, доданий до заявки цього запису.

#### Scenario: AC-DECIDE-20 Менеджер бачить коментар

- **GIVEN** запис заявки з коментарем "Doctor's appointment" і статусом «Awaiting decision»
- **WHEN** менеджер відкриває запис
- **THEN** менеджер бачить коментар "Doctor's appointment"

### Requirement: Змінюються лише години

IF працівник намагається змінити дату, посаду або тип відпустки свого запису, THEN the system SHALL не зберігати зміну й показати повідомлення "Only the hours can be changed. To change the date, position or leave type, cancel this record and submit a new request".

#### Scenario: AC-DECIDE-21 Спроба змінити тип відпустки

- **GIVEN** запис 2026-11-02 «Sick leave» зі статусом «Awaiting decision»
- **WHEN** працівник намагається змінити його тип відпустки на «Personal leave»
- **THEN** зміну не збережено
- **AND** працівник бачить повідомлення "Only the hours can be changed. To change the date, position or leave type, cancel this record and submit a new request"

### Requirement: Перетин при зміні годин

IF нові години запису перетинаються з іншим записом тієї самої посади в статусі «Awaiting decision», «Returned for revision» або «Approved», THEN the system SHALL не зберігати зміну й показати повідомлення "You already have a request for this time: <дата> <години іншого запису>".

#### Scenario: AC-DECIDE-22 Зміна годин перетинає інший запис

- **GIVEN** два записи однієї посади на 2026-11-02, 08:30–10:00 і 13:00–15:30, обидва зі статусом «Awaiting decision»
- **WHEN** працівник змінює другий запис на 09:00–15:30
- **THEN** зміну не збережено
- **AND** працівник бачить повідомлення "You already have a request for this time: 2026-11-02 08:30–10:00"
