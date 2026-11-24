# Tasks

Одна гілка `task/substitutes` і один PR «Реалізація» (D11: міграція лише додає й не змінює сигнатур, тож разом із кодом
безпечно); міграція `npx supabase migration new substitutes` — першим комітом, після злиття реалізації `cancel-approved` (мітка
пізніша за `20261124195428_cancel_approved.sql`, `node scripts/check-migration-order.mjs`); кожна задача доповнює той самий файл міграції своєю частиною. Перед
міграцією — перевірити, що інша відкрита гілка не змінює схему. Задачі вертикальні: кожна — база, дія, сторінка й тести
своїх AC разом, тести спершу червоні. Рядок «Done when» — AC, які задача доводить; PR переводить їх у `реалізовано` в
`docs/conformance.md` (тест із AC ID + код).

## 1. Менеджер веде список замін

- [ ] 1.1 База: таблиця `substitute_lists` з RLS, `revoke`, явними `grant` і політиками D1,
      `private.can_manage_substitutes`, функції `manageable_employees`, `substitute_list`, `substitute_candidates` (D6),
      тестові `assistant1@` і `teacher3@` (D9, `supabase/demo-users.json`). Вітрина `/design`: таблиця списку з «⋯»,
      форма додавання, відмова (D8). Сторінки `/substitutes` і `/substitutes/[employeeId]` з `loading.tsx`, server
      actions `addSubstitute` / `removeSubstitute`, пункт меню «Substitutes» (лише manager і admin) у
      `src/components/sidebar-nav.tsx`. Тести: PGlite `tests/db/substitutes.test.ts` (додавання двох, власний email, `insert` → 42501 і `delete` → 0 рядків,
      працівник і менеджер чужих посад напряму), `tests/db/table-visibility.test.ts` (`anon`, `update`, `added_by`); e2e
      `tests/e2e/substitutes.spec.ts` (менеджер додає двох; працівник за прямим посиланням бачить текст AC без email),
      `tests/e2e/negative-controls.spec.ts` (`insert` PostgREST сесією менеджера чужих посад).
      Done when: AC-SUBST-01, AC-SUBST-12, AC-SUBST-13

## 2. Працівник вибирає заміну в заявці й бачить її на записі

- [ ] 2.1 База: колонки `substitute_id`, `upgrade_minutes`, обмеження й індекс D2, нове тіло
      `private.submit_leave_request` з ключем `substitute_id` і перевіркою списку (D5), `my_substitute_options`,
      `record_substitutes` (D6). Код: `src/lib/leave/substitutes.ts` (`substituteLabel`, стан поля для порожнього
      списку), `SubstituteNote` у `src/components/ui/` і приклади на `/design`; `PositionChoice.substituteId` у
      `src/lib/leave/draft.ts`, `toRpcRecords` з `substitute_id`; форма нової заявки — поле «Substitute» на картці посади,
      `Alert` порожнього списку, колонка в підсумку; `submitLeaveRequest` перевіряє вибір за `my_substitute_options()`;
      заміна в «My requests» (рядок, картка телефона, «View details») і в «Decisions» (рядок черги, `Sheet`). Тести:
      PGlite (запис із заміною й без, людина поза списком, `record_substitutes` менеджеру), unit
      `src/lib/leave/substitutes.test.ts` і `src/lib/leave/draft.test.ts`, e2e (manager1@ бачить заміну в «Awaiting
      decision», «No substitute» в обох, пункти вибору рівно зі списку, порожній список — текст AC і подання).
      Done when: AC-SUBST-02, AC-SUBST-03, AC-SUBST-04, AC-SUBST-11

## 3. Позначка підвищення

- [ ] 3.1 База: `private.upgrade_applies` (D3) і `upgrade_minutes` у `submit_leave_request`. Код: `upgradeApplies`,
      `upgradeMinutes` у `src/lib/leave/substitutes.ts`; `Badge` «With upgrade: N min» у `SubstituteNote`, у підсумку
      заявки, «My requests» і «Decisions». Тести: PGlite (210 хв; «Math teacher» — без позначки), unit (регістр,
      « Assistant », «Math teacher»), SQL-мутант `ilike '%teacher%'` у `scripts/mutants.mjs`, e2e «With upgrade: 210 min».
      Done when: AC-SUBST-08, AC-SUBST-09

## 4. Зайнята заміна не приймається

- [ ] 4.1 База: `private.substitute_conflict` і lock `busy:` (D4), перевірка в `submit_leave_request` і нове тіло
      `private.update_leave_record_hours` (D5). Код: P0001 бази — дослівно в `Alert` підсумку заявки (наявний шлях
      `submitLeaveRequest`) і в формі зміни годин «My requests». Тести: PGlite (власний запис заміни `awaiting`, заміна в
      `approved` записі іншого, перший за часом із двох, `rejected` і `cancelled` не займають, межа `[start, end)`, зміна
      годин у зайнятий час), SQL-мутанти D4 і `npm run mutation:sql`, e2e (`Alert` з текстом AC, запису в «My requests»
      немає).
      Done when: AC-SUBST-05, AC-SUBST-06, AC-SUBST-07

## 5. «My substitutions»

- [ ] 5.1 База: `my_substitutions` (D6). Код: сторінка `/substitutions` з `loading.tsx`, пункт меню «My substitutions» для
      всіх ролей, приклади на `/design`. Тести: PGlite (один рядок без типу відсутності; порожньо для `rejected` /
      `cancelled`), e2e (один рядок, порожній стан, гість → вхід без email і дат).
      Done when: AC-SUBST-10, AC-SUBST-14, AC-SUBST-15

## 6. Телефон, знімки, матриця

- [ ] 6.1 `tests/e2e/substitutes.mobile.spec.ts` (проєкт `mobile`, 360 і 390 px) і знімки станів D8 у світлій і темній
      темі, 390 і 1280 px — `tests/e2e/substitutes-screenshots.spec.ts` → `docs/img/`; прибирання e2e у порядку з ризиків
      design.md (спершу записи з синтетичною заміною, потім профілі).
      Done when: AC-SUBST-01, AC-SUBST-02, AC-SUBST-10, AC-SUBST-11, AC-SUBST-15
- [ ] 6.2 Рядки AC-SUBST-01…15 у `docs/conformance.md` (`/conformance`); кандидати в питання PM (перерва всередині
      запису, зміна годин, власна заявка зайнятої заміни) — у `docs/spec-reading.md`; `database.types.ts` із Summary
      `db-check`; `npm run check:design`, `npm run check:ui`, `npm run ac:coverage`, `npm run gates`, `npm test`.
      Done when: AC-SUBST-01, AC-SUBST-02, AC-SUBST-03, AC-SUBST-04, AC-SUBST-05, AC-SUBST-06, AC-SUBST-07, AC-SUBST-08, AC-SUBST-09, AC-SUBST-10, AC-SUBST-11, AC-SUBST-12, AC-SUBST-13, AC-SUBST-14, AC-SUBST-15
- [ ] 6.3 `npx openspec archive impl-substitutes -y`.
      Done when: AC-SUBST-01, AC-SUBST-02, AC-SUBST-03, AC-SUBST-04, AC-SUBST-05, AC-SUBST-06, AC-SUBST-07, AC-SUBST-08, AC-SUBST-09, AC-SUBST-10, AC-SUBST-11, AC-SUBST-12, AC-SUBST-13, AC-SUBST-14, AC-SUBST-15
