#!/usr/bin/env node
// prebuild: деплой preview чи staging збирається лише з базою staging (дія 2 postmortem 2026-11-20, rhutsul/leave-portal#145;
// рев'ю викладача WS11, пункт 3). У дрілі перевизначення NEXT_PUBLIC_SUPABASE_URL з одним хибним символом зібралось і
// стало живим — smoke помітив це лише через 17 с. Ця перевірка не дає такій збірці завершитись: Vercel показує Failed
// build, а живим лишається попередній деплой.
//
// Коли діє: у Vercel для Preview (VERCEL_ENV=preview — PR-preview і гілка staging) і для будь-якої збірки з
// APP_ENV=staging. Локально й у CI (VERCEL_ENV немає) — нічого не перевіряє.
// Очікуваний ref: SUPABASE_STAGING_REF (якщо задано) або ref staging з docs/runbook.md («Де що») — ref не секрет, це
// частина адреси https://<ref>.supabase.co.
// Друкує лише назву змінної й ref (не секрет), без значень ключів. Код виходу: 0 — гаразд або не діє, 1 — збій.

const STAGING_REF_DEFAULT = "tgvhqyboeeusptbjskio";

/** Ref проєкту Supabase з адреси https://<ref>.supabase.co; "" — адреса не така. */
export function refOf(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const match = /^([a-z0-9]+)\.supabase\.co$/.exec(host);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

/** null — перевірка не діє чи все гаразд; інакше — причина збою (без значень змінних, крім ref). */
export function buildRefProblem(env) {
  const applies = env.VERCEL_ENV === "preview" || env.APP_ENV === "staging";
  if (!applies) return null;
  const expected = (env.SUPABASE_STAGING_REF || STAGING_REF_DEFAULT).trim().toLowerCase();
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url.trim()) return "NEXT_PUBLIC_SUPABASE_URL не задана для Preview — preview і staging мають ходити в базу staging";
  const ref = refOf(url);
  if (!ref) return "NEXT_PUBLIC_SUPABASE_URL не схожа на адресу Supabase (https://<ref>.supabase.co)";
  if (ref !== expected) {
    return `NEXT_PUBLIC_SUPABASE_URL веде в проєкт ${ref}, а preview і staging мають ходити в staging (${expected}) — звірте змінну в Vercel (часто перевизначення для гілки)`;
  }
  return null;
}

if (process.argv[1]?.endsWith("check-build-ref.mjs")) {
  const problem = buildRefProblem(process.env);
  if (problem) {
    console.error(`::error title=build::${problem}`);
    console.error("Збірку зупинено: зламаний деплой не стане живим (postmortem 2026-11-20, дія 2).");
    process.exitCode = 1;
  } else if (process.env.VERCEL_ENV === "preview" || process.env.APP_ENV === "staging") {
    console.log("check-build-ref: OK — preview/staging ходить у базу staging.");
  }
}
