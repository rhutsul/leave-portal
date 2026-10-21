import { describe, expect, it } from "vitest";
import {
  checkAccess,
  checkDecision,
  checkEmployeeAction,
  checkRecordEdit,
  DECISION_MESSAGES,
  employeeActions,
  historyLine,
  isDecision,
  parseRecordId,
  RECORD_EDIT_MESSAGES,
  reviewedHours,
  type Actor,
  type DecisionTarget,
  type OwnRecord,
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

describe("the employee changes, resubmits or cancels their own record", () => {
  // Основна посада teacher1@ у понеділок 2026-11-02: один блок 08:30–15:30.
  const MONDAY_BLOCKS = [{ start: 510, end: 930 }];
  const record = (over: Partial<OwnRecord> = {}): OwnRecord => ({
    id: 2,
    positionId: 1,
    date: "2026-11-02",
    leaveType: "sick",
    status: "awaiting",
    ...over,
  });
  const other = (id: number, start: number, end: number, status = "awaiting") => ({
    id,
    positionId: 1,
    date: "2026-11-02",
    start,
    end,
    status,
  });

  it("AC-DECIDE-16: a record awaiting decision changes from 08:30–15:30 to 09:00–12:00 and keeps its status", () => {
    expect(employeeActions("awaiting")).toEqual(["changeHours", "cancel"]);
    expect(checkRecordEdit(record(), { start: "09:00", end: "12:00" }, MONDAY_BLOCKS, [other(2, 510, 930)])).toEqual({
      ok: true,
      start: 540,
      end: 720,
      minutes: 180,
    });
  });

  it("AC-DECIDE-06: a returned record can change its hours to 09:00–12:00 and be resubmitted", () => {
    expect(employeeActions("returned")).toEqual(["changeHours", "resubmit", "cancel"]);
    expect(checkRecordEdit(record({ status: "returned" }), { start: "09:00", end: "12:00" }, MONDAY_BLOCKS, [])).toEqual({
      ok: true,
      start: 540,
      end: 720,
      minutes: 180,
    });
    expect(checkEmployeeAction("returned", "resubmit")).toEqual({ ok: true });
  });

  it("AC-DECIDE-12: an approved record cannot change its hours", () => {
    expect(employeeActions("approved")).toEqual([]);
    expect(checkRecordEdit(record({ status: "approved" }), { start: "09:00", end: "12:00" }, MONDAY_BLOCKS, [])).toEqual({
      ok: false,
      message: "This record is already approved and cannot be changed",
    });
  });

  it("AC-DECIDE-13: a record awaiting decision can be cancelled", () => {
    expect(checkEmployeeAction("awaiting", "cancel")).toEqual({ ok: true });
  });

  it("AC-DECIDE-17: a returned record can be cancelled, and a cancelled record cannot be resubmitted", () => {
    expect(checkEmployeeAction("returned", "cancel")).toEqual({ ok: true });
    expect(employeeActions("cancelled")).toEqual([]);
    expect(checkEmployeeAction("cancelled", "resubmit")).toEqual({ ok: false, message: RECORD_EDIT_MESSAGES.cancelled });
  });

  it("AC-DECIDE-21: changing the leave type from Sick leave to Personal leave is refused with the PM message", () => {
    expect(checkRecordEdit(record(), { start: "08:30", end: "15:30", leaveType: "personal" }, MONDAY_BLOCKS, [])).toEqual({
      ok: false,
      message:
        "Only the hours can be changed. To change the date, position or leave type, cancel this record and submit a new request",
    });
    // Дата й посада — так само; ті самі значення, що в записі, — це не зміна.
    expect(checkRecordEdit(record(), { start: "08:30", end: "15:30", date: "2026-11-03" }, MONDAY_BLOCKS, [])).toEqual({
      ok: false,
      message: RECORD_EDIT_MESSAGES.onlyHours,
    });
    expect(checkRecordEdit(record(), { start: "08:30", end: "15:30", positionId: 9 }, MONDAY_BLOCKS, [])).toEqual({
      ok: false,
      message: RECORD_EDIT_MESSAGES.onlyHours,
    });
    const same = { start: "08:30", end: "15:30", leaveType: "sick", date: "2026-11-02", positionId: 1 };
    expect(checkRecordEdit(record(), same, MONDAY_BLOCKS, []).ok).toBe(true);
  });

  it("AC-DECIDE-22: changing the second record to 09:00–15:30 overlaps the first one 08:30–10:00", () => {
    const records = [other(1, 510, 600), other(2, 780, 930)];
    expect(checkRecordEdit(record({ id: 2 }), { start: "09:00", end: "15:30" }, MONDAY_BLOCKS, records)).toEqual({
      ok: false,
      message: "You already have a request for this time: 2026-11-02 08:30–10:00",
    });
    // Сам із собою запис не перетинається: 13:00–15:30 → 12:00–15:30 проходить.
    expect(checkRecordEdit(record({ id: 2 }), { start: "12:00", end: "15:30" }, MONDAY_BLOCKS, records).ok).toBe(true);
  });

  it("new hours follow the same schedule rules as a new request", () => {
    expect(checkRecordEdit(record(), { start: "08:00", end: "10:00" }, MONDAY_BLOCKS, [])).toEqual({
      ok: false,
      message: "Hours must be within your schedule: 08:30–15:30",
    });
    expect(checkRecordEdit(record(), { start: "11:00", end: "10:00" }, MONDAY_BLOCKS, [])).toEqual({
      ok: false,
      message: "The end must be later than the start",
    });
  });

  it("a rejected record cannot change, and only a returned record can be resubmitted", () => {
    expect(checkEmployeeAction("rejected", "cancel")).toEqual({ ok: false, message: RECORD_EDIT_MESSAGES.rejected });
    expect(checkEmployeeAction("awaiting", "resubmit")).toEqual({ ok: false, message: RECORD_EDIT_MESSAGES.notReturned });
  });

  it("a record id from the form is a positive integer, anything else is refused", () => {
    expect(parseRecordId("42")).toBe(42);
    for (const raw of [null, "", "0", "-1", "1.5", "1e3", " 7", "9999999999999999"]) expect(parseRecordId(raw)).toBeNull();
  });
});

describe("the decision is about the hours the manager saw", () => {
  it("the decision form carries the reviewed hours, so a change by the employee is caught", () => {
    expect(reviewedHours(540, 720)).toBe("540-720");
    expect(reviewedHours(540, 720)).not.toBe(reviewedHours(510, 930));
  });
});
