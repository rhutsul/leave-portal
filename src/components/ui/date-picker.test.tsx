import { describe, expect, it } from "vitest";
import { dayClass, weeks } from "./date-picker";

// Вигляд DatePicker (DESIGN.md, розділ 5) — правило дизайн-системи, не AC PM: тому без AC ID у назвах.

describe("weeks", () => {
  it("lays a month out in full weeks from Monday", () => {
    // Грудень 2026 починається у вівторок і закінчується в четвер.
    const rows = weeks("2026-12");
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.length === 7)).toBe(true);
    expect(rows[0][0]).toBeNull();
    expect(rows[0][1]).toBe("2026-12-01");
    expect(rows[4].slice(3)).toEqual(["2026-12-31", null, null, null]);
  });
});

describe("dayClass", () => {
  it("a picked day is primary and is not underlined even today", () => {
    expect(dayClass("start", null, true)).toContain("bg-primary");
    expect(dayClass("start", null, true)).not.toContain("underline");
  });

  it("a free day today is underlined; a closed day is hatched until it is picked", () => {
    expect(dayClass(null, null, true)).toContain("underline");
    const hatched = dayClass(null, { label: "already closed: Winter break", hatch: "full" }, false);
    expect(hatched).toContain("repeating-linear-gradient");
    expect(dayClass("single", { label: "already closed: Winter break", hatch: "full" }, false)).not.toContain(
      "repeating-linear-gradient",
    );
  });

  it("a preview is dashed and not part of the selection", () => {
    expect(dayClass("preview", null, true)).toContain("border-dashed");
    expect(dayClass("preview", null, true)).toContain("underline");
  });
});
