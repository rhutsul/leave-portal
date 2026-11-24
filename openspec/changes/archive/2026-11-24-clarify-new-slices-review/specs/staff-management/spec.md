# Дельта: staff-management

## MODIFIED Requirements

### Requirement: Заступник менеджера на період

WHILE сьогоднішня дата (за Києвом) у межах періоду призначення заступника, яке зробив адміністратор, з обома датами включно, the system SHALL давати заступнику ті самі права, що в заміщуваного менеджера, на записи всіх його посад — бачити й вирішувати їх разом із ним, окрім власних записів заступника, — а поза періодом не показувати заступнику цих записів; рішення заступника лишаються після кінця періоду, а історія показує, що вирішив заступник.

#### Scenario: AC-STAFF-09 Заступник бачить і вирішує запис

- **GIVEN** teacher1@example.test has a record 2026-12-08 with status "Awaiting decision" of a position whose only manager is manager1@example.test
- **WHEN** the administrator assigns manager2@example.test as the deputy of manager1@example.test from 2026-12-07 to 2026-12-11 and manager2@example.test opens "Awaiting decision" on 2026-12-08
- **THEN** manager2@example.test sees the record 2026-12-08 of teacher1@example.test and can approve it, and manager1@example.test also still sees it.

#### Scenario: AC-STAFF-10 Поза періодом заступництва

- **GIVEN** the deputy assignment from AC-STAFF-09 and a new record of teacher1@example.test 2026-12-15 with status "Awaiting decision"
- **WHEN** manager2@example.test opens "Awaiting decision" on 2026-12-14
- **THEN** manager2@example.test does not see any record of teacher1@example.test.
