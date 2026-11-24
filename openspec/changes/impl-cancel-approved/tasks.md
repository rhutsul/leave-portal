# Tasks

Одна гілка `task/cancel-approved` і один PR «Реалізація» (D13: міграція лише додає, тож разом із кодом безпечно);
міграція — першим комітом. Рядок «Done when» кожної задачі — AC, які вона доводить; PR переводить їх у `реалізовано` в
`docs/conformance.md` (тест із AC ID + код). Перед міграцією — перевірити, що інша відкрита гілка не змінює схему.

## 1. База: прохання, рішення, скасування менеджером

- [ ] 1.1 Тести PGlite `tests/db/leave-cancellation.test.ts` з тексту AC (спершу червоні): прохання, минуле, повторне,
      чужий запис, підтвердження й залишок, розподіл, відхилення з коментарем і без, скасування з приміткою і без,
      менеджер чужої посади й власного запису напряму, закриття дня до й після підтвердження.
      Done when: AC-CANCEL-01, AC-CANCEL-02, AC-CANCEL-03, AC-CANCEL-04, AC-CANCEL-05, AC-CANCEL-06, AC-CANCEL-07, AC-CANCEL-08, AC-CANCEL-09, AC-CANCEL-10, AC-CANCEL-11, AC-CANCEL-13
- [ ] 1.2 Міграція `npx supabase migration new cancel_approved`: колонки й обмеження D1, дії історії D2,
      `private.cancellation_actor_error`, функції D3–D5 з обгортками `public` (`security invoker`), `revoke` / `grant`;
      `tests/db/table-visibility.test.ts` — працівник не змінює нові колонки напряму; `node
      scripts/check-migration-order.mjs`; `npm run mutation:sql` локально.
      Done when: AC-CANCEL-01, AC-CANCEL-02, AC-CANCEL-03, AC-CANCEL-04, AC-CANCEL-05, AC-CANCEL-06, AC-CANCEL-07, AC-CANCEL-08, AC-CANCEL-09, AC-CANCEL-10, AC-CANCEL-11, AC-CANCEL-13

## 2. Доменні правила TS

- [ ] 2.1 Unit-тести `src/lib/leave/cancellation.test.ts` (спершу червоні), потім `src/lib/leave/cancellation.ts` (D8):
      черга перевірок і тексти, `canRequestCancellation`, `cancellationMark`; `HISTORY_ACTIONS` для двох нових дій.
      Done when: AC-CANCEL-01, AC-CANCEL-03, AC-CANCEL-04, AC-CANCEL-05, AC-CANCEL-06, AC-CANCEL-08, AC-CANCEL-09, AC-CANCEL-10

## 3. Працівник: прохання і результат у «My requests»

- [ ] 3.1 Вітрина `/design`: позначка «Cancellation requested», рядки «Cancellation declined: …» і примітки, форма
      прохання з помилкою (D12).
      Done when: AC-CANCEL-01, AC-CANCEL-03, AC-CANCEL-08
- [ ] 3.2 Сторінка `/requests/[id]/cancel` і server action `requestCancellation` (D9): гість → вхід, чужий запис →
      `EmptyState` з текстом AC, минуле й повторне → `Alert` `destructive`, успіх → «My requests» з `Alert` `info`.
      Done when: AC-CANCEL-01, AC-CANCEL-05, AC-CANCEL-06, AC-CANCEL-10, AC-CANCEL-12
- [ ] 3.3 «My requests» (D10): окремий запит нових колонок, пункт `RowMenu` «Request cancellation», позначка й рядки
      під статусом у таблиці, картці телефона і «View details».
      Done when: AC-CANCEL-01, AC-CANCEL-03, AC-CANCEL-08

## 4. Менеджер: черга, рішення, скасування з приміткою

- [ ] 4.1 «Decisions» (D11): прохання в черзі «Awaiting decision» і в лічильнику меню, розділ «Cancellation request» у
      `Sheet`, «Confirm cancellation» через `Dialog` з `RecordSummary`, «Decline cancellation» з полем коментаря,
      server action `decideCancellation`.
      Done when: AC-CANCEL-01, AC-CANCEL-02, AC-CANCEL-03, AC-CANCEL-04, AC-CANCEL-07, AC-CANCEL-11
- [ ] 4.2 «Cancel record» у `Sheet` погодженого запису через `Dialog` з приміткою, server action `cancelRecord`.
      Done when: AC-CANCEL-08, AC-CANCEL-09

## 5. UAT, знімки, матриця

- [ ] 5.1 e2e `tests/e2e/cancel-approved.spec.ts` (`@writes`, синтетичний працівник): AC-CANCEL-01…05, -08, -09, -10,
      -12; телефон — `tests/e2e/cancel-approved.mobile.spec.ts`; знімки станів D12 у світлій і темній темі, 390 і
      1280 px — `tests/e2e/cancel-approved-screenshots.spec.ts` → `docs/img/`.
      Done when: AC-CANCEL-01, AC-CANCEL-02, AC-CANCEL-03, AC-CANCEL-04, AC-CANCEL-05, AC-CANCEL-08, AC-CANCEL-09, AC-CANCEL-10, AC-CANCEL-12
- [ ] 5.2 Рядки AC-CANCEL-01…13 у `docs/conformance.md` (`/conformance`), кандидати в питання PM (причина
      обов'язкова, підтвердження після дати запису) — у `docs/spec-reading.md`; `npm run check:design`,
      `npm run check:ui`, `npm run ac:coverage`, `npm run gates`, `npm test`.
      Done when: AC-CANCEL-01, AC-CANCEL-02, AC-CANCEL-03, AC-CANCEL-04, AC-CANCEL-05, AC-CANCEL-06, AC-CANCEL-07, AC-CANCEL-08, AC-CANCEL-09, AC-CANCEL-10, AC-CANCEL-11, AC-CANCEL-12, AC-CANCEL-13
- [ ] 5.3 `npx openspec archive impl-cancel-approved -y`.
      Done when: AC-CANCEL-01, AC-CANCEL-02, AC-CANCEL-03, AC-CANCEL-04, AC-CANCEL-05, AC-CANCEL-06, AC-CANCEL-07, AC-CANCEL-08, AC-CANCEL-09, AC-CANCEL-10, AC-CANCEL-11, AC-CANCEL-12, AC-CANCEL-13
