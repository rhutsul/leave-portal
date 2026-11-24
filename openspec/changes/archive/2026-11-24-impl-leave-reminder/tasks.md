# Tasks

Одна гілка `task/leave-reminder` і один PR «Реалізація». Рядок «Done when» кожної задачі — AC, які вона доводить; PR
переводить їх у `реалізовано` в `docs/conformance.md` (тест із AC ID + код).

## 1. Нагадування в підсумку заявки (`task/leave-reminder`)

- [x] 1.1 Unit-тести з тексту AC (спершу червоні): `personalLeaveReminder` — 2.00 дні → текст, 1.50 → `null`, рівно
      2.00 через частини днів → текст, «Sick leave» на 2.00 → `null`.
      Done when: AC-LEAVE-23, AC-LEAVE-24
- [x] 1.2 `PERSONAL_LEAVE_REMINDER` і `personalLeaveReminder` у `src/lib/leave/balance.ts` (D1).
      Done when: AC-LEAVE-23, AC-LEAVE-24
- [x] 1.3 `Alert` `info` у кроці «Summary» `new-request-form.tsx` (D2); `npm run check:design`, `npm run check:ui`.
      Done when: AC-LEAVE-23
- [x] 1.4 e2e у `tests/e2e/new-request.spec.ts` на синтетичному працівнику: AC-LEAVE-23 (нагадування і 2 записи після
      подання), AC-LEAVE-24 (нагадування немає).
      Done when: AC-LEAVE-23, AC-LEAVE-24
- [x] 1.5 Рядки AC-LEAVE-23, -24 у `docs/conformance.md`; `npm run ac:coverage`, `npm run gates`, `npm test`.
      Done when: AC-LEAVE-23, AC-LEAVE-24
- [x] 1.6 `npx openspec archive impl-leave-reminder -y`.
      Done when: AC-LEAVE-23, AC-LEAVE-24
