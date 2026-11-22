// Спільна перевірка здоров'я для /api/health (машини: smoke, перевірка курсу) і /status (люди, WS11): один дешевий
// запит у базу публічним ключем і версія схеми, з одним таймаутом; спершу — чи змінні Supabase взагалі придатні
// (дія з postmortem docs/incidents/2026-11-20-staging-bad-supabase-url.md). Без cookie відвідувача і без секретів.
import { createClient } from "@supabase/supabase-js";
import {
  classifyDbProbe,
  classifySchemaProbe,
  configProblemFromDbReason,
  supabaseConfigProblem,
  type ConfigProblem,
  type SchemaHealth,
} from "@/lib/health";
import type { Database } from "@/lib/supabase/database.types";

/** Скільки чекати відповіді бази: завислий запит має дати «timeout», а не тримати перевірку до таймауту функції. */
const DB_PROBE_TIMEOUT_MS = 5_000;

export type HealthCheck = {
  health: { db: "ok" | "down"; reason: string };
  schema: SchemaHealth;
  config: ConfigProblem | null;
};

export async function checkHealth(): Promise<HealthCheck> {
  // Змінних немає чи вони не схожі на адресу — до бази навіть не йдемо: причина вже відома.
  const preflight = supabaseConfigProblem(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (preflight) return { health: { db: "down", reason: "config" }, schema: { schema: null, reason: "" }, config: preflight };
  const { health, schema } = await probeDatabase();
  return { health, schema, config: health.db === "down" ? configProblemFromDbReason(health.reason) : null };
}

/** Один дешевий запит у базу і версія схеми — паралельно, з одним таймаутом. */
async function probeDatabase(): Promise<Omit<HealthCheck, "config">> {
  let health: HealthCheck["health"];
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
      // Збій версії (функції ще немає, мережа) не валить перевірку: база могла відповісти — причина піде в reason.
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
  return { health, schema };
}
