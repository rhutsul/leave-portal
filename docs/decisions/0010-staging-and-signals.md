# 0010. Середовища й сигнали: staging з окремою базою, smoke кожного деплою, алерт і трекер помилок у Telegram

- Статус: прийнято (рішення людини 2026-11-18: окремий проєкт Supabase для staging, власний `onRequestError` замість
  Sentry, Standard Protection у Vercel, бонус — зашифрована копія бази)
- Дата: 2026-11-18
- AC: продуктових AC не змінює. Це експлуатація (WS11, треки A і B): усі зрізи 1–4 ідуть на прод через staging.
- Джерело: домашка WS11 https://github.com/koldovsky/2026-quitcode-11-devops-operations-hw (`docs/release-guide.md`,
  «Staging з окремою базою»; `docs/signals-guide.md`; набір `materials/ops-kit/`)

## Контекст

До WS11 був один прод: `main` → Vercel Production → проєкт Supabase `leave-portal` (eu-west-1). Preview з PR і
локальна розробка ходили в ту саму базу, smoke перевіряв лише прод, а про червоний smoke ніхто не дізнавався, доки
не подивиться в Actions. Помилки сервера жили лише в журналі Vercel Hobby (година). Безкоштовні тарифи: Vercel Hobby,
Supabase Free (2 активні проєкти на акаунт, пауза після тижня без активності, резервних копій немає).

## Рішення

1. **Два проєкти Supabase.** Прод — `leave-portal` (ref `jfuyhspluullwcrimszx`), staging — `leave-portal-staging`
   (ref `tgvhqyboeeusptbjskio`), обидва eu-west-1, однакові налаштування Data API й Auth. Ref не секрет (він є в
   публічній адресі), тож живе в змінних репо `SUPABASE_PROD_REF` і `SUPABASE_STAGING_REF`.
   - Vercel: змінні Supabase у **Production** — прод; у **Preview (усі гілки)** і **Development** — staging; прод-ключів
     у Preview немає. `SUPABASE_SECRET_KEY` у Vercel не потрібен ніде (застосунок його не читає).
   - Гілка `staging` у Git — постійна гілка Vercel зі своєю адресою і змінною `APP_ENV=staging` лише для неї. Зміни —
     лише з `main` (`git merge --ff-only origin/main`), окремої розробки в `staging` немає.
   - `.env.local` розробника — staging; прод для скриптів — окремий `.env.prod.local`. UAT — лише проти staging.
   - Дані staging — синтетичні: міграції, `seed.sql`, `npm run users:demo` (тригер дає посади й розклади тестовим
     акаунтам); прод-дані не копіюємо.
2. **Міграції — CI, спершу staging.** Job `db-deploy-staging` (environment `staging`, Deployment branches = `main`)
   застосовує міграції в базу staging; `db-deploy` (прод) чекає на нього. Обидва перед міграцією звіряють ref рядка
   підключення зі змінною репо й друкують лише ref. Червоний staging — прод не мігрує. Expand → contract (AGENTS.md)
   діє так само: міграція потрапляє в обидві бази до коду, що її потребує.
3. **`/api/health`** додає `appEnv` (з `APP_ENV`) і `supabaseRef` (з `NEXT_PUBLIC_SUPABASE_URL`). Поля D0 не змінено.
4. **Smoke кожного деплою.** `smoke.yml`: job `prod` — як у D0 плюс `supabaseRef` = прод; job `deploy` — кожен
   непродовий деплой за `client_payload.url` події Vercel із заголовком `x-vercel-protection-bypass` (секрет
   `VERCEL_AUTOMATION_BYPASS_SECRET`), `supabaseRef` = staging; гілка `staging` — ще й `appEnv=staging` і схема =
   міграції коміту; PR-preview — схема лише попередженням (міграції PR потраплять у staging після merge).
5. **Захист Vercel — Standard Protection.** Preview і staging — лише з входом у Vercel або перепусткою; прод відкритий
   (D0 і перевірка курсу читають `/api/health` без входу). PM відкриває staging спільним посиланням Vercel (Shareable
   Link); токен посилання в публічні файли не пишемо.
6. **Сигнали — один канал, Telegram-група команди** (розробник і PM): крок алерту `if: failure()` в обох jobs smoke
   (`scripts/telegram-alert.sh`; без секретів — попередження, не падіння) і власний `onRequestError` у
   `src/instrumentation.ts` (без Sentry): маршрут, метод, клас помилки, digest, ≤5 рядків стеку — без заголовків,
   cookie, тіла, рядка запиту й `error.message`. Журнал AI-функції — один рядок JSON `llm.call` без тексту
   користувача, промпту й відповіді моделі.
7. **Копія бази.** Безкоштовний Supabase копій не робить — `backup.yml`: щоночі дамп прод-бази, `gpg` AES-256,
   артефакт лише зашифрований на 7 днів, тренування відновлення в CI з порівнянням рядків (`docs/ops/restore.md`).

## Альтернативи

- **Staging на прод-базі** (лише гілка й змінна) — курс не зараховує: UAT, дріл і кожен preview писали б у прод.
- **Sentry** (безкоштовний Developer) — повніший трекер, але нова залежність `@sentry/nextjs`, ще один акаунт і алерти
  лише e-mail. Наш обсяг (один розробник, кілька маршрутів) покриває `onRequestError` у той самий канал, що й smoke.
- **Захист Vercel вимкнено** (як з WS6) — PM без посилань, але всі preview відкриті всім, а заголовок обходу нічого не
  доводив би. **All Deployments** — закрив би й прод.
- **Асистент чергового** (бонус) — платний ключ моделі на кожен червоний smoke; копія бази — безкоштовна й закриває
  більший ризик (на Free копій немає взагалі).

## Наслідки

- Два проєкти — дві паузи: щоденний smoke будить лише прод; staging перед UAT, дрілом і демо — Resume project вручну.
- Кожен PR-preview дає прогін smoke; червоний (не та база, стіна входу) — алерт у групу. Перемикання змінних Vercel
  на staging — після того, як база staging має схему й акаунти (порядок — `docs/runbook.md`).
- Прод мігрує на 1–2 хв пізніше (після staging); smoke проду чекає `db-deploy` до ≈ 8 хв.
- Відкат на Hobby: Instant Rollback лише на попередній прод-деплой і вимикає автоматичне просування — потрібен Promote
  (runbook). Базу й змінні відкат не повертає.
- Ротація ключів — окремо для Production і для Preview / гілки `staging`.
