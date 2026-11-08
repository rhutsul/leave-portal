# Tasks

Кожна група — одна гілка `task/<коротко>` і один PR «Реалізація». Рядок «Done when» — AC, які PR переводить у
`реалізовано` в `docs/conformance.md` (тест із AC ID + код). Тести кожної задачі пише окрема сесія з тексту AC до коду
(maker ≠ checker); у кожному PR — таблиця «AC → тест → рівень → доказ, що тест відмови падає». Задачі 2 і 3 незалежні
й ідуть паралельно після злиття задачі 1.

## 1. Дані, права й розклад дати (`task/calendar-db`)

- [ ] 1.1 Тести PGlite з тексту AC (окрема сесія, спершу червоні): `tests/db/school-calendar.test.ts` — додавання й
      відмови (AC-CAL-07, -08, -10, -11), роль (`asUser(manager)` — AC-CAL-13, `asAnon` — AC-CAL-14), частка дня
      (AC-CAL-06), заявка в закритий і скорочений день (AC-CAL-03, -04, -05), видалення (AC-CAL-09)
- [ ] 1.2 Міграція `school_calendar` (D1–D4): таблиця `public.school_closures` з RLS, явними `grant` і обмеженнями;
      `add_school_closure` / `remove_school_closure`; `blocks_on_date`, `closure_on_date`; нові версії
      `check_record_hours`, `working_minutes`, `submit_leave_request`, `update_leave_record_hours`, `get_balance_inputs`;
      спільний advisory lock; перевірка: `db-check` зелений, тести 1.1 зелені, `database.types.ts` з Summary прогону
- [ ] 1.3 SQL-мутанти в `scripts/mutants.mjs` (D6) → `npm run mutation:sql` `KILLED`; таблиця для опису PR
- [ ] 1.4 Синтетичні закриття для перевірки — не в сид проду: створює UAT і тести (Assumptions PM)

Done when: AC-CAL-06, AC-CAL-07, AC-CAL-08, AC-CAL-10, AC-CAL-11, AC-CAL-13, AC-CAL-14.

## 2. Сторінки календаря (`task/calendar-pages`)

- [ ] 2.1 `src/lib/leave/calendar.ts`: навчальний рік і фільтр перетину (закриття через 31 серпня — в обох роках),
      формат дат і «from 12:00», текст порожнього стану; тести AC-CAL-02, AC-CAL-15
- [ ] 2.2 `/calendar` для всіх ролей (`<Table stack>`, перемикач року, `EmptyState`), пункт «School calendar» у
      `sidebar-nav.tsx` і `mobile-nav.tsx`; у адміна — «Add closure» і «⋯» → «Remove closure» з `Dialog`
- [ ] 2.3 `/calendar/manage` — форма «Add closure» (цілі дні / скорочений день), server actions `addClosure` /
      `removeClosure` з `getClaims()` і роллю з `profiles`, помилки бази дослівно в `Alert`; сторінка відмови для
      не-адміна; тести AC-CAL-01, AC-CAL-12
- [ ] 2.4 Адаптив і доступність за ADR 0008: від 360 px, 44 px, `tests/e2e/calendar.mobile.spec.ts`; знімки 390 і
      1280 px у світлій і темній темах у `docs/img/`

Done when: AC-CAL-01, AC-CAL-02, AC-CAL-12, AC-CAL-15.

## 3. Заявка в закритий і скорочений день (`task/calendar-request`)

- [ ] 3.1 `clipBlocks` і `positionsOnDate` із закриттями (`src/lib/leave/calendar.ts`, `request.ts`): закритий день —
      повідомлення AC-CAL-03, скорочений — обрізані блоки; заявка на кілька дат пропускає закриту дату; тести AC-CAL-03,
      AC-CAL-04, AC-CAL-05, AC-CAL-09 (межі: блок, що триває о часі закриття, і блок, що з нього починається)
- [ ] 3.2 `/requests/new`: `loadClosures` для видимих місяців, стан `closed` у календарі — кнопка з повідомленням
      (`CalendarDay`, вітрина `/design`), легенда з «Closed by the school»; зміна годин запису (AC-DECIDE-16) бере ті
      самі обрізані блоки
- [ ] 3.3 Stryker `--mutate src/lib/leave/calendar.ts` — вижилі мутанти розібрано

Done when: AC-CAL-03, AC-CAL-04, AC-CAL-05, AC-CAL-09.

## 4. UAT на кожен AC (`task/uat-school-calendar`)

- [ ] 4.1 `tests/e2e/calendar.spec.ts`: один `test` на кожен з 15 AC, анотація `ac`, тег `@uat`, `given` / `when` /
      `thenStep`, твердження з дослівним текстом AC; AC, що пишуть дані, — `@writes`, створення й прибирання через
      секретний ключ (`tests/e2e/support/admin.ts`, `OWNED_ROWS`), перевірка «чисто» перед прогоном (design, Risks)
- [ ] 4.2 Прогін на проді — людина (`npm run uat -- --url https://leave-portal-olive.vercel.app`), негативний
      контроль NC-1; звіт `docs/qa/uat/<дата>/` (`report.md`, `manifest.json`, `frames/`), відео — у описі PR
- [ ] 4.3 `docs/conformance.md`: усі 15 AC — `реалізовано` зі шляхами коду, тестів і специфікації; `npm run
      ac:coverage` зелений; «UAT готовий» у чат команди

Done when: AC-CAL-01 … AC-CAL-15 мають UAT-специфікацію й рядок звіту.

## 5. Proof pack, ретро й закриття плану (`docs/proof-pack-ws9`)

- [ ] 5.1 `docs/qa/proof-pack.md` за шаблоном WS9 (WS8 — `docs/qa/proof-pack-ws8.md`): рядок на кожен AC і «Не
      перевірено»; заповнює нова сесія лише з того, що є в репо
- [ ] 5.2 Ретро «що взяти з фабрики» — `docs/qa/retro-ws9.md`, до 10 рядків по станціях
- [ ] 5.3 `npx openspec archive impl-school-calendar -y`
