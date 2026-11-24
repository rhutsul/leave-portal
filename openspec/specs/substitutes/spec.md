# substitutes Specification

## Purpose
Дає менеджеру вести список можливих замін для кожного працівника, працівнику — вибрати заміну з цього списку для кожного
запису, а бухгалтерії — бачити позначку підвищення з хвилинами, коли асистент замінює вчителя.

Кроки GIVEN, WHEN і THEN — дослівні «Given», «When» і «Then» PM англійською (`requirements/06-substitutes.md`).

## Requirements

### Requirement: Список замін працівника

WHEN відповідальний менеджер будь-якої з посад працівника або адміністратор додає людей до списку замін працівника, the system SHALL показати в списку замін працівника рівно цих людей, не допускаючи працівника у власний список.

#### Scenario: AC-SUBST-01 Менеджер додає дві заміни

- **GIVEN** manager1@example.test is the manager of teacher1@example.test's main position and teacher1@example.test's substitute list is empty
- **WHEN** manager1@example.test adds assistant1@example.test and teacher2@example.test to teacher1@example.test's substitute list
- **THEN** the substitute list of teacher1@example.test shows exactly assistant1@example.test and teacher2@example.test.

### Requirement: Вибір заміни для запису

WHEN працівник у заявці вибирає заміну для запису й підтверджує підсумок, the system SHALL запропонувати лише людей зі списку замін працівника і створити запис із вибраною заміною, яку менеджер бачить на записі в «Awaiting decision».

#### Scenario: AC-SUBST-02 Запис із заміною

- **GIVEN** teacher1@example.test's substitute list from AC-SUBST-01 and a main position with the schedule Mon–Fri 08:30–15:30
- **WHEN** teacher1@example.test requests "Personal leave" for the whole day Wednesday 2026-12-02, chooses the substitute assistant1@example.test and confirms the summary
- **THEN** 1 record 2026-12-02 08:30–15:30 is created with status "Awaiting decision" and the substitute assistant1@example.test, and manager1@example.test sees the substitute on that record in "Awaiting decision".

#### Scenario: AC-SUBST-04 Пропонуються лише люди зі списку

- **GIVEN** teacher1@example.test's substitute list from AC-SUBST-01 and the employee teacher3@example.test who is not on it
- **WHEN** teacher1@example.test chooses a substitute for a record
- **THEN** the choice offers exactly assistant1@example.test and teacher2@example.test, and teacher3@example.test is not offered.

### Requirement: Запис без заміни

WHEN працівник підтверджує заявку, не вибравши заміни, the system SHALL створити запис і показати на ньому працівнику й менеджеру «No substitute»; WHERE список замін працівника порожній, the system SHALL замість вибору показати повідомлення "Your manager has not added substitutes for you yet" і дозволити підтвердити заявку з «No substitute».

#### Scenario: AC-SUBST-03 Без вибору заміни

- **GIVEN** teacher1@example.test's substitute list from AC-SUBST-01
- **WHEN** teacher1@example.test requests the whole day 2026-12-02 without choosing a substitute and confirms the summary
- **THEN** the record is created, and both teacher1@example.test and manager1@example.test see "No substitute" on it.

#### Scenario: AC-SUBST-11 Порожній список замін

- **GIVEN** teacher1@example.test's substitute list is empty
- **WHEN** teacher1@example.test requests the whole day 2026-12-02
- **THEN** instead of a choice of substitutes teacher1@example.test sees the message "Your manager has not added substitutes for you yet", and the request can still be confirmed with "No substitute".

### Requirement: Зайнята заміна не приймається

IF вибрана заміна хоча б у одну хвилину запису має власний запис або є заміною в іншому записі зі статусом «Awaiting decision», «Returned for revision» чи «Approved», THEN the system SHALL не створювати заявку й показати повідомлення "<email заміни> is not available at this time: <дата> <години першого такого запису>", а записи «Rejected» і «Cancelled» заміну не займають.

#### Scenario: AC-SUBST-05 Заміна має власний запис

- **GIVEN** assistant1@example.test has an own record 2026-12-02 09:00–11:00 with status "Awaiting decision"
- **WHEN** teacher1@example.test chooses assistant1@example.test as the substitute for the record 2026-12-02 08:30–15:30 and confirms
- **THEN** no request is created, and teacher1@example.test sees the message "assistant1@example.test is not available at this time: 2026-12-02 09:00–11:00".

#### Scenario: AC-SUBST-06 Заміна вже замінює іншого

