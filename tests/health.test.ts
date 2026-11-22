// D0: /api/health відрізняє «база відповіла» від «база недоступна, призупинена чи ключ хибний».
import { describe, expect, it } from "vitest";
import {
  appEnvFrom,
  classifyDbProbe,
  classifySchemaProbe,
  configProblemFromDbReason,
  supabaseConfigProblem,
  supabaseRefFromUrl,
} from "@/lib/health";

describe("classifyDbProbe (/api/health)", () => {
  it("рахує базу живою, коли запит пройшов або Postgres відмовив у правах (42501)", () => {
    expect(classifyDbProbe({ status: 200, error: null })).toEqual({ db: "ok", reason: "" });
    expect(classifyDbProbe({ status: 401, error: { code: "42501", message: "permission denied for table profiles" } })).toEqual({
      db: "ok",
      reason: "",
    });
    expect(classifyDbProbe({ status: 400, error: { code: "PGRST100", message: "bad filter" } }).db).toBe("ok");
  });

  it("рахує базу недоступною, коли Postgres відповів, але запитів не обслуговує (класи 08, 53, 57)", () => {
    expect(classifyDbProbe({ status: 503, error: { code: "08006", message: "connection failure" } })).toEqual({
      db: "down",
      reason: "status-503-08006",
    });
    expect(classifyDbProbe({ status: 400, error: { code: "53300", message: "too many connections" } })).toEqual({
      db: "down",
      reason: "status-400-53300",
    });
    expect(classifyDbProbe({ status: 400, error: { code: "57P03", message: "the database system is starting up" } })).toEqual({
      db: "down",
      reason: "status-400-57P03",
    });
  });

  it("рахує базу недоступною на будь-який 5xx, навіть із кодом, що інакше означав би «відповіла»", () => {
    expect(classifyDbProbe({ status: 500, error: { code: "PGRST116", message: "server error" } })).toEqual({
      db: "down",
      reason: "status-500-PGRST116",
    });
    expect(classifyDbProbe({ status: 500, error: { code: "42501", message: "permission denied" } })).toEqual({
      db: "down",
      reason: "status-500-42501",
    });
    expect(classifyDbProbe({ status: 502, error: null })).toEqual({ db: "down", reason: "status-502" });
  });

  it("повідомляє «paused», коли Supabase відповідає 540 (безкоштовний проєкт призупинено)", () => {
    expect(classifyDbProbe({ status: 540, error: { message: "project paused" } })).toEqual({ db: "down", reason: "paused" });
  });

  it("повідомляє про хибний публічний ключ", () => {
    expect(classifyDbProbe({ status: 401, error: { message: "Invalid API key" } })).toEqual({
      db: "down",
      reason: "invalid-api-key",
    });
  });

  it("повідомляє код, коли PostgREST не дістає до бази або мережі немає", () => {
    expect(classifyDbProbe({ status: 503, error: { code: "PGRST002", message: "schema cache" } })).toEqual({
      db: "down",
      reason: "status-503-PGRST002",
    });
    expect(classifyDbProbe({ status: 0, error: { message: "fetch failed" } })).toEqual({ db: "down", reason: "status-0" });
  });
});

describe("classifySchemaProbe (/api/health, поле schema)", () => {
  it("повертає версію останньої міграції без причини", () => {
    expect(classifySchemaProbe({ data: "20261117081842", status: 200, error: null })).toEqual({
      schema: "20261117081842",
      reason: "",
    });
  });

  it("пише код помилки в reason, а без коду — статус HTTP", () => {
    expect(classifySchemaProbe({ data: null, status: 404, error: { code: "PGRST202", message: "not found" } })).toEqual({
      schema: null,
      reason: "schema-PGRST202",
    });
    expect(classifySchemaProbe({ data: null, status: 0, error: { message: "fetch failed" } })).toEqual({
      schema: null,
      reason: "schema-status-0",
    });
  });

  it("рахує таймаут таймаутом, а порожню чи нечислову версію — «schema-empty»", () => {
    expect(classifySchemaProbe({ data: null, status: 0, error: { message: "aborted" } }, true).reason).toBe("schema-timeout");
    expect(classifySchemaProbe({ data: null, status: 200, error: null }).reason).toBe("schema-empty");
    expect(classifySchemaProbe({ data: "v1", status: 200, error: null }).reason).toBe("schema-empty");
  });
});

