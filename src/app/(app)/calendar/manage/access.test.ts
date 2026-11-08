// Хто відкриває сторінку зміни шкільного календаря /calendar/manage — контракт design.md D5 зміни
// impl-school-calendar. Тести з тексту AC (openspec/specs/school-calendar/spec.md) до коду: maker ≠ checker.
// Роль — з profiles.role (employee, manager, admin); null — профілю не знайдено.
import { describe, expect, it } from "vitest";
import { manageAccess } from "./access";

const DENIED = { allowed: false, message: "Only an administrator can change the school calendar" };

describe("access to /calendar/manage", () => {
  it('AC-CAL-12: teacher1@ with only the employee role sees "Only an administrator can change the school calendar"', () => {
    expect(manageAccess("employee")).toEqual(DENIED);
  });

  it("AC-CAL-12: a manager is refused with the same message", () => {
    expect(manageAccess("manager")).toEqual(DENIED);
  });

  it("AC-CAL-12: without a known role the page is refused too", () => {
    expect(manageAccess(null)).toEqual(DENIED);
    expect(manageAccess("Admin")).toEqual(DENIED);
  });

  it("AC-CAL-12: only an administrator opens the page", () => {
    expect(manageAccess("admin")).toEqual({ allowed: true });
  });
});
