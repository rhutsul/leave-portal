# Design: заявка від імені працівника і правка запису до рішення

## Контекст

На чому будуємо (стан `main` на a22ecb0 плюс два зрізи, що зливаються раніше за цей):

- Посади й менеджери — `public.positions`, `public.position_managers`; хелпери `private.manages_position`,
  `private.manages_employee`, `private.can_see_record`, `private.current_app_role`
  (`20261020190045_leave_requests_schema.sql`). Роль — з `profiles.role`. RLS на `positions` показує менеджеру лише
  посади, якими він керує, тож додаткову посаду працівника з іншим менеджером (AC-BEHALF-02) менеджер напряму не бачить.
- Подання — `private.submit_leave_request(p_leave_type, p_records jsonb, p_relationship, p_comment)`, `security
  definer`, обгортка `public` — `security invoker`. Остання версія тіла на `main` —
  `20261113145925_school_calendar_clarifications.sql`; зріз `substitutes` (план `openspec/changes/impl-substitutes/`,
  D4–D5) замінює його тіло ще раз: lock `busy:`, ключ `substitute_id` у `p_records`, перевірка списку замін і
  `private.substitute_conflict`, `upgrade_minutes`. Наш зріз бере за основу саме ту версію.
- Рішення — `private.decide_leave_record(p_record_id, p_decision, p_comment, p_split, p_start_min, p_end_min)`
  (`20261117083144_decide_calendar_lock.sql`): lock працівника, потім спільний lock календаря; розподіл понад залишок
  (`private.record_share`, `private.remaining_hundredths`); перевірка «ті самі години» — оптимістичний захист від зміни
  годин працівником (AC-DECIDE-22).
- Зміна годин працівником — `private.update_leave_record_hours` (lock працівника → календар → `busy:` після зрізу
  `substitutes`); тексти відмов — `private.locked_record_message`.
- Історія — `public.leave_record_events` (`action`, `comment`, `actor_id`, `created_at`); читання —
  `public.record_histories(bigint[])` (повертає `actor_name` = `profiles.full_name`), показ — `RecordHistory` і
  `historyLine` (`src/components/record-history.tsx`, `src/lib/leave/decision.ts`). Зріз `cancel-approved` перестворює
  `leave_record_events_action_check` з діями `cancellation_requested`, `cancellation_declined`.
- Профілі інших людей `authenticated` не читає; менеджер бачить імена й email лише через функції
  (`decision_records()`, після зрізу `substitutes` — `manageable_employees()`, `substitute_list(p_employee_id)`).
- Нова заявка — `src/app/(app)/requests/new/**`: `page.tsx` (посади, залишки, дати чинних записів, закриття),
  `new-request-form.tsx` (кроки, календар, підсумок, попередження понад залишок, нагадування AC-LEAVE-23 через
  `personalLeaveReminder` у `src/lib/leave/balance.ts`), `actions.ts` (`submitLeaveRequest`).
- «Decisions» — `src/app/(app)/decisions/**`: `Sheet` запису (`record-sheet.tsx`), розділи «Record» (`RecordDay`),
  «Balance» (`BalanceShift`), коментарі, «History», смуга дій (`decision-form.tsx`).
- Гостя на `/login` веде `src/proxy.ts` для будь-якого шляху поза публічними.

## Рішення

**D1 — хто подає від імені кого (AC-BEHALF-03, AC-BEHALF-11, AC-BEHALF-12, AC-BEHALF-15).** Право — один новий хелпер
`private.can_act_for_employee(p_employee_id uuid) returns boolean` (`security definer`, `set search_path = ''`,
`stable`, `revoke … from public, anon, authenticated` — викликають лише наші функції): роль `admin`, або роль
`manager` і `private.manages_employee(p_employee_id)` (будь-яка посада працівника — «employees of their positions»);
ніколи не сам користувач (`p_employee_id <> auth.uid()`: власна заявка — `01-leave-request.md`, Out of scope PM).
Перевірки в `submit_leave_request_on_behalf` і на сторінках — у такому порядку, перша, що спрацювала, дає текст:

| Умова | Код | Текст |
|---|---|---|
| не ввійшов | 42501 | `Not signed in` (сторінку до того не пускає `src/proxy.ts`, AC-BEHALF-14) |
| роль `employee` | 42501 | `Only a manager or an administrator can submit a request on behalf of an employee` (AC-BEHALF-12) |
| роль `manager`, жодної посади в `position_managers` | 42501 | `You have no employees to submit requests for` (AC-BEHALF-15) |
| `p_employee_id = auth.uid()` | P0001 | `Submit your own leave from New request` **(розробник)**; сторінка такого вибору не пропонує, а пряме посилання на себе веде на `/requests/new` |
| `not private.can_act_for_employee(p_employee_id)` або профілю немає | 42501 | `You can submit requests only for employees of your positions` (AC-BEHALF-11); неіснуючий працівник — той самий текст, щоб не розкривати, чи профіль існує |

Адміністратор подає за будь-кого (AC-BEHALF-03); неіснуючий профіль для нього — той самий текст AC-BEHALF-11
**(розробник)**.

