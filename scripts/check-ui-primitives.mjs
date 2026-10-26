#!/usr/bin/env node
// Архітектурне правило «лише компоненти дизайн-системи»: поза src/components/ui у JSX немає сирих елементів керування
// <button>, <input>, <select>, <textarea> і <table> — їхні стилі, стани й доступність живуть у Button, Input, Select,
// Textarea, Table… з @/components/ui (DESIGN.md, розділ 5). Рішення й межі правила — docs/decisions/0004-design-system.md.
//   - перевіряє .tsx і .jsx у src/ (поза src/components/ui); якщо теки src/ немає — у app/ і components/ кореня (поза
//     components/ui);
//   - <input type="hidden"> дозволено: це дані форми, а не елемент керування, вигляду в нього немає;
//   - коментарі й рядкові літерали не рахуються (// …, /* … */, зокрема {/* <button> */} у JSX, і "<button"); «//» у
//     тексті JSX (https://… між тегами) — не коментар: такий коментар має стояти на початку рядка або після коду
//     ({ ( [ ; , = ) } & | ? !); «/* … */» — коментар завжди;
//   - type="hidden" не рахується, якщо після нього стоїть spread ({...props}): той може змінити type;
//   - виняток — `design-ok: <причина>` у коментарі рядка, де відкрито тег: <button /* design-ok: … */ …>.
// Використання: node scripts/check-ui-primitives.mjs [--root <dir>] [--json]
// Код виходу: 0 — порушень немає, 1 — є порушення, 2 — немає чого перевіряти, --root без шляху або тека, яку не вдалося
// прочитати.

import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const fail = (message) => {
  console.error(`check-ui-primitives: ${message}`);
  process.exit(2);
};

const args = process.argv.slice(2);
const rootIdx = args.indexOf("--root");
const rootArg = rootIdx >= 0 ? args[rootIdx + 1] : undefined;
if (rootIdx >= 0 && (!rootArg || rootArg.startsWith("--"))) fail("після --root вкажіть шлях до кореня проєкту.");
const root = rootArg ?? process.cwd();
const asJson = args.includes("--json");

const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

const hasSrc = isDir(join(root, "src"));
const BASES = hasSrc ? ["src"] : ["app", "components"].filter((d) => isDir(join(root, d)));
if (BASES.length === 0) fail(`у ${root} немає ні src/, ні app/, components/ — вкажіть --root <корінь проєкту>.`);
const UI_DIR = join(hasSrc ? "src" : "", "components", "ui") + sep;
const SKIP_DIRS = new Set(["node_modules", ".next"]);
const EXT = /\.(tsx|jsx)$/;

const COMPONENTS = {
  button: "Button з @/components/ui/button (посилання з виглядом кнопки — buttonVariants)",
  input: "Input, Checkbox чи RadioGroup з @/components/ui; <input type=\"hidden\"> дозволено",
  select: "Select з @/components/ui/select",
  textarea: "Textarea з @/components/ui/textarea",
  table: "Table, TableRow, TableCell… з @/components/ui/table",
};
const TAG = /<(button|input|select|textarea|table)(?=[\s/>])/g;

// Коментарі → пробіли тієї ж довжини (переноси рядків лишаються): номери рядків і позиції не зсуваються.
// Рядки в лапках проходимо цілими, щоб «//» в адресі (https://…) не став коментарем; так само «//» у тексті JSX:
// перед коментарем — початок рядка або символ коду, а в тексті між тегами перед ним зазвичай літера чи «:».
const BEFORE_COMMENT = new Set(["{", "(", "[", ";", ",", "=", ")", "}", "&", "|", "?", "!"]);
function startsComment(text, i) {
  let j = i - 1;
  while (j >= 0 && (text[j] === " " || text[j] === "\t")) j--;
  return j < 0 || text[j] === "\n" || text[j] === "\r" || BEFORE_COMMENT.has(text[j]);
}
// strings: true — ще й вміст рядків у лапках → пробіли (лапки лишаються): "<button" у рядковому літералі — не тег.
// Атрибути тегу читаємо з копії, де замасковано лише коментарі.
function mask(text, { strings = false } = {}) {
  const out = text.split("");
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") {
        if (strings) out[i] = " ";
        i++;
        if (strings && i < text.length && text[i] !== "\n" && text[i] !== "\r") out[i] = " ";
      } else if (ch === quote || (ch === "\n" && quote !== "`")) quote = null;
      else if (strings && ch !== "\n" && ch !== "\r") out[i] = " ";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "/" && (text[i + 1] === "*" || (text[i + 1] === "/" && startsComment(text, i)))) {
      const end = text[i + 1] === "/" ? text.indexOf("\n", i) : text.indexOf("*/", i + 2) + 2;
      const stop = end <= 1 || end === -1 ? text.length : end;
      for (let j = i; j < stop; j++) if (out[j] !== "\n" && out[j] !== "\r") out[j] = " ";
      i = stop - 1;
    }
  }
  return out.join("");
}

// Текст відкривального тегу до його «>»: атрибути можуть бути на кількох рядках і містити {…} та рядки з «>».
function openingTag(text, start) {
  let depth = 0;
  let quote = null;
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
}

