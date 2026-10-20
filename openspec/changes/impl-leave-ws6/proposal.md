# План реалізації: зріз WS6 — подання заявки, рішення менеджера, залишки

## Why

Реалізуємо зріз WS6, специфікацію якого злито зміною `add-leave-ws6`: можливості `leave-request`, `leave-decision` і
`leave-balance` в `openspec/specs/`. Ця зміна — лише план (`skip_specs: true`): `design.md` з технічними рішеннями й
`tasks.md` з вертикальними задачами, кожна — окремий PR «Реалізація».

## What Changes

Зміна покриває AC зі специфікації `openspec/specs/`:

- `leave-request`: AC-LEAVE-01, AC-LEAVE-02, AC-LEAVE-03, AC-LEAVE-04, AC-LEAVE-05, AC-LEAVE-06, AC-LEAVE-07,
  AC-LEAVE-08, AC-LEAVE-09, AC-LEAVE-10, AC-LEAVE-11, AC-LEAVE-12, AC-LEAVE-13, AC-LEAVE-14, AC-LEAVE-15, AC-LEAVE-16.
- `leave-decision`: AC-DECIDE-01, AC-DECIDE-02, AC-DECIDE-03, AC-DECIDE-04, AC-DECIDE-05, AC-DECIDE-06, AC-DECIDE-07,
  AC-DECIDE-08, AC-DECIDE-09, AC-DECIDE-10, AC-DECIDE-11, AC-DECIDE-12, AC-DECIDE-13, AC-DECIDE-14, AC-DECIDE-15,
  AC-DECIDE-16, AC-DECIDE-17, AC-DECIDE-18, AC-DECIDE-19.
- `leave-balance`: AC-BALANCE-01, AC-BALANCE-02, AC-BALANCE-03, AC-BALANCE-04, AC-BALANCE-05, AC-BALANCE-06,
  AC-BALANCE-07, AC-BALANCE-08, AC-BALANCE-09, AC-BALANCE-10, AC-BALANCE-11, AC-BALANCE-12, AC-BALANCE-13,
  AC-BALANCE-14, AC-BALANCE-15, AC-BALANCE-16.

Порядок і межі задач — у `tasks.md`; що не встигнемо в цьому зрізі — у `docs/conformance.md` зі статусом
«відкладено (причина)».
