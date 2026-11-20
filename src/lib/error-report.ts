// Взято з https://github.com/koldovsky/2026-quitcode-11-devops-operations-hw/blob/main/materials/ops-kit/src/instrumentation.ts.example
// (stackFrames і текст повідомлення) і винесено в чистий модуль: без process.env, fetch і "server-only", тож його
// перевіряє Vitest (tests/error-report.test.ts), а src/instrumentation.ts лише читає змінні середовища й надсилає.
//
// Що НЕ потрапляє в повідомлення ніколи: заголовки запиту (там cookie сесії), тіло, рядок запиту (?query), шлях запиту
// з параметрами (request.path) і error.message (може містити дані користувача). Тип ErrorReportInput навмисно не має
// полів для них — передати їх сюди нема куди. Зі стеку — лише рядки «at …» без абсолютного шляху.

/** Скільки верхніх рядків «at …» стеку надсилати. */
export const STACK_FRAMES = 5;
/** Найдовший рядок стеку в повідомленні. */
export const FRAME_MAX = 160;
/** Найдовший digest: Next дає короткий числовий рядок, довше — не digest. */
const DIGEST_MAX = 40;

/**
 * Лише рядки «at …» зі стеку. Заголовок «Назва: текст помилки» відрізаємо цілим (текст може бути багаторядковим і
 * містити дані користувача), беремо лише рядки виду «at … файл:рядок:колонка», а абсолютний шлях скорочуємо до
 * .next/…, src/… чи node_modules/… — щоб у чат не потрапило ім'я користувача ОС з локального шляху.
 */
export function stackFrames(error: unknown): string[] {
  if (!(error instanceof Error) || typeof error.stack !== "string") return [];
  const header = error.message ? `${error.name}: ${error.message}` : error.name;
  const body = error.stack.startsWith(header)
    ? error.stack.slice(header.length)
    : error.stack.split("\n").slice(header.split("\n").length).join("\n"); // заголовок інший — пропускаємо стільки ж рядків
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at ") && /:\d+:\d+\)?$/.test(line))
    .map((line) => line.replace(/(?:[A-Za-z]:)?[\\/][^\s()]*?[\\/](\.next|src|node_modules)[\\/]/g, "$1/"))
    .slice(0, STACK_FRAMES)
    .map((line) => line.slice(0, FRAME_MAX));
}

/** Назва помилки: клас (`TypeError`, `PostgrestError`), а не її текст. Не Error — лише тип значення. */
export function errorName(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  return /^[A-Za-z0-9_$.]{1,60}$/.test(error.name) ? error.name : "Error";
}

/** digest, який React/Next дає помилці рендера: за ним шукаємо повний стек у Runtime Logs Vercel. */
export function errorDigest(error: unknown): string {
  const raw = (error as { digest?: unknown } | null)?.digest;
  return typeof raw === "string" && /^[A-Za-z0-9_-]+$/.test(raw) ? raw.slice(0, DIGEST_MAX) : "";
}

export type ErrorReportInput = {
  error: unknown;
  /** request.method — GET, POST… */
  method: string;
  /** context.routePath — шаблон маршруту (/app/requests/[id]), без id і ?query. request.path не беремо. */
  routePath: string;
  routeType: string;
  routerKind: string;
  /** APP_ENV (staging) чи VERCEL_ENV (production, preview); локально — "local". */
  env: string;
  branch?: string;
  deploymentId?: string;
  commitSha?: string;
};

/** Ключ для паузи між однаковими повідомленнями: той самий маршрут і та сама помилка. */
export function reportKey(input: Pick<ErrorReportInput, "error" | "routePath">): string {
  return `${input.routePath}|${errorDigest(input.error) || errorName(input.error)}`;
}

/** Екранування для parse_mode=HTML у Telegram: усе підставлене в повідомлення — лише як текст. */
export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * Текст повідомлення в Telegram (parse_mode=HTML, як алерт smoke у scripts/telegram-alert.mjs): середовище, маршрут
 * з методом, назва помилки й digest, коміт і деплой, ≤5 рядків стеку моноширинним блоком. Усе підставлене екрановано.
 */
export function formatErrorReport(input: ErrorReportInput): string {
  const name = errorName(input.error);
  const digest = errorDigest(input.error);
  const frames = stackFrames(input.error);
  const method = /^[A-Z]{1,10}$/.test(input.method) ? input.method : "?";
  const env = `${input.env}${input.branch ? ` (гілка ${input.branch})` : ""}`;
  return [
    `🟠 <b>Помилка сервера</b> · ${escapeHtml(env)}`,
    `<b>Маршрут:</b> <code>${escapeHtml(`${method} ${input.routePath}`)}</code> (${escapeHtml(`${input.routeType}, ${input.routerKind}`)})`,
    `<b>Помилка:</b> ${escapeHtml(name)}${digest ? `, digest <code>${escapeHtml(digest)}</code>` : ""}`,
    `<b>Коміт:</b> <code>${escapeHtml((input.commitSha ?? "local").slice(0, 7))}</code> · деплой <code>${escapeHtml(input.deploymentId ?? "?")}</code>`,
    ...(frames.length ? ["<b>Стек:</b>", `<pre>${escapeHtml(frames.join("\n"))}</pre>`] : []),
  ].join("\n");
}
