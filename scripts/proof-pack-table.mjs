#!/usr/bin/env node
// Таблиця «Доказ на кожен AC» для proof pack — з даних, а не руками (рев'ю WS9, 17.11: таблиця застаріла після
// повторного UAT, і рядок AC казав «немає UAT», хоча прогін уже був).
//
// Джерела (усі — у репо; шляхи від кореня проєкту, тобто від process.cwd()):
//   * рядки AC і короткі назви — docs/conformance.md (AC з префіксом --prefix);
//   * тести — назви, що починаються з AC ID, у файлах, які справді запускає раннер (collectTestRefs, як ac:coverage);
//   * «здатен упасти» — таблиця SQL-мутантів docs/qa/mutation-sql.md (npm run mutation:sql -- --markdown);
//   * вердикт UAT — manifest.json і report.md теки --uat (рядок звіту й кадр «Тоді»).
//
// Використання:
//   npm run proof-pack:table -- --prefix AC-CAL --uat docs/qa/uat/2026-11-15 --sha <40 hex> [--write docs/qa/proof-pack.md]
// Без --write друкує таблицю. З --write замінює вміст між маркерами
//   <!-- proof-pack:ac-table:start --> і <!-- proof-pack:ac-table:end -->
// у вказаному файлі (маркерів немає — помилка, файл не змінюється). Посилання на тести — на --sha (permalink),
// посилання на звіт і кадри — відносні від docs/qa/ (proof pack лежить там же).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseConformance, root } from "./lib/spec-lib.mjs";
import { collectTestRefs } from "./lib/test-titles.mjs";

const REPO = "https://github.com/rhutsul/leave-portal";
const START = "<!-- proof-pack:ac-table:start -->";
const END = "<!-- proof-pack:ac-table:end -->";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`Невідомий аргумент: ${key}`);
    args[key.slice(2)] = argv[++i];
  }
  for (const need of ["prefix", "uat", "sha"]) if (!args[need]) throw new Error(`Бракує --${need}`);
  if (!/^[0-9a-f]{40}$/.test(args.sha)) throw new Error("--sha — повний SHA коміту (40 hex)");
  return args;
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

/** Таблиця мутантів: | Мутант | AC | Що зламано | Вердикт | … | → Map(AC → [{id, verdict}]). */
function parseMutants(file) {
  const byAc = new Map();
  if (!existsSync(file)) return byAc;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (!/^S\d+$/.test(cells[1] ?? "")) continue;
    const [, id, ac, , verdict] = cells;
    if (!byAc.has(ac)) byAc.set(ac, []);
    byAc.get(ac).push({ id, verdict });
  }
  return byAc;
}

function mutantCell(mutants) {
  if (!mutants?.length) return "немає мутанта";
  return mutants.map((m) => `${m.id} ${m.verdict}`).join(", ");
}

/** Вердикт UAT: «**PASS** (R6), Haiku: …», рядок звіту, кадр. Немає в manifest — «немає в прогоні». */
function uatCell(result, reportLines, uatRel) {
  if (!result) return "немає в прогоні";
  const agents = Object.entries(result.agentVerdicts ?? {})
    .filter(([, v]) => v)
    .map(([model, v]) => `${/sonnet/.test(model) ? "Sonnet" : /haiku/.test(model) ? "Haiku" : model}: ${v}`)
    .join(", ");
  const rule = (result.rule ?? "").split(":")[0];
  const row = reportLines.findIndex((l) => l.startsWith(`| ${result.id} |`));
  const parts = [`**${result.verdict}**${rule ? ` (${rule})` : ""}${agents ? ` — ${agents}` : ""}`];
  if (row >= 0) parts.push(`[рядок ${row + 1}](${uatRel}/report.md?plain=1#L${row + 1})`);
  if (result.screenshot) parts.push(`[кадр](${uatRel}/frames/${path.posix.basename(result.screenshot)})`);
  return parts.join(", ");
}

function buildTable({ prefix, uat, sha }) {
  const rows = parseConformance(path.join(root(), "docs", "conformance.md")).rows.filter((r) => r.id.startsWith(`${prefix}-`));
  if (rows.length === 0) throw new Error(`У docs/conformance.md немає AC з префіксом ${prefix}`);
  const manifest = JSON.parse(readFileSync(path.join(root(), uat, "manifest.json"), "utf8"));
  const reportLines = readFileSync(path.join(root(), uat, "report.md"), "utf8").split("\n");
  const results = new Map((manifest.results ?? []).map((r) => [r.id, r]));
  const refs = collectTestRefs();
  const mutants = parseMutants(path.join(root(), "docs", "qa", "mutation-sql.md"));
  const uatRel = path.posix.relative("docs/qa", uat.replaceAll("\\", "/"));
  const date = path.posix.basename(uat.replaceAll("\\", "/"));

  const head = [
    `| AC | Що | Тести (на \`${sha.slice(0, 7)}\`) | Здатен упасти (SQL-мутант) | UAT ${date} | Матриця |`,
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
  if (start < 0 || end < start) throw new Error(`Немає маркерів ${START} … ${END}`);
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
  writeFileSync(file, replaceBetweenMarkers(readFileSync(file, "utf8"), table));
  console.log(`Таблицю записано: ${args.write}`);
}

try {
  main();
} catch (e) {
  console.error(`proof-pack-table: ${e.message}`);
  process.exit(1);
}
