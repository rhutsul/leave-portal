// D0: публічна перевірка здоров'я проду — GET /api/health → { ok, sha, env, appEnv, supabaseRef, db, schema, reason, config }.
// WS11: appEnv — змінна APP_ENV (у Vercel лише для гілки staging), supabaseRef — ref проєкту Supabase з
// NEXT_PUBLIC_SUPABASE_URL: видно, що staging і preview ходять у базу staging, а прод — у прод-базу. Обидва не секрети.
// Без секретів і без даних користувачів: коміт збірки (Vercel), чи відповідає база (один дешевий запит публічним
// ключем) і версія схеми — остання застосована міграція (rpc schema_version, рев'ю WS9: код на проді раніше за
// міграцію). Шлях — у PUBLIC_PATHS (src/lib/supabase/proxy.ts), інакше proxy віддав би 307 на /login.
// WS11, дія з postmortem docs/incidents/2026-11-20-staging-bad-supabase-url.md: config — назва змінної середовища, через
// яку застосунок не дістає до бази, і що з нею ({ variable, problem }), або null. Лише назва, значення — ніколи.
// Читають: scripts/smoke.mjs, .github/workflows/smoke.yml і перевірка розгортань курсу.
import { NextResponse } from "next/server";
import { appEnvFrom, supabaseRefFromUrl } from "@/lib/health";
import { checkHealth } from "@/lib/health-check";

export const dynamic = "force-dynamic";

export async function GET() {
  // VERCEL_GIT_COMMIT_SHA є, коли у Vercel увімкнено «Automatically expose System Environment Variables» (типово так).
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
  const env = process.env.VERCEL_ENV ?? "local";
  const appEnv = appEnvFrom(process.env.APP_ENV);
  const supabaseRef = supabaseRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  // Сама перевірка (змінні → запит у базу → версія схеми) — спільна з /status: src/lib/health-check.ts.
  const { health, schema, config } = await checkHealth();
  // reason — одна причина: спершу база (без неї версія не важлива), потім версія схеми.
  const reason = health.db === "down" ? health.reason : schema.reason;
  return NextResponse.json(
    { ok: health.db === "ok", sha, env, appEnv, supabaseRef, db: health.db, schema: schema.schema, reason, config },
    { status: health.db === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
