# QA proof pack: зріз 4 — помічник календаря (AI-функція, WS10)

<!--
Шаблон з koldovsky/2026-quitcode-09-software-factory-hw/materials/templates/proof-pack.template.md (уперше — у WS8).
Proof pack зрізу 3 — docs/qa/proof-pack.md, WS8 — docs/qa/proof-pack-ws8.md. Рядок на кожен AC зрізу 4; чого довести не
вдалося — у «Не перевірено». Акаунти — лише адреси *@example.test; ключа моделі й паролів тут немає.
-->

- Прод-URL: https://leave-portal-olive.vercel.app — помічник: `/calendar` → «Add from text» (панель `?assistant=1`)
- Зріз 4: AI-помічник шкільного календаря — адміністратор вставляє текст календаря, модель пропонує закриття, людина
  перевіряє, виправляє й зберігає (`requirements/05-calendar-assistant.md`, AC-ASSIST-01…11, 10 golden cases PM)
- Вимоги: https://github.com/mkozlovskyi-ops/course-staff-management-spec · джерело: docs · знімок 2026-11-13
- Спека: `openspec/specs/calendar-assistant/spec.md` (AC-ASSIST-01 … AC-ASSIST-11); план — `impl-calendar-assistant`
  (archive у цьому PR); рішення — ADR `docs/decisions/0009-ai-feature-openrouter.md`
- `/api/health` на момент UAT: `{"ok":true,"sha":"23571b37635618aefea7eade35d872f863cd896e","env":"production","db":"ok"}`,
  16.11.2026 11:29 (Київ)
- PR зрізу: #80 (набір AI), #84 (помічник, живий eval v1), #86 (промпт `calendar-v2`, живий eval), #87 (UAT-тести й
  виправлення, яке знайшов UAT), цей PR (UAT-звіт, proof pack, archive)

## Модель, ключ і межа

- Моделі лише `:free` через OpenRouter: `nvidia/nemotron-3.5-super-vl:free` → `google/gemma-4-31b-it:free` →
  `google/gemma-4-26b-a4b-it:free`; суддя eval — `google/gemma-4-31b-it:free` із запасними (ADR 0009).
- Ключ `OPENROUTER_API_KEY` читає лише `src/lib/ai/openrouter.ts` (`server-only`); у Vercel — Production; у git, клієнті
  й логах його немає (`tests/ai-key.test.ts`, `npm run check:boundary`).
- Модель лише пропонує: у базу пише `saveSuggestions` після «Save closures» людини, через `add_school_closure` під
  сесією адміністратора (RLS + перевірка ролі в базі). `requestSuggestions` не пише нічого.

## Eval

| Прогін | Промпт | Результат | Звіт |
|---|---|---|---|
| 15.11, 1–4 | `calendar-v1` | 5/5 (NOT RUN 5) → 9/10 → 9/10 → **10/10**; обидва FAIL — суддя, не помічник | [`evals/reports/README.md`](../../evals/reports/README.md) |
| 16.11, 5 | `calendar-v2` | **10/10**, усі на Nemotron | [`evals/reports/2026-11-16T08-10-04-945Z.md`](../../evals/reports/2026-11-16T08-10-04-945Z.md) |

Поріг PM (≥ 8 з 10, GC-08…10 завжди) виконано на обох версіях. Офлайн-реплей golden у CI (`tests/golden.test.ts`) іде
тим самим ланцюжком (модель → zod → `checkSuggestions` → стан) на записах прогону 5 і перевіряє версію промпту.

## UAT на проді 16.11

Три прогони з чистого дерева, звіти пише `npm run uat` (руками не правлено):

| Прогін | Прод / код тестів | Підсумок | Що знайшов |
|---|---|---|---|
| [run1](uat/2026-11-16-run1/report.md) | `4073930` / `9e0c323` | PASS 3, NEEDS-HUMAN 1 | **AC-ASSIST-10:** агент не побачив повідомлення на кадрі — поле тексту росло й виштовхувало «The text can be at most 2000 characters» за край панелі. Виправлено в #87 (висота поля до 15rem, тест `toBeInViewport`) |
| [run2](uat/2026-11-16-run2/report.md) | `23571b3` / `23571b3` | PASS 3, FAIL 1 | AC-ASSIST-10 тепер PASS. **AC-ASSIST-11:** усі «Тоді» пройшли, але хук `attachRuntimeErrors` чекав відповіді на запит, що не відповів, до таймауту 60 с — виправлено (не довше 2 с) |
| [**фінальний**](uat/2026-11-16/report.md) | `23571b3` / `76e0df6` | **PASS 4, FAIL 0, NEEDS-HUMAN 0** | — |

