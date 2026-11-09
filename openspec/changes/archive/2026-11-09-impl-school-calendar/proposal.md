# План реалізації: шкільний календар (зріз WS7 PM, реалізуємо у WS9)

## Why

Реалізуємо можливість `school-calendar`, специфікацію якої злито зміною `add-school-calendar` (PR #61): адміністратор
додає й видаляє закриття, усі бачать календар, закриті дні й години не беруться в заявку й не рахуються робочим часом
у залишках. Ця зміна — лише план (`skip_specs: true`): `design.md` з технічними рішеннями й `tasks.md` з вертикальними
задачами, кожна — окремий PR «Реалізація».

## What Changes

Зміна покриває AC зі специфікації `openspec/specs/school-calendar/spec.md`:

- `school-calendar`: AC-CAL-01, AC-CAL-02, AC-CAL-03, AC-CAL-04, AC-CAL-05, AC-CAL-06, AC-CAL-07, AC-CAL-08,
  AC-CAL-09, AC-CAL-10, AC-CAL-11, AC-CAL-12, AC-CAL-13, AC-CAL-14, AC-CAL-15.

Порядок і межі задач — у `tasks.md`; відкриті питання PM (mkozlovskyi-ops/course-staff-management-spec#22, #23, #24)
після відповіді — окремою зміною `clarify-school-calendar` і задачею в цьому плані.
