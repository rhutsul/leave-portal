// Зміна власного пароля (ADR 0011), server action changePassword: порядок кроків і що НЕ відбувається при відмові.
// Підмінено лише зовнішнє: серверний клієнт Supabase (сесія користувача), тимчасовий клієнт supabase-js (перевірка
// поточного пароля) і next/navigation. Без AC ID у назвах: AC-STAFF-16, -17 ще не в openspec/specs.
import { beforeEach, describe, expect, it, vi } from "vitest";

type AuthError = { code?: string; status?: number } | null;

const USER = "a0000000-0000-0000-0000-000000000001";

const h = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  probeUser: "",
  probeError: null as { code?: string; status?: number } | null,
  updateError: null as { code?: string; status?: number } | null,
  createAuthClient: vi.fn(),
  signInWithPassword: vi.fn(),
  probeSignOut: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect ${url}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: h.claims ? { claims: h.claims } : null, error: null }),
      updateUser: async (attrs: unknown) => {
        h.updateUser(attrs);
        return { data: { user: null }, error: h.updateError };
      },
      signOut: async (options: unknown) => {
        h.signOut(options);
        return { error: null };
      },
    },
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    h.createAuthClient(...args);
    return {
      auth: {
        signInWithPassword: async (credentials: unknown) => {
          h.signInWithPassword(credentials);
          return h.probeError
            ? { data: { user: null, session: null }, error: h.probeError as AuthError }
            : { data: { user: { id: h.probeUser }, session: {} }, error: null };
        },
        signOut: async (options: unknown) => {
          h.probeSignOut(options);
          return { error: null };
        },
      },
    };
  },
}));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));

const { changePassword } = await import("@/app/(app)/account/actions");
const { INITIAL_CHANGE_PASSWORD, PASSWORD_MESSAGES: M } = await import("@/lib/account/password");

function form(current: string, next: string, confirm = next) {
  const data = new FormData();
  data.set("current_password", current);
  data.set("new_password", next);
  data.set("confirm_password", confirm);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.claims = { sub: USER, email: "uat-account@example.test" };
  h.probeUser = USER;
  h.probeError = null;
  h.updateError = null;
});

describe("changePassword", () => {
  it("changes the password, closes the check session and signs out other sessions", async () => {
    const state = await changePassword(INITIAL_CHANGE_PASSWORD, form("old-secret-1", "new-secret-2"));
    expect(state).toEqual({ ...INITIAL_CHANGE_PASSWORD, done: true });
    expect(h.signInWithPassword).toHaveBeenCalledWith({ email: "uat-account@example.test", password: "old-secret-1" });
    // Тимчасовий клієнт — публічний ключ і без збереження сесії: куки користувача він не чіпає.
    const [, key, options] = h.createAuthClient.mock.calls[0];
    expect(key).toBe(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    expect(options).toMatchObject({ auth: { persistSession: false, autoRefreshToken: false } });
    expect(h.probeSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(h.updateUser).toHaveBeenCalledWith({ password: "new-secret-2", current_password: "old-secret-1" });
    expect(h.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("checks the input before calling Auth", async () => {
    const state = await changePassword(INITIAL_CHANGE_PASSWORD, form("old-secret-1", "short", "short"));
    expect(state.errors.next).toBe(M.nextShort);
    expect(state.done).toBe(false);
    expect(h.createAuthClient).not.toHaveBeenCalled();
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it("does not change anything when the current password is wrong", async () => {
    h.probeError = { code: "invalid_credentials", status: 400 };
    const state = await changePassword(INITIAL_CHANGE_PASSWORD, form("wrong-secret", "new-secret-2"));
    expect(state.errors.current).toBe(M.currentWrong);
    expect(state.done).toBe(false);
    expect(h.updateUser).not.toHaveBeenCalled();
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it("does not change anything when the check signs in someone else", async () => {
    h.probeUser = "a0000000-0000-0000-0000-000000000002";
    const state = await changePassword(INITIAL_CHANGE_PASSWORD, form("old-secret-1", "new-secret-2"));
    expect(state.message).toBe(M.failed);
    expect(h.probeSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it("shows the Auth refusal and keeps other sessions", async () => {
    h.updateError = { code: "weak_password", status: 422 };
    const state = await changePassword(INITIAL_CHANGE_PASSWORD, form("old-secret-1", "new-secret-2"));
    expect(state.errors.next).toBe(M.nextWeak);
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to sign in", async () => {
    h.claims = null;
    await expect(changePassword(INITIAL_CHANGE_PASSWORD, form("old-secret-1", "new-secret-2"))).rejects.toThrow(
      "redirect /login",
    );
    expect(h.createAuthClient).not.toHaveBeenCalled();
  });
});
