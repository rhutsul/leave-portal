#!/usr/bin/env node
// WS11, трек B: алерт людині в Telegram з червоного smoke (.github/workflows/smoke.yml, крок `if: failure()`).
// Що впало (причина з SMOKE_FAIL_FILE, яку пише scripts/smoke.mjs), середовище, адреса (лише хост), коміт, job і
// посилання на прогін. Без тіла відповіді сервера і без значень змінних. Формат — HTML Telegram (жирні підписи,
// посилання без картки попереднього перегляду); усе підставлене екрануємо.
// Секрети — лише зі змінних середовища кроку: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID. Без них — попередження, код 0.
// Токен стоїть в адресі запиту до Telegram, тому ні адресу, ні текст помилки fetch не друкуємо.
// Інші змінні: ALERT_ENV, ALERT_BRANCH (необов'язково), ALERT_URL, ALERT_JOB, ALERT_SHA, RUN_URL, SMOKE_FAIL_FILE;
// GITHUB_REPOSITORY і GITHUB_WORKFLOW — від Actions. TELEGRAM_ALERT_DRY_RUN=1 — лише надрукувати текст.
// Завжди код 0: червоним прогін робить сам smoke, а не алерт.
// Взято з (крок алерту винесено з обох jobs в один файл):
// https://github.com/koldovsky/2026-quitcode-11-devops-operations-hw/blob/main/materials/ops-kit/.github/workflows/smoke.yml
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REASON_MAX = 300;

/** Екранування для parse_mode=HTML у Telegram: лише &, < і > (і лапки — для атрибута href). */
export const escapeHtml = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Лише хост адреси: без схеми, шляху, параметрів і фрагмента (там може бути токен). */
export function hostOf(url) {
  const s = String(url ?? "").trim();
  if (!s) return "";
  return s.replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "").replace(/^[^@]*@/, "");
}

/**
 * Текст алерту (HTML). failures — рядки причин зі smoke.mjs; показуємо першу і скільки ще.
 * @param {{ repository?: string, workflow?: string, job?: string, env?: string, branch?: string, url?: string,
 *   sha?: string, runUrl?: string, failures?: string[] }} alert
 */
export function formatAlert({ repository, workflow, job, env, branch, url, sha, runUrl, failures = [] }) {
  const lines = [`🔴 <b>Червоний smoke</b> · ${escapeHtml(String(repository || "?").split("/").pop())}`];
  lines.push(`<b>Середовище:</b> ${escapeHtml(env || "?")}${branch ? ` (гілка ${escapeHtml(branch)})` : ""}`);
  lines.push(`<b>Адреса:</b> ${escapeHtml(hostOf(url) || "не задано")}`);
  if (sha) lines.push(`<b>Коміт:</b> <code>${escapeHtml(String(sha).slice(0, 7))}</code>`);
  lines.push(`<b>Job:</b> ${escapeHtml(workflow || "smoke")} / ${escapeHtml(job || "?")}`);
  const reasons = failures.map((f) => String(f).trim()).filter(Boolean);
  if (reasons.length) {
    const first = reasons[0].length > REASON_MAX ? `${reasons[0].slice(0, REASON_MAX)}…` : reasons[0];
    const more = reasons.length > 1 ? ` (і ще ${reasons.length - 1})` : "";
    lines.push(`<b>Що впало:</b> ${escapeHtml(first)}${more}`);
  }
  if (runUrl) lines.push(`<a href="${escapeHtml(runUrl)}">Відкрити прогін</a>`);
  return lines.join("\n");
}

function readFailures(file) {
  if (!file) return [];
  try {
    return readFileSync(file, "utf8").split(/\r?\n/);
  } catch {
    return [];
  }
}

async function main(env = process.env) {
  const text = formatAlert({
    repository: env.GITHUB_REPOSITORY,
    workflow: env.GITHUB_WORKFLOW,
    job: env.ALERT_JOB,
    env: env.ALERT_ENV,
    branch: env.ALERT_BRANCH,
    url: env.ALERT_URL,
    sha: env.ALERT_SHA,
    runUrl: env.RUN_URL,
    failures: readFailures(env.SMOKE_FAIL_FILE),
  });
  if (env.TELEGRAM_ALERT_DRY_RUN === "1") {
    console.log(text);
    return;
  }
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log("::warning title=alert::Немає секретів TELEGRAM_BOT_TOKEN і/або TELEGRAM_CHAT_ID — алерт пропущено (smoke однаково червоний).");
    return;
  }
  let ok = false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(15_000),
    });
    ok = res.ok;
  } catch {
    // Текст помилки fetch не друкуємо: у ньому може бути адреса з токеном.
  }
  console.log(
    ok
      ? "Алерт надіслано в Telegram."
      : "::warning title=alert::Telegram не прийняв повідомлення — перевірте токен бота, chat id і чи бот доданий у чат.",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
