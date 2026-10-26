import { describe, expect, it } from "vitest";
import { DECISION_MESSAGES } from "@/lib/leave/decision";
import { decidedNotice, decisionErrorPlacement, decisionsTab, neighbours, pickRecord, recordHref } from "./decisions-view";

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
