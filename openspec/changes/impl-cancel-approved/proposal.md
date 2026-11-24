# План: скасування погодженого запису через менеджера

## Why

Реалізуємо зріз «скасування погодженого запису» за `openspec/specs/leave-cancellation/spec.md` і зміненою вимогою
«Список «Awaiting decision» менеджера» в `openspec/specs/leave-decision/spec.md` (зміни специфікації
`2026-11-24-add-cancel-approved` і `2026-11-24-clarify-new-slices-review`; вимога PM
`requirements/09-cancel-approved.md`). Зараз погоджений запис скасувати не можна: дні лишаються списаними із залишку, а
день не можна закрити в шкільному календарі.

## What Changes

Покриває AC з `openspec/specs/`:

- AC-CANCEL-01 — прохання працівника про скасування з причиною; позначка «Cancellation requested»; запис у «Awaiting
  decision» менеджера з «Cancellation requested: <причина>»
- AC-CANCEL-02 — підтвердження: «Cancelled», дні повертаються в залишок
- AC-CANCEL-03 — відхилення з коментарем: «Approved» без позначки, «Cancellation declined: <коментар>»
- AC-CANCEL-04 — відхилення без коментаря: повідомлення "Tell the employee why the cancellation is declined"
- AC-CANCEL-05 — запис у минулому: "Records in the past cannot be cancelled"
- AC-CANCEL-06 — повторне прохання: "Cancellation has already been requested", прохання одне
- AC-CANCEL-07 — підтвердження розділеного запису повертає обидві частини
- AC-CANCEL-08 — скасування менеджером з приміткою; примітку видно в «My requests»
- AC-CANCEL-09 — скасування без примітки: "Tell the employee why the record is cancelled"
- AC-CANCEL-10 — чужий запис за прямим посиланням: "You can cancel only your own records"
- AC-CANCEL-11 — менеджер чужої посади в обхід сторінок: нічого не змінюється
- AC-CANCEL-12 — гість за прямим посиланням: сторінка входу
- AC-CANCEL-13 — після скасування день можна закрити в шкільному календарі

Наявні AC, поведінку яких зачіпає зріз і які мають лишитися зеленими: AC-DECIDE-01, AC-DECIDE-14 (список «Awaiting
decision» тепер містить і прохання про скасування), AC-CAL-07, AC-CAL-08 (запис із «Cancellation requested» ще блокує
закриття дня), AC-BALANCE-10 (розподіл).

Нові: міграція (колонки прохання на `leave_records`, нові дії історії, три функції запису), сторінка
`/requests/[id]/cancel`, дії в «My requests» і в панелі запису «Decisions», тести PGlite, unit і e2e.

Поза зрізом: заступники (вимога 07 ще не реалізована), листи, відкликання прохання працівником, скасування частини
годин і записів у минулому — як у «Out of scope» PM.
