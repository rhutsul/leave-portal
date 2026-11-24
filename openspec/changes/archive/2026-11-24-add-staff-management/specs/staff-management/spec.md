# Дельта: staff-management

## Purpose

Дає адміністратору керувати працівниками, посадами, розкладами, відповідальними менеджерами й заступниками в порталі —
без розробника і без втрати історії відпусток, — а кожному користувачу змінювати свій пароль.

Кроки GIVEN, WHEN і THEN — дослівні «Given», «When» і «Then» PM англійською (`requirements/07-staff-management.md`).

## ADDED Requirements

### Requirement: Створення працівника з одноразовим посиланням

WHEN адміністратор створює працівника з іменем і email, якого ще немає серед усіх працівників, the system SHALL показати працівника в списку зі статусом «Invited» і дати адміністратору одноразове посилання для входу, дійсне 7 днів включно з днем створення, а нове посилання — робити попереднє недійсним.

#### Scenario: AC-STAFF-01 Новий працівник і посилання

- **GIVEN** the administrator is signed in and there is no employee teacher3@example.test
- **WHEN** the administrator creates the employee "Teacher Three" with the email teacher3@example.test on 2026-12-01
- **THEN** the employee list shows "Teacher Three", teacher3@example.test, status "Invited", and the administrator sees a one-time sign-in link valid until 2026-12-08.

### Requirement: Пароль за одноразовим посиланням

WHEN людина відкриває дійсне одноразове посилання й задає пароль щонайменше з 8 знаків, the system SHALL увійти від її імені, показати повідомлення "Your password is set" і показати працівника в списку зі статусом «Active»; IF посилання прострочене, THEN the system SHALL показати повідомлення "This link has expired. Ask the administrator for a new one" і не дати задати пароль.

#### Scenario: AC-STAFF-02 Пароль за дійсним посиланням

- **GIVEN** the link from AC-STAFF-01 and today is 2026-12-03
- **WHEN** the person opens the link and sets a password of 10 characters
- **THEN** they are signed in as teacher3@example.test and see the message "Your password is set", and the employee list shows teacher3@example.test with status "Active".

#### Scenario: AC-STAFF-03 Прострочене посилання

- **GIVEN** the link from AC-STAFF-01 and today is 2026-12-09
- **WHEN** the person opens the link
- **THEN** they see the message "This link has expired. Ask the administrator for a new one", and no password can be set.

### Requirement: Посада з розкладом і менеджерами

WHEN адміністратор створює для працівника посаду з типом, підрозділом, назвою, тижневим розкладом з дати й відповідальними менеджерами, the system SHALL показати працівнику посаду й розклад у «Your weekly schedule», а менеджерам — працівника серед працівників їхніх посад.

#### Scenario: AC-STAFF-04 Основна посада нового працівника

- **GIVEN** the active employee teacher3@example.test without positions
- **WHEN** the administrator creates for teacher3@example.test the main position "Elementary school / Teacher" with the schedule Mon–Fri 08:30–15:30 from 2026-12-07 and the responsible manager manager1@example.test
- **THEN** teacher3@example.test sees this position and its schedule in "Your weekly schedule", and manager1@example.test sees teacher3@example.test among the employees of their positions.

### Requirement: Рівно одна основна посада

IF адміністратор створює другу основну посаду працівнику, що вже має основну, THEN the system SHALL не зберегти посаду й показати повідомлення "An employee has exactly one main position".

#### Scenario: AC-STAFF-05 Друга основна посада

- **GIVEN** teacher3@example.test has the main position from AC-STAFF-04
- **WHEN** the administrator tries to create another main position "High school / Math teacher" for teacher3@example.test
- **THEN** the position is not saved, and the administrator sees the message "An employee has exactly one main position".

### Requirement: Розклади посад не перетинаються

