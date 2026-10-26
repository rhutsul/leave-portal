import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { repoRoot } from "./run-script";

// Проєкт у тимчасовій теці: файли з сирими кольорами не потрапляють під check:design самого репо.
const roots: string[] = [];
function project(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "tokens-"));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function run(...args: string[]) {
  const r = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "check-design-tokens.mjs"), ...args], {
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe("scripts/check-design-tokens.mjs", () => {
  it("passes token classes and reports a raw palette class", () => {
    expect(run("--root", project({ "src/app/page.tsx": 'export const c = "bg-primary";\n' })).code).toBe(0);
    const { code, out } = run("--root", project({ "src/app/page.tsx": 'export const c = "bg-zinc-900";\n' }));
    expect(code).toBe(1);
    expect(out).toContain("src/app/page.tsx:1  [raw-palette]");
  });

  it("stops with code 2 when --root has no path", () => {
    const { code, out } = run("--root");
    expect(code).toBe(2);
    expect(out).toContain("після --root вкажіть шлях");
  });

  it("stops with code 2 instead of OK when a folder cannot be read", () => {
    const root = project({ "src/app/page.tsx": 'export const c = "bg-primary";\n' });
    symlinkSync(path.join(root, "missing"), path.join(root, "src", "gone"), "junction");
    const { code, out } = run("--root", root);
    expect(code).toBe(2);
    expect(out).toContain("перевірку не завершено");
  });
});
