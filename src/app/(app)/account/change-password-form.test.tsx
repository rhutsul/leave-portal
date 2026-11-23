// Форма «Change password» (ADR 0011): як показано відповідь server action. DOM-середовища в репо немає, тож рендеримо
// renderToStaticMarkup, а відповідь дії підставляємо через useActionState. Без AC ID: вимог PM до фічі ще немає.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_CHANGE_PASSWORD, NO_PASSWORD_ERRORS, PASSWORD_MESSAGES as M, type ChangePasswordState } from "@/lib/account/password";

const h = vi.hoisted(() => ({ state: null as unknown, pending: false }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: (action: unknown, initial: unknown) => [h.state ?? initial, action, h.pending],
  };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { ChangePasswordForm } = await import("./change-password-form");

function render(state: ChangePasswordState | null) {
  h.state = state;
  return renderToStaticMarkup(<ChangePasswordForm />);
}

/** Поле `<input …>` за ім'ям. */
function input(html: string, name: string): string {
  const at = html.indexOf(`name="${name}"`);
  return html.slice(html.lastIndexOf("<input", at), html.indexOf(">", at) + 1);
}

beforeEach(() => {
  h.state = null;
  h.pending = false;
});

describe("ChangePasswordForm", () => {
  it("has three password fields with the right autocomplete and the hint under the new one", () => {
    const html = render(null);
    expect(input(html, "current_password")).toContain('autoComplete="current-password"');
    expect(input(html, "new_password")).toContain('autoComplete="new-password"');
    expect(input(html, "confirm_password")).toContain('autoComplete="new-password"');
    expect(input(html, "new_password")).toContain('type="password"');
    expect(html).toContain("At least 8 characters.");
    expect(html).toContain(">Change password<");
    expect(html).not.toContain('role="alert"');
  });

  it("shows a wrong current password under its field, linked by aria-describedby", () => {
    const html = render({ ...INITIAL_CHANGE_PASSWORD, errors: { ...NO_PASSWORD_ERRORS, current: M.currentWrong } });
    const field = input(html, "current_password");
    expect(field).toContain('aria-invalid="true"');
    const describedBy = /aria-describedby="([^"]+)"/.exec(field)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toContain(`id="${describedBy}"`);
    expect(html).toContain(M.currentWrong);
    expect(input(html, "new_password")).not.toContain('aria-invalid="');
  });

  it("shows a whole-action error in an alert", () => {
    const html = render({ ...INITIAL_CHANGE_PASSWORD, message: M.rateLimited });
    expect(html).toContain('role="alert"');
    expect(html).toContain(M.rateLimited);
  });

  it("confirms the change", () => {
    const html = render({ ...INITIAL_CHANGE_PASSWORD, done: true });
    expect(html).toContain("Password changed");
    expect(html).toContain('role="status"');
  });
});

describe("ChangePasswordForm while the change is in progress", () => {
  it("disables the fields, so the answer describes what was sent", () => {
    h.pending = true;
    const html = render(null);
    for (const name of ["current_password", "new_password", "confirm_password"]) {
      expect(input(html, name)).toMatch(/\sdisabled=""/);
    }
  });
});
