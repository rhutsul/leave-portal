#!/usr/bin/env node
// D0 smoke розгорнутого застосунку: лише GET, без входу й форм (Node 24, без залежностей). WS11: і кожен НЕпродовий
// деплой (preview, гілка staging) за його адресою — див. змінні середовища нижче.
// Використання: node scripts/smoke.mjs <base-url> [expected-sha]     (або npm run smoke -- <base-url> [sha])
//   1) "/"           → редірект на /welcome (landing для гостя, ADR 0007) чи /login цього ж проду або 200 (не 401/404/5xx
//                      і не стіна входу Vercel);
//   2) "/login"      → 200 і поле пароля (застосунок справді віддає сторінку);
//   3) "/api/health" → 200 {db:"ok"}; з expected-sha — sha збігається (до 6 спроб × 20 с: прод-домен перемикається
//                      на новий деплой не миттєво) і schema — версія останньої застосованої міграції — дорівнює
//                      найновішому файлу supabase/migrations розгорнутого коміту (workflow кладе їх у
//                      SMOKE_MIGRATIONS_DIR; без змінної — supabase/migrations цього checkout).
//                      Гонка: Vercel віддає новий код за ~1 хв після merge, а db-deploy застосовує міграцію лише після
//                      решти jobs CI (~2 хв, бувало й довше в черзі). Тому схему, старшу за код (або ще без функції
//                      schema_version), чекаємо до 25 спроб × 20 с (≈ 8 хв) і лише тоді падаємо. Схема,
//                      новіша за код (Instant Rollback коду після міграції), — попередження: за правилом expand → contract
//                      (AGENTS.md, «База даних») старий код працює з новою схемою ще один реліз.
// Змінні середовища (WS11, .github/workflows/smoke.yml; локально всі необов'язкові):
//   VERCEL_AUTOMATION_BYPASS_SECRET — кожен запит несе заголовок x-vercel-protection-bypass (захищені preview і
//                      staging); значення ніде не друкується, у підсумку лише "bypass": true;
//   SMOKE_TARGET     — prod (типово) або deploy: лише слова в повідомленнях;
//   SMOKE_SCHEMA     — strict (типово: схема, старша за код, — збій після очікування) або warn (PR-preview: міграції
//                      PR ще не в базі staging, вони потраплять туди лише після merge — тож лише попередження);
//   SMOKE_EXPECT_REF — ref проєкту Supabase, у який має ходити деплой (поле supabaseRef у health): прод — ref
//                      проду, preview і staging — ref staging. Інший ref — збій: preview у прод-базі чи навпаки;
//   SMOKE_EXPECT_APP_ENV — значення appEnv (змінна APP_ENV лише для гілки staging у Vercel), напр. staging;
//   SMOKE_FAIL_FILE  — файл, куди скрипт пише причини збою (рядок на причину) для алерту в Telegram
//                      (scripts/telegram-alert.mjs). Там лише те, що вже є в ::error: шлях, код HTTP, назва змінної чи
//                      ref, — без значень секретів, тіл відповідей і даних користувачів.
// Код виходу: 0 — усе гаразд, 1 — є збій (рядки ::error:: видно в GitHub Actions), 2 — адресу не вказано чи вона некоректна.
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
/** Скільки разів питати /api/health, поки прод-домен не перемкнувся на новий коміт / поки db-deploy не застосував
 *  міграцію; пауза між спробами. */
const SHA_ATTEMPTS = 6;
const SCHEMA_ATTEMPTS = 25;
// SMOKE_PAUSE_MS — лише для перевірки скрипту локально (макет проду без 20-секундних пауз).
const PAUSE_MS = Number(process.env.SMOKE_PAUSE_MS) || 20_000;
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const TARGET = process.env.SMOKE_TARGET === "deploy" ? "деплой" : "прод";
const SCHEMA_WARN_ONLY = process.env.SMOKE_SCHEMA === "warn";
const EXPECT_REF = (process.env.SMOKE_EXPECT_REF ?? "").trim();
const EXPECT_APP_ENV = (process.env.SMOKE_EXPECT_APP_ENV ?? "").trim();

/** Версія найновішої міграції (мітка часу з імені файлу), "" — теки немає. Тека — SMOKE_MIGRATIONS_DIR (workflow кладе
 *  туди міграції розгорнутого коміту) або supabase/migrations цього checkout. */
