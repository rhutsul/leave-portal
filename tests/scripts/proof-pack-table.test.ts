import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixtures, runScript } from "./run-script";

const dirs: string[] = [];

function git(cwd: string, ...args: string[]) {
  const r = spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.test", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

/**
 * Копія фікстури в тимчасовому репозиторії git з одним комітом: --write змінює файл (фікстура в git має лишатися як є),
 * а скрипт звіряє тести робочого дерева з --sha через git.
 */
function project() {
  const dir = mkdtempSync(path.join(tmpdir(), "proof-pack-"));
  cpSync(path.join(fixtures, "proof-pack"), dir, { recursive: true });
  dirs.push(dir);
  git(dir, "init", "-q");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "fixture");
  return { dir, sha: git(dir, "rev-parse", "HEAD") };
}

const UAT = ["--prefix", "AC-DEMO", "--uat", "docs/qa/uat/2026-01-05"];
const run = (dir: string, sha: string, ...extra: string[]) => runScript("proof-pack-table.mjs", dir, {}, [...UAT, "--sha", sha, ...extra]);

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("scripts/proof-pack-table.mjs", () => {
  it("builds one row per AC of the prefix from the matrix, test titles, mutants and the UAT manifest", () => {
    const { dir, sha } = project();
    const blob = `https://github.com/rhutsul/leave-portal/blob/${sha}`;
    const { code, out } = run(dir, sha);
    expect(code).toBe(0);
    const rows = out.split("\n").filter((l) => l.startsWith("| AC-"));
    expect(rows).toHaveLength(2);
    expect(out).not.toContain("AC-OTHER-01");

    const [first, second] = rows;
    expect(first).toContain("| AC-DEMO-01 | Закриття \\| дні |");
    expect(first).toContain(`база: [demo.test.ts#L3](${blob}/tests/db/demo.test.ts#L3), [#L7](${blob}/tests/db/demo.test.ts#L7)`);
    // TS-мутант того самого списку (T1) — теж доказ «здатен упасти», коли правило AC живе в TS.
    expect(first).toContain("| S1 KILLED, S2 SURVIVED, T1 KILLED |");
    expect(first).toContain("**PASS** (R6) — Haiku: NEEDS-HUMAN, Sonnet: PASS");
    expect(first).toContain("[рядок 5](uat/2026-01-05/report.md?plain=1#L5)");
    expect(first).toContain("[кадр](uat/2026-01-05/frames/AC-DEMO-01-then-1.png)");

    expect(second).toContain(`e2e: [demo.spec.ts#L3](${blob}/tests/e2e/demo.spec.ts#L3)`);
    expect(second).toContain("немає мутанта");
    expect(second).toContain("немає в прогоні");
    expect(out).toContain("прод `1111111`, код тестів `2222222`, gitDirty: false");
  });

  it("--write replaces only the text between the markers", () => {
    const { dir, sha } = project();
    const { code } = run(dir, sha, "--write", "docs/qa/proof-pack.md");
    expect(code).toBe(0);
    const text = readFileSync(path.join(dir, "docs", "qa", "proof-pack.md"), "utf8");
    expect(text).not.toContain("стара таблиця");
    expect(text).toContain("Вступ лишається.");
    expect(text).toContain("Кінець лишається.");
    expect(text).toMatch(/<!-- proof-pack:ac-table:start -->\nЗгенеровано[\s\S]*\| AC-DEMO-02 [\s\S]*\n<!-- proof-pack:ac-table:end -->/);
  });

  it("refuses tests that differ from --sha: the line numbers would not match the links", () => {
    const { dir, sha } = project();
    appendFileSync(path.join(dir, "tests", "db", "demo.test.ts"), "\n// later change\n");
    const { code, out } = run(dir, sha, "--write", "docs/qa/proof-pack.md");
    expect(code).toBe(1);
    expect(out).toContain(`тести в робочому дереві відрізняються від ${sha.slice(0, 7)}`);
    expect(out).toContain("tests/db/demo.test.ts");
    expect(readFileSync(path.join(dir, "docs", "qa", "proof-pack.md"), "utf8")).toContain("стара таблиця");
  });

  it("explains a short SHA, a missing manifest and a file without markers in Ukrainian", () => {
    const { dir, sha } = project();
    const short = run(dir, "abc1234");
    expect(short.code).toBe(1);
    expect(short.out).toContain("--sha — повний SHA");

    const noUat = runScript("proof-pack-table.mjs", dir, {}, ["--prefix", "AC-DEMO", "--uat", "docs/qa/uat/2099-01-01", "--sha", sha]);
    expect(noUat.code).toBe(1);
    expect(noUat.out).toContain("немає manifest.json прогону UAT: docs/qa/uat/2099-01-01/manifest.json");

    const noMarkers = run(dir, sha, "--write", "docs/conformance.md");
    expect(noMarkers.code).toBe(1);
    expect(noMarkers.out).toContain("немає маркерів");
    expect(readFileSync(path.join(dir, "docs", "conformance.md"), "utf8")).toContain("| AC-DEMO-01 |");
  });
});