- **GIVEN** assistant1@example.test is the substitute in teacher2@example.test's record 2026-12-02 10:00–12:00 with status "Approved"
- **WHEN** teacher1@example.test chooses assistant1@example.test as the substitute for the record 2026-12-02 08:30–15:30 and confirms
- **THEN** no request is created, and teacher1@example.test sees the message "assistant1@example.test is not available at this time: 2026-12-02 10:00–12:00".

#### Scenario: AC-SUBST-07 Відхилений запис заміну не займає

- **GIVEN** assistant1@example.test's only record on 2026-12-02 has status "Rejected"
- **WHEN** teacher1@example.test chooses assistant1@example.test as the substitute for the record 2026-12-02 08:30–15:30 and confirms
- **THEN** the record is created with the substitute assistant1@example.test.

### Requirement: Позначка підвищення

WHERE посада відсутнього працівника в записі має назву, що містить «teacher», а основна посада заміни має назву «Assistant», the system SHALL показати на записі позначку "With upgrade: <хвилини запису> min", а за інших поєднань посад — не показувати позначки.

#### Scenario: AC-SUBST-08 Асистент замінює вчителя

- **GIVEN** teacher1@example.test's position is "Elementary school / Teacher" and assistant1@example.test's main position is "Elementary school / Assistant"
- **WHEN** teacher1@example.test requests 2026-12-02 from 08:30 to 12:00 with the substitute assistant1@example.test and confirms
- **THEN** the record shows the substitute assistant1@example.test and the mark "With upgrade: 210 min".

#### Scenario: AC-SUBST-09 Вчитель замінює вчителя

- **GIVEN** teacher2@example.test's main position is "High school / Math teacher"
- **WHEN** teacher1@example.test requests 2026-12-02 from 08:30 to 12:00 with the substitute teacher2@example.test and confirms
- **THEN** the record shows the substitute teacher2@example.test and has no "With upgrade" mark.

### Requirement: Мої заміни

WHEN користувач відкриває «My substitutions», the system SHALL показати записи, де він заміна, зі статусом «Awaiting decision», «Returned for revision» чи «Approved» — дату, години, відсутнього працівника й статус, — а коли таких записів немає, показати повідомлення "You are not covering for anyone".

#### Scenario: AC-SUBST-10 Один запис у «My substitutions»

- **GIVEN** the record from AC-SUBST-02
- **WHEN** assistant1@example.test opens "My substitutions"
- **THEN** assistant1@example.test sees 1 line: 2026-12-02 08:30–15:30, teacher1@example.test, status "Awaiting decision".

#### Scenario: AC-SUBST-15 Немає замін

- **GIVEN** assistant1@example.test is not a substitute in any record with status "Awaiting decision", "Returned for revision" or "Approved"
- **WHEN** assistant1@example.test opens "My substitutions"
- **THEN** assistant1@example.test sees the message "You are not covering for anyone".

### Requirement: Список замін змінює лише менеджер посади

IF користувач, що не є відповідальним менеджером жодної з посад працівника чи адміністратором, відкриває зміну списку замін працівника або змінює його в обхід сторінок порталу, THEN the system SHALL не змінювати список, а на сторінці показати повідомлення "Only the manager of this employee's position can change the substitute list".

#### Scenario: AC-SUBST-12 Працівник за прямим посиланням

- **GIVEN** teacher1@example.test is signed in and has only the employee role
- **WHEN** teacher1@example.test opens teacher2@example.test's substitute list for changing by a direct link
- **THEN** teacher1@example.test sees the message "Only the manager of this employee's position can change the substitute list", and teacher2@example.test's substitute list is unchanged.

#### Scenario: AC-SUBST-13 Менеджер чужих посад в обхід сторінок

- **GIVEN** manager2@example.test is not the manager of any of teacher1@example.test's positions
- **WHEN** manager2@example.test tries to add teacher3@example.test to teacher1@example.test's substitute list directly, bypassing the portal's pages
- **THEN** teacher1@example.test's substitute list is unchanged and still shows exactly assistant1@example.test and teacher2@example.test.

### Requirement: Мої заміни без входу

IF гість, що не увійшов, відкриває «My substitutions» за прямим посиланням, THEN the system SHALL показати сторінку входу без записів та імен.

#### Scenario: AC-SUBST-14 Гість за прямим посиланням

- **GIVEN** nobody is signed in
- **WHEN** a visitor opens "My substitutions" by a direct link
- **THEN** the visitor sees the sign-in page, and no records or names are shown.
