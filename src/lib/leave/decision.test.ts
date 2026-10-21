import { describe, expect, it } from "vitest";
import {
  checkAccess,
  checkDecision,
  DECISION_MESSAGES,
  historyLine,
  isDecision,
  type Actor,
  type DecisionTarget,
} from "./decision";

// Ідентифікатори як у demo-users: працівник із основною посадою manager1@ і додатковою manager2@.
const TEACHER: Actor = { id: "teacher1", role: "employee" };
const MANAGER1: Actor = { id: "manager1", role: "manager" };
const MANAGER2: Actor = { id: "manager2", role: "manager" };
const ADMIN: Actor = { id: "admin", role: "admin" };

const awaiting = (over: Partial<DecisionTarget> = {}): DecisionTarget => ({
  employeeId: TEACHER.id,
  status: "awaiting",
  managerIds: [MANAGER1.id],
  ...over,
});

describe("who may decide on a record", () => {
  it("AC-DECIDE-08: a manager not responsible for the position cannot approve its record", () => {
    expect(checkDecision(MANAGER2, awaiting(), "approve", "")).toEqual({
      ok: false,
      message: DECISION_MESSAGES.noAccess,
    });
    expect(checkDecision(MANAGER1, awaiting(), "approve", "")).toMatchObject({ ok: true, status: "approved" });
  });

  it("AC-DECIDE-09: an employee without the manager or admin role cannot approve their own record", () => {
    expect(checkDecision(TEACHER, awaiting(), "approve", "")).toEqual({
      ok: false,
      message: DECISION_MESSAGES.noAccess,
    });
    // Навіть якби працівника помилково записали менеджером посади — роль employee рішень не ухвалює.
    expect(checkAccess(TEACHER, awaiting({ managerIds: [TEACHER.id] }))).toEqual({
      ok: false,
      message: DECISION_MESSAGES.noAccess,
    });
  });

  it("AC-DECIDE-18: a manager cannot approve their own record of a position they manage", () => {
    const own = awaiting({ employeeId: MANAGER1.id });
    expect(checkDecision(MANAGER1, own, "approve", "")).toEqual({
      ok: false,
      message: "Your own record is decided by an administrator",
    });
  });

  it("AC-DECIDE-19: the administrator approves the manager's own record", () => {
    const own = awaiting({ employeeId: MANAGER1.id });
    expect(checkDecision(ADMIN, own, "approve", "")).toEqual({ ok: true, status: "approved", comment: null });
  });

  it("AC-DECIDE-10: the administrator approves a record of a position they are not a manager of", () => {
    expect(checkDecision(ADMIN, awaiting({ managerIds: [MANAGER2.id] }), "approve", "")).toEqual({
      ok: true,
      status: "approved",
      comment: null,
    });
  });

  it("a missing record gets the same answer as a record without access", () => {
    expect(checkDecision(ADMIN, null, "approve", "")).toEqual({ ok: false, message: DECISION_MESSAGES.noAccess });
    expect(checkAccess(MANAGER1, null)).toEqual({ ok: false, message: DECISION_MESSAGES.noAccess });
  });
});

describe("status transitions", () => {
  it("AC-DECIDE-07: after the first manager approves, the second manager's reject is refused", () => {
    const shared = awaiting({ managerIds: [MANAGER1.id, MANAGER2.id] });
    const first = checkDecision(MANAGER1, shared, "approve", "");
    expect(first).toEqual({ ok: true, status: "approved", comment: null });
    const afterFirst = { ...shared, status: "approved" as const };
    expect(checkDecision(MANAGER2, afterFirst, "reject", "")).toEqual({
      ok: false,
      message: "Another manager has already decided: Approved",
    });
  });

  it("a cancelled record cannot be decided", () => {
    expect(checkDecision(MANAGER1, awaiting({ status: "cancelled" }), "approve", "")).toEqual({
      ok: false,
      message: DECISION_MESSAGES.cancelled,
    });
  });

  it("AC-DECIDE-02: approving one record gives status Approved", () => {
    expect(checkDecision(MANAGER1, awaiting(), "approve", "")).toEqual({ ok: true, status: "approved", comment: null });
  });

  it("AC-DECIDE-03: rejecting without a comment gives status Rejected", () => {
    expect(checkDecision(MANAGER1, awaiting(), "reject", "")).toEqual({ ok: true, status: "rejected", comment: null });
  });
});

describe("manager comment", () => {
  it("AC-DECIDE-04: returning for revision without a comment is refused with “Tell the employee what to fix”", () => {
    for (const comment of ["", "   "]) {
      expect(checkDecision(MANAGER1, awaiting(), "return", comment)).toEqual({
        ok: false,
        message: "Tell the employee what to fix",
      });
    }
  });

  it("AC-DECIDE-05: returning with a comment gives Returned for revision and keeps the comment", () => {
    expect(checkDecision(MANAGER1, awaiting(), "return", "Enter hours instead of a whole day")).toEqual({
      ok: true,
      status: "returned",
      comment: "Enter hours instead of a whole day",
    });
  });

  it("AC-DECIDE-23: rejecting with a comment keeps the comment", () => {
    expect(checkDecision(MANAGER1, awaiting(), "reject", " Not enough staff that day ")).toEqual({
      ok: true,
      status: "rejected",
      comment: "Not enough staff that day",
    });
  });

  it("AC-DECIDE-24: approving with a comment keeps the comment", () => {
    expect(checkDecision(MANAGER1, awaiting(), "approve", "Get well soon")).toEqual({
      ok: true,
      status: "approved",
      comment: "Get well soon",
    });
  });

  it("a comment longer than 500 characters is refused; exactly 500 is accepted", () => {
    expect(checkDecision(MANAGER1, awaiting(), "reject", "a".repeat(501))).toEqual({
      ok: false,
      message: DECISION_MESSAGES.commentTooLong,
    });
    expect(checkDecision(MANAGER1, awaiting(), "reject", "я".repeat(500))).toMatchObject({ ok: true });
  });

  it("only approve, reject and return are decisions", () => {
    expect(["approve", "reject", "return"].every(isDecision)).toBe(true);
    expect(isDecision("cancel")).toBe(false);
    expect(isDecision("")).toBe(false);
  });
});

describe("record history", () => {
  it("AC-DECIDE-15: a history line shows the decision time to the minute in Kyiv, who decided and “Approved”", () => {
    // 16:12 UTC 20 жовтня 2026 — 19:12 за Києвом (EEST, UTC+3).
    expect(
      historyLine({ createdAt: "2026-10-20T16:12:45Z", action: "approved", actorName: "Manager One", comment: null }),
    ).toEqual({ at: "2026-10-20 19:12", who: "Manager One", what: "Approved" });
    // Після переходу на зимовий час (25 жовтня) — UTC+2.
    expect(historyLine({ createdAt: "2026-11-02T08:05:00Z", action: "returned", actorName: null, comment: "x" })).toEqual({
      at: "2026-11-02 10:05",
      who: "Unknown user",
      what: "Returned for revision",
    });
  });
});
