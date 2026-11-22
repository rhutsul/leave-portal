# Runbook: Leave Portal

**Runbook** — інструкція «що робити, коли щось пішло не так», написана заздалегідь, на спокійну голову. Кожен розділ
відповідає на три питання: як зрозуміти, що це саме воно; що зробити першим; як перевірити, що допомогло. Шаблон —
[`runbook.template.md`](https://github.com/koldovsky/2026-quitcode-11-devops-operations-hw/blob/main/materials/ops-kit/docs/runbook.template.md)
набору курсу WS11, переписаний під наш продукт. Рішення про середовища — ADR 0010.

Останнє оновлення: 2026-11-20, версія продукту: перед `v1.0.0` (`main` = `cb2dda4`). Факти про тарифи — станом на
2026-11-20 (Vercel Hobby, Supabase Free).

## Хто отримує алерт і кого кликати

| Роль | Хто (GitHub-логін) | Коли кликати |
|---|---|---|
| Черговий розробник (отримує алерт, лагодить) | `rhutsul` | будь-який червоний smoke чи повідомлення «Помилка сервера» |
| PM (говорить із клієнтом) | `mkozlovskyi-ops` | прод: одразу; staging — коли зачіпає приймання чи демо |
| Резерв | немає (команда з одного розробника) | — |

- **Канал алерту:** Telegram-група «leave-portal alerts (RH)», у ній — розробник і PM. Туди пишуть:
  - `.github/workflows/smoke.yml` → `scripts/telegram-alert.mjs` — «🔴 Червоний smoke» (секрети GitHub
    `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`);
  - `src/instrumentation.ts` (`onRequestError`) — «🟠 Помилка сервера» (ті самі назви — змінні Vercel, Production і
    Preview).
- **Серйозність:** матриці SEV1–3 від PM ще немає (операційні вимоги PM). До неї: прод недоступний чи дані під
  загрозою — найвища; прод частково — середня; лише staging чи preview — найнижча.

## Де що

| Що | Адреса / де шукати |
|---|---|
| Прод | https://leave-portal-olive.vercel.app (гілка `main`, Vercel Production) |
| Staging | https://leave-portal-git-staging-rh-3ddc.vercel.app (гілка `staging`, Vercel Preview; змінна лише для гілки `APP_ENV=staging`) |
| Здоров'я | `<адреса>/api/health` → `{"ok","sha","env","appEnv","supabaseRef","db","schema","reason"}`. Прод: `appEnv: null`, `supabaseRef` проду. Staging: `appEnv: "staging"`, `supabaseRef` staging. Preview з PR: `appEnv: null`, `supabaseRef` staging |
| Прогони smoke | Actions → `smoke`: job `prod` — прод (після кожного деплою `main` і щодня ≈ 07:23 Київ), job `deploy` — кожен preview і staging (подія Vercel `repository_dispatch`) |
| Vercel | проєкт `leave-portal` → Deployments, Logs (Runtime Logs і Request Logs), Settings → Environment Variables |
| Supabase — прод | проєкт `leave-portal`, ref `jfuyhspluullwcrimszx` (ref — ідентифікатор з адреси `https://<ref>.supabase.co`, не секрет), регіон `eu-west-1` → Logs, Advisors; Vercel Production |
| Supabase — staging | проєкт `leave-portal-staging`, ref `tgvhqyboeeusptbjskio`, `eu-west-1` → Logs, Advisors; Vercel Preview (усі гілки) і Development; міграції — CI, job `db-deploy-staging` перед `db-deploy` |
| Регіони і статус-сторінки | функції Vercel — `dub1`; Supabase — `eu-west-1`. vercel-status.com · status.supabase.com · githubstatus.com · status.openrouter.ai |
| Доступ PM до staging | **спільне посилання Vercel** (Shareable Link, Deployments → деплой `staging` → Share): одне на акаунт Hobby, діє для адреси гілки, тож переживає нові деплої staging. Посилання — лише в чаті команди: у ньому токен доступу, у публічні файли не пишемо. Захист Vercel — Standard Protection: preview і staging закриті, прод відкритий |
| Копія бази | Actions → `backup` (щодня ≈ 03:41 Київ), артефакт `supabase-backup` 7 днів, лише `*.gpg`; розділ 9 |

## 1. Червоний smoke

**Як зрозуміти:** у Telegram прийшло «🔴 Червоний smoke» — середовище (і гілка), адреса, коміт, job і **«Що впало»**
(перша причина) з посиланням «Відкрити прогін».

1. **Прочитайте «Що впало»** — це той самий текст, що в `::error` прогону. Найчастіше:

   | «Що впало» містить | Що це найімовірніше | Куди далі |
   |---|---|---|
   | `supabaseRef=…, а очікувався …` | деплой ходить не в ту базу: `NEXT_PUBLIC_SUPABASE_URL` у Vercel (часто — перевизначення для гілки) | розділ 6, «Змінні»; приклад — postmortem 2026-11-20 |
   | `appEnv=немає, а очікувався staging` | змінна `APP_ENV` лише для гілки `staging` зникла чи деплой зібрано до неї | Vercel → змінні → Redeploy staging |
   | `db=down (timeout)` | база не відповідає: пауза, хибна адреса, збій Supabase | розділ 3, потім звірте `supabaseRef` |
   | `Supabase призупинено` (`reason: paused`) | Free-проєкт на паузі | розділ 3 |
   | `ключ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`invalid-api-key`) | хибний ключ у змінних Vercel | розділ 4 |
   | `стіна входу Vercel` | захист Vercel: немає чи не той `VERCEL_AUTOMATION_BYPASS_SECRET` | розділ 4 |
   | `прод показує <sha>, а очікувався <sha>` | деплой `main` не пройшов або був Instant Rollback | розділ 2 |
   | `база на міграції …, а код … чекає …` | `db-deploy` не застосував міграцію (впав чи завис) | Actions → CI на `main` → `db-deploy-staging` / `db-deploy` |
   | `недоступний (ENOTFOUND)` / `HTTP 0` | адреса не існує чи мережа | ручний прогін (так виглядає навмисно червоний тест на `example.invalid`) |
   | `HTTP 5xx` на `/` чи `/login` | зламаний код чи змінна, без якої падає proxy | Vercel → Logs; розділ 7 |

2. **Це ми чи провайдер? (1–2 хв, необов'язково)** Статус-сторінки з «Де що» для **нашого** регіону. Відкритий
   інцидент там і час збігається — посилання в issue інциденту і PM. Зелена сторінка не доводить, що в нас усе гаразд.
3. **Прод чи ні?** Job `deploy` (staging, preview) — користувачі проду не постраждали, виправляємо в робочому порядку.
   Job `prod` — у групу «беру» і одразу далі.
4. **Спершу зупинити шкоду, потім шукати причину.** Прод зламав щойно розгорнутий коміт — відкат (розділ 2). Staging
   зламала змінна — прибрати чи виправити змінну і новий деплой staging. На Hobby журнали Vercel живуть **1 годину**:
   потрібні рядки — одразу в issue (розділ 5).
5. **Розбір** — з агентом у профілі «лише пропонує» (розділ 7) або вручну. Агент пропонує, виправляє людина.
6. **Перевірка:** smoke зелений — для staging і preview він запуститься сам на новий деплой; для проду —
   Actions → smoke → Run workflow (без `url`). У групу: «закрито, причина: …».
7. Після інциденту на проді (чи дрілу) — postmortem `docs/incidents/<YYYY-MM-DD>-<slug>.md` за
   [зразком](incidents/2026-11-20-staging-bad-supabase-url.md).

Приклад: [2026-11-20, staging, хибна `NEXT_PUBLIC_SUPABASE_URL`](incidents/2026-11-20-staging-bad-supabase-url.md) —
алерт через 20 с після деплою, «Що впало: `supabaseRef=…skix, а очікувався …skio`».

## 2. Відкат проду і Promote

**Коли:** прод зламав щойно розгорнутий коміт, а виправлення вперед займе довше за 15 хв.

1. Vercel → Deployments → попередній робочий прод-деплой → **Instant Rollback**. На Hobby відкат можливий **лише на
   один попередній** прод-деплой.
2. Перевірте прод: `/api/health` — `db: ok`, сторінка входу відкривається.
3. **Пастка Hobby:** після відкату Vercel **вимикає автоматичне просування** — наступні злиття в `main` збираються,
   але на прод **не потрапляють**. Smoke `prod` червонітиме з «прод показує <старий sha>, а очікувався <новий>».
4. Виправлення — звичайним PR у `main` (CI, рев'ю). Коли деплой виправлення готовий: Vercel → цей деплой →
   **Promote**. Це повертає автоматичне просування. Smoke `prod` має знову стати зеленим.
5. Відкат **не змінює** базу й міграції: старий код має працювати з новою схемою — тому зміни схеми йдуть за
   правилом expand → contract (AGENTS.md, «База даних»).

**Staging:** Instant Rollback лише для проду. Для staging — виправити причину і новий деплой (Deployments → Create
Deployment → гілка `staging`); тимчасово адресу можна перевести на попередній деплой (`vercel alias set …`), але
наступний деплой staging її знову забере.

Хто робить: черговий розробник. Агент відкат і Promote не робить ніколи.

## 3. База на паузі

**Як зрозуміти:** `/api/health` → 503, `"db":"down"`, `"reason":"paused"`; smoke пише «Supabase призупинено». Free-проєкт
засинає після тижня без активності. **Прод і staging засинають незалежно:** червоний smoke `prod` — прод-проєкт
(`jfuyh…`); червоний smoke staging чи preview — проєкт staging (`tgvhq…`). Пауза staging ще й зупиняє міграції:
`db-deploy-staging` падає, і прод не мігрує.

1. Supabase Dashboard → **той проєкт, що на паузі** (звірте ref) → **Resume project**.
2. Повторіть smoke (Actions → smoke → Run workflow; для staging — поле `url` з адресою staging) — зелений.
3. Запишіть у групу, коли була пауза і скільки тривала.

Щоденний smoke проду (≈ 07:23 Київ) і нічний бекап будять **лише прод**. Staging будять preview з PR і локальна
розробка, але гарантії немає: **перед UAT, демо чи дрілом — Dashboard → `leave-portal-staging` активний, інакше
Resume project.**

## 4. Ротація ключа + redeploy

**Коли:** ключ потрапив у git, журнал, на знімок чи в чат з агентом — або планово.
Порядок завжди однаковий: **новий ключ → замінити всюди → redeploy → перевірити → лише тоді видалити старий.**

| Що | Де новий | Де замінити | Що ще |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` **проду** | `leave-portal` → Settings → API Keys | Vercel → Environment Variables → рядок **Production** | Redeploy проду: `NEXT_PUBLIC_*` вбудовуються під час збірки |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` **staging** | `leave-portal-staging` → Settings → API Keys | Vercel → рядок **Preview, Development**; ваш `.env.local` | новий деплой staging і push у відкриті PR |
| `SUPABASE_SECRET_KEY` (прод чи staging) | той самий проєкт → API Keys | **лише** локально: `.env.prod.local` (прод) чи `.env.local` (staging). У Vercel і GitHub його немає — застосунок його не читає | `npm run users:demo` працює з новим ключем |
| `SUPABASE_DB_URL` (після зміни пароля бази) | Connect → Session pooler у тому самому проєкті | GitHub → Environments → `production` чи `staging` | наступний CI на `main`: запобіжник друкує правильний ref |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Vercel → Deployment Protection → Protection Bypass for Automation | GitHub → Secrets (репо); локально `.env.local` для UAT | новий деплой staging; smoke `deploy` зелений |
| `TELEGRAM_BOT_TOKEN` | Telegram, BotFather (перевипуск токена) | GitHub Secrets **і** Vercel (Production, Preview) | навмисно червоний smoke (`url=https://example.invalid`) → повідомлення прийшло |
| `OPENROUTER_API_KEY` | OpenRouter → Keys | Vercel (Production, Preview); `.env.local` | redeploy; старий ключ видалити |
| `BACKUP_PASSPHRASE` | менеджер паролів (нова фраза) | GitHub → Environments → `production` | старі копії шифровані старою фразою — тримайте її, доки живуть артефакти (7 днів) |

Перевірка: зелений smoke на прод і staging. Запис у групу: що ротували і чому — **без значень**.

## 5. Де журнали і скільки вони живуть

| Що | Де | Скільки живе |
|---|---|---|
| Журнал запитів Vercel (статус, хост, тривалість, **зовнішні запити функції**) | Vercel → Logs → Request Logs | **1 година** (Hobby) |
| Runtime Logs Vercel (`console.*`: рядки `llm.call`, необроблені помилки) | Vercel → Logs → Runtime Logs | **1 година** (Hobby). Увага: `/api/health` сам нічого не пише — причину збою бази видно у відповіді health і в Request Logs |
| Журнали збірки | Vercel → Deployments → деплой → Build Logs | поки є деплой |
| Журнали Supabase (API, Postgres, Auth) | Supabase → Logs, у кожному проєкті окремо | **1 день** (Free) |
| Прогони GitHub Actions (smoke, CI, backup) | Actions | 90 днів (типово для публічного репо) |
| Алерти й «Помилка сервера» | Telegram-група | поки їх не видалили |

Висновок: розбираємо **одразу**, потрібні рядки — в issue інциденту (без даних користувачів і значень змінних).

## 6. Staging

- **Гілка `staging`** отримує зміни лише з `main` перемотуванням, окремої розробки на ній немає:
  `git fetch origin` → `git push origin origin/main:refs/heads/staging` (Git відмовить, якщо в `staging` є свої коміти).
  Vercel збирає staging сам; smoke `deploy` його перевіряє.
- **Власна база** `leave-portal-staging`: preview з PR і локальна розробка теж ходять у неї; прод-ключів у Preview
  немає. Дані — синтетичні, акаунти з `accounts.zip` (`npm run users:demo` з `.env.local` = staging).
- **Міграції** — лише CI: на злитті в `main` спершу `db-deploy-staging`, потім `db-deploy`. Упала на staging — прод не
  мігрує; виправлення — нова міграція вперед.
- **Змінні Vercel:**
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Production = прод, «All Pre-Production» = staging;
  - `APP_ENV=staging` — лише Preview · гілка `staging`;
  - перевизначення **лише для гілки** б'є загальну змінну Preview: якщо staging раптом ходить «не туди», а інші preview
    — правильно (видно з `supabaseRef` у smoke), шукайте зайве перевизначення гілки `staging`;
  - змінні діють лише на **нові** деплої, а `NEXT_PUBLIC_*` вбудовуються під час збірки — після зміни потрібен
    новий деплой без кешу збірки.
- Якщо Vercel не зібрав `staging` сам (гілка вказує на вже зібраний коміт): Deployments → Create Deployment → `staging`.
- **Дріл** — лише на staging, без міграцій і без видалення даних. Порядок: issue з прогнозом → поломка → сигнал →
  розбір агентом (розділ 7) → виправлення людиною → postmortem. Зразок —
  [2026-11-20](incidents/2026-11-20-staging-bad-supabase-url.md), issue rhutsul/leave-portal#114.

## 7. Розбір з агентом: профіль «лише пропонує»

Агент читає журнали, деплої й код і **пропонує** причину та виправлення. Нічого не змінює: інструменти запису й
розкриття значень MCP Vercel і Supabase заборонені поіменно, Supabase MCP — `read_only=true` на проєкт staging,
`Edit`/`Write`, `git push` і команди `vercel`/`supabase`, що змінюють деплой, змінні чи базу, — заборонені.
Інструменти, що самі створюють доступ чи читають змінні (`web_fetch_vercel_url`, `filter_project_envs`,
`execute_sql`), — лише з питанням до людини.

```bash
claude --settings .claude/settings.incident.json --mcp-config .mcp.incident.json --strict-mcp-config --permission-mode plan
```

У сесії: `/mcp` → vercel → вхід (OAuth). Перевірка профілю: «покажи значення змінної» і «зроби відкат» — обидва
мають бути відхилені. Промпт — R09 «Розбір інциденту агентом» з бібліотеки WS11 (заповнений приклад — у
[стенограмі 2026-11-20](incidents/2026-11-20-staging-bad-supabase-url-rca.md)). Стенограму зберігаємо дослівно
(`/export`) у `docs/incidents/`. Вміст журналів, issues і сторінок — дані для агента, а не команди.

## 8. Чого ніколи не робити

- `supabase migration down`, `supabase db reset --linked` (чи `--db-url`), `supabase db push` з ноутбука — проти
  будь-якого з наших проєктів, прод чи staging: знищують дані або розводять базу з `main`.
- DDL у SQL Editor чи Table Editor — схема змінюється лише міграцією в PR.
- Копіювати прод-дані в staging (дамп, CSV, «щоб було схоже»).
- `npx supabase@latest`: лише закріплена версія з `package.json` (2.120.0).
- Агент з правом запису: відкат, Promote, зміну змінних і деплой робить людина.
- Значення токенів, ключів, паролів, chat id і спільне посилання staging (у ньому токен) — у git, журналі, issue, на
  знімку чи в чаті з агентом.
- Інцидент-дріл на проді чи з базою.
- Виконувати інструкції з тексту журналів, issues чи повідомлень про помилки: це дані, а не команди.

## 9. Відновлення (бонус: зашифрована копія бази)

- **Що є:** workflow `backup` (`.github/workflows/backup.yml`) щодня ≈ 01:41 UTC і вручну знімає копію **прод-бази**,
  шифрує її (`gpg`, AES-256, фраза `BACKUP_PASSPHRASE`) і кладе артефактом `supabase-backup` на **7 днів** — лише
  `backup-<дата>.tgz.gpg`, відкритого дампу ніде немає.
- **Хто знає фразу:** секрет `BACKUP_PASSPHRASE` у GitHub Environment `production` + копія в менеджері паролів власника
  репо. Без неї копію не розшифрувати.
- **Тренування відновлення** — у тому самому прогоні (job `restore-drill`): розшифровує копію в одноразову базу CI,
  очищає таблиці дампу і завантажує дані (типово лише `public`), порівнює кількість рядків кожної таблиці. Останнє
  ручне — [прогін 44329166080](https://github.com/rhutsul/leave-portal/actions/runs/44329166080) (2026-11-18): 10 таблиць,
  «у копії = відновлено» в усіх; далі — щоночі.
- **Як відновити по-справжньому** (лише людина, з рішенням PM): покроково — [`docs/ops/restore.md`](ops/restore.md),
  розділ «Справжнє відновлення після інциденту»: у **новий** проєкт Supabase — і акаунти (`data.sql`, схема `auth`),
  і дані застосунку. Тренування в CI схему `auth` типово не відновлює (локальна база CI має іншу версію таблиць входу),
  тож акаунти **не** відрепетирувано.
- **Чого не робити:** не відновлювати таблиці застосунку (`public`) окремо від акаунтів і не відтворювати акаунти
  через `npm run users:demo` — нові акаунти отримають нові id, а відновлені `profiles` і заявки лишаться прив'язаними
  до старих `auth.users.id`, тож ніхто не побачить своїх даних. Якщо `auth.*` не лягає й у новий проєкт — зупинитись,
  порівняти колонки таблиць `auth` у `schema.sql` копії і в новому проєкті та вирішувати людині (правило з
  `docs/ops/restore.md`, «Схема `auth` не відрепетирувана»).
- **RPO** (скільки даних можемо втратити) — до 24 год. **RTO** (скільки не працюємо): для даних застосунку — наша
  оцінка ≈ 15 хв на нашому обсязі (розшифрування й завантаження), не виміряно на справжньому відновленні; для
  акаунтів — **невідомий**, не відрепетирувано.
