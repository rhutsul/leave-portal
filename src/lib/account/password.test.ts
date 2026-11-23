// Зміна власного пароля (ADR 0011): правила перевірки й тексти помилок Auth. Без AC ID у назвах: вимог PM до фічі ще
// немає (requirements/product.md, «later»), а чужий AC дав би вигадане покриття.
import { describe, expect, it } from "vitest";
import {
  hasPasswordErrors,
  NO_PASSWORD_ERRORS,
  passwordFieldErrors,
  PASSWORD_MESSAGES as M,
  readPasswordFields,
  updateFailure,
  verifyFailure,
} from "./password";

const ok = { current: "old-secret-1", next: "new-secret-2", confirm: "new-secret-2" };

describe("passwordFieldErrors", () => {
  it("accepts a valid change", () => {
    expect(passwordFieldErrors(ok)).toEqual(NO_PASSWORD_ERRORS);
    expect(hasPasswordErrors(passwordFieldErrors(ok))).toBe(false);
  });

  it("asks for every empty field", () => {
    expect(passwordFieldErrors({ current: "", next: "", confirm: "" })).toEqual({
      current: M.currentMissing,
      next: M.nextMissing,
      confirm: M.confirmMissing,
    });
  });

  it("needs at least 8 characters, counting an emoji as one", () => {
    expect(passwordFieldErrors({ ...ok, next: "1234567", confirm: "1234567" }).next).toBe(M.nextShort);
    expect(passwordFieldErrors({ ...ok, next: "12345678", confirm: "12345678" }).next).toBeNull();
    expect(passwordFieldErrors({ ...ok, next: "123456🙂", confirm: "123456🙂" }).next).toBe(M.nextShort);
  });

  it("rejects more than 72 bytes, the limit of Auth", () => {
    const long = "a".repeat(73);
    expect(passwordFieldErrors({ ...ok, next: long, confirm: long }).next).toBe(M.nextLong);
    const edge = "a".repeat(72);
    expect(passwordFieldErrors({ ...ok, next: edge, confirm: edge }).next).toBeNull();
    // Кирилична літера — 2 байти UTF-8: 37 літер — 74 байти.
    const cyr = "ж".repeat(37);
    expect(passwordFieldErrors({ ...ok, next: cyr, confirm: cyr }).next).toBe(M.nextLong);
  });

  it("rejects a new password equal to the current one", () => {
    expect(passwordFieldErrors({ current: "same-secret", next: "same-secret", confirm: "same-secret" }).next).toBe(M.nextSame);
  });

  it("reports a confirmation mismatch only when the new password itself is fine", () => {
    expect(passwordFieldErrors({ ...ok, confirm: "new-secret-3" }).confirm).toBe(M.confirmMismatch);
    expect(passwordFieldErrors({ ...ok, next: "short", confirm: "other" }).confirm).toBeNull();
  });
});

describe("readPasswordFields", () => {
  it("reads the three fields as typed, spaces included", () => {
    const form = new FormData();
    form.set("current_password", " old ");
    form.set("new_password", "new-secret-2 ");
    form.set("confirm_password", "new-secret-2 ");
    expect(readPasswordFields(form)).toEqual({ current: " old ", next: "new-secret-2 ", confirm: "new-secret-2 " });
    expect(readPasswordFields(new FormData())).toEqual({ current: "", next: "", confirm: "" });
  });
});

describe("verifyFailure", () => {
  it("shows one general text under Current password, without Auth details", () => {
    const wrong = verifyFailure({ code: "invalid_credentials", status: 400 });
    expect(wrong).toEqual({ errors: { ...NO_PASSWORD_ERRORS, current: M.currentWrong }, message: "", done: false });
    expect(verifyFailure({ code: "email_not_confirmed", status: 400 }).errors.current).toBe(M.currentWrong);
  });

  it("names the rate limit and falls back to a general message", () => {
    expect(verifyFailure({ code: "over_request_rate_limit", status: 429 }).message).toBe(M.rateLimited);
    expect(verifyFailure({ status: 429 }).message).toBe(M.rateLimited);
    expect(verifyFailure({ code: "unexpected_failure", status: 500 }).message).toBe(M.failed);
  });
});

describe("updateFailure", () => {
  it("maps known Auth codes to their own texts", () => {
    expect(updateFailure({ code: "weak_password", status: 422 }).errors.next).toBe(M.nextWeak);
    expect(updateFailure({ code: "same_password", status: 422 }).errors.next).toBe(M.nextSame);
    expect(updateFailure({ code: "current_password_mismatch", status: 400 }).errors.current).toBe(M.currentWrong);
    expect(updateFailure({ code: "current_password_required", status: 400 }).errors.current).toBe(M.currentWrong);
    expect(updateFailure({ code: "reauthentication_needed", status: 400 }).message).toBe(M.reauthenticate);
    expect(updateFailure({ code: "over_request_rate_limit", status: 429 }).message).toBe(M.rateLimited);
  });

  it("hides anything else behind a general message", () => {
    const failed = updateFailure({ code: "unexpected_failure", status: 500 });
    expect(failed).toEqual({ errors: NO_PASSWORD_ERRORS, message: M.failed, done: false });
  });
});
