# Дизайн-система: Leave Portal

- **Джерело:** Claude Design — артефакт Design System «Leave Portal»
  (https://claude.ai/artifact/QScaTzkv6BQjN8wXSzRbCH) і полотно сторінок «Leave Portal screens»
  (https://claude.ai/artifact/JysD7EqqVnwkCZaA18QWCz); обидва приватні — знімки й промпт у PR дизайн-системи.
- **Вхід від PM:** розділу «Вигляд і тон» не буде — вигляд за розробником
  (mkozlovskyi-ops/course-staff-management-spec#18). Правила PM лише про зміст: тип відсутності й статус завжди словом,
  колір — лише додатково (#14 там само); попередження відрізняється від помилки (#16 там само) —
  `requirements/01-leave-request.md` і `03-leave-balance.md`, Assumptions. Основа — бачення, ролі й глосарій продукту і
  палітра WS6 з `src/app/globals.css`, переведена в OKLCH і перейменована в семантику shadcn/ui. Без брендингу школи.
- **Код:** токени — `src/app/globals.css`; компоненти — `src/components/ui/` (shadcn/ui і наші доменні); вітрина —
  `/design`; перевірки — `npm run check:design` і `npm run check:ui`; рішення — `docs/decisions/0004-design-system.md`.

## 1. Огляд

Внутрішній робочий портал школи: працівник подає заявку на відсутність за днями чи годинами, менеджер вирішує щодо
кожного запису, усі бачать залишки. Ним користуються щодня на робочому комп'ютері (від 1000 px завширшки; мобільна
верстка — поза межами продукту), тому інтерфейс **спокійний, точний, щільний і передбачуваний**: таблиці й форми
читаються швидко, кожен екран має одну основну дію. Виразність зосереджено в одному місці — на сторінці входу; у
робочих сторінках рух лише пояснює зміну (перехід, підсвітка меню) і ледь відгукується на курсор (картки балансу,
розділ 11). Уникаємо декору заради декору: градієнтів, «скла» й ambient-руху поза входом, ілюстрацій, емодзі,
кольорових смуг на картках.

Тон текстів:

- Інтерфейс англійською, як у вимогах PM. Повідомлення, помилки й порожні стани — **дослівно з AC**
  («You have no working hours on this day», «The comment can be at most 500 characters»).
- Звертаємось на «you», коротко. Кнопка — дієслово, що станеться: «Submit request», «Approve», «Return for revision»,
  «Cancel record». Без «Oops», вибачень і знаків оклику.
- Sentence case у заголовках і кнопках («My requests», «Awaiting decision»). Терміни — лише з глосарію продукту:
  record, request, position, division, balance; не «ticket», «slot», «department».
- Дати — `Tue, 3 Nov 2026` або `2026-11-03`; у таблиці, згрупованій за місяцем, — `Tue 3`. Години — `08:30–12:00`
  (коротке тире). Дні балансу — дві цифри після коми й одиниця: `0.50 days`. Числа — `tabular-nums`.

## 2. Кольори

Семантичні токени з іменами shadcn/ui плюс токени нашого домену. Значення — OKLCH. У сторінках — лише утиліти з колонки
«Клас», ніколи hex, `bg-[#…]` чи сирі палітри. Тема — Light, Dark або System (за замовчуванням, `prefers-color-scheme`):
вибір у меню теми, cookie `theme` і `data-theme` на `<html>` (ADR 0005).

| Токен | Для чого | Світла | Темна | Клас |
|---|---|---|---|---|
| `background` / `foreground` | тло сторінки й основний текст | `oklch(0.985 0.004 275)` / `oklch(0.22 0.025 275)` | `oklch(0.145 0.012 275)` / `oklch(0.955 0.006 275)` | `bg-background`, `text-foreground` |
| `card` / `card-foreground` | картки, таблиці, панелі форм | `oklch(1 0 0)` / `oklch(0.22 0.025 275)` | `oklch(0.225 0.018 275)` / `oklch(0.955 0.006 275)` | `bg-card`, `text-card-foreground` |
| `popover` / `popover-foreground` | меню, списки Select, діалоги | `oklch(1 0 0)` / `oklch(0.22 0.025 275)` | `oklch(0.255 0.02 275)` / `oklch(0.955 0.006 275)` | `bg-popover`, `text-popover-foreground` |
| `primary` / `primary-foreground` | одна основна дія на екран, посилання, вибрані дні | `oklch(0.47 0.19 274)` / `oklch(0.99 0.004 274)` | `oklch(0.72 0.13 274)` / `oklch(0.18 0.035 274)` | `bg-primary`, `text-primary-foreground` |
| `secondary` / `secondary-foreground` | другорядні кнопки | `oklch(0.955 0.014 274)` / `oklch(0.32 0.08 274)` | `oklch(0.27 0.025 274)` / `oklch(0.93 0.012 274)` | `bg-secondary`, `text-secondary-foreground` |
| `muted` / `muted-foreground` | тихі заливки (шапка таблиці, скелетони); підписи, підказки, лічильники | `oklch(0.965 0.006 275)` / `oklch(0.5 0.022 275)` | `oklch(0.27 0.016 275)` / `oklch(0.73 0.016 275)` | `bg-muted`, `text-muted-foreground` |
| `accent` / `accent-foreground` | наведення, вибраний рядок, пункт меню | `oklch(0.95 0.023 274)` / `oklch(0.3 0.11 274)` | `oklch(0.31 0.05 274)` / `oklch(0.95 0.012 274)` | `bg-accent`, `text-accent-foreground` |
| `destructive` / `destructive-foreground` | незворотні дії, текст і межа помилки | `oklch(0.52 0.2 27)` / `oklch(0.99 0.003 27)` | `oklch(0.7 0.16 25)` / `oklch(0.18 0.04 25)` | `bg-destructive`, `text-destructive`, `text-destructive-foreground` |
| `border` | розділювачі, межі карток і таблиць (декоративні) | `oklch(0.915 0.008 275)` | `oklch(0.36 0.02 275)` | `border-border` |
| `input` | межа поля, Select, Checkbox | `oklch(0.63 0.02 275)` | `oklch(0.56 0.022 275)` | `border-input` |
| `ring` | кільце фокусу | `oklch(0.55 0.19 274)` | `oklch(0.74 0.13 274)` | `ring-ring`, `outline-ring` |
| `scrim` | затемнення під діалогом (45%) і під `Sheet` (25%) | `oklch(0.22 0.025 275)` | `oklch(0.08 0.01 275)` | `bg-scrim/45` |
| `highlight` / `highlight-foreground` | теплий акцент-позначка: спалах нового рядка, сяйво на вході; ніколи не текст | `oklch(0.8 0.12 68)` / `oklch(0.3 0.07 55)` | `oklch(0.78 0.12 68)` / `oklch(0.22 0.06 55)` | `bg-highlight` |
| `status-awaiting` / `-foreground` | «Awaiting decision»; день, на який уже є запис | `oklch(0.955 0.052 88)` / `oklch(0.44 0.1 62)` | `oklch(0.31 0.06 75)` / `oklch(0.87 0.11 85)` | `bg-status-awaiting`, `text-status-awaiting-foreground` |
| `status-approved` / `-foreground` | «Approved» | `oklch(0.95 0.05 152)` / `oklch(0.42 0.11 152)` | `oklch(0.3 0.055 155)` / `oklch(0.86 0.12 152)` | `bg-status-approved`, `text-status-approved-foreground` |
| `status-rejected` / `-foreground` | «Rejected» | `oklch(0.945 0.027 22)` / `oklch(0.48 0.17 25)` | `oklch(0.3 0.065 22)` / `oklch(0.84 0.088 22)` | `bg-status-rejected`, `text-status-rejected-foreground` |
| `status-returned` / `-foreground` | «Returned for revision» | `oklch(0.945 0.027 245)` / `oklch(0.45 0.13 255)` | `oklch(0.3 0.06 250)` / `oklch(0.85 0.078 245)` | `bg-status-returned`, `text-status-returned-foreground` |
| `status-cancelled` / `-foreground` | «Cancelled» | `oklch(0.95 0.004 275)` / `oklch(0.47 0.015 275)` | `oklch(0.27 0.01 275)` / `oklch(0.78 0.012 275)` | `bg-status-cancelled`, `text-status-cancelled-foreground` |
| `warning` / `warning-foreground` | попередження (перевищення залишку) | `oklch(0.965 0.041 88)` / `oklch(0.42 0.095 62)` | `oklch(0.29 0.05 75)` / `oklch(0.88 0.1 85)` | `bg-warning`, `text-warning-foreground` |
| `info` / `info-foreground` | довідка, повідомлення про успіх дії | `oklch(0.96 0.019 245)` / `oklch(0.43 0.12 255)` | `oklch(0.28 0.05 250)` / `oklch(0.86 0.07 245)` | `bg-info`, `text-info-foreground` |
| `leave-sick` / `-foreground` | тип «Sick leave» | `oklch(0.95 0.025 5)` / `oklch(0.46 0.15 5)` | `oklch(0.29 0.06 5)` / `oklch(0.85 0.08 5)` | `bg-leave-sick`, `text-leave-sick-foreground` |
| `leave-personal` / `-foreground` | тип «Personal leave» | `oklch(0.95 0.022 274)` / `oklch(0.42 0.15 274)` | `oklch(0.29 0.05 274)` / `oklch(0.85 0.074 274)` | `bg-leave-personal`, `text-leave-personal-foreground` |
| `leave-unpaid` / `-foreground` | тип «Unpaid leave» | `oklch(0.95 0.008 275)` / `oklch(0.45 0.02 275)` | `oklch(0.27 0.012 275)` / `oklch(0.8 0.014 275)` | `bg-leave-unpaid`, `text-leave-unpaid-foreground` |
| `leave-family` / `-foreground` | тип «Family celebration» | `oklch(0.95 0.035 320)` / `oklch(0.45 0.15 320)` | `oklch(0.29 0.06 320)` / `oklch(0.85 0.08 320)` | `bg-leave-family`, `text-leave-family-foreground` |
| `sidebar` / `sidebar-foreground` | бокова навігація | `oklch(0.975 0.006 275)` / `oklch(0.3 0.025 275)` | `oklch(0.18 0.014 275)` / `oklch(0.88 0.01 275)` | `bg-sidebar`, `text-sidebar-foreground` |
| `sidebar-accent` / `-foreground` | активний пункт навігації | `oklch(0.93 0.03 274)` / `oklch(0.3 0.12 274)` | `oklch(0.27 0.045 274)` / `oklch(0.95 0.012 274)` | `bg-sidebar-accent`, `text-sidebar-accent-foreground` |

Правила за змістом:

- `primary` — **одна основна дія на екран** (Submit request, Approve). Друга — `secondary` чи `outline`, третя — `ghost`.
- `destructive` — лише незворотне (Cancel record, Reject) і тексти помилок; незворотна дія завжди проходить Dialog.
- Статус запису — бейдж `status-*` (пігулка з крапкою), тип відсутності — `leave-*`: у таблиці квадратик і слово без
  заливки, у формах і підсумках — плоский тег. Так у рядку лише одна заповнена «пігулка» — статус.
- Сірий текст — лише `muted-foreground`; інших сірих не вводимо.

### Контраст

Пораховано з OKLCH-значень (WCAG 2, sRGB). Текст ≥ 4.5:1 на своєму тлі в обох темах, межі полів і фокус ≥ 3:1.

| Пара | Світла | Темна | Норма |
|---|---|---|---|
| `foreground` на `background` | 16.61 | 17.36 | ≥ 4.5 |
| `foreground` на `card` | 17.35 | 15.02 | ≥ 4.5 |
| `foreground` на `muted` | 15.67 | 13.23 | ≥ 4.5 |
| `muted-foreground` на `background` | 5.76 | 8.27 | ≥ 4.5 |
| `muted-foreground` на `card` | 6.02 | 7.15 | ≥ 4.5 |
| `muted-foreground` на `muted` | 5.43 | 6.30 | ≥ 4.5 |
| `primary-foreground` на `primary` | 7.08 | 7.44 | ≥ 4.5 |
| `primary` на `card` | 7.28 | 6.76 | ≥ 4.5 |
| `primary` на `background` | 6.97 | 7.81 | ≥ 4.5 |
| `secondary-foreground` на `secondary` | 11.30 | 12.28 | ≥ 4.5 |
| `accent-foreground` на `accent` | 12.09 | 11.45 | ≥ 4.5 |
| `destructive` на `card` | 6.11 | 5.97 | ≥ 4.5 |
| `destructive-foreground` на `destructive` | 5.93 | 6.61 | ≥ 4.5 |
| `popover-foreground` на `popover` | 17.35 | 13.85 | ≥ 4.5 |
| `highlight-foreground` на `highlight` | 7.29 | 8.56 | ≥ 4.5 |
| `status-awaiting-foreground` на `status-awaiting` | 7.02 | 8.92 | ≥ 4.5 |
| `status-approved-foreground` на `status-approved` | 7.06 | 9.10 | ≥ 4.5 |
| `status-rejected-foreground` на `status-rejected` | 6.03 | 8.29 | ≥ 4.5 |
| `status-returned-foreground` на `status-returned` | 6.41 | 8.68 | ≥ 4.5 |
| `status-cancelled-foreground` на `status-cancelled` | 5.91 | 7.53 | ≥ 4.5 |
| `warning-foreground` на `warning` | 7.86 | 9.86 | ≥ 4.5 |
| `info-foreground` на `info` | 7.29 | 9.59 | ≥ 4.5 |
| `leave-sick-foreground` на `leave-sick` | 6.63 | 8.86 | ≥ 4.5 |
| `leave-personal-foreground` на `leave-personal` | 7.64 | 8.92 | ≥ 4.5 |
| `leave-unpaid-foreground` на `leave-unpaid` | 6.44 | 8.06 | ≥ 4.5 |
| `leave-family-foreground` на `leave-family` | 6.89 | 8.88 | ≥ 4.5 |
| `sidebar-foreground` на `sidebar` | 12.72 | 13.10 | ≥ 4.5 |
| `sidebar-accent-foreground` на `sidebar-accent` | 11.44 | 13.09 | ≥ 4.5 |
| `input` на `card` | 3.51 | 3.67 | ≥ 3 |
| `input` на `background` | 3.36 | 4.24 | ≥ 3 |
| `ring` на `background` | 4.91 | 8.41 | ≥ 3 |
| `ring` на `card` | 5.13 | 7.27 | ≥ 3 |

## 3. Типографіка

Geist для всього інтерфейсу (`next/font`, `--font-sans`), Geist Mono — лише для ідентифікаторів (`--font-mono`).
Числа, дати й години — `tabular-nums`. Ширина тексту в нотатках і порожніх станах — до 60 знаків.

| Роль | Клас | Де |
|---|---|---|
| Заголовок сторінки | `text-2xl font-semibold tracking-tight` (24/32) | один на сторінку, у PageHeader |
| Заголовок розділу | `text-base font-semibold` (16/24) | картки, кроки форми, діалоги, панелі |
| Основний текст | `text-sm` (14/20) | клітинки таблиць, значення, нотатки |
| Підпис поля | `text-[13px] font-medium` через `Label` | над кожним полем |
| Підпис, допоміжний текст | `text-xs text-muted-foreground` (12/16) | підказки, лічильники, заголовки колонок, бейджі |
| Число балансу | `text-3xl font-semibold tabular-nums` + одиниця `text-sm text-muted-foreground` | BalanceCard |

## 4. Відступи й радіуси

- Крок 4 px (шкала Tailwind): `gap-2` між кнопками, `px-3 py-2.5` у клітинках таблиці, `p-5` усередині картки, `gap-6`
  між розділами сторінки, `p-8` — поля сторінки. Контент — до `max-w-[1220px]`, навігація ліворуч 220 px.
- Радіуси: `rounded-sm` (6 px) — теги, мала кнопка; `rounded-md` (8 px) — кнопки, поля, нотатки; `rounded-lg` (12 px) —
  картки, таблиці; `rounded-xl` (16 px) — діалоги, картка входу; `rounded-full` — бейджі статусів, лічильники, смуги.
- Тіні тихі: `shadow-sm` — картки; `shadow-md` — меню й списки; `shadow-lg` — діалоги й картка входу. Ієрархію тримають
  межі `border`, а не тіні.

## 5. Компоненти й варіанти

Лише з `@/components/ui`. Нові shadcn-компоненти — `npx shadcn@4.22.1 add <назва>` (після — перевірити `globals.css`,
розділ 9). Наші доменні компоненти побудовані з shadcn-компонентів і токенів, без власних кольорів.

| Компонент | Варіанти | Правило |
|---|---|---|
| `Button` | `default`, `secondary`, `outline`, `ghost`, `destructive`, `link`; розміри `default`, `sm`, `icon`, `icon-sm` | `default` — одна основна дія на екран; `destructive` — лише кнопка підтвердження в `Dialog`; кнопка-іконка — завжди з `aria-label`; під час дії — спінер і підпис («Submitting…») |
| `Input`, `Textarea` + `Label` | — | у кожного поля `Label` з `htmlFor`; «Optional» — праворуч від підпису, не в ньому; placeholder не замінює підпис |
| `Select`, `Checkbox` | — | список — у порядку з вимоги; Checkbox посади — картка з назвою посади й розкладом |
| `Card` | — | одна ідея на картку: баланс, крок форми, «Your request»; без кольорових смуг і градієнтів |
| `Table` | — | колонки: дата, посада, години, тип, статус, дії; групування за місяцем; дата й години не переносяться. Виняток — черга «Decisions»: список на всю ширину, запис відкривається в `Sheet` справа, колонки працівник (з посадою), дата, години, тип (+ статус в «History»), без групування; рядок цілком — посилання на панель, замість «⋯» — стрілка (в «History» — статус), бо дія одна — відкрити запис |
| `Badge` / `StatusBadge` | статуси домену | статус — завжди словом із глосарію, крапка лише допомагає; «Awaiting decision» — крапка повільно пульсує |
| `LeaveTypeTag` | `tag`, `inline` | `inline` (квадратик + слово) — у таблицях; `tag` — у формах і підсумках |
| `HoursBar` | — | смуга робочого дня посади, заповнено частину запису; поруч час або «Whole day» |
| `Sheet` | — | робоча панель справа поверх сторінки (до 460 px), список під нею видно крізь легке затемнення `scrim`; шапка — хто чи що (заголовок, статус, email), «2 of 6», «Previous / Next» (↑/↓ із шапки) і закрити (Esc; з набраним коментарем Esc і клік повз не закривають); тіло прокручується саме. Для «Decisions»: дії внизу запису — `outline` Reject (червоний текст) і Return for revision ліворуч, `default` Approve праворуч, однієї висоти |
| `DropdownMenu` (`RowMenu`) | — | дії рядка таблиці — лише тут: кнопка «⋯» у КОЖНОМУ рядку (крім списку «Decisions», де дії — у панелі запису); пункти за статусом, «View details» завжди, небезпечна дія — остання, після розділювача, `destructive` |
| `RecordSummary` | — | що саме стосується дія: дата й години великим (години — `primary`), посада й тип нижче; у діалогах і панелі рішення |
| `BalanceCard` | — | лише залишок (`… days`) і «X of Y used» зі смугою; пояснення одиниці — одна підказка під рядком карток; нахил за курсором ≤2° і «докручування» числа — розділ 11 |
| `Dialog` | — | заголовок — питання, RecordSummary, одне речення наслідку, дія-дієслово і «Back» |
| `Alert` | `destructive`, `warning`, `info` | текст помилки — дослівно з AC; не зникає сам |
| `EmptyState` | — | іконка в колі `accent`, текст з AC, щонайбільше одна дія |
| `Skeleton` | — | форма майбутнього вмісту: смуги `muted` (`rounded-sm`), що повільно пульсують |
| `Tooltip` | — | коротке пояснення до іконки чи одиниці, не критична інформація |
| `PageHeader` | — | заголовок сторінки, один рядок опису, основна дія праворуч |
| `AppNav` | розгорнута 220 px, згорнута 60 px | шапка — знак, назва, `ThemeMenu`, кнопка згортання (і Ctrl+B); розділювачі шапки й акаунта — на всю ширину; лише пункти, доступні ролі; лічильник «Awaiting decision» на `primary`; акаунт (ініціали, ім'я, email, Sign out) унизу. Згорнута — лише іконки з `Tooltip`, назви лишаються для зчитувача екрана, лічильник — пігулка на іконці; стан — cookie `sidebar` |
| `Logo` | — | знак (аркуш календаря з кільцями, загнутий кут, галочка) у квадраті `primary`, `currentColor`; той самий — favicon `src/app/icon.svg` |
| `ThemeMenu` | — | кнопка-іконка поточної теми з `aria-label` «Theme: …»; меню Light / Dark / System з галочкою вибраного |

## 6. Стани

| Стан | Як виглядає | Приклад тексту |
|---|---|---|
| Порожній список | `EmptyState`: іконка в колі `accent`, текст `muted-foreground`, одна дія | «No records awaiting decision» (AC-DECIDE-14) |
| Помилка дії | `Alert` `destructive` над формою; введене лишається у формі | «You already have a request for this time: 2026-11-03 09:00–11:00» (AC-LEAVE-16) |
| Помилка поля | межа `destructive`, текст під групою полів, `aria-describedby` | «Hours must be within your schedule: 08:30–12:00, 12:30–15:30» (AC-LEAVE-19) |
| Попередження | `Alert` `warning` у підсумку заявки, дія дозволена | перевищення залишку (AC-BALANCE-08, AC-BALANCE-17) |
| Відмова в доступі | сторінка з поясненням і посиланням на головну, без даних | «You can't decide on this record» (наше припущення до AC-DECIDE-08, AC-DECIDE-09) |
| Завантаження | `Skeleton` у формі вмісту (пульсує); спінер — лише в кнопці, що чекає (`aria-busy`, лишається читабельною) | — |
| Успіх | `Alert` `info` з галочкою над списком; новий рядок спалахує `highlight` один раз | «Request submitted» |
| Вимкнена дія | `disabled` (прозорість 50%) і пояснення поруч, чому | — |
| День календаря | робочий — тонка рамка `border`; вибрано — `primary`; уже є запис — заливка `status-awaiting`; закрито школою — штриховка `muted`/`border`, перекреслено; немає годин — число `muted-foreground` без рамки (кнопка: натискання пояснює AC-LEAVE-06); легенда під календарем | — |

## 7. Доступність — мінімум

- Label у кожного поля; помилка поля пов'язана з полем (`aria-describedby`), межа `destructive`.
- Видимий фокус: `ring` (2 px, відступ 2 px) на кожному інтерактивному елементі; Tab проходить форму по порядку.
- Контраст — таблиця в розділі 2.
- Статус ніколи не лише кольором — поруч завжди текст; тип відсутності — слово, не лише квадратик.
- Спершу семантичний HTML (`<button>`, `<table>`, `<label>`, `<nav>`); `aria-*` — там, де HTML бракує, а не замість нього.
- Кнопки-іконки (`⋯`, Sign out, стрілки календаря) — з `aria-label`; меню — `role="menu"` від `DropdownMenu`.
- `prefers-reduced-motion: reduce` вимикає всю анімацію (розділ «Рух»).

## 8. Do / Don't

| ✅ Робимо | ❌ Не робимо |
|---|---|
| `bg-primary text-primary-foreground` | `bg-zinc-900 text-white`, `bg-[#4338ca]`, `style={{ color: "#…" }}` |
| компонент `Button` з потрібним варіантом | власний `<button className="…">` у сторінці |
| дії рядка — у меню «⋯» | окремі кнопки в рядках таблиці |
| причина відмови чи повернення — під статусом («Manager: …») | ховати причину лише в деталях запису |
| залишок — `22.00 days` | залишок у годинах або без одиниці |
| новий токен через розділ 9 | новий колір «лише для цієї сторінки» |
| рух через `duration-*` і `ease-*` | довільні `transition: 300ms` і анімації поза токенами |
| виразність — лише на сторінці входу; у робочих — рух, що пояснює зміну, і нахил картки ≤2° | градієнти, «скло», 3D-рушії, паралакс чи відео в робочих сторінках |

## 9. Як додати токен

1. Опишіть токен у таблиці розділу 2: для чого, значення в обох темах, клас, і пару в таблиці контрасту.
2. `src/app/globals.css`: `--<назва>` у `:root` і в **обидва** темні блоки — `@media (prefers-color-scheme: dark)` і
   `:root[data-theme="dark"]` (однаковість блоків перевіряє тест `src/components/ui/design-system.test.tsx`).
3. `--color-<назва>: var(--<назва>);` у `@theme inline` → з'являються класи `bg-<назва>`, `text-<назва>`, `border-<назва>`.
4. `npm run check:design`, вітрина `/design` і знімок сторінки у світлій і темній темі.

Після `npx shadcn add` компонента з власними CSS-змінними (sidebar, chart) приберіть доданий блок `.dark` і другий
`@custom-variant dark`, якщо CLI його додав: наш варіант `dark` уже в `globals.css` і йде за `data-theme` або системою.

## 10. Перевірка

- `npm run check:design` — жодного hex, довільного кольору, сирої палітри чи кольору в inline style поза
  `src/components/ui` і `globals.css`. CI: `.github/workflows/architecture.yml`, job «Design system: tokens only».
- `npm run check:ui` — поза `src/components/ui` немає сирих `<button>`, `<input>` (крім `type="hidden"`), `<select>`,
  `<textarea>`, `<table>`: лише компоненти з розділу 5. CI: той самий workflow, job «Design system: ui components only».
- Виняток — коментар `design-ok: <причина>` у тому самому рядку; кожен виняток — з реальною причиною.
- Візуально: вітрина `/design` і знімки ключових сторінок у світлій і темній темі (`docs/img/`), Tab по формі, контраст.

## 11. Рух

Рух пояснює зміну, а не прикрашає. Лише через токени; `prefers-reduced-motion: reduce` вимикає все.

| Токен | Значення | Де |
|---|---|---|
| `--duration-fast` | 120ms | наведення, натискання (кнопка зсувається на 1 px), фокус, підсвітка рядка, нахил картки балансу |
| `--duration-base` | 200ms | поява Dialog, меню й списку Select (підйом + масштаб 0.98 → 1), нотаток (підйом 4 px), нового вмісту сторінки (підйом 6 px), ковзання підсвітки меню, згортання бічної панелі, виїзд `Sheet` |
| `--duration-slow` | 420ms | спалах нового рядка `highlight`, поява числа балансу і його «докручування» від 0, заповнення смуги |
| `--duration-ambient` | 18s | лише фон сторінки входу |
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | усе, що з'являється або реагує на курсор |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | цикли: пульс, мерехтіння, дрейф фону |

- Сторінка входу: три м'які плями `primary`, `highlight` і `info-foreground` повільно дрейфують по `background` під
  сіткою з крапок; картка входу — «скло» (`card` 82% + розмиття) і легкий нахил за курсором.
- Робочі сторінки:
  - **перехід між розділами меню** — новий вміст підіймається на 6 px і проявляється (`(app)/template.tsx`,
    `animate-page-in`); підіймається те, що з'явилось першим, зазвичай скелетон сторінки, а готовий вміст потім
    стає на його місце без руху. Зміна `?record=` чи `?year=` на тій самій сторінці й перехід усередині розділу
    (My requests → New request) не анімують;
  - **меню** — одна смуга підсвітки ковзає до натиснутого пункту одразу, ще до відповіді сервера; поки сторінка
    чекає довше за 100 ms, на місці іконки пункту — спінер;
  - **картки балансу** — нахил за курсором не більше 2° (лише миша, без 3D-рушія); число залишку «докручується»
    від 0, коли картка з'являється після переходу (перше завантаження й зміна року показують число одразу); смуга
    використаного заповнюється.
- Без руху: текст помилок, таблиці під час читання, усе, що вже на місці. Без паралаксу, 3D-рушіїв і відео.
