import { describe, expect, it } from "vitest";
import { countUpText, highlightTarget, navSection } from "./motion";

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

describe("navSection", () => {
  const hrefs = ["/", "/requests", "/decisions", "/balances", "/calendar"];

  it("highlights the item itself on its own page", () => {
    expect(navSection("/requests", hrefs)).toBe("/requests");
    expect(navSection("/", hrefs)).toBe("/");
  });

  it("highlights the parent item on a page that has no item of its own", () => {
    // «New request» більше не пункт меню: форма — частина розділу «My requests».
    expect(navSection("/requests/new", hrefs)).toBe("/requests");
    expect(navSection("/calendar/manage", hrefs)).toBe("/calendar");
  });

  it("picks the deepest parent when several items are parents", () => {
    expect(navSection("/requests/new/step", ["/requests", "/requests/new"])).toBe("/requests/new");
    expect(navSection("/requests/new/step", ["/requests/new", "/requests"])).toBe("/requests/new");
  });

  it("does not treat Overview as the parent of every page or match a mere prefix", () => {
    expect(navSection("/design", hrefs)).toBeNull();
    expect(navSection("/requestsx", hrefs)).toBeNull();
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
