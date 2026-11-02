# QA proof pack: зріз 1 — заявка на відсутність і залишки

<!--
Шаблон з koldovsky/2026-quitcode-08-quality-hw/materials/templates/proof-pack.template.md.
Заповнюємо по кроках WS8 (A → B → C → D). Посилання — на файли на коміті (…/blob/<sha>/…#L<N>), на PR (…/pull/N) і на
прогони (…/actions/runs/N). Жодних паролів і пароля від accounts.zip. Акаунти — лише адреси *@example.test.
Цей файл — вхід для конвеєра WS9: на кожен AC видно, чим він доведений.
Чому зріз 1: зріз 2 PM не опублікував, тож 3 AC — зі зрізу 1, і всі лише читають прод.
-->

- Прод-URL: https://leave-portal-olive.vercel.app
- Вимоги: https://github.com/mkozlovskyi-ops/course-staff-management-spec · джерело: docs · знімок 2026-10-26
- `/api/health` на момент UAT: sha 3a955d4, db ok, 02.11.2026

## 3 AC

| AC | Вид | «Тоді» (дослівно з вимоги PM) |
|---|---|---|
| AC-BALANCE-13 | відмова в браузері: чужі дані за прямим посиланням | Then the balances are not shown. |
| AC-LEAVE-06 | стан інтерфейсу: помилка | Then the date is not accepted, and the employee sees the message "You have no working hours on this day". |
| AC-LEAVE-19 | стан інтерфейсу: помилка поля | Then no request is created, and the employee sees the message "Hours must be within your schedule: 08:30–12:00, 12:30–15:30". |

## A. Ворота

- PR воріт: https://github.com/rhutsul/leave-portal/pull/37 (злито в `3a955d4`)
- Зелений `quality` на `main`: https://github.com/rhutsul/leave-portal/actions/runs/41428498556
- Обов'язкові перевірки в `solo-main` з 02.11.2026: `spec`, `app`, `conformance`, `db-check`, «Ворота: fallow audit»,
  «Покриття: доменна підлога» («Порада: вразливі залежності» — лише порада, не обов'язкова)
- Червоний прогін воріт: https://github.com/rhutsul/leave-portal/actions/runs/41422446090 (коміт ae08d8d — мертвий
  експорт без тесту `shortName` у `src/lib/utils.ts`: «Ворота: fallow audit» ✗ і «Покриття: доменна підлога» ✗);
  зелений після revert: https://github.com/rhutsul/leave-portal/actions/runs/41422759693

Розбір першого повного прогону `fallow` (той самий — в описі PR воріт #37):

| Група знахідок | Скільки | Справжня / навмисна / хибна | Дія і причина |
|---|---|---|---|
| unused export `AC_ID_GLOBAL` (`scripts/lib/spec-lib.mjs`) | 1 | справжня | прибрано в #37: ніхто не імпортує |
| unused file `src/lib/supabase/client.ts` | 1 | навмисна | `ignoreFindings` з причиною: браузерний клієнт шаблону, частина структури зі `AGENTS.md`; лишаємо для першого Client Component із Supabase |
| клон `initials()` — `employee-picker.tsx` ↔ `sidebar.tsx` | 1 група | справжня | виправлено: винесено в `src/lib/utils.ts` з тестом, під підлогою |
| клон у `src/app/globals.css` (56 рядків) | 1 група | навмисна | `ignoredClones` з причиною: два темні блоки токенів мають бути однакові (ADR 0005, `DESIGN.md` §9, `design-system.test.tsx`) |
| клони у вітрині `src/app/(app)/design/page.tsx` | 3 групи | навмисна | `ignoredClones` з причиною: вітрина навмисно показує варіанти тієї самої розмітки |
| клони між `scripts/check-design-tokens.mjs`, `check-server-boundary.mjs`, `check-ui-primitives.mjs` | 8 груп | навмисна | `ignoredClones` з причиною: кожен — самодостатній CLI одним файлом, як у матеріалах курсу |
| складність у скриптах курсу й шаблону | 8 функцій | навмисна | `health.ignore` з причиною: не наш код для перебудови |
| складність у нашому коді (`NewRequestForm`, `DecisionsPage`, `decideRecord`, …) | 52 функції | справжня (успадкована) | лишено з причиною: рефакторинг — окремий PR; `fallow audit` рахує лише нове, тож PR, що додає складність, упаде |
| unused dependencies, правила Next.js | 0 | — | — |

## B. Якість тестів

_Чекає PR B (`task/test-quality`): рівень для кожного AC, покриття, Stryker і SQL-мутації._

### Рівень для кожного AC

| AC | Де живе правило | Рівень | Чому | Тест |
|---|---|---|---|---|
| | | | | |

### Покриття

| Файл за AC | Рядки | Гілки | Чим доведено, якщо 0 % |
|---|---|---|---|
| | | | |

### Доказ мутацією

| Мутант (файл:рядок, що змінено) | AC під загрозою | До | Тест, посилений з тексту AC | Після |
|---|---|---|---|---|
| | | | | |

- Stryker: —
- SQL-мутації (`npm run mutation:sql`): —
- Еквівалентні мутанти: —

## C. UAT на проді

| AC | Специфікація | Тест (твердження) | Агент | Вердикт | Кадр |
|---|---|---|---|---|---|
| AC-BALANCE-13 | [balances.spec.ts#L31](https://github.com/rhutsul/leave-portal/blob/bec6601ed191343cc9a267c15799fdb422358fcf/tests/e2e/balances.spec.ts#L31) | passed | Haiku: PASS | PASS (R6) | [AC-BALANCE-13-then-1.png](https://github.com/rhutsul/leave-portal/blob/772c91a558405cd65a5e8ab5b4363cf0e68d4654/docs/qa/uat/2026-11-02/frames/AC-BALANCE-13-then-1.png) |
| AC-LEAVE-06 | [new-request.spec.ts#L17](https://github.com/rhutsul/leave-portal/blob/bec6601ed191343cc9a267c15799fdb422358fcf/tests/e2e/new-request.spec.ts#L17) | passed | Haiku: PASS | PASS (R6) | [AC-LEAVE-06-then-1.png](https://github.com/rhutsul/leave-portal/blob/772c91a558405cd65a5e8ab5b4363cf0e68d4654/docs/qa/uat/2026-11-02/frames/AC-LEAVE-06-then-1.png) |
| AC-LEAVE-19 | [new-request.spec.ts#L63](https://github.com/rhutsul/leave-portal/blob/bec6601ed191343cc9a267c15799fdb422358fcf/tests/e2e/new-request.spec.ts#L63) | passed | Haiku: PASS | PASS (R6) | [AC-LEAVE-19-then-1.png](https://github.com/rhutsul/leave-portal/blob/772c91a558405cd65a5e8ab5b4363cf0e68d4654/docs/qa/uat/2026-11-02/frames/AC-LEAVE-19-then-1.png) |

- Звіт: https://github.com/rhutsul/leave-portal/blob/772c91a558405cd65a5e8ab5b4363cf0e68d4654/docs/qa/uat/2026-11-02/report.md
  (прогін 02.11.2026 12:36, код тестів `bec6601`, прод `3a955d4`)
- Відео: вкладення в описі PR UAT (не в git)
- Рецензент: claude-haiku-5-5; суперечки — claude-sonnet-5-5 (у цьому прогоні суперечок не було); $0.0065 за 3 AC за цінами API
- Негативний контроль (`npm run uat:nc`, [negative-controls.spec.ts](https://github.com/rhutsul/leave-portal/blob/bec6601ed191343cc9a267c15799fdb422358fcf/tests/e2e/negative-controls.spec.ts)):
  - NC-1 (AC-LEAVE-06): у твердженні навмисно інший текст («on that day») → твердження впало, Haiku: PASS → **FAIL** (R1:
    агент не перекриває впале твердження);
  - NC-2 (AC-LEAVE-19): текст «Тоді» «уточнено» (`and` замість коми), тест і застосунок — ні → твердження пройшли,
    Haiku: FAIL, Sonnet: FAIL → **NEEDS-HUMAN** (R3).
- Дані: лише читання — нічого не подається; без `SUPABASE_SECRET_KEY`, прибирання не потрібне.
- **AC-BALANCE-13, примітка для PM:** «Тоді» PM — про відсутність залишків, тож дослівної цитати PM на сторінці немає.
  Агент цитує наш текст порожнього стану «These balances are not available to you.», якого в критерії немає, тож його
  вердикт тут слабкий. Відсутність доводять твердження: 0 карток залишків і 0 чисел «… days», немає імені й email
  teacher2@example.test, немає рядка «<ім'я> · School year». Прошу глянути кадр.

### Приймання PM

| AC | Рішення PM | Посилання |
|---|---|---|
| AC-BALANCE-13 | | |
| AC-LEAVE-06 | | |
| AC-LEAVE-19 | | |

## D. Eval рецензента

_Чекає PR D: гілка з вадами, CodeRabbit і `/code-review high`, правило, повторний прогін._

- PR з вадами (не злитий): —
- Ключ і таблиця: —

| # | Вада (ключ) | CodeRabbit | `/code-review high` |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| П | | | |

- Інші знахідки: —
- Правило, що закриває пропуск: —
- Повторний прогін: —
