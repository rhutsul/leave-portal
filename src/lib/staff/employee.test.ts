// Працівники (вимога PM 07, D4, D10 impl-staff-management): перевірка введення як у базі, переклад відповіді бази й
// тексти AC.
import { describe, expect, it } from "vitest";
import {
  employeeFieldErrors,
  fieldOfMessage,
  messageOfDbError,
  readEmployeeFields,
  roleLabel,
  STAFF_MESSAGES,
  uuidOf,
} from "./employee";
import { loginErrorOf } from "./login";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

describe("employee fields", () => {
  it("AC-STAFF-01: reads the name and the email as the database stores them", () => {
    expect(readEmployeeFields(form({ full_name: "  Teacher Three ", email: " Teacher3@Example.test " }))).toEqual({
      name: "Teacher Three",
      email: "teacher3@example.test",
    });
  });

  it("AC-STAFF-01: checks the name and the email before sending, with the same rules as the database", () => {
    expect(employeeFieldErrors({ name: "Teacher Three", email: "teacher3@example.test" })).toEqual({
      name: null,
      email: null,
    });
    expect(employeeFieldErrors({ name: "", email: "not-an-email" })).toEqual({
      name: STAFF_MESSAGES.nameInvalid,
      email: STAFF_MESSAGES.emailInvalid,
    });
    expect(employeeFieldErrors({ name: "x".repeat(201), email: "a@b.c" }).name).toBe(STAFF_MESSAGES.nameInvalid);
  });

  it("AC-STAFF-11: shows a taken email under the email field", () => {
    expect(fieldOfMessage(STAFF_MESSAGES.emailTaken)).toBe("email");
    expect(fieldOfMessage(STAFF_MESSAGES.nameInvalid)).toBe("name");
    expect(fieldOfMessage(STAFF_MESSAGES.ownRole)).toBeNull();
  });
});

describe("answers of the database", () => {
  it("AC-STAFF-13: no right is the AC text, verbatim", () => {
    expect(messageOfDbError({ code: "42501", message: "permission denied" })).toBe(
      "Only an administrator can manage employees",
    );
  });

  it("AC-STAFF-18: the refusal to change one's own role comes from the database verbatim", () => {
    expect(messageOfDbError({ code: "P0001", message: "You cannot change your own role" })).toBe(
      "You cannot change your own role",
    );
    expect(STAFF_MESSAGES.ownRole).toBe("You cannot change your own role");
  });

  it("AC-STAFF-01: hides any other database error behind a general text", () => {
    expect(messageOfDbError({ code: "23505", message: "duplicate key value violates …" })).toBe(STAFF_MESSAGES.failed);
  });

  it("AC-STAFF-12: tells the employee who changes names and emails, verbatim", () => {
    expect(STAFF_MESSAGES.adminChangesNames).toBe("Only an administrator can change names and emails");
  });

  it("AC-STAFF-08: a banned sign-in becomes the deactivated message, anything else stays the general one", () => {
    expect(loginErrorOf({ code: "user_banned" })).toBe("deactivated");
    expect(loginErrorOf({ code: "invalid_credentials" })).toBe("invalid");
    expect(STAFF_MESSAGES.deactivated).toBe("Your account is deactivated. Contact the administrator");
  });
});

describe("helpers", () => {
  it("AC-STAFF-13: accepts only a real uuid from a form or an address", () => {
    expect(uuidOf("A0000000-0000-0000-0000-000000000004")).toBe("a0000000-0000-0000-0000-000000000004");
    expect(uuidOf("1; drop table")).toBeNull();
    expect(uuidOf(null)).toBeNull();
    expect(roleLabel("admin")).toBe("Administrator");
  });
});
