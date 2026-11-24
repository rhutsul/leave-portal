import { describe, expect, it } from "vitest";
import {
  CANCELLATION_MESSAGES,
  canCancelWithNote,
  cancellationDecisionCheck,
  cancellationMark,
  cancellationRequestCheck,
  cancellationRequestLine,
  canRequestCancellation,
  isCancellationDecision,
  managerCancelCheck,
  type CancellationTarget,
} from "./cancellation";
import { DECISION_MESSAGES, historyLine, type Actor } from "./decision";

// Дати AC: сьогодні 2026-12-01, запис 2026-12-10 (AC-CANCEL-01) і 2026-11-27 (AC-CANCEL-05).
const TODAY = "2026-12-01";
const TEACHER1: Actor = { id: "teacher1", role: "employee" };
const MANAGER1: Actor = { id: "manager1", role: "manager" };
const MANAGER2: Actor = { id: "manager2", role: "manager" };
const ADMIN: Actor = { id: "admin", role: "admin" };

const record = (over: Partial<CancellationTarget> = {}): CancellationTarget => ({
  employeeId: TEACHER1.id,
  managerIds: [MANAGER1.id],
  date: "2026-12-10",
  status: "approved",
  cancelReason: null,
  cancelRequestId: null,
  ...over,
});

const requested = (over: Partial<CancellationTarget> = {}) =>
  record({ cancelReason: "Plans changed", cancelRequestId: 7, ...over });

describe("the employee asks to cancel an approved record", () => {
  it("AC-CANCEL-01: an approved record 2026-12-10 with 'Plans changed' can be asked to cancel; the mark shows", () => {
    expect(canRequestCancellation(record(), TODAY)).toBe(true);
    expect(cancellationRequestCheck(record(), TODAY, "  Plans changed ")).toEqual({ ok: true, text: "Plans changed" });
    expect(
      cancellationMark("approved", { cancel_reason: "Plans changed", cancel_declined_comment: null, cancel_note: null }),
    ).toEqual({ kind: "requested", text: "Cancellation requested" });
    expect(cancellationRequestLine("Plans changed")).toBe("Cancellation requested: Plans changed");
  });

  it("AC-CANCEL-01: the history shows who asked, to the minute", () => {
    expect(
      historyLine({ createdAt: "2026-12-01T08:05:30Z", action: "cancellation_requested", actorName: "Teacher One", comment: null }),
    ).toEqual({ at: "2026-12-01 10:05", who: "Teacher One", what: "Cancellation requested" });
  });

  it("AC-CANCEL-05: a record 2026-11-27 when today is 2026-12-01 — 'Records in the past cannot be cancelled'", () => {
    const past = record({ date: "2026-11-27" });
    expect(canRequestCancellation(past, TODAY)).toBe(false);
    expect(cancellationRequestCheck(past, TODAY, "Plans changed")).toEqual({
      ok: false,
      message: "Records in the past cannot be cancelled",
    });
    // Сьогодні — ще можна («today or later»).
    expect(canRequestCancellation(record({ date: TODAY }), TODAY)).toBe(true);
  });

  it("AC-CANCEL-06: the record already has the request — 'Cancellation has already been requested'", () => {
    expect(canRequestCancellation(requested(), TODAY)).toBe(false);
    expect(cancellationRequestCheck(requested(), TODAY, "Plans changed")).toEqual({
      ok: false,
      message: "Cancellation has already been requested",
    });
  });

  it("AC-CANCEL-10: somebody else's record (not found among own) — 'You can cancel only your own records'", () => {
    expect(cancellationRequestCheck(null, TODAY, "Plans changed")).toEqual({
      ok: false,
      message: "You can cancel only your own records",
    });
  });

  it("a record that is not approved, an empty reason and a reason over 500 characters are refused", () => {
    expect(cancellationRequestCheck(record({ status: "awaiting" }), TODAY, "x")).toEqual({
      ok: false,
      message: CANCELLATION_MESSAGES.notApproved,
    });
    expect(cancellationRequestCheck(record(), TODAY, " \n ")).toEqual({ ok: false, message: CANCELLATION_MESSAGES.reason });
    expect(cancellationRequestCheck(record(), TODAY, "a".repeat(501))).toEqual({
      ok: false,
      message: CANCELLATION_MESSAGES.commentTooLong,
    });
    expect(cancellationRequestCheck(record(), TODAY, "a".repeat(500))).toMatchObject({ ok: true });
  });
});

