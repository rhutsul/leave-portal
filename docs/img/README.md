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
- **Sign in.** На полотні — «скляна» картка на фоні з плямами. У реалізації праворуч ще 3D-стос карток-днів (ADR 0006)
  і кнопка «Show password» у полі пароля.

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
