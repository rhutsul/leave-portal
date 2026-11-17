#!/usr/bin/env node
// Таблиця «Доказ на кожен AC» для proof pack — з даних, а не руками (рев'ю WS9, 17.11: таблиця застаріла після
// повторного UAT, і рядок AC казав «немає UAT», хоча прогін уже був).
//
// Джерела (усі — у репо; шляхи від кореня проєкту, тобто від process.cwd()):
//   * рядки AC і короткі назви — docs/conformance.md (AC з префіксом --prefix);
//   * тести — назви, що починаються з AC ID, у файлах, які справді запускає раннер (collectTestRefs, як ac:coverage);
//   * «здатен упасти» — таблиці SQL- і TS-мутантів docs/qa/mutation-sql.md (npm run mutation:sql -- --markdown);
//   * вердикт UAT — manifest.json і report.md теки --uat (рядок звіту й кадр «Тоді»).
//
// Використання:
//   npm run proof-pack:table -- --prefix AC-CAL --uat docs/qa/uat/2026-11-15 --sha <40 hex> [--write docs/qa/proof-pack.md]
// Без --write друкує таблицю. З --write замінює вміст між маркерами
//   <!-- proof-pack:ac-table:start --> і <!-- proof-pack:ac-table:end -->
// у вказаному файлі (маркерів немає — помилка, файл не змінюється). Посилання на тести — на --sha (permalink),
// посилання на звіт і кадри — відносні від docs/qa/ (proof pack лежить там же).
// Номери рядків тестів беремо з робочого дерева, тож src/ і tests/ мають збігатися з --sha: інакше посилання вкажуть
// не на той рядок. Скрипт перевіряє через git саме ці файли (є на SHA, без змін) і без збігу нічого не пише.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseConformance, root, splitTableRow } from "./lib/spec-lib.mjs";
import { collectTestRefs } from "./lib/test-titles.mjs";

const REPO = "https://github.com/rhutsul/leave-portal";
const START = "<!-- proof-pack:ac-table:start -->";
const END = "<!-- proof-pack:ac-table:end -->";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`невідомий аргумент: ${key}`);
    args[key.slice(2)] = argv[++i];
  }
  for (const need of ["prefix", "uat", "sha"]) if (!args[need]) throw new Error(`бракує --${need}`);
  if (!/^[0-9a-f]{40}$/.test(args.sha)) throw new Error("--sha — повний SHA коміту (40 hex)");
  return args;
}

function git(args) {
  const r = spawnSync("git", args, { cwd: root(), encoding: "utf8" });
  if (r.error || r.status === null) throw new Error("не вдалося запустити git — потрібен репозиторій git");
  return r;
}

/**
 * Файли, з яких беремо посилання, мають бути в робочому дереві тими самими, що на --sha: номери рядків беремо з дерева,
 * посилання — на SHA. Інші файли (тести скриптів, фікстури) не важать.
 */
function assertTestsMatch(sha, files) {
  if (git(["cat-file", "-e", `${sha}^{commit}`]).status !== 0) throw new Error(`коміту ${sha} немає в цьому репозиторії`);
  const missing = files.filter((f) => git(["cat-file", "-e", `${sha}:${f}`]).status !== 0);
  const changed = files.length ? git(["diff", "--name-only", sha, "--", ...files]).stdout.trim().split("\n") : [];
  const differ = [...new Set([...missing, ...changed.filter(Boolean)])].join("\n");
  if (differ) {
    throw new Error(
      `тести в робочому дереві відрізняються від ${sha.slice(0, 7)}, і номери рядків не збіглися б з посиланнями. ` +
        `Закомітьте зміни й передайте новий --sha або поверніть файли:\n${differ}`,
    );
  }
}

function readRequired(file, what) {
  if (!existsSync(file)) throw new Error(`немає ${what}: ${path.relative(root(), file).split(path.sep).join("/")}`);
  return readFileSync(file, "utf8");
}

function readManifest(file) {
  const text = readRequired(file, "manifest.json прогону UAT");
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`manifest.json прогону UAT — не JSON: ${e.message}`);
  }
}

const level = (file) => (file.startsWith("tests/e2e/") ? "e2e" : file.startsWith("tests/db/") ? "база" : "unit");

/** Тести AC: «рівень: file.ts#L1, #L2» — одна група на файл, посилання на SHA. */
function testCell(refs, sha) {
  if (!refs?.length) return "немає";
  const byFile = new Map();
  for (const r of refs.filter((r) => r.counted !== false)) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r.line);
  }
  return [...byFile]
    .map(([file, lines]) => {
      const name = path.posix.basename(file);
      const links = lines.map((l, i) => `[${i === 0 ? `${name}#L${l}` : `#L${l}`}](${REPO}/blob/${sha}/${file}#L${l})`);
      return `${level(file)}: ${links.join(", ")}`;
    })
    .join("; ");
}

