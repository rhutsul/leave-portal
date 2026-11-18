// scripts/smoke.mjs проти макета проду: коміт і версія схеми (рев'ю WS9, пункт 3). Тест інструмента — без AC ID.
// Макет — HTTP-сервер у цьому ж процесі, тож скрипт запускаємо асинхронно (spawnSync заблокував би сервер).
// SMOKE_PAUSE_MS=1 — без 20-секундних пауз; SMOKE_MIGRATIONS_DIR — тимчасова тека з «міграціями розгорнутого коміту».
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { repoRoot } from "./run-script";

const SHA = "a".repeat(40);
const NEWEST = "20261117081842";

/** Відповіді /api/health по черзі; остання повторюється. */
let answers: Array<Record<string, unknown>> = [];
let calls = 0;
/** WS11: значення заголовка обходу, яке вимагає макет (порожньо — захисту немає), і що прийшло в останньому запиті. */
let requiredBypass = "";
let seenBypass: string | undefined;
let server: Server;
let base = "";
let migrations = "";

beforeAll(async () => {
  migrations = mkdtempSync(path.join(os.tmpdir(), "smoke-migrations-"));
  for (const f of ["20261115122625_older.sql", `${NEWEST}_schema_version.sql`, "README.md"]) {
    writeFileSync(path.join(migrations, f), "-- test\n");
  }
  server = createServer((req, res) => {
    seenBypass = req.headers["x-vercel-protection-bypass"] as string | undefined;
    if (requiredBypass && seenBypass !== requiredBypass) {
      // Як стіна входу Vercel (Deployment Protection) для захищеного деплою без перепустки.
      res.writeHead(401, { "content-type": "text/html" }).end("Authentication Required — Vercel");
      return;
    }
    if (req.url === "/") {
      res.writeHead(307, { location: "/welcome" }).end();
    } else if (req.url === "/login") {
      res.writeHead(200).end('<input type="password">');
    } else if (req.url === "/api/health") {
      const body = answers[Math.min(calls++, answers.length - 1)];
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  rmSync(migrations, { recursive: true, force: true });
});

const health = (schema: string | null, sha = SHA) => ({
  ok: true,
  sha,
  env: "production",
  db: "ok",
  schema,
  reason: schema ? "" : "schema-PGRST202",
});

function smoke(...responses: Array<Record<string, unknown>>) {
  return smokeWith({}, ...responses);
}

function smokeWith(extraEnv: Record<string, string>, ...responses: Array<Record<string, unknown>>) {
  answers = responses;
  calls = 0;
  const env: NodeJS.ProcessEnv = { ...process.env, SMOKE_PAUSE_MS: "1", SMOKE_MIGRATIONS_DIR: migrations, ...extraEnv };
  // Змінні WS11 з оточення розробника не мають впливати на тести.
  for (const k of ["VERCEL_AUTOMATION_BYPASS_SECRET", "SMOKE_TARGET", "SMOKE_SCHEMA", "SMOKE_EXPECT_REF", "SMOKE_EXPECT_APP_ENV"]) {
    if (!(k in extraEnv)) delete env[k];
  }
  return new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn(process.execPath, [path.join(repoRoot, "scripts", "smoke.mjs"), base, SHA], { env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

describe("smoke: schema version vs the deployed commit", () => {
  it("passes when the database is on the newest migration of the deployed commit", async () => {
    const { code, out } = await smoke(health(NEWEST));
    expect(out).toContain("OK —");
    expect(code).toBe(0);
    expect(calls).toBe(1);
  });

  it("waits for db-deploy: an older schema, then the right one, is not a failure", async () => {
    const { code } = await smoke(health("20261115122625"), health(null), health(NEWEST));
    expect(code).toBe(0);
    expect(calls).toBe(3);
  });

  it("fails after 25 attempts when the schema stays older than the code", async () => {
    const { code, out } = await smoke(health("20261115122625"));
    expect(code).toBe(1);
    expect(calls).toBe(25);
    expect(out).toContain(`база на міграції 20261115122625, а код aaaaaaa чекає ${NEWEST}`);
  });

  it("fails with the reason when schema_version never answers", async () => {
    const { code, out } = await smoke(health(null));
    expect(code).toBe(1);
    expect(out).toContain("версію схеми не прочитано (schema-PGRST202)");
  });

  it("only warns when the database is newer than the code (code rolled back after a migration)", async () => {
    const { code, out } = await smoke(health("20261231000000"));
    expect(code).toBe(0);
    expect(out).toContain("::warning");
    expect(out).toContain("новіша за код");
  });

  it("does not wait for the schema while the production domain still serves another commit", async () => {
    const { code, out } = await smoke(health("20261115122625", "b".repeat(40)));
    expect(code).toBe(1);
    expect(calls).toBe(6);
    expect(out).toContain("прод показує bbbbbbb");
  });
});

describe("smoke of every deployment (WS11): bypass header, database ref, app env", () => {
  const BYPASS = "test-bypass-value-0123456789abcdef";
  const STAGING = "stagingref0000000000";
  const deployHealth = (over: Record<string, unknown> = {}) => ({
    ...health(NEWEST),
    env: "preview",
    appEnv: "staging",
    supabaseRef: STAGING,
    ...over,
  });

  it("passes a protected deployment with the bypass header and never prints the secret", async () => {
    requiredBypass = BYPASS;
    try {
      const { code, out } = await smokeWith(
        { VERCEL_AUTOMATION_BYPASS_SECRET: BYPASS, SMOKE_TARGET: "deploy", SMOKE_EXPECT_REF: STAGING, SMOKE_EXPECT_APP_ENV: "staging" },
        deployHealth(),
      );
      expect(code).toBe(0);
      expect(seenBypass).toBe(BYPASS);
      expect(out).toContain('"bypass":true');
      expect(out).toContain("OK — деплой живий");
      expect(out).not.toContain(BYPASS);
    } finally {
      requiredBypass = "";
    }
  });

  it("fails on the Vercel login wall and names the missing secret", async () => {
    requiredBypass = BYPASS;
    try {
      const { code, out } = await smokeWith({ SMOKE_TARGET: "deploy" }, deployHealth());
      expect(code).toBe(1);
      expect(out).toContain("задайте секрет VERCEL_AUTOMATION_BYPASS_SECRET");
    } finally {
      requiredBypass = "";
    }
  });

  it("fails when a preview talks to another Supabase project (e.g. the production database)", async () => {
    const { code, out } = await smokeWith(
      { SMOKE_TARGET: "deploy", SMOKE_EXPECT_REF: STAGING },
      deployHealth({ supabaseRef: "prodref000000000000" }),
    );
    expect(code).toBe(1);
    expect(out).toContain(`supabaseRef=prodref000000000000, а очікувався ${STAGING}`);
  });

  it("stops at once on the wrong database ref instead of waiting for the schema", async () => {
    const { code, out } = await smokeWith(
      { SMOKE_TARGET: "deploy", SMOKE_EXPECT_REF: STAGING },
      deployHealth({ supabaseRef: "prodref000000000000", schema: "20261115122625" }),
    );
    expect(code).toBe(1);
    expect(calls).toBe(1);
    expect(out).toContain("supabaseRef=prodref000000000000");
  });

  it("fails when the staging branch was built without its APP_ENV", async () => {
    const { code, out } = await smokeWith(
      { SMOKE_TARGET: "deploy", SMOKE_EXPECT_APP_ENV: "staging" },
      deployHealth({ appEnv: null }),
    );
    expect(code).toBe(1);
    expect(out).toContain("appEnv=немає, а очікувався staging");
  });

  it("only warns for a PR preview whose migrations are not in the staging database yet", async () => {
    const { code, out } = await smokeWith({ SMOKE_TARGET: "deploy", SMOKE_SCHEMA: "warn" }, deployHealth({ schema: "20261115122625" }));
    expect(code).toBe(0);
    expect(calls).toBe(1);
    expect(out).toContain("::warning");
    expect(out).toContain("міграції PR потраплять у базу staging лише після merge");
  });
});
