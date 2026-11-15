# План реалізації: виправлення шкільного календаря за рев'ю WS9

## Why

Доводимо зріз «шкільний календар» (`openspec/specs/school-calendar/spec.md`, AC-CAL-01…20) за рев'ю викладача WS9
(12.11 і 14.11): сума часток однієї дати не має перевищувати 1.00, коли календар змінився між погодженнями
(Assumptions `requirements/03-leave-balance.md`, «One date never counts as more than 1.00 day»); правило «Enter the
closing time» має жити в базі, а не лише у формі; UAT на проді — один прогін усіх 20 AC з чистого дерева, з синтетичним
працівником для AC з балансом і розкладом. Уточнення AC-CAL-16…20 (зміна `clarify-school-calendar`, PR #74) реалізовано
в PR #75 без власного плану — ця зміна дає їм задачі з «Done when», щоб рядки `docs/conformance.md` вели до задачі.
Ця зміна — лише план (`skip_specs: true`): `design.md` і `tasks.md`.

## What Changes

Зміна покриває AC зі специфікацій:

- `school-calendar`: AC-CAL-06, AC-CAL-16, AC-CAL-17, AC-CAL-18, AC-CAL-19, AC-CAL-20 і повторний UAT AC-CAL-01…20;
- `leave-balance`: AC-BALANCE-05 (дата не дорожча за 1.00, коли календар змінився між погодженнями).

Поведінки за AC не змінюємо: нових правил, яких немає у вимогах PM, план не додає. Дзеркальний випадок частки дня
(0.65 замість 1.00) — відкрите питання до PM (`design.md`, Open questions).