// Атрибути відкривального тегу [ім'я, значення] у порядку появи: значення в лапках чи {…} читаємо цілим, тож
// type='hidden' усередині title="…" не стане атрибутом type. Spread ({...props}) — запис з ім'ям, що починається з «{».
function attributes(tag) {
  const attrs = [];
  let i = tag.search(/[\s/>]/);
  while (i >= 0 && i < tag.length) {
    while (/\s/.test(tag[i] ?? "")) i++;
    if (i >= tag.length || tag[i] === ">" || tag[i] === "/") break;
    let name = "";
    while (i < tag.length && !/[\s=/>]/.test(tag[i])) name += tag[i++];
    while (/\s/.test(tag[i] ?? "")) i++;
    let value = "";
    if (tag[i] === "=") {
      i++;
      while (/\s/.test(tag[i] ?? "")) i++;
      const start = i;
      if (tag[i] === '"' || tag[i] === "'") {
        const close = tag.indexOf(tag[i], i + 1);
        i = close < 0 ? tag.length : close + 1;
      } else if (tag[i] === "{") {
        let depth = 0;
        let quote = null;
        for (; i < tag.length; i++) {
          const ch = tag[i];
          if (quote) {
            if (ch === "\\") i++;
            else if (ch === quote) quote = null;
          } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
          else if (ch === "{") depth++;
          else if (ch === "}" && --depth === 0) {
            i++;
            break;
          }
        }
      } else {
        while (i < tag.length && !/[\s/>]/.test(tag[i])) i++;
      }
      value = tag.slice(start, i);
    }
    if (name) attrs.push([name, value]);
    else i++;
  }
  return attrs;
}

// Прихований — лише коли останній type = "hidden" і жоден spread після нього не може його перевизначити.
function isHidden(tag) {
  const attrs = attributes(tag);
  const last = attrs.findLastIndex(([name]) => name === "type");
  if (last < 0 || !/^(?:"hidden"|'hidden'|\{\s*["'`]hidden["'`]\s*\})$/.test(attrs[last][1])) return false;
  return !attrs.slice(last + 1).some(([name]) => name.startsWith("{"));
}

// Текст коментарів рядка: символи, які mask() замінив пробілами.
function commentsOf(line, maskedLine) {
  let out = "";
  for (let i = 0; i < line.length; i++) if (line[i] !== maskedLine[i]) out += line[i];
  return out;
}

const unreadable = (path, error) =>
  fail(`не вдалося прочитати ${relative(root, path) || "."} (${error.code ?? error.message}) — перевірку не завершено.`);

// Посилання на теку (symlink, junction) обходимо раз: петля посилань не зациклить обхід.
const seen = new Set();
function walk(dir, out = []) {
  // Теку дизайн-системи не обходимо зовсім (і не позначаємо її справжній шлях обійденим): посилання з неї на іншу
  // теку src/ не сховає ту від перевірки.
  if ((relative(root, dir) + sep).startsWith(UI_DIR)) return out;
  let real;
  try {
    real = realpathSync(dir);
  } catch (error) {
    unreadable(dir, error);
  }
  if (seen.has(real)) return out;
  seen.add(real);
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

const findings = [];
for (const file of BASES.flatMap((b) => walk(join(root, b)))) {
  const rel = relative(root, file);
  if (rel.startsWith(UI_DIR)) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    unreadable(file, error);
  }
  const lines = text.split(/\r?\n/);
  const code = mask(text);
  const codeLines = code.split(/\r?\n/);
  const scan = mask(text, { strings: true });
  for (const m of scan.matchAll(TAG)) {
    const element = m[1];
    if (element === "input" && isHidden(openingTag(code, m.index))) continue;
    const line = code.slice(0, m.index).split("\n").length;
    // Виняток — лише в коментарі цього рядка й лише з причиною: «design-ok:» без тексту після нього не рахується.
    if (/design-ok:\s*[\p{L}\p{N}]/u.test(commentsOf(lines[line - 1], codeLines[line - 1]))) continue;
    findings.push({
      file: rel.split(sep).join("/"),
      line,
      rule: `raw-${element}`,
      match: `<${element}`,
      message: `сирий <${element}> — візьміть ${COMPONENTS[element]}`,
    });
  }
}

const scanned = BASES.map((b) => `${b}/`);
if (asJson) {
  console.log(JSON.stringify({ ok: findings.length === 0, scanned, findings }, null, 2));
} else {
  if (!hasSrc) console.log(`check-ui-primitives: теки src/ немає — перевіряю ${scanned.join(", ")}.`);
  if (findings.length === 0) {
    console.log(`check-ui-primitives: OK — сирих <button>, <input>, <select>, <textarea>, <table> поза ${UI_DIR.slice(0, -1).split(sep).join("/")} немає.`);
  } else {
    for (const f of findings) console.log(`${f.file}:${f.line}  [${f.rule}]  ${f.match}  — ${f.message}`);
    const files = new Set(findings.map((f) => f.file)).size;
    console.log(`\ncheck-ui-primitives: ${findings.length} порушень у ${files} файлах. Компоненти — у DESIGN.md, розділ 5.`);
  }
}
process.exit(findings.length === 0 ? 0 : 1);
