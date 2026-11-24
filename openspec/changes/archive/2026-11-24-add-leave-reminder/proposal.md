# Пропозиція: нагадування поговорити з адміністратором про довгу Personal leave

## Why

Працівник, що бере Personal leave на кілька днів, має заздалегідь поговорити з адміністратором, але портал про це не
нагадує. Зріз додає в підсумок заявки нагадування, коли Personal leave у заявці займає 2.00 дні або більше; нагадування
нічого не блокує.

Джерело — вимога PM (знімок 2026-11-24, `docs/` репо `mkozlovskyi-ops/course-staff-management-spec`):
`requirements/01-leave-request.md` (джерело — `docs/requirements/01-leave-request.md`, коміт 2064613), AC-LEAVE-23 і
AC-LEAVE-24, і припущення про нагадування; правило частки дня — `requirements/03-leave-balance.md`. У roadmap PM — рядок
WS11 (`requirements/product.md`).

## What Changes

- У підсумку заявки, де «Personal leave» разом дає 2.00 дні або більше, працівник бачить нагадування «Personal leave of 2
  days or more: please talk to the administrator before you go», а заявка після підтвердження створюється як завжди
  (AC-LEAVE-23).
- Коли «Personal leave» у заявці менше за 2.00 дні, нагадування немає (AC-LEAVE-24).

## Capabilities

### New Capabilities

—

### Modified Capabilities

- `leave-request`: нова вимога «Нагадування про довгу Personal leave» (ADDED); наявні вимоги й AC без змін.

## Users & roles

| Роль | Сутність | Дія в цьому зрізі |
|---|---|---|
| `employee`, `manager`, `admin` | своя заявка | бачить нагадування в підсумку власної заявки |
| `manager`, `admin` | заявка від імені працівника | бачить те саме нагадування (`08-on-behalf-and-edit.md`, зміна `add-on-behalf-and-edit`) |

## Non-goals

- Будь-яке блокування заявки чи окреме погодження адміністратором: це лише нагадування.
- Листи чи сповіщення адміністратору.

## Assumptions

З «Assumptions» PM (вимога 01):

- Нагадування з'являється в підсумку, коли «Personal leave» заявки разом дає 2.00 дні або більше за правилом частки
  дня з `03-leave-balance.md`; воно лише нагадує й ніколи не зупиняє заявку.
- Його бачить і менеджер, що подає заявку від імені працівника (`08-on-behalf-and-edit.md`).

Власні припущення (розробник):

- **(розробник)** Межа включна: рівно 2.00 дні — нагадування є (AC-LEAVE-23), 1.99 і менше — немає.

## Open questions

Відкритих питань PM немає («None»). Наших питань до PM немає.