**D2 — «погоджено одразу» і одне місце для заступників (AC-BEHALF-01, AC-BEHALF-02, AC-BEHALF-03).** Новий хелпер
`private.decides_for_position(p_position_id bigint, p_date date) returns boolean` (`security definer`, `set
search_path = ''`, `stable`, без прав для `authenticated`): роль `admin`, або роль `manager` і
`private.manages_position(p_position_id)`. Параметр `p_date` уже є, бо заступник за уточненням
`2026-11-24-clarify-new-slices-review` «на цей день погоджує одразу, як відповідальний менеджер»: зріз
`staff-management` (вимога 07) додасть умову заступника лише в тіло цієї функції — і погодження одразу, і правка
(D7) отримають її без інших змін. До того заступників немає (припущення з `add-on-behalf-and-edit`). Записи, для яких
функція дає `false`, лишаються «Awaiting decision» і потрапляють у чергу менеджерів своєї посади звичайним шляхом
(`decision_records()` рахує за `position_managers`) — AC-BEHALF-02.

**D3 — спільне ядро подання замість копії перевірок (AC-BEHALF-01, AC-BEHALF-02, AC-BEHALF-05).** Тіло
`private.submit_leave_request` (версія зрізу `substitutes`) переносимо в нову внутрішню
`private.create_leave_request(p_employee_id uuid, p_actor_id uuid, p_leave_type text, p_records jsonb, p_relationship
text, p_comment text) returns bigint` (`security definer`, `set search_path = ''`, `revoke … from public, anon,
authenticated`). Відмінності від копії — лише три місця, де тіло брало `auth.uid()`:

1. власник записів — `p_employee_id` (`leave_requests.employee_id`, `leave_records.employee_id`, перевірка посади
   `p.employee_id = p_employee_id`, `private.closed_day_name` / `private.working_minutes` для працівника, пошук
   перетину для тексту відмови, список замін `substitute_lists.employee_id = p_employee_id`);
2. lock `busy:` — на `p_employee_id` і вибраних замін (як у плані `substitutes`, D4);
3. подія історії: `p_actor_id = p_employee_id` → `submitted` (як було); інакше → `submitted_on_behalf` (D4).

`private.submit_leave_request` стає тонкою: `auth.uid()` → 42501 `Not signed in`, далі `return
private.create_leave_request(v_uid, v_uid, …)`. Сигнатура, типи параметрів і результату ті самі, тож expand →
contract не потрібен (AGENTS.md): код, що кличе `submit_leave_request`, працює до й після міграції. Тексти ядра
лишаються «you»-текстами працівника; для менеджера їх перекладає D6.

Нова `private.submit_leave_request_on_behalf(p_employee_id uuid, p_leave_type text, p_records jsonb, p_relationship
text default null, p_comment text default null) returns jsonb` (`security definer`, `set search_path = ''`), обгортка
`public.submit_leave_request_on_behalf` — `security invoker`; `revoke execute … from public, anon`, `grant execute …
to authenticated` для обох (як `submit_leave_request`). Порядок:

1. перевірки D1;
2. `pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0))` — lock працівника, як у рішенні й зміні годин,
   **до** спільного lock календаря, який бере ядро (той самий порядок працівник → календар → `busy:`, що в
   `decide_leave_record` і `update_leave_record_hours`: без deadlock із чергою ексклюзивного lock закриття);
3. `v_request_id := private.create_leave_request(p_employee_id, auth.uid(), …)` у блоці `begin … exception when
   raise_exception then raise exception '%', private.on_behalf_message(sqlerrm); end` — повідомлення P0001 ядра
   перекладає D6, решта кодів (42501, 22023, 23P01) іде як є;
4. записи заявки за `date, start_min, id` по черзі: `private.decides_for_position(position_id, date)` → погодити
   (D5) і додати подію `approved` з `actor_id = auth.uid()`;
5. результат `{"request_id", "approved", "awaiting"}` — лічильники для повідомлення про успіх (D10).

Усе в одній транзакції: виняток на будь-якому кроці відкочує заявку цілком («no record is created», AC-BEHALF-11,
AC-BEHALF-12). Пропуск неробочих і закритих дат (AC-LEAVE-21, AC-CAL-03) діє так само; якщо жодної дати не прийнято —
текст D6 («This employee has no working hours on this day», AC-BEHALF-05).

**D4 — історія: дві нові дії, рядок PM — у `comment` (AC-BEHALF-01, AC-BEHALF-06, AC-BEHALF-07, AC-BEHALF-08).**
`leave_record_events_action_check` перестворюємо (drop → add) з усіма наявними діями, діями зрізу `cancel-approved`
(`cancellation_requested`, `cancellation_declined`) і двома новими:

| Дія | `actor_id` | `comment` — дослівний рядок PM |
|---|---|---|
| `submitted_on_behalf` | той, хто подав | `Submitted by manager1@example.test on behalf of teacher1@example.test` |
| `record_changed` | той, хто змінив | `manager1@example.test changed the date: 2026-12-03 → 2026-12-04` |

