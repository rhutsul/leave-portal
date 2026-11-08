# Знімки екрана

Знімки інтерфейсу — з проду (`https://leave-portal-olive.vercel.app`) на синтетичних акаунтах `*@example.test`, без паролів у
кадрі. `-light` / `-dark` — тема. Знімки налаштування (`auth-*`, `env-*`, `vercel-*`, `ruleset.png` тощо) — для
`docs/bootstrap.md`.

## Decisions за ролями (рев'ю WS7, п. 4)

У WS7 обидва знімки Decisions зроблено під адміністратором, хоча в описі rhutsul/leave-portal#22 їх підписано як
manager1. Нижче — правильні підписи й окремі знімки кожної ролі.

| Знімок | Хто | Що видно |
|---|---|---|
| `ws7-decisions-manager1-dark.png` | `manager1@example.test` | «Awaiting decision»: лише записи посади, за яку він відповідає (Elementary school / Teacher, AC-DECIDE-01); пункт «Decisions» з лічильником |
| `ws7-decisions-teacher1-denied-dark.png` | `teacher1@example.test` | `/decisions` працівника: «You can't decide on records» — відмова за роллю (AC-DECIDE-09); пункту «Decisions» у меню немає |
| `ws7-after-decisions-light.png`, `-dark.png` | `admin@example.test` | адміністратор: «All records of every position» — записи всіх посад |
| `ws7-after-decisions-denied-light.png`, `-dark.png` | `admin@example.test` | запис поза списком (посилання `?record=` на запис, якого немає в черзі), а **не** відмова за роллю |
| `ws7-after-decisions-confirm-*.png`, `ws7-after-decisions-history-*.png` | `admin@example.test` | діалог рішення й вкладка «History» |

## Полотно Claude Design → реалізація

Полотно «Leave Portal screens» (Claude Design) приватне, тож тут два його знімки. Їх відрендерено локально (Playwright)
з файлів полотна — розмітки артбордів і CSS дизайн-системи `ds/leave-portal/` — у світлій темі, без редактора навколо:

- `design-canvas-light.png` — 4 артборди світлої теми: My requests, New request, Awaiting decision (manager), Sign in;
- `design-canvas-decisions.png` — артборд «Awaiting decision — manager».

Чим реалізація відрізняється від полотна:

- **Decisions.** На полотні — таблиця і поруч завжди відкрита картка вибраного запису. У реалізації — список на всю
  ширину, а запис відкривається в `Sheet` справа поверх сторінки з «Previous / Next» і клавішами ↑/↓; вкладки
  «Awaiting decision» і «History» (AC-DECIDE-11); кнопки внизу панелі — Reject і Return for revision ліворуч, Approve
  праворуч (`DESIGN.md`, розділ 5).
- **New request.** На полотні — одна сторінка з чотирма картками. У реалізації — кроки (Dates → Positions & hours →
  Leave type → Summary): помилки годин показуються на своєму кроці. День без годин на полотні вимкнений, у
  реалізації — кнопка, що пояснює причину текстом AC-LEAVE-06 (`DESIGN.md`, розділ 6).
- **My requests.** На полотні над таблицею — картки залишків і фільтри статусів. У реалізації залишки — окрема сторінка
  «Balances» (AC-BALANCE-*), а «My requests» — лише список, згрупований за місяцем, з меню «⋯» у кожному рядку.
- **Навігація.** На полотні — простий список. У реалізації `AppNav` має `ThemeMenu` (Light / Dark / System, ADR 0005),
  згортання до 60 px (Ctrl+B) і лічильник «Awaiting decision» на `primary`; пункти — лише доступні ролі.
- **Sign in.** На полотні — «скляна» картка на фоні з плямами. Тепер (Sign in v2, ADR 0007, що замінює 0006) — тиха
  картка ліворуч на сітці з крапок, праворуч аркуш місяця з частинок (`ParticleField`), у полі пароля — кнопка «Show
  password»; знімок — `v2-login-field-dark.jpg` нижче. 3D-стос карток-днів (ADR 0006) прибрано.