function newestMigration() {
  const dir = process.env.SMOKE_MIGRATIONS_DIR
    ? pathToFileURL(`${path.resolve(process.env.SMOKE_MIGRATIONS_DIR)}/`)
    : new URL("../supabase/migrations/", import.meta.url);
  try {
    const files = readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f));
    return files.sort().at(-1)?.split("_")[0] ?? "";
  } catch {
    return "";
  }
}
/** Порівняння версій міграцій (рядки цифр різної довжини теж): <0 — a старша. */
const compareVersions = (a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);
const isVersion = (v) => typeof v === "string" && /^\d+$/.test(v);

/** health.config ({ variable, problem }) — лише відомі назви й слова, інакше null: у причину йде тільки перевірене. */
const CONFIG_VARIABLES = new Set(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
const CONFIG_WORDS = {
  missing: "не задана",
  invalid: "не схожа на адресу Supabase",
  unreachable: "веде туди, де база не відповідає (хибний ref?)",
  rejected: "не приймається Supabase",
};
function configProblem(health) {
  const c = health?.config;
  return c && CONFIG_VARIABLES.has(c.variable) && Object.hasOwn(CONFIG_WORDS, c.problem) ? c : null;
}

/** Межа на кожен запит разом із читанням тіла: завислий прод має дати збій, а не тримати прогін. */
const REQUEST_TIMEOUT_MS = 10_000;

const get = async (path) => {
  try {
    const r = await fetch(base + path, {
      redirect: "manual",
      // Заголовок, а не параметр адреси: адреси потрапляють у журнали. Значення секрету не друкуємо.
      headers: { "user-agent": "smoke/1.0 (D0)", ...(BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {}) },
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
/** Адреса редиректу для повідомлення: лише шлях (і схема з хостом, якщо хост чужий) — без облікових даних,
 *  параметрів і фрагмента: там може бути токен, а причина йде і в журнал, і в Telegram (SMOKE_FAIL_FILE). */
function safeLocation(location) {
  try {
    const target = new URL(location || "/", `${base}/`);
    return target.origin === new URL(base).origin ? target.pathname : target.origin + target.pathname;
  } catch {
    return "(нерозбірна адреса)";
  }
}

async function main() {
  const fail = [];
  if (strippedCredentials) console.log("::warning title=smoke::PROD_URL містить облікові дані — їх прибрано з адреси");
  const root = await get("/");
  if (vercelWall(root)) {
    fail.push(
      BYPASS
        ? `"/": стіна входу Vercel попри заголовок обходу — секрет VERCEL_AUTOMATION_BYPASS_SECRET у GitHub не збігається з Vercel (перегенерували?) чи деплой старший за секрет (Redeploy)`
        : `"/": стіна входу Vercel — задайте секрет VERCEL_AUTOMATION_BYPASS_SECRET (Vercel → Settings → Deployment Protection → Protection Bypass for Automation)`,
    );
  }
  else if (root.status === 0) fail.push(`"/": недоступний (${root.text})`);
  else if (root.status >= 400) {
    const hint = root.vercelError === "MIDDLEWARE_INVOCATION_FAILED" ? " — у Vercel бракує NEXT_PUBLIC_SUPABASE_*?" : "";
    fail.push(`"/": HTTP ${root.status} ${root.vercelError}${hint}`.trim());
  } else if (root.status >= 300) {
    // redirect: "manual" — за редиректом не йдемо, тож перевіряємо, куди він веде: без сесії — на landing /welcome
    // (з #54, ADR 0007) або на /login цього ж проду.
    const target = new URL(root.location || "/", `${base}/`);
    const sameOrigin = target.origin === new URL(base).origin;
    // Точні шляхи (з урахуванням шляху в PROD_URL, якщо він є), а не «закінчується на»: /other/welcome — це вже збій.
    const basePath = new URL(base).pathname.replace(/\/$/, "");
    const allowed = [`${basePath}/welcome`, `${basePath}/login`];
    if (!sameOrigin || !allowed.includes(target.pathname)) {
      // Лише шлях (і хост, якщо чужий), без параметрів: у них може бути токен.
      fail.push(`"/": редирект ${root.status} на ${safeLocation(root.location)}, а очікувався /welcome або /login`);
    }
  } else if (root.status !== 200) {
    fail.push(`"/": HTTP ${root.status}, а очікувався 200 або редирект на /welcome чи /login`);
  }

  const login = await get("/login");
  if (login.status !== 200 || !/type=["']?password/i.test(login.text)) {
    fail.push(`"/login": HTTP ${login.status} ${login.vercelError}${login.status === 200 ? " (немає поля пароля)" : ""}`.trim());
  }

  // Версію схеми звіряємо лише з expected-sha: без нього checkout може бути на іншій гілці з новими міграціями.
  const expectSchema = expectSha ? newestMigration() : "";
  if (expectSha && !expectSchema) {
    console.log("::warning title=smoke::Немає supabase/migrations у checkout — версію схеми не перевірено");
  }
  let health = null;
  for (let attempt = 1; login.status === 200; attempt++) {
    const r = await get("/api/health");
    try {
      // status — фактичний код HTTP, а не поле з тіла.
      health = { ...JSON.parse(r.text), status: r.status };
    } catch {
      health = { status: r.status, location: safeLocation(r.location) };
    }
    // sha=local — Vercel не віддає VERCEL_GIT_COMMIT_SHA: чекати марно.
    if (!expectSha || health.sha === "local") break;
    // Не та база Supabase — чекати міграцію марно: збій видно одразу (друга думка до #105).
    if (EXPECT_REF && health.supabaseRef && health.supabaseRef !== EXPECT_REF) break;
    const shaPending = health.sha !== expectSha;
    // Код уже новий, а схема ще стара чи без schema_version (db-deploy іде) — це гонка, а не збій: чекаємо.
    const schemaPending =
      !SCHEMA_WARN_ONLY &&
      !shaPending &&
      Boolean(expectSchema) &&
      health.status === 200 &&
      health.db === "ok" &&
      (!isVersion(health.schema) || compareVersions(health.schema, expectSchema) < 0);
    if (!(shaPending && attempt < SHA_ATTEMPTS) && !(schemaPending && attempt < SCHEMA_ATTEMPTS)) break;
    if (schemaPending) {
      console.log(`схема ${health.schema ?? `не прочитана (${health.reason || "?"})`} старша за код (чекаємо ${expectSchema}) — db-deploy ще йде? спроба ${attempt}/${SCHEMA_ATTEMPTS}`);
    }
    await new Promise((res) => setTimeout(res, PAUSE_MS));
  }
  if (!health) {
    // прод не відкрився — причина вже у fail
  } else if (health.status === 404) {
    fail.push(`"/api/health": 404 — додайте src/app/api/health/route.ts`);
  } else if (health.status >= 300 && health.status < 400) {
    fail.push(`"/api/health": ${health.status} → ${health.location} — додайте "/api/health" у PUBLIC_PATHS (src/lib/supabase/proxy.ts)`);
  } else if (health.reason === "paused") {
    fail.push(`"/api/health": Supabase призупинено — Dashboard → Resume project (безкоштовний проєкт засинає після тижня без активності)`);
  } else if (configProblem(health)) {
    // WS11, дія з postmortem 2026-11-20: health сам називає змінну — у причині (і в алерті) лише її назва.
    const { variable, problem } = configProblem(health);
    fail.push(`"/api/health": HTTP ${health.status} — змінна ${variable} ${CONFIG_WORDS[problem]} — Vercel → Settings → Environment Variables (Production — прод, Preview — staging; перевизначення для гілки б'є загальну), потім новий деплой`);
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
    fail.push(
      TARGET === "прод"
        ? `прод показує ${String(health.sha).slice(0, 7)}, а очікувався ${expectSha.slice(0, 7)} — деплой main не пройшов чи зроблено Instant Rollback?`
        : `деплой показує ${String(health.sha).slice(0, 7)}, а очікувався ${expectSha.slice(0, 7)} — це не той деплой?`,
    );
  } else if (expectSchema && health?.status === 200 && health.db === "ok") {
    // Коміт збігся — звіряємо схему бази з міграціями цього коміту.
    if (!isVersion(health.schema)) {
      fail.push(
        `"/api/health": версію схеми не прочитано (${health.reason || "немає поля schema"}), а код ${expectSha.slice(0, 7)} чекає міграцію ${expectSchema} — db-deploy не пройшов? Перевірте job db-deploy у CI main`,
      );
    } else if (compareVersions(health.schema, expectSchema) < 0 && SCHEMA_WARN_ONLY) {
      console.log(
        `::warning title=smoke ${base}::база на міграції ${health.schema}, а код ${expectSha.slice(0, 7)} чекає ${expectSchema} — для PR-preview це очікувано: міграції PR потраплять у базу staging лише після merge`,
      );
    } else if (compareVersions(health.schema, expectSchema) < 0) {
      fail.push(
        `база на міграції ${health.schema}, а код ${expectSha.slice(0, 7)} чекає ${expectSchema} — новий код на проді зі старою схемою: db-deploy не пройшов чи завис? Перевірте job db-deploy у CI main`,
      );
    } else if (compareVersions(health.schema, expectSchema) > 0 && SCHEMA_WARN_ONLY) {
      console.log(
        `база staging на міграції ${health.schema}, новіша за гілку ${expectSha.slice(0, 7)} (${expectSchema}) — для PR-preview це нормально: main уже пішов уперед`,
      );
    } else if (compareVersions(health.schema, expectSchema) > 0) {
      console.log(
        `::warning title=smoke ${base}::база на міграції ${health.schema}, новіша за код ${expectSha.slice(0, 7)} (${expectSchema}) — Instant Rollback коду після міграції? Старий код має працювати з новою схемою (expand → contract)`,
      );
    }
  }

  // WS11: деплой ходить у свою базу (ref не секрет — він є в публічній NEXT_PUBLIC_SUPABASE_URL) і має свою змінну.
  if (!EXPECT_REF && process.env.GITHUB_ACTIONS) {
    console.log(
      `::warning title=smoke::Не задано очікуваний ref бази (змінні репо SUPABASE_PROD_REF / SUPABASE_STAGING_REF) — у яку базу ходить ${TARGET}, не перевірено`,
    );
  }
  if (EXPECT_REF && health && (health.status === 200 || health.supabaseRef) && health.supabaseRef !== EXPECT_REF) {
    fail.push(
      `"/api/health": supabaseRef=${health.supabaseRef ?? "немає"}, а очікувався ${EXPECT_REF} — ${TARGET} ходить не в ту базу Supabase: звірте NEXT_PUBLIC_SUPABASE_URL у Vercel (Production — прод, Preview — staging) і зробіть Redeploy`,
    );
  }
  if (EXPECT_APP_ENV && health?.status === 200 && health.appEnv !== EXPECT_APP_ENV) {
    fail.push(
      `"/api/health": appEnv=${health.appEnv ?? "немає"}, а очікувався ${EXPECT_APP_ENV} — у Vercel немає змінної APP_ENV для цієї гілки чи деплой зібрано до неї (Redeploy)`,
    );
  }

  console.log(JSON.stringify({ base, bypass: Boolean(BYPASS), root: root.status, login: login.status, health }));
  for (const f of fail) console.log(`::error title=smoke ${base}::${f}`);
  writeFailures(fail);
  if (!fail.length) console.log(`OK — ${TARGET} живий, сторінка входу відкривається, база відповідає.`);
  return fail.length ? 1 : 0;
}

/** Причини збою для алерту (SMOKE_FAIL_FILE): ті самі рядки, що в ::error, по одному. Немає змінної — нічого. */
function writeFailures(lines) {
  const file = process.env.SMOKE_FAIL_FILE;
  if (!file || !lines.length) return;
  try {
    writeFileSync(file, `${lines.join("\n")}\n`);
  } catch {
    // Алерт однаково піде — лише без причини.
  }
}

// process.exitCode, а не process.exit(): на Windows exit() після fetch падає з assertion libuv.
if (baseError) {
  // Саму адресу не друкуємо: у ній можуть бути облікові дані чи токен.
  console.error(`::error title=smoke::${baseError}`);
  writeFailures([baseError]);
  process.exitCode = 2;
} else if (!base) {
  console.error("Використання: node scripts/smoke.mjs <base-url> [expected-sha]  (або змінна PROD_URL)");
  process.exitCode = 2;
} else {
  process.exitCode = await main();
}
