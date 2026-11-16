# Звіт UAT — 16.11.2026

- **Застосунок:** https://leave-portal-olive.vercel.app (/api/health: коміт `4073930`)
- **Код тестів:** `task/assistant-uat` @ `9e0c323`, дерево чисте
- **Прогін:** 16.11.2026, 10:48 (Київ), Playwright 93.8 с; AC: 4 — PASS 3, FAIL 0, NEEDS-HUMAN 1
- **Рецензент:** `claude-haiku-5-5`; суперечки → `claude-sonnet-5-5`. Разом за розбір: $0.0785 (ціни API; за підпискою — у межах ліміту плану)
- **Прибирання:** рядків UAT шкільного календаря видалено 1 (закриття «Winter holidays» 2026-12-28…2027-01-08 (зі сторінки)), закриттів AC лишилось 0, записів teacher1@ у датах AC лишилось 0
- **Відео й траси:** не в git — `test-results/` локально або артефакт CI; трасу відкриває `npx playwright show-trace <trace.zip>`

| AC | Перевірки | Агент | Підсумок | Чому | Playwright | Розбір |
|---|---|---|---|---|---|---|
| AC-ASSIST-03 | пройшли | Haiku: PASS | **PASS** | R6: перевірки, агент і цитати збігаються | 27.9 с | $0.0022, 7.9 с |
| AC-ASSIST-06 | пройшли | Haiku: PASS | **PASS** | R6: перевірки, агент і цитати збігаються | 10.7 с | $0.0026, 14.0 с |
| AC-ASSIST-10 | пройшли | Haiku: FAIL, Sonnet: FAIL | **NEEDS-HUMAN** | R3: перевірки пройшли, агент не погоджується — вирішує людина | 10.2 с | $0.0404, 20.0 с |
| AC-ASSIST-11 | пройшли | Haiku: NEEDS-HUMAN, Sonnet: PASS | **PASS** | R6: перевірки, агент і цитати збігаються | 9.8 с | $0.0333, 22.1 с |

## AC-ASSIST-03 — PASS

**Тест:** AC-ASSIST-03: removes "Teachers' meeting", renames "Winter break" to "Winter holidays" and saves — the calendar shows only "Winter holidays"

**Критерій** (requirements/05-calendar-assistant.md):

> AC-ASSIST-03: Given the 2 suggested closures from AC-ASSIST-01. When the administrator removes "Teachers' meeting", changes the name "Winter break" to "Winter holidays" and saves. Then the school calendar shows only "Winter holidays" 2026-12-28 – 2027-01-08.

![Кадр «Тоді» 1](frames/AC-ASSIST-03-then-1.png)

**Кроки:** ✔ Дано: the 2 suggested closures from AC-ASSIST-01 → ✔ Коли: the administrator removes "Teachers' meeting", changes the name "Winter break" to "Winter holidays" and saves → ✔ Тоді: the school calendar shows only "Winter holidays" 2026-12-28 – 2027-01-08.

**Агент (claude-haiku-5-5, PASS):** У блоці Closures (лічильник «1») видно лише один запис «Winter holidays» з датами 2026-12-28 – 2027-01-08 і позначкою «Whole days». Записів «Teachers' meeting» і «Winter break» у списку немає, що підтверджує лічильник 1.

**Цитати агента, звірені зі сторінкою (aria):**
- «Winter holidays» — є на сторінці
- «2026-12-28 – 2027-01-08» — є на сторінці
- «Closures» — є на сторінці
- «1» — є на сторінці

**Правило:** R6: перевірки, агент і цитати збігаються

**Відео:** `test-results/artifacts/calendar-assistant-admin-e-b61e6-shows-only-Winter-holidays--chromium/video.webm` · **траса:** `test-results/artifacts/calendar-assistant-admin-e-b61e6-shows-only-Winter-holidays--chromium/trace.zip` (не в git)

**Рішення PM:** ☐ приймаю · ☐ відхилення від вимог (issue «Відхилення від вимог: AC-ASSIST-03 — …») · @login: ____

## AC-ASSIST-06 — PASS

**Тест:** AC-ASSIST-06: a poem request — no closures suggested, the refusal message

**Критерій** (requirements/05-calendar-assistant.md):

> AC-ASSIST-06: Given the administrator is signed in. When the administrator asks for suggestions for the text "Write a short poem about the winter holidays". Then no closures are suggested, and the administrator sees the message "The calendar assistant only helps to add school closures. Paste the text of the school calendar."

![Кадр «Тоді» 1](frames/AC-ASSIST-06-then-1.png)

**Кроки:** ✔ Дано: the administrator is signed in → ✔ Коли: the administrator asks for suggestions for the text "Write a short poem about the winter holidays" → ✔ Тоді: no closures are suggested, and the administrator sees the message "The calendar assistant only helps to add school closures. Paste the text of the school calendar."

**Агент (claude-haiku-5-5, PASS):** На кадрі в бічній панелі «Calendar assistant» з полем, де введено «Write a short poem about the winter holidays», видно повідомлення, що збігається з критерієм посимвольно (у кадрі воно розбито на два рядки, але це один текст). Списку запропонованих канікул немає, кнопки «Save closures» немає, є лише «Suggest closures»; ця частина підтверджується відсутністю елементів, тому цитати немає.

**Цитати агента, звірені зі сторінкою (aria):**
- «The calendar assistant only helps to add school closures. Paste the text of the school calendar.» — є на сторінці

**Правило:** R6: перевірки, агент і цитати збігаються