## Друга версія вигляду (ADR 0007)

Знімки з Preview гілки, вхід — `manager1@example.test` (синтетичні дані, `supabase/demo-users.json`). «До» — знімки
WS7 вище (`ws7-after-decisions-*.png`).

| Файл | Що видно |
|---|---|
| `v2-quiet-decisions-history-light.jpg`, `v2-quiet-decisions-history-dark.jpg` | «History», 1280 px: статус — слово з крапкою кольору статусу, без залитої пігулки; таблиця без тіні |
| `v2-quiet-decisions-sheet-light.jpg`, `v2-quiet-decisions-sheet-dark.jpg` | «Awaiting decision» з відкритим записом, 1280 px: «скляна» панель до 480 px, статус у шапці панелі |
| `v2-quiet-decisions-sheet-1000-light.jpg` | те саме на 1000 px |
| `v2-quiet-design-status-light.jpg` | вітрина `/design`, розділ «Status and leave type», 1000 px |

### Overview v3 (ADR 0007)

З Preview гілки `task/overview-v3`; «до» — `ws7-after-overview-*.png`.

| Файл | Хто | Що видно |
|---|---|---|
| `v2-overview-teacher1-light.jpg`, `v2-overview-teacher1-dark.jpg` | `teacher1@example.test` | 1280 px: місяць із точок (записи кольором статусу, сьогодні підсвічено), смуга чисел, діаграма за двома посадами, «Next leave», «Needs your attention» з коментарем менеджера |
| `v2-overview-manager1-light.jpg`, `v2-overview-manager1-dark.jpg` | `manager1@example.test` | 1280 px: «To decide» у смузі й праворуч, «Away» — хто з посад відсутній, «Activity» |
| `v2-overview-manager1-1000-light.jpg` | `manager1@example.test` | 1000 px: шапка в один рядок, смуга чисел 4 в ряд; години в смугах діаграми скорочено, повні — у підказці |

### Рух рішення й легенда місяця (ADR 0007)

З Preview гілки `task/decision-motion`, `manager1@example.test`, темна тема, 1280 px.

| Файл | Що видно |
|---|---|
| `v2-overview-dot-month-legend-dark.jpg` | місяць із точок: заголовок одним рядком, підпис дня під сіткою окремим рядком сталої висоти, легенда кольорів |
| `v2-decisions-sheet-motion-dark.jpg` | панель запису перед рішенням (рух — печатка, виїзд угору, наступний запис знизу — у кадрі не видно; рішень на спільній базі під час знімків не ухвалювали) |

### Landing `/welcome` (ADR 0007)

З локальної збірки гілки `task/welcome-landing`, гість (без входу), 1440 px. Поле частинок ще не підключене (PR 5/5):
тло — сітка з крапок, той самий запасний вигляд, що без WebGL.

| Файл | Що видно |
|---|---|
| `v2-welcome-hero-light.jpg`, `v2-welcome-hero-dark.jpg` | шапка зі «склом», hero: заголовок, «Sign in» і «Try a request», три факти |
| `v2-welcome-try-light.jpg` | «Try it» після «Submit request»: два записи на четвер, кожен схвалив менеджер своєї посади, залишок 15.64 |
| `v2-welcome-roles-dark.jpg` | три ролі за матрицею прав і нахилене прев'ю Overview |

### Поле частинок і Sign in v2 (ADR 0007)

З локальної збірки гілки `task/particle-field`, гість, 1440 px. Полотно — `ParticleField` (three.js); вужче за 1100 px,
без WebGL2 чи з reduced motion його немає, лишається сітка з крапок (як на знімках `v2-welcome-*` вище).

| Файл | Що видно |
|---|---|
| `v2-welcome-field-sheet-dark.jpg` | hero: аркуш місяця з частинок праворуч від тексту, позначені дні кольорами статусів |
| `v2-welcome-field-ring-dark.jpg` | «Balances»: кільце залишку за числом 16.64 — залишок `primary`, використане тьмяне |
| `v2-welcome-field-roles-light.jpg` | ролі, світла тема: наведено картку Administrator — її сфера яскравіша й більша, інші тьмяніють |
| `v2-login-field-dark.jpg` | Sign in v2: тиха картка ліворуч, аркуш місяця праворуч склався з хмари |

