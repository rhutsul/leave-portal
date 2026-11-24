// Реєстр погоджених відсутностей (ADR 0012) — ініціатива розробника до вимог PM, тож без AC ID у назвах.
import { describe, expect, it } from "vitest";
import {
  employeeLabel,
  exportFileName,
  exportHref,
  hoursDecimal,
  hoursLabel,
  leaveTypeLabel,
  monthInRange,
  monthOf,
  positionKindLabel,
  recordsLabel,
  registerCells,
  registerHref,
  registerQuery,
  registerTotals,
  totalsLabel,
  type RegisterRow,
} from "./register";

const DIVISIONS = [
  { id: 2, code: "elementary", name: "Elementary school" },
  { id: 3, code: "high", name: "High school" },
];

function row(overrides: Partial<RegisterRow> = {}): RegisterRow {
  return {
    record_id: 1,
    employee_name: "Teacher One",
    employee_email: "teacher1@example.test",
    position_title: "Teacher",
    position_kind: "main",
    date: "2026-11-03",
    start_min: 510,
    end_min: 930,
    minutes: 420,
    whole_day: true,
    leave_type: "personal",
    paid_days: 1,
    unpaid_days: 0,
    approved_at: "2026-11-02T10:15:00Z",
    approved_by_name: "Manager One",
    ...overrides,
  };
}

describe("register query", () => {
  it("takes a known division and a month within a year of the current one", () => {
    expect(registerQuery({ division: "high", month: "2026-09" }, DIVISIONS, "2026-11")).toEqual({
      division: DIVISIONS[1],
      month: "2026-09",
    });
    expect(registerQuery({ month: "2025-11" }, DIVISIONS, "2026-11").month).toBe("2025-11");
    expect(registerQuery({ month: "2027-11" }, DIVISIONS, "2026-11").month).toBe("2027-11");
  });

  it("falls back to the first division and the current month", () => {
    expect(registerQuery({}, DIVISIONS, "2026-11")).toEqual({ division: DIVISIONS[0], month: "2026-11" });
    expect(registerQuery({ division: "unknown" }, DIVISIONS, "2026-11").division).toBe(DIVISIONS[0]);
    expect(registerQuery({ division: ["high", "elementary"] }, DIVISIONS, "2026-11").division).toBe(DIVISIONS[1]);
    for (const month of ["2025-10", "2027-12", "2026-13", "2026-00", "2026-1", "2026-11-01", "", "abc"]) {
      expect(registerQuery({ month }, DIVISIONS, "2026-11").month).toBe("2026-11");
    }
    expect(registerQuery({ month: ["2026-10"] }, DIVISIONS, "2026-11").month).toBe("2026-10");
  });

  it("has no division when none is available", () => {
    expect(registerQuery({ division: "high" }, [], "2026-11").division).toBeNull();
  });

  it("checks the month range across years", () => {
    expect(monthInRange("2025-11", "2026-11")).toBe(true);
    expect(monthInRange("2025-10", "2026-11")).toBe(false);
    expect(monthInRange("2027-11", "2026-11")).toBe(true);
    expect(monthInRange("2027-12", "2026-11")).toBe(false);
    expect(monthOf("2026-11-24")).toBe("2026-11");
  });
});

describe("register links and file name", () => {
  it("builds the page and export links", () => {
    expect(registerHref("high", "2026-11")).toBe("/register?division=high&month=2026-11");
    expect(registerHref(null, "2026-11")).toBe("/register?month=2026-11");
    expect(exportHref("high", "2026-11")).toBe("/register/export?division=high&month=2026-11");
  });

  it("names the file after the division code and month, with safe characters only", () => {
    expect(exportFileName("elementary", "2026-11")).toBe("register-elementary-2026-11.csv");
    expect(exportFileName('a"b/c d', "2026-11")).toBe("register-a-b-c-d-2026-11.csv");
    expect(exportFileName("--", "2026-11")).toBe("register-division-2026-11.csv");
  });
});

describe("register cells", () => {
  it("shows a whole day or the hours", () => {
    expect(hoursLabel(row())).toBe("Whole day");
    expect(hoursLabel(row({ whole_day: false, start_min: 510, end_min: 720 }))).toBe("08:30–12:00");
  });

  it("gives the duration in hours to 0.01", () => {
    expect(hoursDecimal(420)).toBe("7.00");
    expect(hoursDecimal(210)).toBe("3.50");
    expect(hoursDecimal(25)).toBe("0.42");
    expect(hoursDecimal(0)).toBe("0.00");
  });

  it("names the employee, or falls back to the email", () => {
    expect(employeeLabel(row())).toBe("Teacher One");
    expect(employeeLabel(row({ employee_name: "  " }))).toBe("teacher1@example.test");
    expect(employeeLabel(row({ employee_name: null, employee_email: null }))).toBe("Employee");
  });

  it("names leave types and position kinds", () => {
    expect(leaveTypeLabel("family")).toBe("Family celebration");
    expect(leaveTypeLabel("other")).toBe("other");
    expect(positionKindLabel("main")).toBe("Main");
    expect(positionKindLabel("additional")).toBe("Additional");
    expect(positionKindLabel("other")).toBe("other");
  });

  it("gives every cell of a row as text, the same for the table and the CSV", () => {
    expect(registerCells(row())).toEqual({
      employee: "Teacher One",
      email: "teacher1@example.test",
      position: "Teacher",
      kind: "Main",
      date: "2026-11-03",
      dateLong: "Tue, 3 Nov 2026",
      hours: "Whole day",
      from: "08:30",
      to: "15:30",
      hoursDetail: "08:30–15:30",
      duration: "7 h",
      durationHours: "7.00",
      type: "Personal leave",
      paid: "1.00",
      unpaid: "0.00",
      approvedBy: "Manager One",
      approvedOn: "2026-11-02 12:15",
    });
  });

  it("leaves unknown approvals, a missing email and missing days empty or zero", () => {
    const c = registerCells(
      row({
        whole_day: false,
        start_min: 945,
        end_min: 1020,
        minutes: 75,
        employee_email: null,
        paid_days: null,
        unpaid_days: "0.15",
        approved_by_name: null,
        approved_at: null,
      }),
    );
    expect([c.email, c.hours, c.hoursDetail, c.duration, c.durationHours]).toEqual(["", "15:45–17:00", "", "1 h 15 min", "1.25"]);
    expect([c.paid, c.unpaid, c.approvedBy, c.approvedOn]).toEqual(["0.00", "0.15", "", ""]);
    expect(registerCells(row({ approved_by_name: "  " })).approvedBy).toBe("");
    expect(recordsLabel(1)).toBe("1 record");
    expect(recordsLabel(2)).toBe("2 records");
  });
});

describe("register totals", () => {
  it("adds up records, minutes and paid and unpaid days in hundredths", () => {
    const totals = registerTotals([
      row(),
      row({ record_id: 2, minutes: 210, paid_days: "0.25", unpaid_days: "0.25" }),
      row({ record_id: 3, minutes: 45, paid_days: null, unpaid_days: null }),
    ]);
    expect(totals).toEqual({ records: 3, minutes: 675, paid: 125, unpaid: 25 });
    expect(totalsLabel(totals)).toBe("3 records · 11 h 15 min · 1.25 paid days · 0.25 unpaid days");
  });

  it("speaks of one record in the singular", () => {
    expect(totalsLabel(registerTotals([row()]))).toBe("1 record · 7 h · 1.00 paid days · 0.00 unpaid days");
    expect(totalsLabel(registerTotals([]))).toBe("0 records · 0 min · 0.00 paid days · 0.00 unpaid days");
  });
});
