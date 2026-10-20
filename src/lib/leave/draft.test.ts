import { describe, expect, it } from "vitest";
import { choiceFor, draftReducer, EMPTY_DRAFT, toPayload, type Draft, type DraftAction } from "./draft";

const MONDAY = "2026-11-02";
const TUESDAY = "2026-11-03";

// Працівник з AC-LEAVE-02: основна посада (id 1) щодня, додаткова (id 2) — лише в понеділок.
const positionIdsOn = (date: string) => (date === MONDAY ? [1, 2] : [1]);

const run = (actions: DraftAction[], from: Draft = EMPTY_DRAFT) => actions.reduce(draftReducer, from);

// Заявка на 2 дати, дійшла до підсумку: Mon — основна 09:00–11:30, додаткова виключена; Tue — цілий день.
const atSummary = run([
  { type: "toggleDate", date: TUESDAY },
  { type: "toggleDate", date: MONDAY },
  { type: "go", step: 2 },
  { type: "setChoice", date: MONDAY, positionId: 1, patch: { wholeDay: false, start: "09:00", end: "11:30" } },
  { type: "setChoice", date: MONDAY, positionId: 2, patch: { include: false } },
  { type: "go", step: 3 },
  { type: "setLeaveType", leaveType: "personal" },
  { type: "setComment", comment: "Doctor's appointment" },
  { type: "go", step: 4 },
]);

describe("new request draft", () => {
  it("AC-LEAVE-11: going back from the summary keeps the dates and hours, and the summary can be reopened as is", () => {
    expect(atSummary.step).toBe(4);
    const before = toPayload(atSummary, positionIdsOn);

    const editing = draftReducer(atSummary, { type: "go", step: 3 });
    expect(editing.step).toBe(3);
    expect(editing.maxStep).toBe(4);
    const hours = draftReducer(editing, { type: "go", step: 2 });
    expect(hours.dates).toEqual([MONDAY, TUESDAY]);
    expect(choiceFor(hours, MONDAY, 1)).toEqual({ positionId: 1, include: true, wholeDay: false, start: "09:00", end: "11:30" });
    expect(choiceFor(hours, MONDAY, 2).include).toBe(false);
    expect(choiceFor(hours, TUESDAY, 1)).toMatchObject({ include: true, wholeDay: true });
    expect(toPayload(hours, positionIdsOn)).toEqual(before);

    // Без змін можна одразу повернутися до підсумку зі степера — нічого не треба вводити заново.
    expect(draftReducer(hours, { type: "go", step: 4 }).step).toBe(4);
  });

  it("AC-LEAVE-11: an edit after going back locks the later steps until they are passed again", () => {
    const back = draftReducer(atSummary, { type: "go", step: 2 });
    const changed = draftReducer(back, {
      type: "setChoice",
      date: TUESDAY,
      positionId: 1,
      patch: { wholeDay: false, start: "10:00", end: "12:00" },
    });
    expect(changed.maxStep).toBe(2);
    expect(changed.leaveType).toBe("personal");
    expect(changed.comment).toBe("Doctor's appointment");
  });

  it("the payload sends only the selected dates with a choice for every scheduled position", () => {
    const payload = toPayload(atSummary, positionIdsOn);
    expect(payload).toEqual({
      dates: [MONDAY, TUESDAY],
      leaveType: "personal",
      relationship: "",
      comment: "Doctor's appointment",
      choices: [
        { date: MONDAY, positionId: 1, include: true, wholeDay: false, start: "09:00", end: "11:30" },
        { date: MONDAY, positionId: 2, include: false, wholeDay: true, start: "", end: "" },
        { date: TUESDAY, positionId: 1, include: true, wholeDay: true, start: "", end: "" },
      ],
    });
    const withoutTuesday = draftReducer(atSummary, { type: "toggleDate", date: TUESDAY });
    expect(withoutTuesday.maxStep).toBe(1);
    expect(toPayload(withoutTuesday, positionIdsOn).choices.map((c) => c.date)).toEqual([MONDAY, MONDAY]);
  });
});
