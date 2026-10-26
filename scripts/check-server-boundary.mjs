#!/usr/bin/env node
// Архітектурне правило «секретний ключ лише на сервері».
// 1) SUPABASE_SECRET_KEY / SERVICE_ROLE читається лише в src/lib/supabase/admin.ts і в scripts/ (поза src/).
// 2) src/lib/supabase/admin.ts починається з `import "server-only"`.
// 3) admin-клієнт (src/lib/supabase/admin.ts — через @/… чи відносний шлях, також у кілька рядків) імпортують лише
//    серверні файли: actions.ts, route.ts або файли з директивою "use server" на початку модуля.
//    Файл з "use client" не може його імпортувати. Увага: кожен експорт файлу з "use server" — публічний POST-ендпойнт,
//    його викликають напряму. Тому перевірка ролі (getClaims + роль з profiles) — ДО admin-клієнта. Скрипт її не бачить:
//    це тест і рев'ю. Не додавайте "use server" у допоміжний модуль, щоб пройти перевірку.
// 4) Жодної змінної NEXT_PUBLIC_*SECRET* / NEXT_PUBLIC_*SERVICE_ROLE* — усе з NEXT_PUBLIC_ потрапляє в браузер.
// Шукає в src/. Якщо теки src/ немає — у app/, components/ і lib/ кореня (admin-клієнт — lib/supabase/admin.ts).
// Використання: node scripts/check-server-boundary.mjs [--root <dir>]
// Код виходу: 0 — порушень немає, 1 — є порушення, 2 — немає чого перевіряти (ні src/, ні app/, components/, lib/),
// --root без шляху або тека, яку не вдалося прочитати.
// Взято з koldovsky/2026-quitcode-07-fullstack-hw/materials/scripts (7b9d783); змінено після рев'ю PR #19: код 2 для
// --root без шляху й неповного обходу тек, директиви — лише з прологу модуля, імпорт admin-клієнта — за розв'язаним шляхом.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";

const fail = (message) => {
  console.error(`check-server-boundary: ${message}`);
  process.exit(2);
};

const args = process.argv.slice(2);
const rootIdx = args.indexOf("--root");
const rootArg = rootIdx >= 0 ? args[rootIdx + 1] : undefined;
if (rootIdx >= 0 && (!rootArg || rootArg.startsWith("--"))) fail("після --root вкажіть шлях до кореня проєкту.");
const root = rootArg ?? process.cwd();

const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

// Код у src/ — як у шаблоні проєкту. Інакше — теки Next.js у корені.
const hasSrc = isDir(join(root, "src"));
const BASES = hasSrc ? ["src"] : ["app", "components", "lib"].filter((d) => isDir(join(root, d)));
if (BASES.length === 0) {
  console.error(`check-server-boundary: у ${root} немає ні src/, ні app/, components/, lib/ — вкажіть --root <корінь проєкту>.`);
  process.exit(2);
}
const ADMIN_FILE = join(hasSrc ? "src" : "", "lib", "supabase", "admin.ts");
const ADMIN_SHOWN = ADMIN_FILE.split(sep).join("/");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);
const EXT = /\.(tsx?|jsx?|mjs|cjs)$/;

// Тека, яку не вдалося прочитати, — не «порушень немає»: перевірка неповна.
const unreadable = (path, error) =>
  fail(`не вдалося прочитати ${relative(root, path) || "."} (${error.code ?? error.message}) — перевірку не завершено.`);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (error) {
    unreadable(dir, error);
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch (error) {
      unreadable(full, error);
    }
    if (st.isDirectory()) walk(full, out);
    else if (EXT.test(name)) out.push(full);
  }
  return out;
}