/** Таблиця мутантів: | Мутант | AC | Що зламано | Вердикт | … | → Map(AC → [{id, verdict}]); «\|» у клітинці — не межа. */
function parseMutants(file) {
  const byAc = new Map();
  if (!existsSync(file)) return byAc;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const [id, ac, , verdict] = splitTableRow(line);
    // S — SQL-мутанти, T — TS-мутанти того самого списку (правило AC у TS, напр. AC-CAL-15).
    if (!/^[ST]\d+$/.test(id ?? "")) continue;
    if (!byAc.has(ac)) byAc.set(ac, []);
    byAc.get(ac).push({ id, verdict });
  }
  return byAc;
}

function mutantCell(mutants) {
  if (!mutants?.length) return "немає мутанта";
  return mutants.map((m) => `${m.id} ${m.verdict}`).join(", ");
}

const agentName = (model) => (/sonnet/.test(model) ? "Sonnet" : /haiku/.test(model) ? "Haiku" : model);

/** Вердикт UAT: «**PASS** (R6) — Haiku: …», рядок звіту, кадр. Немає в manifest — «немає в прогоні». */
function uatCell(result, reportLines, uatRel) {
  if (!result) return "немає в прогоні";
  const agents = Object.entries(result.agentVerdicts ?? {})
    .filter(([, v]) => v)
    .map(([model, v]) => `${agentName(model)}: ${v}`)
    .join(", ");
  const rule = (result.rule ?? "").split(":")[0];
  const parts = [[`**${result.verdict}**`, rule && `(${rule})`, agents && `— ${agents}`].filter(Boolean).join(" ")];
  const row = reportLines.findIndex((l) => l.startsWith(`| ${result.id} |`));
  if (row >= 0) parts.push(`[рядок ${row + 1}](${uatRel}/report.md?plain=1#L${row + 1})`);
  if (result.screenshot) parts.push(`[кадр](${uatRel}/frames/${path.posix.basename(result.screenshot)})`);
  return parts.join(", ");
}

function buildTable({ prefix, uat, sha }) {
  const rows = parseConformance(path.join(root(), "docs", "conformance.md")).rows.filter((r) => r.id.startsWith(`${prefix}-`));
  if (rows.length === 0) throw new Error(`у docs/conformance.md немає AC з префіксом ${prefix}`);
  const refs = collectTestRefs();
  const used = new Set(rows.flatMap((r) => (refs.get(r.id) ?? []).map((t) => t.file)));
  assertTestsMatch(sha, [...used].sort());
  const manifest = readManifest(path.join(root(), uat, "manifest.json"));
  const reportLines = readRequired(path.join(root(), uat, "report.md"), "report.md прогону UAT").split("\n");
  const results = new Map((manifest.results ?? []).map((r) => [r.id, r]));
  const mutants = parseMutants(path.join(root(), "docs", "qa", "mutation-sql.md"));
  const uatPosix = uat.split("\\").join("/");
  const uatRel = path.posix.relative("docs/qa", uatPosix);

  const head = [
    `| AC | Що | Тести (на \`${sha.slice(0, 7)}\`) | Здатен упасти (SQL-мутант) | UAT ${path.posix.basename(uatPosix)} | Матриця |`,
    "|---|---|---|---|---|---|",
  ];
  const body = rows.map((r) =>
    [r.id, r.cells[1] ?? "", testCell(refs.get(r.id), sha), mutantCell(mutants.get(r.id)), uatCell(results.get(r.id), reportLines, uatRel), r.status]
      .map((c) => c.replaceAll("|", "\\|"))
      .join(" | "),
  );
  const note =
    `Згенеровано \`npm run proof-pack:table -- --prefix ${prefix} --uat ${uat} --sha ${sha}\`: ` +
    `прод \`${(manifest.deployedSha ?? "").slice(0, 7)}\`, код тестів \`${(manifest.testsCommit ?? "").slice(0, 7)}\`, ` +
    `gitDirty: ${manifest.gitDirty}. Руками не правити — перегенерувати після нового UAT чи мутантів.`;
  return [note, "", ...head, ...body.map((b) => `| ${b} |`)].join("\n");
}

function replaceBetweenMarkers(text, table) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start < 0 || end < start) throw new Error(`немає маркерів ${START} … ${END}`);
  return `${text.slice(0, start + START.length)}\n${table}\n${text.slice(end)}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const table = buildTable(args);
  if (!args.write) {
    console.log(table);
    return;
  }
  const file = path.join(root(), args.write);
  writeFileSync(file, replaceBetweenMarkers(readRequired(file, "файлу для --write"), table));
  console.log(`Таблицю записано: ${args.write}`);
}

try {
  main();
} catch (e) {
  console.error(`proof-pack-table: ${e.message}`);
  process.exit(1);
}
