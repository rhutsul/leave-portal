# Tasks

Кожна група — одна гілка `task/<коротко>` і один PR «Реалізація». Рядок «Done when» — AC, які PR переводить у
`реалізовано` в `docs/conformance.md` (тест із AC ID + код). Тести пише окрема сесія з тексту AC до коду. У кожному
PR — таблиця «AC → тест → рівень → як доводимо» і джерело запозичених файлів («взято з
https://github.com/koldovsky/2026-quitcode-10-ai-features-hw/tree/main/materials/ai-feature»). Задачі йдуть по черзі.

Передумови: злито PR набору AI (ADR 0009, залежності, `src/lib/ai/**` прикладу) і міграцію виду закриття з
«Enter the closing time» у `add_school_closure` (сесія WS9).

## 1. Помічник календаря: пропозиції, перевірка, збереження (`task/calendar-assistant`)

- [x] 1.1 Тести з тексту AC (окрема сесія, спершу червоні): unit `checkSuggestions` і промпту; golden офлайн
      `tests/golden.test.ts` з `cases.json` GC-01…GC-10 (назви з AC ID за D7); тести дій `requestSuggestions` і
      `saveSuggestions` (роль, довжина, ключ, збої, частковий успіх); компонент — «Preparing suggestions…»; PGlite —
      дві пропозиції, одна на вже закриту дату
- [x] 1.2 Схема `CalendarSuggestions` (D2), `checkSuggestions` у `src/lib/ai/suggestions.ts` (неіснуюча дата й скорочений день без часу → `needs_info`), `assistantTextLength`, промпт (D3) з
      `DRAFT_PROMPT_VERSION`, «сьогодні» параметром; тексти станів — константи з AC дослівно
- [x] 1.3 Server Actions `requestSuggestions` / `saveSuggestions` (D4), `timeout` 30 с, `maxRetries` 0; збої → AC-ASSIST-09; `closureRpcMessage` у `src/lib/leave/calendar.ts`; тег `@live-model` і `grepInvert` у `playwright.config.ts` (D9)
- [x] 1.4 Панель помічника на `/calendar` (`?assistant=1`, було — сторінка `/calendar/assistant`) і кнопка «Add from text» для адміністратора (D1): форма, стани `Alert`, пропозиції на сітці року,
      картки пропозицій з полями «Add closure», «Remove suggestion», «Save closures»; адаптив (ADR 0008);
      `npm run check:design`, `npm run check:ui`
- [ ] 1.5 Перевірка руками без ключа (`OPENROUTER_API_KEY=" "`): сторінка показує AC-ASSIST-09, ручна форма працює
      — не робили руками: замінено тестом дії «немає ключа → AC-ASSIST-09» (`tests/calendar-assistant-actions.test.ts`), proof pack «Не перевірено»
- [x] 1.6 Мутація Stryker на `src/lib/ai/suggestions.ts`; рядки `docs/conformance.md`; `npm run ac:coverage`,
      `npm run gates`, `npm run build`

AC-ASSIST-01, -05, -06, -07 у цьому PR лишаються «відкладено (чекає живого eval)»: golden на заглушках набору —
не доказ, тож «реалізовано» вони отримають у задачі 2.

Done when: AC-ASSIST-02, AC-ASSIST-03, AC-ASSIST-04, AC-ASSIST-08, AC-ASSIST-09, AC-ASSIST-10, AC-ASSIST-11.

## 2. Живий eval і записи (`task/assistant-eval`)

- [x] 2.1 `npm run ai:models` — ланцюжок існує; `npm run ai:quota` — вистачає ліміту (людина)
- [x] 2.2 `RECORD=1 npm run eval` у звичайному терміналі (людина), не в добу приймання PM
- [x] 2.3 Звіт `evals/reports/<дата й час>.md` і `recorded.json` без заглушок; кожен FAIL — одним рядком (модель,
      промпт, кейс), що виправлено або чому лишили; зміна промпту — `DRAFT_PROMPT_VERSION` + 1 і новий прогін
      наступної доби
- [x] 2.4 Поріг PM: ≥ 8 з 10, GC-08, GC-09, GC-10 — PASS; інакше — виправлення промпту чи `checkSuggestions` і
      повторний прогін

Done when: AC-ASSIST-01, AC-ASSIST-05, AC-ASSIST-06, AC-ASSIST-07 (golden офлайн через увесь ланцюжок на справжніх записах).

## 3. Прод, UAT і здача (`task/assistant-uat`)

- [x] 3.1 `OPENROUTER_API_KEY` у Vercel Production (людина); `/api/health` — SHA `main`; на проді — один кейс, що
      проходить, і одна відмова руками
- [x] 3.2 `tests/e2e/calendar-assistant.spec.ts` (D9): AC-ASSIST-03, AC-ASSIST-06, AC-ASSIST-10, AC-ASSIST-11;
      `npm run uat -- --url https://leave-portal-olive.vercel.app` (людина, чисте дерево) → `docs/qa/uat/<дата>/`
- [x] 3.3 `docs/conformance.md` — чесний статус кожного AC зрізу 4; proof pack; самоперевірка (ключ ніде, запис лише
      після людини, заглушок немає)
- [ ] 3.4 «eval готовий: прод <URL>, звіт <посилання>» у чаті команди (людина); archive `impl-calendar-assistant`
      — archive зроблено в PR UAT; повідомлення в чат команди — людина

Done when: UAT на проді для AC-ASSIST-03, AC-ASSIST-06, AC-ASSIST-10, AC-ASSIST-11 (статуси «реалізовано» вже з задач 1 і 2; тут — запис на проді й proof pack).
