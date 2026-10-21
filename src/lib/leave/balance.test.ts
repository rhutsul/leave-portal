import { describe, expect, it } from "vitest";
import {
  computeBalances,
  dayShare,
  formatDays,
  formatSchoolYear,
  parseBalanceInputs,
  schoolYearOf,
  type BalanceInputs,
  type DayMinutes,
} from "./balance";

const YEAR = 2026;
const NONE: BalanceInputs = { days: [], splits: [], carryovers: [] };

// Хвилини одного типу на дату; працівник з однією посадою Tue 08:30–15:30 — 420 робочих хвилин.
const day = (minutes: number, leaveType: string, status: string, date = "2026-11-03", workingMinutes = 420): DayMinutes => ({
  date,
  workingMinutes,
  leaveType,
  status,
  minutes,
});

const shown = (inputs: BalanceInputs, year = YEAR) => {
  const b = computeBalances(inputs, year);
  const row = (type: "sick" | "personal") => ({
    granted: formatDays(b.limited[type].granted),
    carriedOver: formatDays(b.limited[type].carriedOver),
    used: formatDays(b.limited[type].used),
    remaining: formatDays(b.limited[type].remaining),
  });
  return {
    sick: row("sick"),
    personal: row("personal"),
    unpaid: formatDays(b.unlimited.unpaid),
    family: formatDays(b.unlimited.family),
  };
};

describe("balances", () => {
  it("AC-BALANCE-01: without approved records and carry-over: 18.00 granted and remaining, 0.00 used everywhere", () => {
    expect(shown(NONE)).toEqual({
      sick: { granted: "18.00", carriedOver: "0.00", used: "0.00", remaining: "18.00" },
      personal: { granted: "18.00", carriedOver: "0.00", used: "0.00", remaining: "18.00" },
      unpaid: "0.00",
      family: "0.00",
    });
  });

  it("AC-BALANCE-04: an awaiting whole-day Personal leave record does not change the balance", () => {
    expect(shown({ ...NONE, days: [day(420, "personal", "awaiting")] }).personal).toEqual({
      granted: "18.00",
      carriedOver: "0.00",
      used: "0.00",
      remaining: "18.00",
    });
  });

  it("AC-BALANCE-02: an approved whole-day Sick leave on 2026-11-03 gives used 1.00, remaining 17.00", () => {
    const sick = shown({ ...NONE, days: [day(420, "sick", "approved")] }).sick;
    expect([sick.used, sick.remaining]).toEqual(["1.00", "17.00"]);
  });

  it("AC-BALANCE-03: 09:00–11:30 of 420 minutes gives used 0.36 (150 ÷ 420 half up), remaining 17.64", () => {
    expect(dayShare(150, 420)).toBe(36);
    const sick = shown({ ...NONE, days: [day(150, "sick", "approved")] }).sick;
    expect([sick.used, sick.remaining]).toEqual(["0.36", "17.64"]);
  });

  it("AC-BALANCE-05: whole days on both positions on 2026-11-02 count as 1.00, not 2.00", () => {
    // Записи двох посад однієї дати й типу — один рядок get_balance_inputs або два; сума та сама.
    const twoRows = [day(420, "personal", "approved", "2026-11-02", 495), day(75, "personal", "approved", "2026-11-02", 495)];
    expect(shown({ ...NONE, days: twoRows }).personal.used).toBe("1.00");
    expect(dayShare(495 + 495, 495)).toBe(100);
  });

  it("AC-BALANCE-06: a whole day of the additional position only gives 0.15 (75 of 495 minutes)", () => {
    expect(shown({ ...NONE, days: [day(75, "personal", "approved", "2026-11-02", 495)] }).personal.used).toBe("0.15");
  });

  it("AC-BALANCE-07: a rejected whole-day Sick leave record keeps used 0.00, remaining 18.00", () => {
    const sick = shown({ ...NONE, days: [day(420, "sick", "rejected"), day(420, "sick", "cancelled", "2026-11-04")] }).sick;
    expect([sick.used, sick.remaining]).toEqual(["0.00", "18.00"]);
  });

  it("AC-BALANCE-11: 5.00 Sick days left on 2027-08-31 are carried over into 2027–2028: 18.00 + 5.00 = 23.00", () => {
    // 2026–2027: 13 погоджених цілих днів Sick leave — лишилося 5.00 на 31 серпня 2027.
    const days = Array.from({ length: 13 }, (_, i) => day(420, "sick", "approved", `2027-08-${String(i + 1).padStart(2, "0")}`));
    expect(shown({ ...NONE, days }, 2026).sick.remaining).toBe("5.00");
    expect(schoolYearOf("2027-08-31")).toBe(2026);
    expect(schoolYearOf("2027-09-01")).toBe(2027);
    expect(shown({ ...NONE, days }, schoolYearOf("2027-09-01")).sick).toEqual({
      granted: "18.00",
      carriedOver: "5.00",
      used: "0.00",
      remaining: "23.00",
    });
    // Перенесення без обмеження: невикористані 18.00 Personal leave — теж повністю.
    expect(shown({ ...NONE, days }, 2027).personal.carriedOver).toBe("18.00");
  });

  it("AC-BALANCE-11: carry-over entered for the first school year is added and chained into the next year", () => {
    const inputs: BalanceInputs = { ...NONE, carryovers: [{ schoolYear: 2026, leaveType: "sick", days: 5 }] };
    expect(shown(inputs, 2026).sick).toEqual({ granted: "18.00", carriedOver: "5.00", used: "0.00", remaining: "23.00" });
    expect(shown(inputs, 2027).sick.carriedOver).toBe("23.00");
  });
});

