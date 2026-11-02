#!/usr/bin/env node
// D0 smoke розгорнутого застосунку: лише GET, без входу й форм, без секретів (Node 24, без залежностей).
// Використання: node scripts/smoke.mjs <base-url> [expected-sha]     (або npm run smoke -- <base-url> [sha])
//   1) "/"           → редірект на /login або 200 (не 401/404/5xx і не стіна входу Vercel);
//   2) "/login"      → 200 і поле пароля (застосунок справді віддає сторінку);
//   3) "/api/health" → 200 {db:"ok"}; з expected-sha — sha збігається (до 6 спроб × 20 с: прод-домен перемикається
//                      на новий деплой не миттєво).
// Код виходу: 0 — усе гаразд, 1 — є збій (рядки ::error:: видно в GitHub Actions), 2 — адресу не вказано чи вона некоректна.
const [rawBase = process.env.PROD_URL ?? "", expectSha = ""] = process.argv.slice(2);
// Адреса проду: лише схема, хост і шлях. Облікові дані (https://user:pass@…) прибираємо: прод публічний. Адресу з
// параметрами запиту чи фрагментом або нерозбірну відхиляємо, не друкуючи її: там може бути токен.
function parseBase(raw) {
  const input = raw.trim();
  if (!input) return { base: "" };
  try {
    // client_payload.url від Vercel може прийти хостом без схеми — додаємо https://; чужу схему відхиляємо нижче.
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "PROD_URL — не адреса http(s)" };
    if (url.search || url.hash) return { error: "PROD_URL не має містити параметрів запиту чи фрагмента (#…)" };
    const strippedCredentials = Boolean(url.username || url.password);
    url.username = "";
    url.password = "";
    return { base: url.toString().replace(/\/+$/, ""), strippedCredentials };
  } catch {
    return { error: "PROD_URL — не адреса http(s)" };
  }
}
const { base = "", strippedCredentials = false, error: baseError } = parseBase(rawBase);
/** Межа на кожен запит разом із читанням тіла: завислий прод має дати збій, а не тримати прогін. */
const REQUEST_TIMEOUT_MS = 10_000;

const get = async (path) => {
  try {
    const r = await fetch(base + path, {
      redirect: "manual",
      headers: { "user-agent": "smoke/1.0 (D0)" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return {
      status: r.status,
      location: r.headers.get("location") ?? "",
      vercelError: r.headers.get("x-vercel-error") ?? "",
      text: await r.text(),
    };
  } catch (e) {
    const reason = e.name === "TimeoutError" ? `немає відповіді за ${REQUEST_TIMEOUT_MS / 1000} с` : String(e.cause?.code ?? e);
    return { status: 0, location: "", vercelError: "", text: reason };
  }
};
const vercelWall = (r) =>
  /vercel\.com\/(sso|login)|_vercel_sso/.test(r.location) || ((r.status === 401 || r.status === 403) && /vercel/i.test(r.text));

async function main() {
  const fail = [];
  if (strippedCredentials) console.log("::warning title=smoke::PROD_URL містить облікові дані — їх прибрано з адреси");
  const root = await get("/");
  if (vercelWall(root)) fail.push(`"/": стіна входу Vercel — Settings → Deployment Protection → вимкніть Vercel Authentication`);
  else if (root.status === 0) fail.push(`"/": недоступний (${root.text})`);
  else if (root.status >= 400) {
    const hint = root.vercelError === "MIDDLEWARE_INVOCATION_FAILED" ? " — у Vercel бракує NEXT_PUBLIC_SUPABASE_*?" : "";
    fail.push(`"/": HTTP ${root.status} ${root.vercelError}${hint}`.trim());
  }

  const login = await get("/login");
  if (login.status !== 200 || !/type=["']?password/i.test(login.text)) {
    fail.push(`"/login": HTTP ${login.status} ${login.vercelError}${login.status === 200 ? " (немає поля пароля)" : ""}`.trim());
  }

  let health = null;
  for (let attempt = 1; attempt <= (expectSha ? 6 : 1) && login.status === 200; attempt++) {
    const r = await get("/api/health");
    try {
      // status — фактичний код HTTP, а не поле з тіла.
      health = { ...JSON.parse(r.text), status: r.status };
    } catch {
      health = { status: r.status, location: r.location };
    }
    // sha=local — Vercel не віддає VERCEL_GIT_COMMIT_SHA: чекати марно.
    if (!expectSha || health.sha === expectSha || health.sha === "local") break;
    if (attempt < 6) await new Promise((res) => setTimeout(res, 20_000));
  }
  if (!health) {
    // прод не відкрився — причина вже у fail
  } else if (health.status === 404) {
    fail.push(`"/api/health": 404 — додайте src/app/api/health/route.ts`);
  } else if (health.status >= 300 && health.status < 400) {
    fail.push(`"/api/health": ${health.status} → ${health.location} — додайте "/api/health" у PUBLIC_PATHS (src/lib/supabase/proxy.ts)`);
  } else if (health.reason === "paused") {
    fail.push(`"/api/health": Supabase призупинено — Dashboard → Resume project (безкоштовний проєкт засинає після тижня без активності)`);
  } else if (health.reason === "invalid-api-key") {
    fail.push(`"/api/health": ключ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY у Vercel не приймається — звірте змінні Production і зробіть Redeploy`);
  } else if (health.status !== 200 || health.db !== "ok") {
    fail.push(
      `"/api/health": HTTP ${health.status}, db=${health.db ?? "?"}${health.reason ? ` (${health.reason})` : ""} — Supabase недоступний чи NEXT_PUBLIC_SUPABASE_URL у Vercel не той?`,
    );
  }
  if (expectSha && health?.sha === "local") {
    fail.push(`"/api/health": sha=local — у Vercel увімкніть Settings → Environment Variables → «Automatically expose System Environment Variables» і зробіть Redeploy`);
  } else if (expectSha && health?.status === 200 && !health.sha) {
    // Без sha коміт деплою не перевірено — це збій, а не мовчазний успіх.
    fail.push(`"/api/health": у відповіді немає sha — очікувався ${expectSha.slice(0, 7)}`);
  } else if (expectSha && health?.status === 200 && health.sha !== expectSha) {
    fail.push(`прод показує ${String(health.sha).slice(0, 7)}, а очікувався ${expectSha.slice(0, 7)} — деплой main не пройшов чи зроблено Instant Rollback?`);
  }

  console.log(JSON.stringify({ base, root: root.status, login: login.status, health }));
  for (const f of fail) console.log(`::error title=smoke ${base}::${f}`);
  if (!fail.length) console.log("OK — прод живий, сторінка входу відкривається, база відповідає.");
  return fail.length ? 1 : 0;
}

// process.exitCode, а не process.exit(): на Windows exit() після fetch падає з assertion libuv.
if (baseError) {
  // Саму адресу не друкуємо: у ній можуть бути облікові дані чи токен.
  console.error(`::error title=smoke::${baseError}`);
  process.exitCode = 2;
} else if (!base) {
  console.error("Використання: node scripts/smoke.mjs <base-url> [expected-sha]  (або змінна PROD_URL)");
  process.exitCode = 2;
} else {
  process.exitCode = await main();
}
