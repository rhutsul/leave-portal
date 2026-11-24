# Дельта: leave-request

Кроки GIVEN, WHEN і THEN нових сценаріїв — дослівні «Given», «When» і «Then» PM англійською
(`requirements/01-leave-request.md`).

## ADDED Requirements

### Requirement: Нагадування про довгу Personal leave

WHEN працівник відкриває підсумок заявки, у якій «Personal leave» разом за правилом частки дня дає 2.00 дні або більше, the system SHALL показати нагадування "Personal leave of 2 days or more: please talk to the administrator before you go", не зупиняючи заявку, а коли менше за 2.00 дні — не показувати його.

#### Scenario: AC-LEAVE-23 Personal leave на 2.00 дні — нагадування

- **GIVEN** an employee with the schedule Mon–Fri 08:30–15:30
- **WHEN** the employee requests "Personal leave" for the whole days Monday 2026-12-07 and Tuesday 2026-12-08 (2.00 days) and opens the summary
- **THEN** the employee sees the reminder "Personal leave of 2 days or more: please talk to the administrator before you go", and after confirming, the request is created with 2 records.

#### Scenario: AC-LEAVE-24 Personal leave на 1.50 дні — без нагадування

- **GIVEN** an employee with the schedule Mon–Fri 08:30–15:30
- **WHEN** the employee requests "Personal leave" for the whole day 2026-12-07 and for 2026-12-08 from 08:30 to 12:00 in one request (1.50 days in total) and opens the summary
- **THEN** the employee does not see the reminder about Personal leave of 2 days or more.
