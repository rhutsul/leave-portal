// Розбір форми правки запису до рішення (крок 4 D9 impl-on-behalf). Що можна змінити й хто — перевіряє база
// (tests/db/on-behalf.test.ts); тут — формат полів і куди показати відповідь.
import { describe, expect, it } from "vitest";
import { EDIT_MESSAGES, editErrorMessage, isHoursMessage, parseEditForm } from "./record-edit";
import { REQUEST_MESSAGES } from "./request";
import { TIME_MESSAGES } from "./time";

const SUB = "a0000000-0000-0000-0000-000000000005";

function form(values: Record<string, string>) {
  return (name: string) => values[name] ?? null;
}

const BASE = { record_id: "7", date: "2026-12-04", whole_day: "0", start: "09:00", end: "11:00", leave_type: "sick", substitute_id: "none" };

describe("parseEditForm", () => {
  it("AC-BEHALF-06: the new date, the hours and 'No substitute' go to edit_leave_record as they are", () => {
    expect(parseEditForm(form(BASE))).toEqual({
      ok: true,
      fields: { date: "2026-12-04", wholeDay: false, start: 540, end: 660, leaveType: "sick", relationship: null, substituteId: null },
    });
  });

  it("AC-BEHALF-07: a new leave type; Family celebration needs the relationship", () => {
    expect(parseEditForm(form({ ...BASE, leave_type: "personal" }))).toMatchObject({ ok: true, fields: { leaveType: "personal" } });
    expect(parseEditForm(form({ ...BASE, leave_type: "family", relationship: "" }))).toEqual({
      ok: false,
      message: REQUEST_MESSAGES.relationship,
    });
    expect(parseEditForm(form({ ...BASE, leave_type: "family", relationship: "child" }))).toMatchObject({
      ok: true,
      fields: { leaveType: "family", relationship: "child" },
    });
  });

  it("AC-BEHALF-08: a substitute from the list is sent by id; anything else than a uuid is refused", () => {
    expect(parseEditForm(form({ ...BASE, substitute_id: SUB.toUpperCase() }))).toMatchObject({ ok: true, fields: { substituteId: SUB } });
    expect(parseEditForm(form({ ...BASE, substitute_id: "teacher2@example.test" }))).toEqual({ ok: false, message: EDIT_MESSAGES.failed });
  });

  it("Whole day leaves the hours to the server (the working day of the position on the new date)", () => {
    expect(parseEditForm(form({ ...BASE, whole_day: "1", start: "", end: "" }))).toMatchObject({
      ok: true,
      fields: { wholeDay: true, start: null, end: null },
    });
  });

  it("refuses a missing date, broken times and an end before the start", () => {
    expect(parseEditForm(form({ ...BASE, date: "" }))).toEqual({ ok: false, message: EDIT_MESSAGES.chooseDate });
    expect(parseEditForm(form({ ...BASE, date: "2026-13-45" }))).toEqual({ ok: false, message: EDIT_MESSAGES.chooseDate });
    expect(parseEditForm(form({ ...BASE, start: "9" }))).toEqual({ ok: false, message: TIME_MESSAGES.step });
    expect(parseEditForm(form({ ...BASE, start: "11:00", end: "09:00" }))).toEqual({
      ok: false,
      message: TIME_MESSAGES.endBeforeStart,
    });
  });
});

describe("isHoursMessage", () => {
  it("AC-BEHALF-09: 'Hours must be within the schedule: …' is shown at the hours field as well", () => {
    expect(isHoursMessage("Hours must be within the schedule: 08:30–15:30")).toBe(true);
    expect(isHoursMessage(TIME_MESSAGES.step)).toBe(true);
    expect(isHoursMessage(TIME_MESSAGES.blockEnd(720))).toBe(true);
  });

  it("AC-BEHALF-10: 'already decided' and other refusals stay above the form only", () => {
    expect(isHoursMessage("This record is already decided and cannot be changed")).toBe(false);
    expect(isHoursMessage("The school is closed on this day: Holiday")).toBe(false);
  });
});

describe("editErrorMessage", () => {
  it("AC-BEHALF-10: the database text is shown as it is; a missing grant is a plain failure, not Postgres wording", () => {
    expect(editErrorMessage({ code: "P0001", message: "This record is already decided and cannot be changed" })).toBe(
      "This record is already decided and cannot be changed",
    );
    expect(editErrorMessage({ code: "42501", message: "You can't change this record" })).toBe("You can't change this record");
    expect(editErrorMessage({ code: "42501", message: "permission denied for function edit_leave_record" })).toBe(EDIT_MESSAGES.failed);
    expect(editErrorMessage({ code: "XX000", message: "boom" })).toBe(EDIT_MESSAGES.failed);
  });
});
