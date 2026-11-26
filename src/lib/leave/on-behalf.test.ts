import { describe, expect, it } from "vitest";
import { employeeWarning } from "./balance";
import { forEmployee, parseSubmitted, refusalOf, employeeIdOf, submittedMessage, ON_BEHALF_MESSAGES } from "./on-behalf";
import { TIME_MESSAGES } from "./time";
import { REQUEST_MESSAGES } from "./request";

describe("forEmployee", () => {
  it("AC-BEHALF-05: 'You have no working hours on this day' becomes 'This employee has no working hours on this day'", () => {
    expect(forEmployee(TIME_MESSAGES.noWorkingHours)).toBe("This employee has no working hours on this day");
  });

  it("AC-BEHALF-09: the schedule message speaks of 'the schedule'", () => {
    expect(forEmployee(TIME_MESSAGES.outsideSchedule([{ start: 510, end: 930 }]))).toBe(
      "Hours must be within the schedule: 08:30–15:30",
    );
  });

  it("AC-BEHALF-05: overlap, substitute list and over-balance warning say 'this employee'; other texts stay", () => {
    expect(forEmployee(REQUEST_MESSAGES.overlap("2026-12-03", 540, 660))).toBe(
      "This employee already has a request for this time: 2026-12-03 09:00–11:00",
    );
    expect(forEmployee("This substitute is no longer on your substitute list")).toBe(
      "This substitute is no longer on this employee's substitute list",
    );
    expect(forEmployee(employeeWarning("sick", 100, 50)!)).toBe(
      "This employee's Sick leave balance is 0.50 day. Another 0.50 day will be counted as Unpaid leave",
    );
    expect(forEmployee("The school is closed on this day: Holiday")).toBe("The school is closed on this day: Holiday");
    expect(forEmployee("The comment can be at most 500 characters")).toBe("The comment can be at most 500 characters");
  });
});

describe("on-behalf page helpers", () => {
  it("AC-BEHALF-11: only a uuid is an employee id; database refusals shown verbatim are recognised", () => {
    expect(employeeIdOf("A0000000-0000-0000-0000-000000000004")).toBe("a0000000-0000-0000-0000-000000000004");
    expect(employeeIdOf("teacher3")).toBeNull();
    expect(refusalOf(ON_BEHALF_MESSAGES.notYourEmployee)).toBe(ON_BEHALF_MESSAGES.notYourEmployee);
    expect(refusalOf(ON_BEHALF_MESSAGES.employeeRole)).toBe(ON_BEHALF_MESSAGES.employeeRole);
    expect(refusalOf(ON_BEHALF_MESSAGES.noEmployees)).toBe(ON_BEHALF_MESSAGES.noEmployees);
    expect(refusalOf("permission denied for function on_behalf_positions")).toBeNull();
  });

  it("AC-BEHALF-02: the success message counts approved and awaiting records", () => {
    expect(submittedMessage(1, 1)).toBe("Request submitted: 1 approved, 1 awaiting decision");
    expect(submittedMessage(2, 0)).toBe("Request submitted: 2 approved");
    expect(submittedMessage(0, 1)).toBe("Request submitted: 1 awaiting decision");
    expect(parseSubmitted("1-1")).toEqual({ approved: 1, awaiting: 1 });
    expect(parseSubmitted("1-x")).toBeNull();
    expect(parseSubmitted(undefined)).toBeNull();
  });
});
