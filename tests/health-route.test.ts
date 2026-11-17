// D0: GET /api/health — код відповіді за станом бази і таймаут проби. supabase-js підмінено: без мережі.
import { afterEach, describe, expect, it, vi } from "vitest";

type Probe = { error: { code?: string; message?: string } | null; status: number };
type Version = Probe & { data: string | null };
const probe = vi.hoisted(() => ({
  answer: ((): Promise<Probe> => Promise.resolve({ error: null, status: 200 })) as (signal: AbortSignal) => Promise<Probe>,
  version: ((): Promise<Version> => Promise.resolve({ data: "20261117081842", error: null, status: 200 })) as (
    signal: AbortSignal,
  ) => Promise<Version>,
}));
const defaults = { answer: probe.answer, version: probe.version };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ limit: () => ({ abortSignal: (signal: AbortSignal) => probe.answer(signal) }) }) }),
    rpc: (name: string) => {
      expect(name).toBe("schema_version");
      return { abortSignal: (signal: AbortSignal) => probe.version(signal) };
    },
  }),
}));

const { GET } = await import("@/app/api/health/route");

afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(probe, defaults);
});

describe("GET /api/health", () => {
  it("відповідає 200 і db «ok», коли база відповіла", async () => {
    probe.answer = () => Promise.resolve({ error: { code: "42501", message: "permission denied" }, status: 401 });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, db: "ok", schema: "20261117081842", reason: "" });
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

  it("лишає 200, коли версію схеми не прочитано, і пише причину в reason (функції ще немає — міграцію не застосовано)", async () => {
    probe.version = () =>
      Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function" }, status: 404 });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, db: "ok", schema: null, reason: "schema-PGRST202" });
  });

  it("лишає 200 «schema-exception», коли виклик версії кинув виняток", async () => {
    probe.version = () => Promise.reject(new Error("boom"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, db: "ok", schema: null, reason: "schema-exception" });
  });

  it("лишає 200, коли база відповіла вчасно, а версія схеми — ні: таймаут версії не стає таймаутом бази", async () => {
    const timer = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(timer.signal);
    // Версія відповідає лише тоді, коли спрацював таймаут — як supabase-js на перерваний запит.
    probe.version = (signal) =>
      new Promise((resolve) =>
        signal.addEventListener("abort", () => resolve({ data: null, error: { message: "AbortError" }, status: 0 })),
      );
    const pending = GET();
    await new Promise((resolve) => setTimeout(resolve, 0));
    timer.abort();
    const res = await pending;
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, db: "ok", schema: null, reason: "schema-timeout" });
  });

  it("у reason — причина бази, коли база недоступна, навіть якщо й версію не прочитано", async () => {
    probe.answer = () => Promise.resolve({ error: { code: "53300", message: "too many connections" }, status: 503 });
    probe.version = () => Promise.resolve({ data: null, error: { code: "53300", message: "too many connections" }, status: 503 });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, db: "down", schema: null, reason: "status-503-53300" });
  });
});