describe("supabaseRefFromUrl і appEnvFrom (/api/health, поля supabaseRef і appEnv, WS11)", () => {
  it("бере ref проєкту з адреси Supabase, локальну базу називає local, решту — null", () => {
    expect(supabaseRefFromUrl("https://tgvhqyboeeusptbjskio.supabase.co")).toBe("tgvhqyboeeusptbjskio");
    expect(supabaseRefFromUrl("https://tgvhqyboeeusptbjskio.supabase.co/")).toBe("tgvhqyboeeusptbjskio");
    expect(supabaseRefFromUrl("http://127.0.0.1:54321")).toBe("local");
    expect(supabaseRefFromUrl("http://localhost:54321")).toBe("local");
    expect(supabaseRefFromUrl("https://example.com")).toBeNull();
    expect(supabaseRefFromUrl("https://short.supabase.co")).toBeNull();
    expect(supabaseRefFromUrl("не адреса")).toBeNull();
    expect(supabaseRefFromUrl(undefined)).toBeNull();
  });

  it("віддає APP_ENV лише коротким словом, інакше null", () => {
    expect(appEnvFrom("staging")).toBe("staging");
    expect(appEnvFrom(" staging ")).toBe("staging");
    expect(appEnvFrom(undefined)).toBeNull();
    expect(appEnvFrom("")).toBeNull();
    expect(appEnvFrom("Staging with spaces")).toBeNull();
    expect(appEnvFrom("x".repeat(40))).toBeNull();
  });
});

describe("supabaseConfigProblem і configProblemFromDbReason (/api/health, поле config, WS11)", () => {
  it("називає змінну, якої бракує чи яка не схожа на адресу Supabase; придатні — null", () => {
    expect(supabaseConfigProblem(undefined, "k")).toEqual({ variable: "NEXT_PUBLIC_SUPABASE_URL", problem: "missing" });
    expect(supabaseConfigProblem("  ", "k")).toEqual({ variable: "NEXT_PUBLIC_SUPABASE_URL", problem: "missing" });
    expect(supabaseConfigProblem("not a url", "k")).toEqual({ variable: "NEXT_PUBLIC_SUPABASE_URL", problem: "invalid" });
    expect(supabaseConfigProblem("ftp://abcdefghijklmnopqrst.supabase.co", "k")).toEqual({
      variable: "NEXT_PUBLIC_SUPABASE_URL",
      problem: "invalid",
    });
    // Власний домен Supabase чи інший хост — не invalid: health перевірить його запитом.
    expect(supabaseConfigProblem("https://db.example.com", "k")).toBeNull();
    expect(supabaseConfigProblem("https://abcdefghijklmnopqrst.supabase.co", "")).toEqual({
      variable: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      problem: "missing",
    });
    expect(supabaseConfigProblem("https://abcdefghijklmnopqrst.supabase.co", "k")).toBeNull();
    expect(supabaseConfigProblem("http://127.0.0.1:54321", "k")).toBeNull();
  });

  it("за причиною збою бази: мережа й таймаут — адреса, відхилений ключ — ключ, пауза й 5xx — не налаштування", () => {
    const url = { variable: "NEXT_PUBLIC_SUPABASE_URL", problem: "unreachable" };
    expect(configProblemFromDbReason("timeout")).toEqual(url);
    expect(configProblemFromDbReason("exception")).toEqual(url);
    expect(configProblemFromDbReason("status-0")).toEqual(url);
    expect(configProblemFromDbReason("status-0-ECONNREFUSED")).toEqual(url);
    expect(configProblemFromDbReason("invalid-api-key")).toEqual({
      variable: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      problem: "rejected",
    });
    expect(configProblemFromDbReason("paused")).toBeNull();
    expect(configProblemFromDbReason("status-503-53300")).toBeNull();
    expect(configProblemFromDbReason("status-00")).toBeNull();
  });
});