### Адаптив, робочі сторінки (ADR 0008, PR 1/3)

З Preview гілки `task/responsive-app`, `manager1@example.test` (синтетичні дані, `supabase/demo-users.json`). Телефон —
390 px (Overview — 375 px), настільний — 1280 px.

| Файл | Що видно |
|---|---|
| `v2r-phone-overview-dark.jpg` | шапка з кнопкою меню, Overview: місяць із точок на всю ширину, смуга чисел 2×2 |
| `v2r-phone-menu-light.jpg` | меню зліва: ті самі пункти й лічильник «Decisions», тема й закрити (акаунт і Sign out — унизу панелі, за межею знімка) |
| `v2r-phone-decisions-dark.jpg` | «Decisions»: записи — картки цілком-посилання зі стрілкою в куті |
| `v2r-phone-record-dark.jpg` | запис на весь екран: «Back to list», ↑/↓, Reject і Return у два стовпці, Approve на всю ширину, прикріплені внизу |
| `v2r-desktop-decisions-light.jpg` | 1280 px без змін: бічна панель і таблиця |

### Адаптив, нова заявка (ADR 0008, PR 2/3)

З Preview гілки `task/responsive-new-request`, `teacher1@example.test` (синтетичні дані, `supabase/demo-users.json`);
заявку не подано. Телефон — 390 px (`pointer: coarse`), настільний — 1280 px.

| Файл | Що видно |
|---|---|
| `v2r-newrequest-phone-dates-dark.jpg` | крок «Dates»: кроки смужкою вгорі, календар на всю ширину картки (день 48 px), внизу прикріплена панель «2 dates» і Continue |
| `v2r-newrequest-phone-hours-light.jpg` | «Positions and hours»: картки посад без лівого відступу, поля часу 16 px в один рядок, на панелі — «2 records · 10 h 30 min» і «назад» іконкою |
| `v2r-newrequest-phone-summary-light.jpg` | «Check and confirm»: записи — картки з тривалістю в куті, попередження про залишок, Submit request прикріплено внизу |
| `v2r-newrequest-desktop-summary-light.jpg` | 1280 px без змін: таблиця записів, «Back to editing» і Submit request у картці |
| `v2r-newrequest-desktop-type-dark.jpg` | 1280 px, темна тема: картки типів — іконка біля краю (приховане радіо більше не займає місця) |

### Адаптив, landing і вхід (ADR 0008, PR 3/3)

З локальної збірки гілки `task/responsive-welcome-login` (`next start` із заглушками `NEXT_PUBLIC_SUPABASE_*`), гість,
Playwright: телефон — Pixel 7 на 390×844 (дотик, легке поле), настільний — 1280×800 (миша, повне поле).

| Файл | Що видно |
|---|---|
| `v2r-welcome-phone-light.jpg`, `v2r-welcome-phone-dark.jpg` | шапка: знак, тема, «Sign in» і «Open menu» (розділи в меню); легке поле — аркуш місяця над заголовком; кнопки hero на всю ширину |
| `v2r-welcome-phone-try-dark.jpg` | «Try it» в одну колонку: дати в п'ять колонок, посади, час |
| `v2r-welcome-phone-roles-light.jpg` | ролі по одній у рядку, три сфери ролей поля в ряд над картками |
| `v2r-welcome-desktop-light.jpg`, `v2r-welcome-desktop-dark.jpg` | 1280 px без змін: аркуш праворуч від тексту hero, посилання розділів у шапці |
| `v2r-login-phone-light.jpg`, `v2r-login-phone-dark.jpg` | вхід на телефоні: аркуш місяця смугою вгорі, картка нижче; поля й кнопка 44+ px, шрифт полів 16 px |
| `v2r-login-desktop-light.jpg`, `v2r-login-desktop-dark.jpg` | 1280 px без змін: картка ліворуч, аркуш праворуч |