IF розклад нової чи зміненої посади перетинається з розкладом іншої посади того самого працівника на будь-яку дату, THEN the system SHALL не зберегти посаду й показати повідомлення "This schedule overlaps the position <підрозділ> / <назва>: <день> <години>".

#### Scenario: AC-STAFF-06 Перетин розкладів

- **GIVEN** teacher3@example.test has the main position with the schedule Mon 08:30–15:30
- **WHEN** the administrator creates the additional position "High school / Math teacher" with the schedule Mon 15:00–17:00
- **THEN** the position is not saved, and the administrator sees the message "This schedule overlaps the position Elementary school / Teacher: Mon 08:30–15:30".

### Requirement: Розклад з дати

WHEN адміністратор задає посаді новий розклад з дати, the system SHALL застосовувати новий розклад до записів з цієї дати, попередній — до записів раніше, і не змінювати наявних записів.

#### Scenario: AC-STAFF-07 Новий розклад не змінює погодженого запису

- **GIVEN** teacher1@example.test's main position has the schedule Mon–Fri 08:30–15:30 and a record 2026-12-08 08:30–15:30 with status "Approved"
- **WHEN** the administrator sets the new schedule Mon–Fri 08:30–12:30 from 2026-12-07 and teacher1@example.test then requests the whole day 2026-12-09
- **THEN** the record 2026-12-08 still shows 08:30–15:30, and the new record 2026-12-09 is 08:30–12:30.

### Requirement: Деактивація працівника

WHEN адміністратор деактивує працівника, the system SHALL не дати йому увійти, показуючи повідомлення "Your account is deactivated. Contact the administrator", і зберегти його записи й залишки в історії менеджерів і в реєстрі.

#### Scenario: AC-STAFF-08 Деактивований працівник

- **GIVEN** the active employee teacher3@example.test with a record 2026-12-08 with status "Approved"
- **WHEN** the administrator deactivates teacher3@example.test and teacher3@example.test then tries to sign in
- **THEN** teacher3@example.test sees the message "Your account is deactivated. Contact the administrator" and is not signed in, and manager1@example.test still sees the record 2026-12-08 of teacher3@example.test in "History".

### Requirement: Заступник менеджера на період

WHILE призначення заступника, яке адміністратор зробив на період з обома датами включно, діє на дату запису, the system SHALL давати заступнику ті самі права, що в заміщуваного менеджера, на записи всіх його посад — бачити й вирішувати їх разом із ним, окрім власних записів заступника, — а поза періодом не показувати заступнику цих записів.

#### Scenario: AC-STAFF-09 Заступник бачить і вирішує запис

- **GIVEN** teacher1@example.test has a record 2026-12-08 with status "Awaiting decision" of a position whose only manager is manager1@example.test
- **WHEN** the administrator assigns manager2@example.test as the deputy of manager1@example.test from 2026-12-07 to 2026-12-11 and manager2@example.test opens "Awaiting decision" on 2026-12-08
- **THEN** manager2@example.test sees the record 2026-12-08 of teacher1@example.test and can approve it, and manager1@example.test also still sees it.

#### Scenario: AC-STAFF-10 Поза періодом заступництва

- **GIVEN** the deputy assignment from AC-STAFF-09 and a new record of teacher1@example.test 2026-12-15 with status "Awaiting decision"
- **WHEN** manager2@example.test opens "Awaiting decision" on 2026-12-14
- **THEN** manager2@example.test does not see any record of teacher1@example.test.

### Requirement: Порожній список заступників

WHEN адміністратор відкриває список заступників, а жодного заступника ще не призначено, the system SHALL показати повідомлення "No deputies assigned".

#### Scenario: AC-STAFF-19 Немає заступників

- **GIVEN** no deputy has ever been assigned
- **WHEN** the administrator opens the list of deputies
- **THEN** the administrator sees the message "No deputies assigned".

### Requirement: Ім'я й email змінює адміністратор