describe("balance helpers", () => {
  it("rounds half up to 0.01 and never counts a date as more than 1.00", () => {
    // 0.355 → 0.36: 71 з 200 хвилин.
    expect(dayShare(71, 200)).toBe(36);
    expect(dayShare(1, 300)).toBe(0);
    expect(dayShare(500, 420)).toBe(100);
    expect(dayShare(60, 0)).toBe(0);
  });

  it("counts only the asked school year and Unpaid leave and Family celebration without a limit", () => {
    const b = computeBalances(
      {
        ...NONE,
        days: [
          day(420, "unpaid", "approved"),
          day(210, "family", "approved", "2026-11-04"),
          day(420, "sick", "approved", "2026-08-31"),
        ],
      },
      YEAR,
    );
    expect([formatDays(b.unlimited.unpaid), formatDays(b.unlimited.family)]).toEqual(["1.00", "0.50"]);
    expect(formatDays(b.limited.sick.used)).toBe("0.00");
  });

  it("AC-BALANCE-10: a record approved with the split 0.50 + 0.50 at used 17.50 gives Personal used 18.00, remaining 0.00, Unpaid used 0.50", () => {
    // Used 17.50 до рішення: 17 цілих днів і половина дня Personal leave.
    const before = [
      ...Array.from({ length: 17 }, (_, i) => day(420, "personal", "approved", `2026-10-${String(i + 1).padStart(2, "0")}`)),
      day(210, "personal", "approved", "2026-10-20"),
    ];
    expect(shown({ ...NONE, days: before }).personal.used).toBe("17.50");
    const after = shown({
      ...NONE,
      days: before,
      splits: [{ date: "2026-11-03", leaveType: "personal", paidDays: 0.5, unpaidDays: 0.5 }],
    });
    expect([after.personal.used, after.personal.remaining, after.unpaid]).toEqual(["18.00", "0.00", "0.50"]);
  });

  it("formats school years and parses the database answer", () => {
    expect(formatSchoolYear(2026)).toBe("2026–2027");
    expect(formatDays(1764)).toBe("17.64");
    expect(
      parseBalanceInputs({
        days: [{ date: "2026-11-03", working_minutes: 420, leave_type: "sick", status: "approved", minutes: 150 }],
        splits: [],
        carryovers: [{ school_year: 2026, leave_type: "sick", days: "5.00" }],
      }),
    ).toEqual({
      days: [{ date: "2026-11-03", workingMinutes: 420, leaveType: "sick", status: "approved", minutes: 150 }],
      splits: [],
      carryovers: [{ schoolYear: 2026, leaveType: "sick", days: 5 }],
    });
  });
});
