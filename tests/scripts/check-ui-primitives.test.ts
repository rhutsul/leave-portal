import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { repoRoot } from "./run-script";

// Проєкт у тимчасовій теці: сторінки із сирими елементами не потрапляють під check:ui самого репо.
const roots: string[] = [];
function project(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "ui-primitives-"));
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
  const r = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "check-ui-primitives.mjs"), ...args], {
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const page = (body: string) => `export default function Page() {\n  return (\n${body}\n  );\n}\n`;

describe("scripts/check-ui-primitives.mjs", () => {
  it("passes components from @/components/ui and raw elements inside src/components/ui", () => {
    const root = project({
      "src/app/page.tsx": page('    <Button onClick={go}>Go</Button>'),
      "src/components/ui/button.tsx": "export const Button = (p) => <button {...p} />;\n",
      "src/components/ui/table.tsx": 'export const Table = (p) => <table className="w-full" {...p} />;\n',
    });
    const { code, out } = run("--root", root);
    expect(code).toBe(0);
    expect(out).toContain("OK");
  });

  it("reports each raw control outside src/components/ui with its line", () => {
    const root = project({
      "src/app/page.tsx": page(
        ['    <form>', '      <button type="submit">Save</button>', "      <select name=\"t\" />", "      <table>", "    </form>"].join("\n"),
      ),
      "src/components/sidebar.tsx": "export const S = () => <textarea />;\n",
    });
    const { code, out } = run("--root", root);
    expect(code).toBe(1);
    expect(out).toContain("src/app/page.tsx:4  [raw-button]");
    expect(out).toContain("src/app/page.tsx:5  [raw-select]");
    expect(out).toContain("src/app/page.tsx:6  [raw-table]");
    expect(out).toContain("src/components/sidebar.tsx:1  [raw-textarea]");
    expect(out).toContain("4 порушень у 2 файлах");
  });

  it("allows hidden inputs, also with attributes on several lines, and reports other inputs", () => {
    const root = project({
      "src/app/form.tsx": page(
        [
          '    <input type="hidden" name="id" value={id} />',
          "    <input",
          '      name="hours"',
          "      type={\"hidden\"}",
          "      value={a > b ? 1 : 2}",
          "    />",
          "    <input",
          '      data-x=">"',
          '      type="time"',
          "    />",
          `    <input title="type='hidden'" type="text" />`,
        ].join("\n"),
      ),
    });
    const { code, out } = run("--root", root, "--json");
    expect(code).toBe(1);
    const { findings } = JSON.parse(out);
    // type='hidden' усередині title — не атрибут type: поле видиме й порушує правило.
    expect(findings).toEqual([
      expect.objectContaining({ file: "src/app/form.tsx", line: 9, rule: "raw-input" }),
      expect.objectContaining({ file: "src/app/form.tsx", line: 13, rule: "raw-input" }),
    ]);
  });

  it("ignores comments, but not code after a URL in a string", () => {
    const root = project({
      "src/app/page.tsx": page(
        [
          "    // <button> used to be here",
          "    {/* <table> of records */}",
          "    /* <select>",
          "       <textarea> */",
          '    <a href="https://example.test/a">x</a><button>y</button>',
        ].join("\n"),
      ),
    });
    const { code, out } = run("--root", root);
    expect(code).toBe(1);
    expect(out).toContain("src/app/page.tsx:7  [raw-button]");
    expect(out).toContain("1 порушень у 1 файлах");
  });

  it("treats // in JSX text as text, so a control after it on the same line is still reported", () => {
    const root = project({
      "src/app/page.tsx": page("    <p>See https://example.test/help // or ask</p><textarea />"),
    });
    const { code, out } = run("--root", root);
    expect(code).toBe(1);
    expect(out).toContain("src/app/page.tsx:3  [raw-textarea]");
  });

  it("ignores tags in string literals, but not a spread after type=hidden or design-ok outside a comment", () => {
    const root = project({
      "src/app/page.tsx": page(
        [
          '    <p>{"Use <button> from the kit"}</p>',
          "    <input type=\"hidden\" {...props} />",
          '    <p title="design-ok: not a comment" /><select />',
        ].join("\n"),
      ),
    });
    const { code, out } = run("--root", root, "--json");
    expect(code).toBe(1);
    const { findings } = JSON.parse(out);
    expect(findings).toEqual([
      expect.objectContaining({ line: 4, rule: "raw-input" }),
      expect.objectContaining({ line: 5, rule: "raw-select" }),
    ]);
  });

  it("still checks a folder that src/components/ui links to", () => {
    // src/zz обходиться після src/components, тож посилання з теки дизайн-системи трапляється першим.
    const root = project({ "src/zz/page.tsx": page("    <textarea />") });
    mkdirSync(path.join(root, "src", "components", "ui"), { recursive: true });
    symlinkSync(path.join(root, "src", "zz"), path.join(root, "src", "components", "ui", "linked"), "junction");
    const { code, out } = run("--root", root);
    expect(code).toBe(1);
    expect(out).toContain("src/zz/page.tsx:3  [raw-textarea]");
  });

  it("skips a line with a design-ok reason, but not a bare design-ok", () => {
    const root = project({
      "src/app/page.tsx": page('    <button /* design-ok: third-party widget needs a native button */ type="button" />'),
    });
    expect(run("--root", root).code).toBe(0);
    const bare = project({ "src/app/page.tsx": page("    <button /* design-ok: */ />") });
    const { code, out } = run("--root", bare);
    expect(code).toBe(1);
    expect(out).toContain("src/app/page.tsx:3  [raw-button]");
  });

  it("stops with code 2 when there is nothing to check or --root has no path", () => {
    expect(run("--root").code).toBe(2);
    const { code, out } = run("--root", project({ "README.md": "# x\n" }));
    expect(code).toBe(2);
    expect(out).toContain("немає ні src/");
  });

  it("stops with code 2 instead of OK when a folder cannot be read", () => {
    const root = project({ "src/app/page.tsx": page("    <Button />") });
    symlinkSync(path.join(root, "missing"), path.join(root, "src", "gone"), "junction");
    const { code, out } = run("--root", root);
    expect(code).toBe(2);
    expect(out).toContain("перевірку не завершено");
  });
});
