import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixtures, runScript } from "./run-script";

const SHA = "abcdef0123456789abcdef0123456789abcdef01";
const BLOB = `https://github.com/rhutsul/leave-portal/blob/${SHA}`;
const dirs: string[] = [];

/** Копія фікстури в тимчасовій теці: --write змінює файл, а фікстура в git має лишатися як є. */
function project() {
  const dir = mkdtempSync(path.join(tmpdir(), "proof-pack-"));
  cpSync(path.join(fixtures, "proof-pack"), dir, { recursive: true });
  dirs.push(dir);
  return dir;
}

const run = (cwd: string, ...extra: string[]) =>
  runScript("proof-pack-table.mjs", cwd, {}, ["--prefix", "AC-DEMO", "--uat", "docs/qa/uat/2026-01-05", "--sha", SHA, ...extra]);

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("scripts/proof-pack-table.mjs", () => {
  it("builds one row per AC of the prefix from the matrix, test titles, mutants and the UAT manifest", () => {
    const { code, out } = run(project());
    expect(code).toBe(0);
    const rows = out.split("\n").filter((l) => l.startsWith("| AC-"));
    expect(rows).toHaveLength(2);
    expect(out).not.toContain("AC-OTHER-01");

    const [first, second] = rows;
    expect(first).toContain("| AC-DEMO-01 | Закриття цілими днями |");
    expect(first).toContain(`[demo.test.ts#L3](${BLOB}/tests/db/demo.test.ts#L3), [#L7](${BLOB}/tests/db/demo.test.ts#L7)`);
    expect(first).toContain("база:");
    expect(first).toContain("S1 KILLED, S2 SURVIVED");
    expect(first).toContain("**PASS** (R6) — Haiku: NEEDS-HUMAN, Sonnet: PASS");
    expect(first).toContain("[рядок 5](uat/2026-01-05/report.md?plain=1#L5)");
    expect(first).toContain("[кадр](uat/2026-01-05/frames/AC-DEMO-01-then-1.png)");

    expect(second).toContain(`e2e: [demo.spec.ts#L3](${BLOB}/tests/e2e/demo.spec.ts#L3)`);
    expect(second).toContain("немає мутанта");
    expect(second).toContain("немає в прогоні");
    expect(out).toContain("прод `1111111`, код тестів `2222222`, gitDirty: false");
  });

  it("--write replaces only the text between the markers", () => {
    const dir = project();
    const { code } = run(dir, "--write", "docs/qa/proof-pack.md");
    expect(code).toBe(0);
    const text = readFileSync(path.join(dir, "docs", "qa", "proof-pack.md"), "utf8");
    expect(text).not.toContain("стара таблиця");
    expect(text).toContain("Вступ лишається.");
    expect(text).toContain("Кінець лишається.");
    expect(text).toMatch(/<!-- proof-pack:ac-table:start -->\nЗгенеровано[\s\S]*\| AC-DEMO-02 [\s\S]*\n<!-- proof-pack:ac-table:end -->/);
  });

  it("refuses a short SHA and a file without markers, and leaves the file unchanged", () => {
    const dir = project();
    const short = runScript("proof-pack-table.mjs", dir, {}, ["--prefix", "AC-DEMO", "--uat", "docs/qa/uat/2026-01-05", "--sha", "abc1234"]);
    expect(short.code).toBe(1);
    expect(short.out).toContain("--sha — повний SHA");

    const noMarkers = run(dir, "--write", "docs/conformance.md");
    expect(noMarkers.code).toBe(1);
    expect(noMarkers.out).toContain("Немає маркерів");
    expect(readFileSync(path.join(dir, "docs", "conformance.md"), "utf8")).toContain("| AC-DEMO-01 |");
  });
});