**Відео:** `test-results/artifacts/calendar-assistant-admin-e-abaf6-ggested-the-refusal-message-chromium/video.webm` · **траса:** `test-results/artifacts/calendar-assistant-admin-e-abaf6-ggested-the-refusal-message-chromium/trace.zip` (не в git)

**Рішення PM:** ☐ приймаю · ☐ відхилення від вимог (issue «Відхилення від вимог: AC-ASSIST-06 — …») · @login: ____

## AC-ASSIST-10 — NEEDS-HUMAN

**Тест:** AC-ASSIST-10: a text of 2001 characters — the assistant is not asked, the length message

**Критерій** (requirements/05-calendar-assistant.md):

> AC-ASSIST-10: Given the administrator pastes a text of 2001 characters. When the administrator asks for suggestions. Then the calendar assistant is not asked, and the administrator sees the message "The text can be at most 2000 characters".

![Кадр «Тоді» 1](frames/AC-ASSIST-10-then-1.png)

**Кроки:** ✔ Дано: the administrator pastes a text of 2001 characters → ✔ Коли: the administrator asks for suggestions → ✔ Тоді: the calendar assistant is not asked, and the administrator sees the message "The text can be at most 2000 characters".

**Агент (claude-sonnet-5-5, FAIL):** На кадрі відкрита панель Calendar assistant із довгим текстом з «x» у полі. Повідомлення про помилку довжини й лічильника «2001 / 2000» немає. Можливо, вони поза видимою ділянкою, але з кадру це підтвердити не можна.

Haiku сказав FAIL, тож розбір повторив Sonnet; рішення агента — за Sonnet.

**Агент бачить вади:**
- На кадрі немає повідомлення «The text can be at most 2000 characters».
- На кадрі немає лічильника «2001 / 2000».
- Видно лише панель Calendar assistant з довгим текстом із символів x, підказку «The assistant only suggests closures. Nothing is saved until you review the suggestions and save them.» і кнопку «Suggest closures». Решта панелі нижче або вище може бути прихована, бо текстове поле прокручене.

**Правило:** R3: перевірки пройшли, агент не погоджується — вирішує людина

**Відео:** `test-results/artifacts/calendar-assistant-admin-e-95c32-ot-asked-the-length-message-chromium/video.webm` · **траса:** `test-results/artifacts/calendar-assistant-admin-e-95c32-ot-asked-the-length-message-chromium/trace.zip` (не в git)

**Рішення PM:** ☐ приймаю · ☐ відхилення від вимог (issue «Відхилення від вимог: AC-ASSIST-10 — …») · @login: ____

## AC-ASSIST-11 — PASS

**Тест:** AC-ASSIST-11: teacher1@example.test opens the calendar assistant by a direct link — «Only an administrator can change the school calendar»

**Критерій** (requirements/05-calendar-assistant.md):

> AC-ASSIST-11: Given teacher1@example.test is signed in and has only the employee role. When teacher1@example.test opens the calendar assistant by a direct link. Then teacher1@example.test sees the message "Only an administrator can change the school calendar", and no closures are suggested or saved.

![Кадр «Тоді» 1](frames/AC-ASSIST-11-then-1.png)

**Кроки:** ✔ Дано: teacher1@example.test is signed in and has only the employee role → ✔ Коли: teacher1@example.test opens the calendar assistant by a direct link → ✔ Тоді: teacher1@example.test sees the message "Only an administrator can change the school calendar", and no closures are suggested or saved.

**Агент (claude-sonnet-5-5, PASS):** На кадрі панель «Calendar assistant» показує повідомлення «Only an administrator can change the school calendar» з поясненням. У панелі немає ні текстового поля, ні кнопок «Suggest closures» чи «Save closures». Підпис користувача — teacher1@exampl…

Haiku сказав NEEDS-HUMAN, тож розбір повторив Sonnet; рішення агента — за Sonnet.

**Цитати агента, звірені зі сторінкою (aria):**
- «Only an administrator can change the school calendar» — є на сторінці
- «You can see the school calendar, but only an administrator adds closures.» — є на сторінці

**Правило:** R6: перевірки, агент і цитати збігаються

**Відео:** `test-results/artifacts/calendar-assistant-teacher-7e034-change-the-school-calendar»-chromium/video.webm` · **траса:** `test-results/artifacts/calendar-assistant-teacher-7e034-change-the-school-calendar»-chromium/trace.zip` (не в git)

**Рішення PM:** ☐ приймаю · ☐ відхилення від вимог (issue «Відхилення від вимог: AC-ASSIST-11 — …») · @login: ____

## Як читати підсумок

- **PASS** — автоматичні перевірки пройшли, агент-рецензент погодився з кадром, а кожну його цитату знайдено на сторінці.
- **FAIL** — впала автоматична перевірка. Агент цього не перекриває: невидимі вади (буфер обміну, база) він на кадрі не побачить.
- **NEEDS-HUMAN** — перевірки зелені, але агент не погодився або його цитати немає на сторінці. Часто це слабкий тест або розбіжність між текстом AC і тестом — питання до PM, а не обов'язково вада продукту.

Правила: R1: перевірка впала — FAIL завжди, агент не перекриває; R2: немає вердикту агента або кадру; R3: перевірки пройшли, агент не погоджується — вирішує людина; R4: цитати агента немає на сторінці (aria) — не підтверджено; R5: помилка сторінки або 5xx під час сценарію; R6: перевірки, агент і цитати збігаються.
