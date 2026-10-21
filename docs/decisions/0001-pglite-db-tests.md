# 0001. Тести бази на PGlite у `npm test`

- Статус: прийнято
- Дата: 2026-10-20
- AC: AC-LEAVE-07, AC-LEAVE-14 (задача 1); далі — AC, які тримає лише база: «перше рішення», права менеджера,
  перетин записів (задачі 2, 4, 5 `openspec/changes/archive/2026-10-21-impl-leave-ws6/tasks.md`)

## Контекст

План зрізу (`openspec/changes/archive/2026-10-21-impl-leave-ws6/design.md`) кладе цілісність даних на базу: RLS «лише свої записи»
(AC-LEAVE-14), «заявка цілком або нічого», перетини через exclusion-обмеження (D3), зміни лише через функції
`private.*` (D4). У Non-goals плану записано «тести через справжню базу (pglite, Docker) у цьому зрізі — див. Risks», а
в Risks — «RLS і функції бази не покриті тестами з AC ID … Тести через pglite — окремим рішенням (нова залежність)».
Це ADR і є тим окремим рішенням: `design.md` не змінюємо, рядок Non-goals про тести через базу з цього ADR знято.

Обмеження: тести мають іти в `npm test` і в CI (job `app`) без Docker і без хмарної бази; стек не оновлюємо; кожен
тест — `*.test.ts` з AC ID у назві.

Спайк 2026-10-20 (`@electric-sql/pglite` 0.5.8, Postgres 18.3 у WASM, розширення `btree_gist` з
`@electric-sql/pglite/contrib/btree_gist`) перевірив обидва обмеження D3:

- перетин блоків розкладу одного працівника і перетин записів однієї посади — `23P01 exclusion_violation`;
- суміжні інтервали (`int4range` — `[)`), записи зі статусом `rejected`, записи іншої посади — не блокують;
- `exception when exclusion_violation` у plpgsql ловиться (потрібно для повідомлення AC-LEAVE-13, AC-LEAVE-16).

Запасний варіант (тригер + `pg_advisory_xact_lock` замість exclusion) не знадобився.

## Рішення

- Dev-залежність `@electric-sql/pglite` 0.5.8 (точна версія).
- `tests/db/supabase-pglite.ts` — тестова база: емуляція того, що Supabase має до наших міграцій (ролі `anon`,
  `authenticated`, `service_role`, схеми `auth` і `extensions`, `auth.uid()` з `request.jwt.claim.sub`), далі ті самі
  `supabase/migrations/*.sql` і `supabase/seed.sql`, що й `db-check`, і користувачі з `supabase/demo-users.json`.
  Запити від імені користувача — `set local role authenticated` в окремій транзакції. Файл адаптовано з
  `tests/db/supabase-pglite.ts` демо-репозиторію курсу
  (https://github.com/koldovsky/2026-quitcode-06-leave-portal-demo/blob/5a5fc27/tests/db/supabase-pglite.ts); джерело
  вказано в шапці файлу й в описі PR.
- Тести бази — `tests/db/*.test.ts`: лише те, що тримає база (RLS, «все або нічого», обмеження, `private`-функції).
  Правила часу й балансу — як і раніше, чисті функції `src/lib/leave/` з власними тестами (D5).
- Ручна перевірка перед merge — локальний Supabase у Docker (`npx supabase start`, `npx supabase db reset` лише
  локально). Окремого хмарного тестового проєкту немає.

## Розглянуті варіанти

- Лише чисті функції + `db-check` (як у плані) — `db-check` перевіряє, що SQL застосовується, але не що RLS
  ховає чужі записи чи функція не лишає половини заявки; ці AC лишилися б без автоматичного тесту.
- Локальний Supabase у Docker у CI — повільно (хвилини на старт контейнерів), а `npm test` у розробника вимагав би
  Docker.
- Окремий хмарний проєкт Supabase для тестів — ще одна база, ключі в CI, дрейф схеми; тариф Free має ліміт проєктів.

## Наслідки

- `npm test` перевіряє RLS і функції бази на справжньому Postgres; тест падає, якщо міграція зламала політику.
- PGlite — Postgres 18, хмарний проєкт — 17 (`supabase/config.toml`): міграції пишемо без можливостей 18-ї версії;
  остаточна перевірка SQL — `db-check` на образі Supabase.
- Емуляція спрощена: немає PostgREST, JWT і GoTrue; `auth.users` — лише потрібні колонки. Поведінку Data API
  (колонкові `grant`, видимість схеми `private`) остаточно перевіряємо вручну на локальному Supabase і preview.
- Нова міграція, що потребує ще одного розширення, — додати його в `tests/db/supabase-pglite.ts`, якщо PGlite його має;
  інакше — новий ADR.