Рядок складає база в момент події з `profiles.email` (`security definer` читає профілі) — так `record_histories` не
змінює тип результату, і код, що його читає, не потребує expand → contract. Email у рядку — знімок на момент події
**(розробник)**: пізніша зміна email адміністратором (вимога 07) старих рядків не переписує, як і в паперовому журналі.
«Approved by …» — наявна подія `approved` з `actor_id` того, хто подав; обидві події вставляє одна транзакція, тож
`created_at = now()` однаковий («with the same time»), а порядок показу тримає `order by … created_at, id` у
`record_histories`. Окремого тексту «Approved by …» PM не дає в AC — показ той самий, що в звичайного погодження
(«Approved · <ім'я>», AC-DECIDE-15) **(розробник)**.

Поля в `record_changed` і формат значень: `date` — `YYYY-MM-DD`; `hours` — `08:30–15:30` (`private.format_minutes`,
коротке тире); `leave type` — назва з глосарію («Sick leave», «Personal leave», «Unpaid leave», «Family celebration»);
`substitute` — email або «No substitute» (AC-BEHALF-08). Перехід на «Family celebration» чи зміна стосунку пише в рядок
типу і стосунок: `Sick leave → Family celebration (child)` **(розробник)**: PM серед полів правки стосунку не називає,
а без нього запис «Family celebration» недійсний (обмеження `leave_records_relationship_family_check`).

TS: `HISTORY_ACTIONS` отримує `submitted_on_behalf: "Submitted on behalf"`, `record_changed: "Changed"` (назви для
зчитувача й запасний показ); `RecordHistory` для цих двох дій показує як основний рядок `comment` без лапок (як уже
робить для `hours_changed`), під ним — час до хвилини за Києвом (`historyLine`), крапка — `bg-muted-foreground`.

**D5 — залишок і розподіл при погодженні одразу (AC-BEHALF-04).** Обчислення з `decide_leave_record` виносимо у
внутрішню `private.approval_split(p_record_id bigint, out share integer, out paid integer)` (`stable`, без прав для
`authenticated`): для «Sick leave» і «Personal leave» — `share = private.record_share(id)`, `paid = least(share,
greatest(private.remaining_hundredths(…), 0))`; для інших типів — `null`. Нове тіло `private.decide_leave_record`
(та сама сигнатура, D9) кличе її замість власних рядків — одне правило на обидва шляхи. Погодження одразу завжди йде
«with the suggested split» (Assumptions PM: «a record over the balance is approved with the suggested split, as in
AC-BALANCE-10»): `paid_days = paid / 100.0`, `unpaid_days = (share - paid) / 100.0`. Записи погоджуються по черзі
(D3, крок 4), тож другий запис бачить залишок після першого (як AC-BALANCE-14). Тригер `private.fix_day_share`
фіксує частку, як у звичайного погодження; `get_balance_inputs` рахує запис без змін — AC-BEHALF-04 («used 1.00,
remaining 17.00»).

**D6 — «this employee» замість «you»: одна таблиця в SQL і одна в TS (AC-BEHALF-05, AC-BEHALF-09).** SQL: внутрішня
`private.on_behalf_message(p_text text) returns text` (`immutable`, `set search_path = ''`, без прав для
`authenticated`) замінює лише початок відомих текстів, решту повертає як є. TS: `forEmployee(message: string): string`
у новому `src/lib/leave/on-behalf.ts` з тією самою таблицею — для перевірок форми до подання (календар, години,
попередження). Тест порівнює обидві таблиці на тих самих рядках.

| Текст працівника | Текст для менеджера | Джерело |
|---|---|---|
| `You have no working hours on this day` | `This employee has no working hours on this day` | AC-BEHALF-05 |
| `Hours must be within your schedule: …` | `Hours must be within the schedule: …` | AC-BEHALF-09 |
| `You already have a request for this time: …` | `This employee already has a request for this time: …` | **(розробник)**, за правилом Assumptions PM |
| `This substitute is no longer on your substitute list` | `This substitute is no longer on this employee's substitute list` | **(розробник)** |
| `Your <type> balance is <n> day. Another <m> day will be counted as Unpaid leave` | `This employee's <type> balance is <n> day. Another <m> day will be counted as Unpaid leave` | **(розробник)**, Assumptions PM: попередження бачить менеджер |

Не перекладаємо (у тексті немає «you» про працівника): «The school is closed on this day: …», «State your
relationship …», «The comment can be at most 500 characters», «<email> is not available at this time: …». Нагадування
AC-LEAVE-23 «Personal leave of 2 days or more: please talk to the administrator before you go» показуємо менеджеру
дослівно **(розробник)**: Assumptions `01-leave-request.md` кажуть «It is also shown to a manager submitting on
behalf», тобто той самий текст; кандидат у питання PM (D13).

**D7 — правка запису до рішення: одна RPC на чотири поля (AC-BEHALF-06, AC-BEHALF-07, AC-BEHALF-08, AC-BEHALF-09,
AC-BEHALF-10, AC-BEHALF-13).** Нова `private.edit_leave_record(p_record_id bigint, p_date date, p_start_min integer,
p_end_min integer, p_leave_type text, p_relationship text, p_substitute_id uuid) returns void` (`security definer`,
`set search_path = ''`), обгортка `public.edit_leave_record` — `security invoker`; `revoke … from public, anon`,
`grant execute … to authenticated`. Форма завжди шле всі поля (поточні значення для незмінених). Кроки:

1. `auth.uid()` → 42501 `Not signed in`; рядок запису (без lock) → немає, або `not private.decides_for_position(
   position_id, date)` → 42501 `You can't change this record` **(розробник)**; запис самого менеджера (не
   адміністратор) → `Your own record is decided by an administrator` (наявний текст AC-DECIDE-18);
2. lock працівника → спільний lock календаря → lock `busy:` власника, старої й нової заміни в порядку зростання uuid
   (порядок D3); `select … for update` запису;
3. статус ≠ `awaiting` → P0001 `This record is already decided and cannot be changed` (AC-BEHALF-10) — для
   «Approved», «Rejected», «Returned for revision» і «Cancelled» **(розробник)**, як у `add-on-behalf-and-edit`;
4. тип: невідомий → 22023; «Family celebration» без стосунку → наявний текст «State your relationship …»;
5. нова дата: `private.closed_day_name(employee, date)` → `The school is closed on this day: …`;
   `private.working_minutes(employee, date) = 0` → `This employee has no working hours on this day`;
6. години: `private.check_record_hours(position, date, start, end)` у блоці з `private.on_behalf_message` → `Hours must
   be within the schedule: 08:30–15:30` (AC-BEHALF-09);
7. заміна: не `null` і немає в `substitute_lists (employee_id = власник)` → `This substitute is not on this employee's
   substitute list` **(розробник)**; `private.substitute_conflict(заміна, посада, дата, години, p_exclude_record =>
   запис)` → `<email> is not available at this time: …` (той самий текст, що AC-SUBST-05);
8. нічого не змінилось — `return` без подій;
9. `update` дати, годин, `minutes`, типу, стосунку, `substitute_id`, `upgrade_minutes = case when
   private.upgrade_applies(position, заміна) then minutes end`, `updated_at = now()`; `exclusion_violation` → `This
   employee already has a request for this time: …` (пошук перетину без самого запису, `r.id <> p_record_id`, як у
   `update_leave_record_hours`) — «the record itself is not checked against itself»;
10. події `record_changed` по одній на кожне змінене поле в порядку date, hours, leave type, substitute (D4).

Виняток на будь-якому кроці відкочує все: запис і історія без змін (AC-BEHALF-09, AC-BEHALF-10, AC-BEHALF-13).
AC-BEHALF-13 («directly, bypassing the portal's pages») — це виклик `edit_leave_record` чи `update` через PostgREST
сесією manager2@: `update` на `leave_records` у `authenticated` немає (лише функції пишуть), а функція відмовляє на
кроці 1. Статус лишається «Awaiting decision» (AC-BEHALF-06); тригер частки при цьому не рахує нічого, бо статус не
змінюється.

Зайнятість самого власника як заміни в чужих записах правка не перевіряє — так само, як нова заявка: план
`impl-substitutes` (D5, «Чого не перевіряємо») приймає власну заявку людини, що комусь замінює, бо PM перевіряє лише
вибір заміни (Out of scope `06-substitutes.md`), а AC-BEHALF правки вимагають «the same checks as a new record».
Якщо PM вирішить інакше (кандидат у питання PM зрізу `substitutes`), перевірка `private.substitute_conflict(власник,
…, p_exclude_record => запис)` під уже взятим lock `busy:` власника додається одночасно в ядро подання (D3) і в
крок 7 правки — одним правилом.

**D8 — читання для форми від імені — функції з мінімумом полів (AC-BEHALF-01, AC-BEHALF-02, AC-BEHALF-05,
AC-BEHALF-11, AC-BEHALF-15).** Кожна — `private` + `security definer` + `set search_path = ''`, обгортка `public` —
`security invoker`; `revoke execute … from public, anon`, `grant execute … to authenticated`; на вході — перевірки D1
з тими самими текстами (сторінка показує їх дослівно):

| Функція | Повертає | Навіщо |
|---|---|---|
| `on_behalf_employees()` | `employee_id, email, main_title, division_name` | список вибору: адміністратору — усі профілі, крім себе; менеджеру — працівники його посад, крім себе; порожньо в менеджера без посад — сторінка показує AC-BEHALF-15. Правило те саме, що `manageable_employees()` зрізу `substitutes`, але без себе й без лічильника замін; обидві кличуть `private.can_act_for_employee` / `private.can_manage_substitutes`, тож заступник (вимога 07) додається в хелпери, а не в запити |
| `on_behalf_positions(p_employee_id uuid)` | `id, kind, title, division_name, blocks jsonb, decides boolean` | усі посади працівника з розкладом, зокрема посади інших менеджерів (AC-BEHALF-02); `decides` — `private.decides_for_position(id, current_date)` для попереднього перегляду «Approved at once» у підсумку (що записано, вирішує база на дату запису) |
| `on_behalf_record_dates(p_employee_id uuid, p_from date, p_to date)` | `date` | дати чинних записів працівника (статуси `BLOCKING_STATUSES` — той самий явний список `('awaiting', 'returned', 'approved')`, що в `leave_records_no_overlap`) — календар форми їх зафарбовує; без типу й посади |

Залишки працівника — наявний `get_balance_inputs` (менеджер будь-якої посади й адміністратор, AC-BALANCE-20); список
замін — `substitute_list(p_employee_id)` зрізу `substitutes`; закриття — наявне читання. Ширшої RLS на `profiles`,
`positions` чи `leave_records` не додаємо: вона віддала б менеджеру чужі посади, типи й коментарі.

**D9 — рішення після чужої правки: expand → contract (AC-BEHALF-06, AC-BEHALF-07, AC-BEHALF-08).** Двоє менеджерів
однієї посади: один змінив дату чи тип, другий тим часом натискає «Approve» у панелі з даними до зміни. Наявна
перевірка рішення порівнює лише години. Тому `decide_leave_record` отримує нову сигнатуру з тим, що бачив менеджер:
`(p_record_id, p_decision, p_comment, p_split, p_start_min, p_end_min, p_date date, p_leave_type text, p_substitute_id
uuid)`; розбіжність дати, типу чи заміни → P0001 `This record has been changed. Check it again before deciding`
**(розробник)**, за зразком наявного тексту AC-DECIDE-22. Нова сигнатура перевіряє **завжди**: дату й тип — `=`,
заміну — `is distinct from` (`null` у ній означає «No substitute», а не «не перевіряти», тож перехід `null` ↔ uuid в
обидва боки — розбіжність). Режим сумісності старої обгортки від значень не залежить: обидві сигнатури кличуть
внутрішнє тіло `private.decide_leave_record_core(…, p_check_fields boolean)`, і лише 6-параметрова передає `false`.
Це зміна сигнатури RPC, яку кличе код, тож — expand → contract за AGENTS.md. Поки існує стара сигнатура (вона
перевіряє лише години), правка не мусить бути доступна ніде — ні в інтерфейсі, ні в базі, — інакше рішення через
стару RPC, підготовлене до чужої правки, погодило б нову дату. Тому contract іде **до** відкриття правки, кроки:

1. **expand** (PR реалізації зрізу, з міграцією): нова 9-параметрова функція (`private` + обгортка `public`) і стара
   6-параметрова як тонка обгортка над тим самим тілом з `p_check_fields => false`; код ще кличе стару.
   `private.edit_leave_record` і `public.edit_leave_record` у цій міграції створено, але **без** `grant execute … to
   authenticated` (`revoke … from public, anon, authenticated`): виклик сесією будь-кого — 42501, кнопки «Edit
   record» в інтерфейсі ще немає. PGlite-тести правки кличуть функцію від ролі з правом (як тести внутрішніх
   `private`-функцій) — логіку D7 перевірено вже тут;
2. коли `/api/health` показує схему цієї міграції чи новішу — PR, що перемикає `decideRecord` на нову сигнатуру
   (дата й тип — з `decision_records()`, заміна — з `record_substitutes`); правка все ще закрита;
3. **contract** — коли код кроку 2 на проді (`sha` = `main`): міграція `drop` 6-параметрових `private` і `public`
   `decide_leave_record`; тест старого виклику прибирається в тому самому PR; правка все ще закрита;
4. коли contract застосовано на проді (`/api/health`) — PR з міграцією `grant execute on function
   public.edit_leave_record(…) to authenticated` (і на `private`-функцію, яку кличе обгортка `security invoker`)
   разом із кнопкою «Edit record», формою й `editRecord`. Код і грант виходять не разом: поки `db-deploy` не
   застосував грант, «Save changes» отримує 42501 і показує «The change could not be saved. Please try again.» —
   даних це не зачіпає; smoke чекає `db-deploy`. Тепер єдина RPC рішення — та, що бачить правку.

На всіх етапах рішення без правки працюють: стара сигнатура до кроку 2, нова після. Тести 9-параметрової: зміна
дати, типу, заміни `null` → uuid і uuid → `null` після показу → текст D9; ті самі значення → рішення проходить.

Правка сама захищена `updated_at`? Ні: форма шле повні значення, а база перевіряє кожне правило заново, тож дві
правки поспіль просто дають два набори рядків історії — останнє слово за другою, і обидві видно працівнику.

**D10 — сторінки й дії (AC-BEHALF-01…03, AC-BEHALF-05…12, AC-BEHALF-14, AC-BEHALF-15).**

- Пункт меню «On behalf» (`UserRoundPlus`, лише `deciders`) у `src/components/sidebar-nav.tsx` після «Decisions».
- `/on-behalf` (`src/app/(app)/on-behalf/page.tsx`, `loading.tsx`): `getClaims()`; роль із `profiles.role`: `employee`
  → `EmptyState` з текстом AC-BEHALF-12; `on_behalf_employees()` порожньо в менеджера → `EmptyState` з текстом
  AC-BEHALF-15; інакше таблиця працівників, рядок — посилання на `/on-behalf/[employeeId]`.
- `/on-behalf/[employeeId]` (`page.tsx`, `loading.tsx`): `id` не uuid → текст AC-BEHALF-11; `employeeId = claims.sub` →
  `redirect("/requests/new")`; далі `on_behalf_positions` — 42501 бази → `EmptyState` з її текстом (AC-BEHALF-11,
  AC-BEHALF-12, AC-BEHALF-15), без імен, email і форми. Інакше — `NewRequestForm` з новим пропом `subject: { kind:
  "employee"; employeeId; email }` (без пропа — як зараз, «self»): тексти перевірок форми — через `forEmployee` (D6),
  попередження понад залишок — текст D6, нагадування AC-LEAVE-23 — дослівно (`personalLeaveReminder` той самий),
  поле «Substitute» — зі `substitute_list(employeeId)`, у підсумку — колонка «Status after submit» («Approved» для
  `decides`, «Awaiting decision» для решти, `StatusBadge`), кнопка «Submit request».
- Server action `submitOnBehalf` (`src/app/(app)/on-behalf/actions.ts`): `getClaims()`; той самий `parsePayload`,
  `buildRequestRecords`, `checkLeaveType`, `checkComment`, що й `submitLeaveRequest` (виносимо спільне в
  `src/app/(app)/requests/new/request-payload.ts`, без зміни поведінки), посади — `on_behalf_positions`; власну
  перевірку перетину TS не робимо (менеджер не бачить усіх записів працівника) — перетин ловить база з текстом D6;
  `rpc("submit_leave_request_on_behalf")`; P0001 і 42501 з текстом D1 — дослівно в `Alert` над підсумком, введене
  лишається; успіх — `revalidatePath("/decisions")`, `redirect` на `/on-behalf/[employeeId]?submitted=<approved>-<awaiting>`
  (лише числа, без email у URL) з повідомленням «Request submitted: 1 approved, 1 awaiting decision» **(розробник)**
  і, як у «My requests», текстом про неприйняті дати (AC-LEAVE-21) у формі D6.
- Гість на `/on-behalf/**` — `src/proxy.ts` веде на `/login` до рендеру, сторінка ще раз перевіряє `getClaims()`
  (AC-BEHALF-14).
- «Decisions» (крок 4 D9, не в першому PR): у розділі «Record» панелі запису для `status = 'awaiting'` і `can_decide` (не власний) — кнопка «Edit
  record». Форма правки `src/app/(app)/decisions/edit-record-form.tsx`, server action `editRecord` у
  `src/app/(app)/decisions/actions.ts`: `getClaims()`, `parseRecordId`, перевірка полів тими самими чистими функціями
  (`checkHours`, `checkLeaveType`), `rpc("edit_leave_record")`; P0001 і 42501 — дослівно в `Alert` над формою, введене
  лишається; успіх — `revalidatePath("/decisions")`, панель того самого запису з новими значеннями й рядками історії.
- «My requests» працівника нічого нового не потребує: записи від імені — звичайні власні записи, історія з
  `record_histories` (AC-BEHALF-01, AC-BEHALF-06).

**D11 — вигляд кожного нового стану за `DESIGN.md` (AC-BEHALF-01…03, AC-BEHALF-05…12, AC-BEHALF-15).** Лише
компоненти `@/components/ui`, кольори — токени, іконки — `lucide-react`; нових токенів і доменних компонентів не
вводимо. Перед сторінками — приклади на вітрині `/design` (список працівників, банер «за кого», колонка статусу після
подання, форма правки, рядки історії). Жодних сирих `<button>`, `<input>`, `<select>`, `<table>` (`npm run check:ui`).

| Стан | Де | Компонент і варіант |
|---|---|---|
| пункт меню (AC-BEHALF-01) | `AppNav` | «On behalf», іконка `UserRoundPlus`; згорнута панель — `Tooltip`; на телефоні — у `Sheet` меню, як решта |
| список працівників (AC-BEHALF-01) | `/on-behalf` | `PageHeader` «Request on behalf» з описом «Record leave for an employee of your positions.»; над таблицею `Label` «Find an employee» + `Input` (фільтр за email на клієнті); `Table stack`: email (`text-foreground`), основна посада й підрозділ (`text-xs text-muted-foreground`); рядок — посилання, праворуч `ChevronRight`, як черга «Decisions»; нічого не знайдено — `EmptyState` «No employees match» **(розробник)** |
| відмова працівнику (AC-BEHALF-12) | `/on-behalf`, `/on-behalf/[employeeId]` | `EmptyState` з іконкою `ShieldX` у колі `accent`, текст дослівно «Only a manager or an administrator can submit a request on behalf of an employee», одна дія «Go to Overview» (`buttonVariants({ variant: "outline" })`); жодних імен і email |
| чужий працівник (AC-BEHALF-11) | `/on-behalf/[employeeId]` | той самий `EmptyState` із текстом «You can submit requests only for employees of your positions» і дією «Back to the list» |
| немає працівників (AC-BEHALF-15) | `/on-behalf` | `EmptyState` з іконкою `UsersRound` у колі `accent`, текст дослівно «You have no employees to submit requests for», без дії |
| за кого подаємо (AC-BEHALF-01…03) | `/on-behalf/[employeeId]`, над формою | `PageHeader` «New request for teacher1@example.test» з breadcrumb «← Request on behalf»; `Alert variant="info"` з `Info`: «Records of your positions are approved at once; others go to their managers.» (адміністратору — «All records are approved at once.») **(розробник)** |
| неробочий день (AC-BEHALF-05) | календар форми | наявна клітинка «немає годин» (`muted-foreground` без рамки); натискання пояснює текстом «This employee has no working hours on this day» у наявному місці повідомлення календаря |
| статус після подання (AC-BEHALF-01, AC-BEHALF-02) | підсумок форми | нова колонка `Table stack` «Status after submit» зі `StatusBadge` «Approved» / «Awaiting decision» — слово з крапкою, без заливки |
| попередження понад залишок (AC-BEHALF-04) | підсумок | наявний `Alert variant="warning"` з текстом D6 |
| нагадування AC-LEAVE-23 | підсумок | наявний `Alert variant="info"` з текстом AC дослівно |
| помилка подання (AC-BEHALF-05, D6) | підсумок | наявний `Alert variant="destructive"` (`role="alert"`) з текстом бази |
| успіх (AC-BEHALF-01) | `/on-behalf/[employeeId]?submitted=…` | `Alert variant="info"` з `CircleCheck` над порожньою формою: «Request submitted: 1 approved, 1 awaiting decision»; неприйняті дати — другий рядок `text-muted-foreground` |
| «Edit record» (AC-BEHALF-06…08) | `Sheet` «Decisions», розділ «Record» | `Button variant="ghost" size="sm"` з `Pencil` праворуч від заголовка розділу; є лише для «Awaiting decision» і запису, який можна вирішувати |
| форма правки (AC-BEHALF-06…09) | там само, замість `RecordDay` | `Label` «Date» + `DatePickerField mode="single"`; `Label` «Hours» + `Checkbox` «Whole day» і два поля часу, як у кроці «Positions & hours» нової заявки (ті самі компоненти); `Label` «Leave type» + `Select` (порядок з вимоги), за «Family celebration» — `Label` «Relationship» + `Select`; `Label` «Substitute» + `Select` («No substitute» першим, далі email зі списку працівника). Смуга дій унизу панелі на час правки: `ghost` «Cancel» ліворуч, `default` «Save changes» праворуч (`SubmitButton`, «Saving…»); дії рішення сховані — одна основна дія на екран. Без `Dialog`: зміна оборотна (наступною правкою) |
| помилка правки (AC-BEHALF-09, AC-BEHALF-10, AC-BEHALF-13) | над формою правки | `Alert variant="destructive"` з текстом бази дослівно; поле годин — межа `destructive` і `aria-describedby` для «Hours must be within the schedule: …»; введене лишається |
| збережено (AC-BEHALF-06…08) | панель | `RecordDay` з новими значеннями; `Alert variant="info"` «Record updated» **(розробник)**; нові рядки історії спалахують `highlight` один раз (`--duration-slow`) |
| рядки історії (AC-BEHALF-01, AC-BEHALF-06…08) | «History» у `Sheet` і «My requests» | `RecordHistory`: рядок PM звичайною вагою, під ним час `text-xs text-muted-foreground tabular-nums`, крапка `bg-muted-foreground`; «Approved» — крапка `status-approved-foreground`, як було |
| завантаження | `/on-behalf/**` | `loading.tsx` зі `Skeleton` у формі таблиці / форми |

Телефон (360 і 390 px, DESIGN.md розділ 12): список — картки `Table stack` (email, посада під ним, стрілка); форма від
імені — та сама адаптивна форма нової заявки (календар без бокових полів, кнопка кроку прикріплена внизу з
`env(safe-area-inset-bottom)`), `Alert` «за кого» над кроками; у підсумку колонка статусу — рядок картки під типом.
Панель запису на телефоні — на весь екран: поля правки одне під одним на всю ширину, на дотику 44 px і шрифт 16 px;
смуга «Cancel» / «Save changes» прикріплена внизу — два стовпці. Темна тема — лише токени (`accent`, `info`,
`destructive`, `muted-foreground`), без власних значень. Знімки світлої й темної теми на 390 і 1280 px — у
`docs/img/` (D12).

**D12 — тести (AC-BEHALF-01…15).** PGlite — `tests/db/on-behalf.test.ts`; підготовка приводить дані до «Given» AC
(teacher1@: основна посада менеджера manager1@ Mon–Fri 08:30–15:30, додаткова — manager2@ Thu 15:45–17:00;
manager3@ — роль `manager` без посад; teacher3@ — без посад manager1@). e2e — синтетичні працівники
(`createUatEmployee`), дати від `kyivDate(new Date())`, а не сталими рядками AC.

| AC | Тест | Рівень |
|---|---|---|
| AC-BEHALF-01 | PGlite — manager1@ `submit_leave_request_on_behalf` «Sick leave» на цілий день основної посади → `approved`, історія: `submitted_on_behalf` з дослівним рядком і `approved` з тим самим `created_at`. e2e `tests/e2e/on-behalf.spec.ts` — менеджер подає через `/on-behalf`, працівник у «My requests» бачить «Approved» і рядок історії | PGlite + e2e |
| AC-BEHALF-02 | PGlite — обидві посади: основна `approved`, додаткова `awaiting` і є в `decision_records()` manager2@, нема в черзі manager1@. e2e — колонка «Status after submit» у підсумку | PGlite + e2e |
| AC-BEHALF-03 | PGlite — admin подає на обидві посади → обидві `approved` | PGlite |
| AC-BEHALF-04 | PGlite — після AC-BEHALF-01 `get_balance_inputs` → «Sick leave» used 1.00, remaining 17.00; понад залишок — `paid_days` + `unpaid_days` як AC-BALANCE-10 | PGlite |
| AC-BEHALF-05 | PGlite — лише субота → P0001 «This employee has no working hours on this day», `leave_requests` без рядка. Unit `src/lib/leave/on-behalf.test.ts` — `forEmployee` і співпадіння з таблицею SQL `on_behalf_message`. e2e — клік по суботі в календарі показує текст AC | PGlite + unit + e2e |
| AC-BEHALF-06 | PGlite — `edit_leave_record` дата 12-03 → 12-04: запис 12-04 08:30–15:30 `awaiting`, рядок історії дослівно; перетин з іншим записом працівника — текст D6, сам із собою — ні. e2e `tests/e2e/on-behalf-edit.spec.ts` — «Edit record» у «Decisions», працівник бачить рядок | PGlite + e2e |
| AC-BEHALF-07 | PGlite — тип «Sick leave» → «Personal leave», рядок історії дослівно | PGlite + e2e |
| AC-BEHALF-08 | PGlite — заміна `null` → teacher2@ зі списку: `substitute_id`, рядок «No substitute → teacher2@example.test»; людина поза списком і зайнята заміна — відмова | PGlite + e2e |
| AC-BEHALF-09 | PGlite — години 16:00–17:00 → P0001 «Hours must be within the schedule: 08:30–15:30», запис і історія без змін. Unit — `forEmployee` для «Hours must be within your schedule». e2e — `Alert` з текстом AC | PGlite + unit + e2e |
| AC-BEHALF-10 | PGlite — `approved` (і окремо `rejected`, `returned`, `cancelled`) → P0001 «This record is already decided and cannot be changed». e2e — правку відкрито, запис погоджено `adminClient()` у фоні, «Save changes» → текст AC | PGlite + e2e |
| AC-BEHALF-11 | PGlite — manager1@ за teacher3@ → 42501 з текстом, `leave_requests` teacher3@ порожньо. e2e — `/on-behalf/<teacher3>` показує текст без email | PGlite + e2e |
| AC-BEHALF-12 | PGlite — teacher1@ за teacher2@ → 42501 з текстом, записів немає. e2e — пряме посилання працівника | PGlite + e2e |
| AC-BEHALF-13 | PGlite — manager2@ `edit_leave_record` запису основної посади → 42501; `update leave_records` напряму → 42501 (немає гранту); дата, години, тип, заміна й кількість подій ті самі. e2e `tests/e2e/negative-controls.spec.ts` — PostgREST RPC сесією manager2@ | PGlite + e2e |
| AC-BEHALF-14 | e2e — гість на `/on-behalf/<uuid>` → сторінка входу, у DOM немає email і дат | e2e |
| AC-BEHALF-15 | PGlite — manager3@ `on_behalf_employees()` порожньо, `submit_leave_request_on_behalf` → 42501 з текстом. e2e — `/on-behalf` показує текст AC | PGlite + e2e |

Ще без AC ID: регресія власної заявки — наявні `tests/db/submit-leave-request.test.ts`,
`multi-date-request.test.ts`, `school-calendar-request.test.ts` лишаються зеленими після переносу тіла в ядро (D3) і
`leave-decisions.test.ts` після `approval_split` (D5); старий 6-параметровий виклик `decide_leave_record` — окремий
тест, що живе до contract (D9); `tests/db/schema-version.test.ts` — нових `security definer` у `public` немає.
SQL-мутанти `scripts/mutants.mjs`: `decides_for_position` (`manages_position` → `manages_employee`), `p_exclude`
перетину в правці (`r.id <> p_record_id`), умова «нічого не змінилось» (кількість подій). Знімки D11 —
`tests/e2e/on-behalf-screenshots.spec.ts` (без AC ID), телефон — `tests/e2e/on-behalf.mobile.spec.ts` (проєкт
`mobile`, 360 і 390 px).

**D13 — міграція, порядок викатки, тестові дані (AC-BEHALF-01…15; AGENTS.md, «Код і схема виходять на прод не
разом»).** Одна міграція `npx supabase migration new on_behalf_and_edit` — новий файл із міткою, пізнішою за міграцію
зрізу `substitutes` (створюємо після його злиття від свіжого `main`; `node scripts/check-migration-order.mjs`). Вона:
перестворює `leave_record_events_action_check`; додає хелпери D1, D2, D6, `approval_split`; переносить тіло подання в
ядро без зміни сигнатури `submit_leave_request`; додає `submit_leave_request_on_behalf`, `edit_leave_record`, функції
D8 і 9-параметрову `decide_leave_record` зі старою як обгорткою (expand, D9). Нових таблиць немає; на кожну нову
`public`-функцію — `revoke execute … from public, anon` і `grant execute … to authenticated`, крім `edit_leave_record`
(грант — окремою міграцією кроку 4 D9); усі `private`-хелпери — без прав для `authenticated`, крім тих, що кличуть
обгортки. Тестові дані: `manager3@example.test` (роль `manager`,
жодної посади) — у `supabase/demo-users.json`; посади teacher3@ додає зріз `substitutes`. Код, що вийде до
`db-deploy`: нові RPC ще не існують → `/on-behalf/**` показують «The page could not be loaded. Please try again.»;
кнопки «Edit record» в цьому PR ще немає (D9); власна заявка й рішення працюють (сигнатури ті самі). Smoke
(`scripts/smoke.mjs`) чекає `db-deploy`. `database.types.ts` — із Summary `db-check`.

Кандидати в питання PM (у `docs/spec-reading.md` у PR реалізації): текст нагадування AC-LEAVE-23 для менеджера;
текст попередження понад залишок для менеджера; чи правка «Returned for revision» теж «already decided».

## Ризики

- Перенос тіла подання в ядро (D3) — найризиковіша частина: тіло велике й щойно змінене зрізом `substitutes`.
  Пом'якшення — копія тіла з трьома точковими змінами, наявні PGlite-тести власної заявки як регресія, SQL-мутанти;
  рецензія міграції — CodeRabbit або друга думка лише для читання до злиття (AGENTS.md).
- Expand → contract для `decide_leave_record` (D9) тягне ще три PR після реалізації, і правка (AC-BEHALF-06…10,
  AC-BEHALF-13 в інтерфейсі) з'являється для людей лише на кроці 4 — зате вікна «рішення після чужої правки» немає:
  поки існує стара RPC рішення (до contract), правку закрито і в базі (без гранту), і в інтерфейсі.
- Список `/on-behalf` адміністратора — усі профілі; фільтр на клієнті достатній для шкільного масштабу, пагінації не
  робимо.
- Email у рядках історії — знімок (D4); якщо PM захоче поточні email, це зміна `record_histories` за expand → contract.
