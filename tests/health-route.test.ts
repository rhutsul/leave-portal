// D0: GET /api/health — код відповіді за станом бази і таймаут проби. supabase-js підмінено: без мережі.
import { afterEach, describe, expect, it, vi } from "vitest";

type Probe = { error: { code?: string; message?: string } | null; status: number };
const probe = vi.hoisted(() => ({
  answer: ((): Promise<Probe> => Promise.resolve({ error: null, status: 200 })) as (signal: AbortSignal) => Promise<Probe>,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ limit: () => ({ abortSignal: (signal: AbortSignal) => probe.answer(signal) }) }) }),
  }),
}));

const { GET } = await import("@/app/api/health/route");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("відповідає 200 і db «ok», коли база відповіла", async () => {
    probe.answer = () => Promise.resolve({ error: { code: "42501", message: "permission denied" }, status: 401 });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, db: "ok", reason: "" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("відповідає 503, коли база не обслуговує запитів", async () => {
    probe.answer = () => Promise.resolve({ error: { code: "53300", message: "too many connections" }, status: 503 });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, db: "down", reason: "status-503-53300" });
  });

  it("відповідає 503 «timeout», коли база не відповіла вчасно", async () => {
    // Сигнал уже спрацював: так supabase-js повертає перерваний запит — помилкою зі status 0.
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort(new DOMException("timeout", "TimeoutError")));
    probe.answer = (signal) =>
      Promise.resolve(signal.aborted ? { error: { message: "AbortError: aborted" }, status: 0 } : { error: null, status: 200 });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, db: "down", reason: "timeout" });
  });

  it("відповідає 503 «exception», коли проба кинула виняток не через таймаут", async () => {
    probe.answer = () => Promise.reject(new Error("boom"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, db: "down", reason: "exception" });
  });
});
