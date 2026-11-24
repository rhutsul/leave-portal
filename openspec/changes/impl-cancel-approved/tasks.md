# Tasks

Одна гілка `task/cancel-approved` і один PR «Реалізація» (D13: міграція лише додає, тож разом із кодом безпечно).
Задачі — вертикальні, за сценаріями PM: кожна несе свою частину міграції (один файл `cancel_approved`, створений
`npx supabase migration new cancel_approved` у задачі 1 і доповнений наступними до злиття), доменних правил
(`src/lib/leave/cancellation.ts`, D8), сторінок і тестів PGlite, unit і e2e — тести з тексту AC пишемо першими
(червоні). Рядок «Done when» — лише AC, які задача доводить повністю; PR переводить їх у `реалізовано` в
`docs/conformance.md`. Перед міграцією — перевірити, що інша відкрита гілка не змінює схему.

## 1. Прохання працівника про скасування

- [ ] 1.1 Міграція: колонки `cancel_reason`, `cancel_request_id` (D1), дія історії `cancellation_requested` (D2),
      `request_record_cancellation` з обгорткою (D3); `cancellationRequestCheck`, `canRequestCancellation`,
      `cancellationMark` (D8); сторінка `/requests/[id]/cancel` і `requestCancellation` (D9); пункт `RowMenu` і
      позначка в «My requests» (D10); прохання в черзі «Awaiting decision», рядок «Cancellation requested: …» у `Sheet`
      і лічильник меню (D11); вітрина `/design` для позначки й форми (D12). Тести: PGlite (прохання, минуле, повторне,
      чужий запис, пряме `update` колонок у `table-visibility`), unit, e2e (працівник і менеджер, гість за посиланням,
      teacher2 за посиланням).
      Done when: AC-CANCEL-01, AC-CANCEL-05, AC-CANCEL-06, AC-CANCEL-10, AC-CANCEL-12

## 2. Підтвердження прохання менеджером

- [ ] 2.1 Міграція: `private.cancellation_actor_error`, `decide_record_cancellation` з `p_request_id` і гілкою
      `confirm` (D4); `cancellationDecisionCheck` для підтвердження (D8); «Confirm cancellation» через `Dialog` з
      `RecordSummary` і `decideCancellation` (D11). Тести: PGlite (залишок 3.00 → 2.00, розподіл 0.50 + 0.50, менеджер
      чужої посади й власного запису напряму, `awaiting` і застарілий `p_request_id`, закриття дня до й після
      підтвердження), e2e (картка «Personal leave» після підтвердження).
      Done when: AC-CANCEL-02, AC-CANCEL-07, AC-CANCEL-11, AC-CANCEL-13

## 3. Відхилення прохання з коментарем

- [ ] 3.1 Міграція: дія історії `cancellation_declined`, колонка `cancel_declined_comment` (D1, D2), гілка `decline` у
      `decide_record_cancellation` (D4); перевірка коментаря в `cancellationDecisionCheck` (D8); «Decline cancellation»
      з полем коментаря й `FieldError` у `Sheet` (D11); рядок «Cancellation declined: …» у «My requests» (D10). Тести:
      PGlite, unit, e2e.
      Done when: AC-CANCEL-03, AC-CANCEL-04

## 4. Скасування менеджером з приміткою

- [ ] 4.1 Міграція: колонка `cancel_note` (D1), `cancel_approved_record` (D5); `managerCancelCheck` (D8); «Cancel
      record» через `Dialog` з приміткою й `cancelRecord` (D11); примітка під статусом «Cancelled» у «My requests» (D10).
      Тести: PGlite, unit, e2e.
      Done when: AC-CANCEL-08, AC-CANCEL-09

## 5. Телефон, знімки, матриця, archive

- [ ] 5.1 Телефон — `tests/e2e/cancel-approved.mobile.spec.ts` (проєкт `mobile`); знімки станів D12 у світлій і темній
      темі, 390 і 1280 px — `tests/e2e/cancel-approved-screenshots.spec.ts` → `docs/img/`; кандидати в питання PM
      (причина обов'язкова, підтвердження після дати запису) — `docs/spec-reading.md`; рядки AC-CANCEL-01…13 у
      `docs/conformance.md` (`/conformance`); `node scripts/check-migration-order.mjs`, `npm run mutation:sql`,
      `npm run check:design`, `npm run check:ui`, `npm run ac:coverage`, `npm run gates`, `npm test`;
      `npx openspec archive impl-cancel-approved -y`.
      Done when: AC-CANCEL-01, AC-CANCEL-02, AC-CANCEL-03, AC-CANCEL-04, AC-CANCEL-05, AC-CANCEL-06, AC-CANCEL-07, AC-CANCEL-08, AC-CANCEL-09, AC-CANCEL-10, AC-CANCEL-11, AC-CANCEL-12, AC-CANCEL-13
