// D0: /api/health відрізняє «база відповіла» від «база недоступна, призупинена чи ключ хибний».
import { describe, expect, it } from "vitest";
import { classifyDbProbe } from "@/lib/health";

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
