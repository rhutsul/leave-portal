// /status (WS11): історія збоїв проду з прогонів smoke. Тест логіки сторінки експлуатації — без AC ID (AC PM про
// сторінку стану немає).
import { describe, expect, it } from "vitest";
import { buildHistory, describeDay, formatMinutes, overallState, prodRuns, summarize, type SmokeRun } from "@/lib/status/history";

const run = (event: string, conclusion: string | null, at: string, end = at): SmokeRun => ({
  event,
  conclusion,
  createdAt: at,
  updatedAt: end,
});
const NOW = new Date("2026-11-22T12:00:00Z");

describe("status history", () => {
  it("counts only checks of production (schedule, status) that finished", () => {
    const runs = [
      run("schedule", "success", "2026-11-22T05:23:00Z"),
      run("status", "skipped", "2026-11-22T06:00:00Z"),
      run("repository_dispatch", "failure", "2026-11-22T07:00:00Z"),
      run("workflow_dispatch", "failure", "2026-11-22T08:00:00Z"),
      run("status", "failure", "2026-11-22T09:00:00Z"),
      run("status", null, "2026-11-22T10:00:00Z"),
    ];
    expect(prodRuns(runs).map((r) => `${r.event}:${r.conclusion}`)).toEqual(["schedule:success", "status:failure"]);
  });

  it("builds 30 Kyiv days, oldest first, with ok / issues / none", () => {
    const history = buildHistory(
      [
        run("schedule", "success", "2026-11-21T05:23:00Z"),
        run("status", "failure", "2026-11-22T09:00:00Z", "2026-11-22T09:01:00Z"),
        run("status", "success", "2026-11-22T09:10:00Z", "2026-11-22T09:13:00Z"),
      ],
      NOW,
    );
    expect(history).toHaveLength(30);
    expect(history[0].date).toBe("2026-10-24");
    expect(history.at(-1)).toMatchObject({ date: "2026-11-22", state: "issues", failures: 1, longestMinutes: 12, ongoing: false });
    expect(history.at(-2)).toMatchObject({ date: "2026-11-21", state: "ok" });
    expect(history.at(-3)?.state).toBe("none");
  });

  it("uses Kyiv dates: 23:30 UTC on Nov 21 is already Nov 22 in Kyiv", () => {
    const history = buildHistory([run("schedule", "success", "2026-11-21T23:30:00Z")], NOW);
    expect(history.at(-1)).toMatchObject({ date: "2026-11-22", state: "ok" });
    expect(history.at(-2)?.state).toBe("none");
  });

  it("keeps 30 consecutive calendar days across the switch to winter time (25 Oct 2026)", () => {
    const history = buildHistory([], new Date("2026-11-22T21:30:00Z"));
    const dates = history.map((d) => d.date);
    expect(new Set(dates).size).toBe(30);
    expect(dates[0]).toBe("2026-10-24");
    expect(dates.at(-1)).toBe("2026-11-22");
  });

  it("does not count a green check that finished before the failure as its recovery", () => {
    const history = buildHistory(
      [
        run("status", "failure", "2026-11-22T09:00:00Z", "2026-11-22T09:10:00Z"),
        run("schedule", "success", "2026-11-22T09:05:00Z", "2026-11-22T09:08:00Z"),
      ],
      NOW,
    );
    expect(history.at(-1)).toMatchObject({ state: "issues", ongoing: true, longestMinutes: null });
  });

  it("marks a failure with no green check after it as not resolved yet", () => {
    const history = buildHistory([run("status", "failure", "2026-11-22T09:00:00Z")], NOW);
    expect(history.at(-1)).toMatchObject({ state: "issues", ongoing: true, longestMinutes: null });
    expect(describeDay(history.at(-1)!)).toBe("22 Nov — 1 failed check, not resolved yet");
  });

  it("describes days and durations in plain words", () => {
    expect(describeDay({ date: "2026-11-09", state: "ok", failures: 0, longestMinutes: null, ongoing: false })).toBe(
      "9 Nov — no issues",
    );
    expect(describeDay({ date: "2026-11-09", state: "none", failures: 0, longestMinutes: null, ongoing: false })).toBe(
      "9 Nov — no checks",
    );
    expect(describeDay({ date: "2026-11-09", state: "issues", failures: 2, longestMinutes: 75, ongoing: false })).toBe(
      "9 Nov — 2 failed checks, resolved in 1 h 15 min",
    );
    expect(formatMinutes(12)).toBe("12 min");
    expect(formatMinutes(120)).toBe("2 h");
  });

  it("summarizes clean days among days with checks, and maps the database state to the overall state", () => {
    const history = buildHistory(
      [run("schedule", "success", "2026-11-21T05:23:00Z"), run("schedule", "failure", "2026-11-22T05:23:00Z")],
      NOW,
    );
    expect(summarize(history)).toEqual({ clean: 1, checked: 2 });
    expect(overallState(true)).toBe("operational");
    expect(overallState(false)).toBe("outage");
  });
});
