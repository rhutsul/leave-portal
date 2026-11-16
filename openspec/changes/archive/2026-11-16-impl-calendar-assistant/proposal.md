# План реалізації: помічник календаря (зріз 4, WS10)

## Why

Реалізуємо можливість `calendar-assistant`, специфікацію якої злито зміною `add-calendar-assistant` (PR #78):
адміністратор вставляє текст шкільного календаря, помічник календаря (AI) пропонує закриття, а адміністратор
перевіряє, виправляє і зберігає їх. Ця зміна — лише план (`skip_specs: true`): `design.md` з рішеннями (зокрема розділ
«AI») і `tasks.md` з вертикальними задачами, кожна — окремий PR «Реалізація».

## What Changes

Зміна покриває AC зі специфікації `openspec/specs/calendar-assistant/spec.md`:

- `calendar-assistant`: AC-ASSIST-01, AC-ASSIST-02, AC-ASSIST-03, AC-ASSIST-04, AC-ASSIST-05, AC-ASSIST-06,
  AC-ASSIST-07, AC-ASSIST-08, AC-ASSIST-09, AC-ASSIST-10, AC-ASSIST-11.

Порядок і межі задач — у `tasks.md`; відкрите питання PM mkozlovskyi-ops/course-staff-management-spec#27 (Q12) після
відповіді — окремою зміною специфікації і пунктом у задачі 1.
