// Хто куди потрапляє без входу (ADR 0007): гість на `/` — на landing `/welcome`, на будь-якому іншому захищеному
// шляху — на вхід, як і раніше. Вигляд і маршрут за розробником, тож без AC ID у назвах.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims } }),
}));

const { guestRedirect, updateSession } = await import("./proxy");

describe("guestRedirect", () => {
  it("sends a guest who opens the root to the landing page", () => {
    expect(guestRedirect("/")).toBe("/welcome");
  });

  it("lets a guest see the landing page itself", () => {
    expect(guestRedirect("/welcome")).toBeNull();
  });

  it("keeps only the exact landing path public", () => {
    expect(guestRedirect("/welcome-back")).toBe("/login");
    expect(guestRedirect("/welcome/x")).toBe("/login");
  });

  it("sends a guest on any other protected path to sign in", () => {
    for (const path of ["/requests", "/requests/new", "/calendar", "/decisions", "/balances", "/design"]) {
      expect(guestRedirect(path)).toBe("/login");
    }
  });

  it("does not open paths that only start like a public one", () => {
    expect(guestRedirect("/login-x")).toBe("/login");
    expect(guestRedirect("/authors")).toBe("/login");
  });

  it("keeps sign-in, auth callbacks and the health check public", () => {
    for (const path of ["/login", "/auth/callback", "/api/health"]) {
      expect(guestRedirect(path)).toBeNull();
    }
  });
});

describe("updateSession", () => {
  beforeEach(() => getClaims.mockReset());

  const visit = (path: string) => updateSession(new NextRequest(new URL(path, "https://portal.example.test")));

  it("redirects a guest on the root to the landing page", async () => {
    getClaims.mockResolvedValue({ data: null });
    const response = await visit("/");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://portal.example.test/welcome");
  });

  it("redirects a guest on the calendar to sign in", async () => {
    getClaims.mockResolvedValue({ data: null });
    const response = await visit("/calendar");
    expect(response.headers.get("location")).toBe("https://portal.example.test/login");
  });

  it("lets a guest open the landing page", async () => {
    getClaims.mockResolvedValue({ data: null });
    const response = await visit("/welcome");
    expect(response.headers.get("location")).toBeNull();
  });

  it("lets a signed-in user open the root and the landing page", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    expect((await visit("/")).headers.get("location")).toBeNull();
    expect((await visit("/welcome")).headers.get("location")).toBeNull();
  });
});
