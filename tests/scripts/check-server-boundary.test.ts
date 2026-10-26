import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { repoRoot } from "./run-script";

// Проєкт у тимчасовій теці: файли з порушеннями не потрапляють під lint, typecheck і check:design репо.
const roots: string[] = [];
function project(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "boundary-"));
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
  const r = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "check-server-boundary.mjs"), ...args], {
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const ADMIN = { "src/lib/supabase/admin.ts": 'import "server-only";\nexport const admin = {};\n' };

describe("scripts/check-server-boundary.mjs", () => {
  it("passes when only a server action imports the admin client", () => {
    const root = project({ ...ADMIN, "src/app/actions.ts": 'import { admin } from "@/lib/supabase/admin";\n' });
    expect(run("--root", root)).toMatchObject({ code: 0 });
  });

  it("catches a relative import of the admin client from a helper", () => {
    const root = project({ ...ADMIN, "src/lib/helper.ts": 'import { admin } from "./supabase/admin";\n' });
    const { code, out } = run("--root", root);
    expect(code).toBe(1);
    expect(out).toContain("src/lib/helper.ts:1");
  });

  it("catches a multi-line import and reports the line of its specifier", () => {
    const root = project({
      ...ADMIN,
      "src/components/x.tsx": '"use client";\nimport {\n  admin,\n} from "@/lib/supabase/admin";\n',
    });
    const { code, out } = run("--root", root);
    expect(code).toBe(1);
    expect(out).toContain('src/components/x.tsx:4  admin-клієнт імпортовано у файлі з "use client"');
  });

  it('counts "use server" only as a directive at the top of the module', () => {
    const root = project({
      ...ADMIN,
      "src/lib/helper.ts": 'import { admin } from "@/lib/supabase/admin";\nconst tag = {\n"use server": true };\n',
      "src/app/thing/do.ts": '// server action\n"use server";\nimport { admin } from "@/lib/supabase/admin";\n',
    });
    const { code, out } = run("--root", root);
    expect(code).toBe(1);
    expect(out).toContain("src/lib/helper.ts:1");
    expect(out).not.toContain("src/app/thing/do.ts");
  });

  it("does not take an expression or a shebang for the end of the prologue", () => {
    const root = project({
      ...ADMIN,
      "src/lib/helper.ts": '"use server".length;\nimport { admin } from "@/lib/supabase/admin";\n',
      "src/app/thing/run.ts": '#!/usr/bin/env node\n"use client";\nimport { admin } from "@/lib/supabase/admin";\n',
    });
    const { code, out } = run("--root", root);
    expect(code).toBe(1);
    expect(out).toContain("src/lib/helper.ts:2");
    expect(out).toContain('src/app/thing/run.ts:3  admin-клієнт імпортовано у файлі з "use client"');
  });

  it("catches a dynamic import in backticks and ignores a path mentioned in a comment", () => {
    const root = project({
      ...ADMIN,
      "src/lib/lazy.ts": "export const load = () => import(`@/lib/supabase/admin`);\n",
      "src/lib/notes.ts": '// see import "@/lib/supabase/admin"\n/*\n * from "@/lib/supabase/admin"\n */\nexport {};\n',
    });
    const { code, out } = run("--root", root);
    expect(code).toBe(1);
    expect(out).toContain("src/lib/lazy.ts:1");
    expect(out).not.toContain("src/lib/notes.ts");
  });

  it("stops with code 2 when --root has no path", () => {
    const { code, out } = run("--root");
    expect(code).toBe(2);
    expect(out).toContain("після --root вкажіть шлях");
  });

  it("stops with code 2 instead of OK when a folder cannot be read", () => {
    const root = project(ADMIN);
    symlinkSync(path.join(root, "missing"), path.join(root, "src", "gone"), "junction");
    const { code, out } = run("--root", root);
    expect(code).toBe(2);
    expect(out).toContain("перевірку не завершено");
  });
});
