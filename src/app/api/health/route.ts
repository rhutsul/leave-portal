// D0: публічна перевірка здоров'я проду — GET /api/health → { ok, sha, env, db, schema, reason }.
// Без секретів і без даних користувачів: коміт збірки (Vercel), чи відповідає база (один дешевий запит публічним
// ключем) і версія схеми — остання застосована міграція (rpc schema_version, рев'ю WS9: код на проді раніше за
// міграцію). Шлях — у PUBLIC_PATHS (src/lib/supabase/proxy.ts), інакше proxy віддав би 307 на /login.
// Читають: scripts/smoke.mjs, .github/workflows/smoke.yml і перевірка розгортань курсу.
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { classifyDbProbe, classifySchemaProbe, type SchemaHealth } from "@/lib/health";
import type { Database } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

/** Скільки чекати відповіді бази: завислий запит має дати 503 «timeout», а не тримати перевірку до таймауту функції. */
const DB_PROBE_TIMEOUT_MS = 5_000;

export async function GET() {
  // VERCEL_GIT_COMMIT_SHA є, коли у Vercel увімкнено «Automatically expose System Environment Variables» (типово так).
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
  const env = process.env.VERCEL_ENV ?? "local";
  let health: { db: "ok" | "down"; reason: string };
  let schema: SchemaHealth = { schema: null, reason: "schema-exception" };
  const timeout = AbortSignal.timeout(DB_PROBE_TIMEOUT_MS);
  try {
    // Звичайний supabase-js, не @/lib/supabase/server: перевірка не читає cookie відвідувача.
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    // GET, не HEAD: потрібне тіло помилки, щоб відрізнити «anon без прав» (база відповіла) від «хибний ключ».
    // Перерваний запит supabase-js повертає помилку зі status 0, а не кидає виняток, тож причину беремо із сигналу.
    // Обидва запити паралельно і з тим самим таймаутом: версія схеми не подовжує перевірку. Чи перервано, фіксуємо
    // для кожного запиту в мить його відповіді: повільна версія схеми не робить «timeout» з бази, що відповіла вчасно.
    const [probe, version] = await Promise.all([
      supabase
        .from("profiles")
        .select("id")
        .limit(1)
        .abortSignal(timeout)
        .then((r) => ({ ...r, aborted: timeout.aborted })),
      // Збій версії (функції ще немає, мережа) не валить health: база могла відповісти — причина піде в reason.
      supabase
        .rpc("schema_version")
        .abortSignal(timeout)
        .then(
          (r) => classifySchemaProbe(r, timeout.aborted),
          (): SchemaHealth => ({ schema: null, reason: timeout.aborted ? "schema-timeout" : "schema-exception" }),
        ),
    ]);
    schema = version;
    health = probe.aborted ? { db: "down", reason: "timeout" } : classifyDbProbe(probe);
  } catch {
    health = { db: "down", reason: timeout.aborted ? "timeout" : "exception" };
  }
  // reason — одна причина: спершу база (без неї версія не важлива), потім версія схеми.
  const reason = health.db === "down" ? health.reason : schema.reason;
  return NextResponse.json(
    { ok: health.db === "ok", sha, env, db: health.db, schema: schema.schema, reason },
    { status: health.db === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
