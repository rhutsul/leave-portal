import { describe, expect, it } from "vitest";
import { DECISION_MESSAGES } from "@/lib/leave/decision";
import {
  afterDecision,
  balanceShift,
  dayBar,
  decidedNotice,
  decisionErrorPlacement,
  decisionsTab,
  neighbours,
  pickRecord,
  recordHref,
} from "./decisions-view";

const awaiting = [{ id: 11 }, { id: 12 }];
const all = [...awaiting, { id: 20 }];

describe("Decisions: messages of a decision", () => {
  it("AC-DECIDE-04: «Tell the employee what to fix» shows under the comment field", () => {
    expect(decisionErrorPlacement(DECISION_MESSAGES.returnComment)).toBe("field");
    expect(decisionErrorPlacement(DECISION_MESSAGES.commentTooLong)).toBe("field");
  });

  it("AC-DECIDE-07: the second manager sees «Another manager has already decided: Approved» on the record", () => {
    // Після redirect форми вже немає: текст будується з поточного статусу запису.
    expect(decidedNotice("approved")).toBe("Another manager has already decided: Approved");
    expect(decidedNotice("rejected")).toBe("Another manager has already decided: Rejected");
    expect(decidedNotice("cancelled")).toBe(DECISION_MESSAGES.cancelled);
    expect(decidedNotice("awaiting")).toBeNull();
  });

  it("other answers show above the form, not under the comment", () => {
    expect(decisionErrorPlacement(DECISION_MESSAGES.hoursChanged)).toBe("form");
    expect(decisionErrorPlacement(DECISION_MESSAGES.noAccess)).toBe("form");
    expect(decisionErrorPlacement("")).toBeNull();
  });
});

describe("Decisions: list and record panel", () => {
  it("a link to a record outside the manager's lists shows a refusal, not the record", () => {
    // decision_records не дає записів чужих посад: такого id немає серед записів менеджера.
    expect(pickRecord(all, "99")).toEqual({ record: null, denied: true });
    expect(pickRecord(all, "abc")).toEqual({ record: null, denied: true });
  });

  it("without a selected record the panel is closed; a link opens that record", () => {
    expect(pickRecord(all, undefined)).toEqual({ record: null, denied: false });
    expect(pickRecord(all, "11")).toEqual({ record: { id: 11 }, denied: false });
    // Запис з іншої вкладки (щойно вирішений) за посиланням теж відкривається.
    expect(pickRecord(all, "20")).toEqual({ record: { id: 20 }, denied: false });
  });

  it("Previous and Next step through the shown list and stop at its ends", () => {
    expect(neighbours(awaiting, awaiting[0].id)).toMatchObject({ index: 0, prev: null, next: awaiting[1] ?? null });
    const last = awaiting[awaiting.length - 1];
    expect(neighbours(awaiting, last.id)).toMatchObject({ index: awaiting.length - 1, next: null });
    // Запис з іншої вкладки — без сусідів: стрілки не стрибають між списками.
    expect(neighbours(awaiting, 20)).toEqual({ index: -1, prev: null, next: null });
  });

  it("links keep the tab: Awaiting decision or History", () => {
    expect(decisionsTab("history")).toBe("history");
    expect(decisionsTab(undefined)).toBe("awaiting");
    expect(decisionsTab("other")).toBe("awaiting");
    expect(recordHref("awaiting", 5)).toBe("/decisions?record=5");
    expect(recordHref("history", 5)).toBe("/decisions?tab=history&record=5");
  });
});

describe("afterDecision (ADR 0007)", () => {
  it("opens the next record of the queue, the previous one after the last, and closes the panel when the queue is empty", () => {
    expect(afterDecision([4, 7, 9], 7, "approved")).toBe("/decisions?record=9&decided=approved");
    expect(afterDecision([4, 7, 9], 9, "rejected")).toBe("/decisions?record=7&decided=rejected");
    expect(afterDecision([4, 7, 9], 4, "returned")).toBe("/decisions?record=7&decided=returned");
    expect(afterDecision([7], 7, "approved")).toBe("/decisions?decided=approved");
    expect(afterDecision([], 7, "approved")).toBe("/decisions?decided=approved");
  });

  it("a record outside the queue goes to its first record", () => {
    expect(afterDecision([4, 9], 7, "approved")).toBe("/decisions?record=4&decided=approved");
  });
});

// Вигляд панелі рішення v2 (смуга дня, залишок до й після) — не AC PM: тому без AC ID у назвах.
describe("Decisions: the record panel", () => {
  const day = { start: 510, end: 930, minutes: 420 };

  it("a whole-day record fills the day bar and says so", () => {
    expect(dayBar({ start_min: 510, end_min: 930, minutes: 420 }, day)).toEqual({
      left: 0,
      width: 1,
      label: "08:30–15:30 · Whole day",
      total: "7 h of 7 h",
    });
  });

  it("a part of the day sits on its hours of the working day of the position", () => {
    const bar = dayBar({ start_min: 720, end_min: 930, minutes: 210 }, day);
    expect(bar.left).toBeCloseTo(0.5);
    expect(bar.width).toBeCloseTo(0.5);
    expect(bar.label).toBe("12:00–15:30");
    expect(bar.total).toBe("3 h 30 min of 7 h");
  });

  it("without the schedule the bar is full and only the duration of the record is told", () => {
    expect(dayBar({ start_min: 720, end_min: 930, minutes: 210 }, null)).toEqual({ left: 0, width: 1, label: "12:00–15:30", total: "3 h 30 min" });
  });

  it("the balance after approval is the remaining days less the record, as shares of the year for the bar", () => {
    const shift = balanceShift(1536, 100, 1800);
    expect(shift).toMatchObject({ before: 1536, after: 1436, used: 264 });
    expect(shift.bar?.before).toBeCloseTo(0.853, 3);
    expect(shift.bar?.after).toBeCloseTo(0.798, 3);
  });

  it("over the balance only the remaining days are paid, so nothing is left; without the total of the year there is no bar", () => {
    expect(balanceShift(50, 100, 1800)).toMatchObject({ before: 50, after: 0 });
    expect(balanceShift(-25, 100, null)).toEqual({ before: 0, after: 0, bar: null, used: null });
  });
});
