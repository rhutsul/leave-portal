// Одноразове посилання (вимога PM 07, D2 impl-staff-management): строк, адреса з токеном у фрагменті й тексти.
import { describe, expect, it } from "vitest";
import { isTokenShape, LINK_MESSAGES, linkStateMessage, linkValidUntil, oneTimeLinkUrl, tokenFromHash } from "./link";

const TOKEN = "a".repeat(20) + "-_" + "B".repeat(21);

describe("one-time link", () => {
  it("AC-STAFF-01: a link created on 2026-12-01 is valid until 2026-12-08, including the day it was created", () => {
    expect(linkValidUntil("2026-12-01")).toBe("2026-12-08");
    expect(linkValidUntil("2026-12-28")).toBe("2027-01-04");
  });

  it("AC-STAFF-01: puts the token in the fragment, so it never reaches the server in a page request", () => {
    const url = oneTimeLinkUrl("https://portal.example.test/", TOKEN);
    expect(url).toBe(`https://portal.example.test/auth/set-password#token=${TOKEN}`);
    expect(new URL(url).search).toBe("");
  });

  it("AC-STAFF-02: reads the token back from the fragment and refuses anything that is not a token", () => {
    expect(isTokenShape(TOKEN)).toBe(true);
    expect(tokenFromHash(`#token=${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromHash("#token=short")).toBeNull();
    expect(tokenFromHash("")).toBeNull();
  });

  it("AC-STAFF-03: an expired link says so verbatim; a used or replaced link gets its own text", () => {
    expect(linkStateMessage("expired")).toBe("This link has expired. Ask the administrator for a new one");
    expect(linkStateMessage("invalid")).toBe(LINK_MESSAGES.invalid);
    expect(LINK_MESSAGES.passwordSet).toBe("Your password is set");
  });
});
