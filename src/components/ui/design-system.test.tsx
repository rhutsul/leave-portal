import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LEAVE_TYPES, RECORD_STATUSES, type LeaveType, type RecordStatus } from "@/lib/leave/request";
import { parseTheme, themeAttribute } from "@/lib/preferences";
import { Button } from "./button";
import { CalendarDay } from "./calendar-day";
import { DialogFooter } from "./dialog";
import { LeaveTypeTag } from "./leave-type-tag";
import { PasswordInput } from "./password-input";
import { splitRowMenuItems } from "./row-menu";
import { StatusBadge } from "./status-badge";

// Правила дизайн-системи (DESIGN.md), а не AC PM: тому без AC ID у назвах.

const classes = (html: string) => html.match(/class="([^"]*)"/)?.[1].split(" ") ?? [];

describe("Button", () => {
  it("link variant has no button height or padding at any size", () => {
    for (const size of ["default", "xs", "sm", "lg"] as const) {
      const list = classes(renderToStaticMarkup(<Button variant="link" size={size} />));
      expect(list).toEqual(expect.arrayContaining(["h-auto", "px-0"]));
      // Висота й відступи розміру, зокрема відступ біля іконки (has-data-[icon=…]:pr-3).
      expect(list.filter((c) => /(^|:)(h-\d|p[xlr]-[1-9])/.test(c))).toEqual([]);
    }
  });

  it("other variants keep the size", () => {
    expect(classes(renderToStaticMarkup(<Button />))).toEqual(expect.arrayContaining(["h-9", "px-3.5"]));
  });
});

describe("DialogFooter", () => {
  it("bleeds exactly over the p-5 padding of DialogContent", () => {
    expect(classes(renderToStaticMarkup(<DialogFooter />))).toEqual(
      expect.arrayContaining(["-mx-5", "-mb-5", "px-5"]),
    );
  });
});

describe("StatusBadge and LeaveTypeTag", () => {
  it("always show the status as its word", () => {
    for (const status of Object.keys(RECORD_STATUSES) as RecordStatus[]) {
      expect(renderToStaticMarkup(<StatusBadge status={status} />)).toContain(`>${RECORD_STATUSES[status]}<`);
    }
  });

  it("always show the leave type as its word in both variants", () => {
    for (const type of Object.keys(LEAVE_TYPES) as LeaveType[]) {
      expect(renderToStaticMarkup(<LeaveTypeTag type={type} />)).toContain(LEAVE_TYPES[type]);
      expect(renderToStaticMarkup(<LeaveTypeTag type={type} variant="inline" />)).toContain(LEAVE_TYPES[type]);
    }
  });

  it("shows an unknown leave type as is", () => {
    expect(renderToStaticMarkup(<LeaveTypeTag type="other" />)).toBe("<span>other</span>");
  });
});

describe("CalendarDay", () => {
  it("days closed by the school cannot be picked; days without hours stay clickable to explain why", () => {
    expect(renderToStaticMarkup(<CalendarDay day={3} state="closed" />)).toMatch(/\sdisabled=""/);
    // День без годин — кнопка: натискання показує повідомлення з AC-LEAVE-06, а не мовчить.
    for (const state of ["off", "free"] as const) {
      expect(renderToStaticMarkup(<CalendarDay day={3} state={state} />)).not.toMatch(/\sdisabled=""/);
    }
  });

  it("marks only the selected day as pressed", () => {
    expect(renderToStaticMarkup(<CalendarDay day={3} state="selected" />)).toContain('aria-pressed="true"');
    expect(renderToStaticMarkup(<CalendarDay day={3} state="record" />)).toContain('aria-pressed="false"');
  });
});

describe("RowMenu", () => {
  it("puts the dangerous actions last and keeps the order of the others", () => {
    const { safe, danger } = splitRowMenuItems([
      { label: "View details" },
      { label: "Cancel record", destructive: true },
      { label: "Change hours" },
    ]);
    expect(safe.map((i) => i.label)).toEqual(["View details", "Change hours"]);
    expect(danger.map((i) => i.label)).toEqual(["Cancel record"]);
  });
});

describe("Theme (ADR 0005)", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const declarations = (block: string | undefined) =>
    (block ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("--") || line.startsWith("color-scheme"));

  it("the system dark theme and the chosen dark theme set the same tokens", () => {
    const system = css.match(/:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/)?.[1];
    const chosen = css.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)?.[1];
    expect(declarations(system).length).toBeGreaterThan(40);
    expect(declarations(chosen)).toEqual(declarations(system));
  });

  it("every light token has a dark value", () => {
    const light = css.match(/^:root \{([^}]*)\}/m)?.[1];
    const dark = css.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)?.[1];
    const names = (block: string | undefined) =>
      declarations(block)
        .map((d) => d.split(":")[0])
        .filter((n) => !n.startsWith("--duration"));
    expect(names(dark)).toEqual(expect.arrayContaining(names(light)));
  });

  it("only Light and Dark are written to <html>; anything else follows the system", () => {
    expect(themeAttribute(parseTheme("dark"))).toBe("dark");
    expect(themeAttribute(parseTheme("light"))).toBe("light");
    expect(themeAttribute(parseTheme("system"))).toBeUndefined();
    expect(themeAttribute(parseTheme("purple"))).toBeUndefined();
    expect(themeAttribute(parseTheme(undefined))).toBeUndefined();
  });
});

describe("PasswordInput", () => {
  it("starts hidden, with a labelled toggle that is not pressed", () => {
    const html = renderToStaticMarkup(<PasswordInput id="p" name="password" />);
    expect(html).toContain('type="password"');
    expect(html).toContain('aria-label="Show password"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('type="button"');
  });
});
