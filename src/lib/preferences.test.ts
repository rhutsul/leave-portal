import { describe, expect, it } from "vitest";
import { isSidebarCollapsed, parseTheme, preferenceCookie, themeAttribute } from "./preferences";

describe("preferences cookies", () => {
  it("reads the theme cookie; a missing or broken value means System", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("Dark")).toBe("system");
  });

  it("sets data-theme only for an explicitly chosen theme", () => {
    expect(themeAttribute("light")).toBe("light");
    expect(themeAttribute("dark")).toBe("dark");
    expect(themeAttribute("system")).toBeUndefined();
  });

  it("treats only the value collapsed as a collapsed sidebar", () => {
    expect(isSidebarCollapsed("collapsed")).toBe(true);
    expect(isSidebarCollapsed("expanded")).toBe(false);
    expect(isSidebarCollapsed(undefined)).toBe(false);
  });

  it("writes a site-wide cookie for a year, or removes it for null", () => {
    expect(preferenceCookie("theme", "dark")).toBe("theme=dark; path=/; max-age=31536000; samesite=lax");
    expect(preferenceCookie("sidebar", null)).toBe("sidebar=; path=/; max-age=0; samesite=lax");
  });
});