describe("the manager decides the request", () => {
  it("AC-CANCEL-03: declining with 'Exam week' is accepted; the employee then sees 'Cancellation declined: Exam week'", () => {
    expect(cancellationDecisionCheck(MANAGER1, requested(), "decline", " Exam week ", 7)).toEqual({
      ok: true,
      comment: "Exam week",
    });
    expect(
      cancellationMark("approved", { cancel_reason: null, cancel_declined_comment: "Exam week", cancel_note: null }),
    ).toEqual({ kind: "declined", text: "Cancellation declined: Exam week" });
  });

  it("AC-CANCEL-04: declining without a comment — 'Tell the employee why the cancellation is declined' under the field", () => {
    expect(cancellationDecisionCheck(MANAGER1, requested(), "decline", "  ", 7)).toEqual({
      ok: false,
      message: "Tell the employee why the cancellation is declined",
      field: true,
    });
    expect(cancellationDecisionCheck(MANAGER1, requested(), "confirm", "", 7)).toEqual({ ok: true, comment: null });
  });

  it("AC-CANCEL-11: manager2@ (not a manager of the position) and the employee cannot decide; the administrator can", () => {
    expect(cancellationDecisionCheck(MANAGER2, requested(), "confirm", "", 7)).toEqual({
      ok: false,
      message: DECISION_MESSAGES.noAccess,
    });
    expect(cancellationDecisionCheck(TEACHER1, requested(), "confirm", "", 7)).toMatchObject({ ok: false });
    expect(cancellationDecisionCheck(MANAGER1, null, "confirm", "", 7)).toMatchObject({ ok: false });
    expect(cancellationDecisionCheck(ADMIN, requested(), "confirm", "", 7)).toMatchObject({ ok: true });
    expect(
      cancellationDecisionCheck(MANAGER1, requested({ employeeId: MANAGER1.id }), "confirm", "", 7),
    ).toEqual({ ok: false, message: DECISION_MESSAGES.ownRecord });
  });

  it("no open request, an already cancelled record and a stale request id are refused", () => {
    expect(cancellationDecisionCheck(MANAGER1, record({ status: "awaiting" }), "confirm", "", 7)).toEqual({
      ok: false,
      message: CANCELLATION_MESSAGES.noRequest,
    });
    expect(cancellationDecisionCheck(MANAGER1, record(), "decline", "x", 7)).toEqual({
      ok: false,
      message: CANCELLATION_MESSAGES.noRequest,
    });
    expect(cancellationDecisionCheck(MANAGER1, record({ status: "cancelled" }), "confirm", "", 7)).toEqual({
      ok: false,
      message: CANCELLATION_MESSAGES.alreadyCancelled,
    });
    expect(cancellationDecisionCheck(MANAGER1, requested(), "confirm", "", 6)).toEqual({
      ok: false,
      message: CANCELLATION_MESSAGES.requestChanged,
    });
    expect(cancellationDecisionCheck(MANAGER1, requested(), "confirm", "", null)).toMatchObject({ ok: false });
    expect(isCancellationDecision("confirm")).toBe(true);
    expect(isCancellationDecision("approve")).toBe(false);
  });
});

describe("the manager cancels an approved record with a note", () => {
  it("AC-CANCEL-08: 'Event moved to January' is accepted; the employee sees the note on the cancelled record", () => {
    expect(canCancelWithNote(record(), TODAY)).toBe(true);
    expect(managerCancelCheck(MANAGER1, record(), TODAY, "Event moved to January")).toEqual({
      ok: true,
      comment: "Event moved to January",
    });
    expect(
      cancellationMark("cancelled", { cancel_reason: null, cancel_declined_comment: null, cancel_note: "Event moved to January" }),
    ).toEqual({ kind: "note", text: "Event moved to January" });
  });

  it("AC-CANCEL-09: without a note — 'Tell the employee why the record is cancelled' under the field", () => {
    expect(managerCancelCheck(MANAGER1, record(), TODAY, "")).toEqual({
      ok: false,
      message: "Tell the employee why the record is cancelled",
      field: true,
    });
  });

  it("a record in the past, not approved, already cancelled or of another position cannot be cancelled with a note", () => {
    expect(canCancelWithNote(record({ date: "2026-11-27" }), TODAY)).toBe(false);
    expect(canCancelWithNote(requested(), TODAY)).toBe(false);
    expect(managerCancelCheck(MANAGER1, record({ date: "2026-11-27" }), TODAY, "x")).toEqual({
      ok: false,
      message: CANCELLATION_MESSAGES.past,
    });
    expect(managerCancelCheck(MANAGER1, record({ status: "rejected" }), TODAY, "x")).toEqual({
      ok: false,
      message: CANCELLATION_MESSAGES.notApprovedForNote,
    });
    expect(managerCancelCheck(MANAGER1, record({ status: "cancelled" }), TODAY, "x")).toEqual({
      ok: false,
      message: CANCELLATION_MESSAGES.alreadyCancelled,
    });
    expect(managerCancelCheck(MANAGER2, record(), TODAY, "x")).toEqual({ ok: false, message: DECISION_MESSAGES.noAccess });
    expect(cancellationMark("approved", undefined)).toBeNull();
    expect(cancellationMark("approved", { cancel_reason: null, cancel_declined_comment: null, cancel_note: null })).toBeNull();
  });
});