WHEN адміністратор змінює ім'я чи email працівника, the system SHALL показати нові ім'я й email у списку працівників і в записах, а людина SHALL входити з новим email і тим самим паролем; IF працівник намагається змінити власні ім'я чи email, THEN the system SHALL не змінювати їх і показати повідомлення "Only an administrator can change names and emails".

#### Scenario: AC-STAFF-11 Нові ім'я й email

- **GIVEN** the employee teacher1@example.test named "Teacher One"
- **WHEN** the administrator changes the name to "Teacher One-Smith" and the email to teacher1-new@example.test
- **THEN** the employee list shows "Teacher One-Smith", teacher1-new@example.test, and the person signs in with teacher1-new@example.test and the same password.

#### Scenario: AC-STAFF-12 Працівник змінює собі ім'я чи email

- **GIVEN** teacher1@example.test is signed in and has only the employee role
- **WHEN** teacher1@example.test tries to change their own name or email
- **THEN** teacher1@example.test sees the message "Only an administrator can change names and emails", and both the name and the email stay the same.

### Requirement: Працівниками керує лише адміністратор

IF користувач, що не є адміністратором, відкриває сторінки керування працівниками чи змінює працівників, посади або призначення заступників в обхід сторінок порталу, THEN the system SHALL нічого з цього не змінювати, а на сторінці показати повідомлення "Only an administrator can manage employees".

#### Scenario: AC-STAFF-13 Менеджер за прямим посиланням

- **GIVEN** manager1@example.test is signed in and is not an administrator
- **WHEN** manager1@example.test opens the page for creating employees by a direct link
- **THEN** manager1@example.test sees the message "Only an administrator can manage employees", and the employee list is unchanged.

#### Scenario: AC-STAFF-14 Менеджер призначає себе заступником в обхід сторінок

- **GIVEN** manager1@example.test is not an administrator
- **WHEN** manager1@example.test tries to assign themselves as a deputy directly, bypassing the portal's pages
- **THEN** no deputy assignment exists, and manager1@example.test still sees only the records of their own positions.

### Requirement: Список працівників без входу

IF гість, що не увійшов, відкриває список працівників за прямим посиланням, THEN the system SHALL показати сторінку входу без імен та email.

#### Scenario: AC-STAFF-15 Гість за прямим посиланням

- **GIVEN** nobody is signed in
- **WHEN** a visitor opens the employee list by a direct link
- **THEN** the visitor sees the sign-in page, and no names or emails are shown.

### Requirement: Зміна власного пароля

WHEN користувач, що увійшов, вводить правильний поточний пароль і новий пароль щонайменше з 8 знаків, the system SHALL змінити пароль, показати повідомлення "Your password has been changed" і далі приймати при вході лише новий пароль; IF поточний пароль неправильний, THEN the system SHALL не змінювати пароль і показати повідомлення "The current password is incorrect".

#### Scenario: AC-STAFF-16 Правильний поточний пароль

- **GIVEN** teacher1@example.test is signed in
- **WHEN** teacher1@example.test enters the correct current password and a new password of 12 characters
- **THEN** teacher1@example.test sees the message "Your password has been changed", and on the next sign-in only the new password works.

#### Scenario: AC-STAFF-17 Неправильний поточний пароль

- **GIVEN** teacher1@example.test is signed in
- **WHEN** teacher1@example.test enters a wrong current password and a new password
- **THEN** teacher1@example.test sees the message "The current password is incorrect", and the old password still works.

### Requirement: Адміністратор не змінює власну роль

IF адміністратор намагається змінити власну роль, THEN the system SHALL не змінювати роль і показати повідомлення "You cannot change your own role".

#### Scenario: AC-STAFF-18 Єдиний адміністратор знімає собі роль

- **GIVEN** the administrator is the only administrator
- **WHEN** the administrator tries to remove their own administrator role
- **THEN** the role is not changed, and the administrator sees the message "You cannot change your own role".
