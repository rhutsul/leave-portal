import { describe, expect, it } from "vitest";
import { countUpText, highlightTarget } from "./motion";

// Рух у застосунку (DESIGN.md, розділ 11) — вигляд, а не AC PM: тому без AC ID у назвах.

describe("highlightTarget", () => {
  it("moves to the clicked item while the address is still the one it was clicked from", () => {
    expect(highlightTarget({ href: "/decisions", from: "/balances?year=2026" }, "/balances?year=2026", "/balances")).toBe(
      "/decisions",
    );
  });

  it("follows the path once the navigation is done or another one superseded it", () => {
    // Перехід завершився.
    expect(highlightTarget({ href: "/decisions", from: "/balances" }, "/decisions", "/decisions")).toBe("/decisions");
    // Поки йшов перехід на /decisions, змінили рік на /balances — шлях той самий, адреса інша.
    expect(highlightTarget({ href: "/decisions", from: "/balances?year=2026" }, "/balances?year=2027", "/balances")).toBe(
      "/balances",
    );
    expect(highlightTarget(null, "/requests", "/requests")).toBe("/requests");
  });
});

describe("countUpText", () => {
  it("starts at zero and ends exactly at the target", () => {
    expect(countUpText(18, 0, 2)).toBe("0.00");
    expect(countUpText(18, 1, 2)).toBe("18.00");
    expect(countUpText(0.5, 1, 2)).toBe("0.50");
  });

  it("eases out: more than half of the way at the middle", () => {
    expect(Number(countUpText(20, 0.5, 2))).toBeGreaterThan(10);
  });

  it("never shows a signed zero for negative targets", () => {
    expect(countUpText(-1.5, 0.0001, 2)).toBe("0.00");
    expect(countUpText(-1.5, 1, 2)).toBe("-1.50");
  });

  it("clamps the share outside 0…1", () => {
    expect(countUpText(5, 2, 2)).toBe("5.00");
    expect(countUpText(5, -1, 2)).toBe("0.00");
  });
});