Фінальний звіт — [report.md](uat/2026-11-16/report.md), [manifest.json](uat/2026-11-16/manifest.json) (`gitDirty: false`),
відео — [uat-ac-assist.mp4](uat/2026-11-16/uat-ac-assist.mp4) (4 AC одним файлом, 57 с, AC і SHA проду в куті кадру).
Живих запитів до моделі на UAT — 6 (по 2 на прогін: AC-ASSIST-03 і -06).

## Доказ на кожен AC зрізу 4

| AC | Статус | Найвищий рівень доказу | Де |
|---|---|---|---|
| AC-ASSIST-01 | реалізовано | golden офлайн на записах живого прогону (GC-01…05) + дія | `tests/golden.test.ts`, `tests/calendar-assistant-actions.test.ts`; eval 16.11 |
| AC-ASSIST-02 | реалізовано | дія (мок Supabase): один `rpc("add_school_closure")` на пропозицію, перехід у календар | `tests/calendar-assistant-actions.test.ts` |
| AC-ASSIST-03 | реалізовано | **UAT на проді, жива модель — PASS** | [рядок 12](uat/2026-11-16/report.md?plain=1#L12), [кадр](uat/2026-11-16/frames/AC-ASSIST-03-then-1.png) |
| AC-ASSIST-04 | реалізовано | дія + PGlite: P0001 дослівно для своєї пропозиції, інша збережена | `tests/calendar-assistant-actions.test.ts`, `tests/db/calendar-assistant.test.ts` |
| AC-ASSIST-05 | реалізовано | golden (GC-06, GC-07), суддя «так»; unit `checkSuggestions` і промпту | `tests/golden.test.ts`, `src/lib/ai/suggestions.test.ts` |
| AC-ASSIST-06 | реалізовано | **UAT на проді, жива модель — PASS** (Haiku NEEDS-HUMAN → Sonnet PASS) + golden GC-08, GC-10 | [рядок 13](uat/2026-11-16/report.md?plain=1#L13), [кадр](uat/2026-11-16/frames/AC-ASSIST-06-then-1.png) |
| AC-ASSIST-07 | реалізовано | golden GC-09 (рівно 1 закриття); межа `<document>` з кодуванням дужок; дія: GC-09 позначено кодом (`injectionSuspected`), «Every Monday» з речення з ін'єкцією не пропонується | `tests/golden.test.ts`, `src/lib/ai/suggestions.test.ts` |
| AC-ASSIST-08 | реалізовано | компонент: «Preparing suggestions…», кнопка `disabled` | `src/app/(app)/calendar/assistant/assistant-form.test.tsx` |
| AC-ASSIST-09 | реалізовано | unit + дія: 429 (і в тілі HTTP 200), таймаут 30 с, не за схемою, немає ключа, 21-й запит за добу → текст AC, без повтору; PGlite: ліміт 20 на добу в базі | `tests/golden.test.ts`, `tests/calendar-assistant-actions.test.ts`, `src/lib/ai/suggestions.test.ts`, `tests/db/ai-quota.test.ts` |
| AC-ASSIST-10 | реалізовано | **UAT на проді — PASS** (+ CI e2e): повідомлення видно без прокрутки | [рядок 14](uat/2026-11-16/report.md?plain=1#L14), [кадр](uat/2026-11-16/frames/AC-ASSIST-10-then-1.png) |
| AC-ASSIST-11 | реалізовано | **UAT на проді — PASS** (+ CI e2e) | [рядок 15](uat/2026-11-16/report.md?plain=1#L15), [кадр](uat/2026-11-16/frames/AC-ASSIST-11-then-1.png) |

## Посилення після рев'ю WS10 (18.11)

Рев'ю викладача (koldovsky/2026-quitcode-10-ai-features-hw#4) — межі AI-функції, які тримав лише промпт, тепер тримає
код. PR `task/ai-output-guards`:

- **Вільний текст моделі (п. 2).** `checkMissing` відкидає в `missing` посилання, домен, email, телефон, `<`/`>` і
  фрагменти інструкцій і вимагає згадки назви чи дати з тексту; `checkSuggestions(draft, text)` пропонує лише назву,
  що є в реченні тексту без ін'єкції, і не приймає назву-повторення («Every Monday»). Інакше — стан AC-ASSIST-09.
  Рівень доказу: unit (`src/lib/ai/suggestions.test.ts`) і дія (`tests/calendar-assistant-actions.test.ts`) на
  реплеях з рев'ю; golden 10/10 на записах `calendar-v2` лишився зеленим без змін записів.
- **Спроба ін'єкції (п. 3).** Чиста `detectInjection(text)` (NFKC, нижній регістр, вузький перелік шаблонів) дає
  `injectionSuspected` у кроці `suggestions`; форма показує над пропозиціями `Alert` `warning`: «This text contains
  instructions to the assistant. Check each suggestion against the calendar text before saving.» **AC PM про це немає —
  це наше рішення**, не новий AC: позначка не блокує (AC-ASSIST-07 вимагає й далі запропонувати «Winter break»), лише
  просить людину перевірити уважніше. Тексти й шаблони — англійською, як інтерфейс. Рівень доказу: unit, дія
  (`AC-ASSIST-07: a text with "Ignore all previous instructions" is flagged by code and still gives exactly 1 closure`)
  і компонент (`assistant-form.test.tsx`). Обмеження: ін'єкцію поза переліком шаблонів позначка не впізнає — тому
  перша межа й далі `<document>` із кодуванням дужок і промпт, а остання — людина перед «Save closures».
- **Один валідатор (п. 5).** `ClosureInputSchema` (zod, `src/lib/leave/closure-input.ts`) — спільна для
  `parseClosureForm` (форма «Add closure» і «Save closures») і `checkClosure` (відповідь моделі): назва, справжні дати,
  час скороченого дня з текстами PM. Решту правил вимоги 04 перевіряє `add_school_closure` у базі. Окремий модуль —
  щоб zod не потрапив у клієнтські форми календаря. Рівень доказу: `src/lib/leave/calendar-form.test.ts` без змін
  очікувань, тест AC-ASSIST-04 про порожню назву зелений.
- **Денний ліміт запитів (п. 1, PR `task/ai-quota`).** Лічильник у базі, а не в пам'яті процесу:
  `private.ai_quota (user_id, day, used)` без прав для `anon` і `authenticated`, `private.take_ai_quota()`
  (`security definer`, `set search_path = ''`, користувач — з `auth.uid()`) з обгорткою `public.take_ai_quota()`
  (`security invoker`). 20 запитів на добу за Києвом; один `insert … on conflict do update … where used < 20`, тож
  лічильник не росте понад ліміт. `requestSuggestions` кличе його після ролі й довжини тексту і перед моделлю; `false`
  чи збій — повідомлення AC-ASSIST-09, модель не питаємо. Рівень доказу: дія (21-й запит → текст AC-ASSIST-09,
  `doGenerateCalls` 0), PGlite (`tests/db/ai-quota.test.ts`: 21-й → `false`, інший користувач — свій лічильник,
  учорашні запити не рахуються, прямий доступ до таблиці — 42501) і SQL-мутанти S36–S38. На проді ліміт не
  вичерпували навмисно (той самий безкоштовний ліміт OpenRouter).
- **`wrapDocument` (дрібне).** Обрізає до 2000 знаків до кодування дужок: «'a'×1990 + 10 `<`» доходить до моделі
  як 10 `&lt;`.

## Не перевірено

- **AC-ASSIST-09 на проді:** справжній таймаут чи вичерпаний денний ліміт на проді не відтворювали (не витрачаємо
  ліміт навмисно); доведено тестами дій і unit із моками збоїв. Ручна перевірка без ключа (задача 1.5 плану) замінена
  тестом дії «немає ключа → AC-ASSIST-09».
- **AC-ASSIST-02, -04 на проді:** збереження без змін і відмова бази на вже закриту дату — на рівні дії й PGlite;
  на проді збереження доведено AC-ASSIST-03 (той самий шлях `saveSuggestions` → `add_school_closure`).
- **Повторюваність моделей:** безкоштовні моделі змінюються. `calendar-v1` — чотири прогони 15.11 (один неповний через
  429 постачальника судді; між прогонами мінявся лише суддя), `calendar-v2` — один прогін 16.11. Повторюваність на
  інший день для v2 ще не міряна; приймання PM — окремо.
- **Українські тексти календаря:** поза зрізом за вимогою PM.