// Директиви ("use client", "use server") — лише з прологу модуля: до першого коду, після коментарів та інших директив.
function directives(text) {
  const found = new Set();
  let rest = text.replace(/^﻿/, "").replace(/^#![^\n]*/, "");
  for (;;) {
    rest = rest.replace(/^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)+/, "");
    // Директива — рядок, за яким «;» або кінець рядка; "use server".length — уже вираз, не директива.
    const m = rest.match(/^(["'])([^"'\n]*)\1[ \t]*(?:;|(?=\r?\n|$))/);
    if (!m) return found;
    found.add(m[2]);
    rest = rest.slice(m[0].length);
  }
}

// Імпорти з усього тексту, зокрема багаторядкові import { … } from "…", import("…") і require("…").
const IMPORT_RE = /(?:\bfrom|\bimport|\brequire\s*\(|\bimport\s*\()\s*["'`]([^"'`]+)["'`]/g;
// Рядок-коментар (// …, /* …, * …): згадка шляху в ньому — не імпорт.
const inCommentLine = (text, index) => /^\s*(?:\/\/|\/\*|\*)/.test(text.slice(text.lastIndexOf("\n", index) + 1, index));
const ADMIN_MODULE = ADMIN_FILE.replace(/\.ts$/, "");

// Шлях імпорту, розв'язаний від кореня (@/… — від src/, відносний — від теки файлу), веде до admin-клієнта.
function importsAdmin(rel, spec) {
  let target;
  if (spec.startsWith("@/")) target = join(hasSrc ? "src" : "", spec.slice(2));
  else if (spec.startsWith(".")) target = join(dirname(rel), spec);
  else return false;
  return target.replace(/\.(tsx?|jsx?|mjs|cjs)$/, "") === ADMIN_MODULE;
}

const problems = [];
const report = (file, line, message) => problems.push(`${file.split(sep).join("/")}:${line}  ${message}`);

for (const file of BASES.flatMap((b) => walk(join(root, b)))) {
  const rel = relative(root, file);
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const directive = directives(text);
  const isClient = directive.has("use client");
  const isServerFile =
    directive.has("use server") || ["actions.ts", "route.ts"].includes(basename(file)) || rel === ADMIN_FILE;

  lines.forEach((line, i) => {
    if (/NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE_ROLE)/.test(line)) {
      report(rel, i + 1, "NEXT_PUBLIC_ зі секретом — така змінна потрапить у браузер");
    }
    if (/SUPABASE_SECRET_KEY|SERVICE_ROLE_KEY/.test(line) && rel !== ADMIN_FILE) {
      report(rel, i + 1, `секретний ключ читається поза ${ADMIN_SHOWN}`);
    }
  });

  if (rel === ADMIN_FILE) continue;
  for (const m of text.matchAll(IMPORT_RE)) {
    if (!importsAdmin(rel, m[1]) || inCommentLine(text, m.index)) continue;
    const line = text.slice(0, m.index).split("\n").length;
    if (isClient) report(rel, line, 'admin-клієнт імпортовано у файлі з "use client"');
    else if (!isServerFile) {
      report(
        rel,
        line,
        'admin-клієнт імпортовано не з actions.ts / route.ts / "use server" — викликайте його з Server Action чи Route ' +
          'Handler після перевірки ролі. Не додавайте "use server" у допоміжний модуль: кожен його експорт стане ' +
          "публічним ендпойнтом",
      );
    }
  }
}

const adminPath = join(root, ADMIN_FILE);
if (existsSync(adminPath)) {
  const first = readFileSync(adminPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.trim() && !l.trim().startsWith("//"));
  if (!/^import\s+["']server-only["'];?$/.test(first?.trim() ?? "")) {
    report(ADMIN_FILE, 1, 'admin.ts має починатися з import "server-only"');
  }
}

if (!hasSrc) console.log(`check-server-boundary: теки src/ немає — перевіряю ${BASES.map((b) => `${b}/`).join(", ")}.`);
if (problems.length === 0) {
  console.log("check-server-boundary: OK — секретний ключ і admin-клієнт лише в серверному коді.");
  process.exit(0);
}
for (const p of problems) console.log(p);
console.log(`\ncheck-server-boundary: ${problems.length} порушень. Правило — docs/decisions і AGENTS.md (розділ «Секрети»).`);
process.exit(1);
