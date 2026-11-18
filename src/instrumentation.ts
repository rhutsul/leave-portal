// Взято з https://github.com/koldovsky/2026-quitcode-11-devops-operations-hw/blob/main/materials/ops-kit/src/instrumentation.ts.example
// Трекер помилок сервера без Sentry (WS11, B): Next.js викликає onRequestError на кожну необроблену помилку сервера
// (сторінка, маршрут API, Server Action, proxy), а ми надсилаємо КОРОТКЕ повідомлення в той самий Telegram-чат, що й
// алерт smoke. Текст складає чистий модуль src/lib/error-report.ts (там же — що НЕ надсилаємо ніколи); тут — лише
// змінні середовища, пауза між однаковими помилками й надсилання.
// Змінні (лише назви): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — у Vercel (Production і Preview), без NEXT_PUBLIC_.
// Немає змінних — функція мовчки нічого не робить і запит не ламає.
// Документація: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
// (onRequestError, з v15.0.0). Перевірка: GET /api/ops/server-error під адміністратором на staging (маршрут —
// src/app/api/ops/server-error/route.ts) → повідомлення в чаті.
import type { Instrumentation } from "next";
import { formatErrorReport, reportKey } from "@/lib/error-report";

const TIMEOUT_MS = 2_500; // не тримаємо відповідь користувачу довше: Telegram недоступний — повідомлення пропадає
const SAME_ERROR_PAUSE_MS = 60_000; // та сама помилка на тому самому маршруті — не частіше разу на хвилину
const MAX_KEYS = 200; // digest помилок рендера буває унікальним: на теплому інстансі мапа не росте без меж
const lastSent = new Map<string, number>();

/** Чи надсилали цю помилку щойно. Заодно прибирає записи, старші за паузу, і найстаріші понад MAX_KEYS. */
function recentlySent(key: string, now: number): boolean {
  for (const [k, at] of lastSent) if (now - at >= SAME_ERROR_PAUSE_MS) lastSent.delete(k);
  return lastSent.has(key);
}

function remember(key: string, now: number) {
  lastSent.delete(key);
  lastSent.set(key, now);
  while (lastSent.size > MAX_KEYS) lastSent.delete(lastSent.keys().next().value as string);
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  // Усе далі — у try: дивне кинуте значення (Proxy, геттер stack/name/digest, що кидає) не має зламати сам хук.
  try {
    const key = reportKey({ error, routePath: context.routePath });
    const now = Date.now();
    if (recentlySent(key, now)) return;

    const text = formatErrorReport({
      error,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
      env: process.env.APP_ENV ?? process.env.VERCEL_ENV ?? "local", // APP_ENV=staging — лише для гілки staging
      branch: process.env.VERCEL_GIT_COMMIT_REF,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
    });

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Паузу ставимо лише після доставки: невдале надсилання не глушить ту саму помилку на хвилину.
    if (res.ok) remember(key, now);
  } catch {
    // Навмисно нічого не пишемо: помилка fetch містить адресу запиту, а в ній — токен бота.
  }
};
