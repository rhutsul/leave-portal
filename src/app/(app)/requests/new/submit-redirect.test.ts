// Адреса «My requests» після подання заявки — з'єднання server action submitLeaveRequest зі сторінкою: залишок у формі,
// яку повертає loadRemaining (RemainingByYear), блоки всіх посад і параметри, які читає requests/page.tsx.
import { describe, expect, it } from "vitest";
import { overBalanceWarnings } from "@/lib/leave/balance";
import type { RemainingByYear } from "../../balances/load-balances";
import { submitRedirect } from "./submit-redirect";

const TUESDAY_ONLY = [{ weekday: 2, start: 510, end: 930 }];
const MON_FRI = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: 510, end: 930 }));
const wholeDays = (...dates: string[]) => dates.map((date) => ({ date, minutes: 420 }));
const remaining2026 = (personal: number): RemainingByYear => new Map([[2026, { sick: 1800, personal }]]);

/** Параметри адреси так, як їх бачить сторінка «My requests». */
const paramsOf = (url: string) => {
  const parsed = new URL(url, "http://localhost");
  expect(parsed.pathname).toBe("/requests");
  return parsed.searchParams;
};

describe("the redirect after submitting a request", () => {
  it("AC-BALANCE-17: a 3-day Personal leave request over a balance of 1.50 carries one warning", () => {
    const params = paramsOf(
      submitRedirect({
        limitedType: "personal",
        remaining: remaining2026(150),
        records: wholeDays("2026-11-02", "2026-11-03", "2026-11-04"),
        blocks: MON_FRI,
        skipped: [],
      }),
    );
    expect(params.get("submitted")).toBe("1");
    expect(params.has("balance")).toBe(false);
    expect(overBalanceWarnings(params.get("over") ?? "")).toEqual([
      "Your Personal leave balance is 1.50 day. Another 1.50 day will be counted as Unpaid leave",
    ]);
  });

  it("AC-BALANCE-08: a whole day 2026-11-03 over a balance of 0.50 carries the warning about 0.50 day unpaid", () => {
    const params = paramsOf(
      submitRedirect({
        limitedType: "personal",
        remaining: remaining2026(50),
        records: wholeDays("2026-11-03"),
        blocks: TUESDAY_ONLY,
        skipped: [],
      }),
    );
    expect(overBalanceWarnings(params.get("over") ?? "")).toEqual([
      "Your Personal leave balance is 0.50 day. Another 0.50 day will be counted as Unpaid leave",
    ]);
  });

  it("AC-BALANCE-15: 09:00–11:30 over a balance of 0.20 carries the warning about 0.16 day unpaid", () => {
    const params = paramsOf(
      submitRedirect({
        limitedType: "personal",
        remaining: remaining2026(20),
        records: [{ date: "2026-11-03", minutes: 150 }],
        blocks: TUESDAY_ONLY,
        skipped: [],
      }),
    );
    expect(overBalanceWarnings(params.get("over") ?? "")).toEqual([
      "Your Personal leave balance is 0.20 day. Another 0.16 day will be counted as Unpaid leave",
    ]);
  });

  it("AC-LEAVE-21: the Saturday that was not accepted goes to the skipped dates, without a balance warning", () => {
    const params = paramsOf(
      submitRedirect({
        limitedType: null,
        remaining: null,
        records: wholeDays("2026-11-06"),
        blocks: MON_FRI,
        skipped: ["2026-11-07"],
      }),
    );
    expect(params.get("skipped")).toBe("2026-11-07");
    expect(params.has("over")).toBe(false);
    expect(params.has("balance")).toBe(false);
  });

  // Не з AC PM: наш запасний шлях — залишок не завантажився, і «My requests» каже, що його не перевірено.
  it("a limited type whose balance did not load gives balance=unchecked and no warning", () => {
    const params = paramsOf(
      submitRedirect({
        limitedType: "sick",
        remaining: null,
        records: wholeDays("2026-11-03"),
        blocks: TUESDAY_ONLY,
        skipped: [],
      }),
    );
    expect(params.get("balance")).toBe("unchecked");
    expect(params.has("over")).toBe(false);
  });

  it("no warning within the balance, for a school year without a loaded balance, or for a forged skipped date", () => {
    const within = paramsOf(
      submitRedirect({
        limitedType: "personal",
        remaining: remaining2026(100),
        records: wholeDays("2026-11-03"),
        blocks: TUESDAY_ONLY,
        skipped: ["not-a-date"],
      }),
    );
    expect([...within.keys()]).toEqual(["submitted"]);
    const otherYear = paramsOf(
      submitRedirect({
        limitedType: "personal",
        remaining: remaining2026(0),
        records: wholeDays("2027-09-07"),
        blocks: TUESDAY_ONLY,
        skipped: [],
      }),
    );
    expect(otherYear.has("over")).toBe(false);
  });
});
