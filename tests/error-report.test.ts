// WS11, B: трекер помилок сервера. Повідомлення в Telegram має маршрут, метод, назву помилки, digest, середовище,
// деплой і ≤5 рядків стеку «at …» — і НІКОЛИ текст помилки, заголовки, cookie, тіло чи рядок запиту.
// Назви тестів без AC ID: це інструмент експлуатації, а не поведінка за AC PM (інакше ac:coverage покаже ORPHAN).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorDigest, errorName, formatErrorReport, reportKey, stackFrames, STACK_FRAMES } from "@/lib/error-report";

// Вигаданий «текст користувача» з персональними даними: жодна його частина не має опинитися в повідомленні.
const USER_TEXT = "Прошу відпустку 12-16 травня, діагноз у довідці, пишіть на olena.test@example.test";
const SECRET_MARKERS = ["відпустку", "діагноз", "olena.test", "@example.test", "Bearer", "sb-access-token", "note="];

function errorWithStack(message: string, frames: string[]): Error {
  const error = new Error(message);
  error.stack = [`Error: ${message}`, ...frames.map((f) => `    ${f}`)].join("\n");
  return error;
}

const FRAMES = Array.from(
  { length: 8 },
  (_, i) => `at fn${i} (/home/olena/leave-portal/.next/server/app/page${i}.js:${i + 1}:${i + 10})`,
);

const base = {
  method: "POST",
  routePath: "/app/(app)/requests/new/page",
  routeType: "action",
  routerKind: "App Router",
  env: "staging",
  branch: "staging",
  deploymentId: "dpl_abc123",
  commitSha: "d2f8df2aaaaaaaaaaaaaa",
};

describe("stackFrames", () => {
  it("бере не більше 5 рядків «at …» і скорочує абсолютний шлях", () => {
    const frames = stackFrames(errorWithStack("boom", FRAMES));
    expect(frames).toHaveLength(STACK_FRAMES);
    expect(frames[0]).toBe("at fn0 (.next/server/app/page0.js:1:10)");
    for (const frame of frames) expect(frame).not.toContain("olena");
    const windows = stackFrames(errorWithStack("boom", ["at fn (C:\\Users\\olena\\leave-portal\\src\\lib\\a.ts:1:2)"]));
    expect(windows).toEqual(["at fn (src/lib\\a.ts:1:2)"]);
  });

  it("відкидає багаторядковий текст помилки і рядки, що не схожі на рядок стеку", () => {
    const message = `${USER_TEXT}\nat fake (line with user text)\nat ${USER_TEXT}:1:2`;
    const error = new Error(message);
    error.stack = `Error: ${message}\n    at real (/var/task/src/app/x.ts:3:4)\n    not a frame`;
    const frames = stackFrames(error);
    expect(frames).toEqual(["at real (src/app/x.ts:3:4)"]);
  });

  it("обрізає довгий рядок стеку і не ламається без стеку", () => {
    const long = `at ${"f".repeat(300)} (/var/task/src/a.ts:1:2)`;
    expect(stackFrames(errorWithStack("x", [long]))[0]).toHaveLength(160);
    const noStack = new Error("x");
    noStack.stack = undefined;
    expect(stackFrames(noStack)).toEqual([]);
    expect(stackFrames("not an error")).toEqual([]);
  });
});

describe("formatErrorReport", () => {
  it("містить маршрут, метод, назву помилки, digest, середовище, деплой і рядки стеку", () => {
    const error = Object.assign(errorWithStack("boom", FRAMES), { digest: "1234567890" });
    const text = formatErrorReport({ ...base, error });
    expect(text).toContain("ПОМИЛКА СЕРВЕРА");
    expect(text).toContain("Середовище: staging (гілка staging)");
    expect(text).toContain("Маршрут: POST /app/(app)/requests/new/page (action, App Router)");
    expect(text).toContain("Помилка: Error, digest 1234567890");
    expect(text).toContain("Деплой: dpl_abc123, коміт d2f8df2");
    expect(text).toContain("at fn4 (.next/server/app/page4.js:5:14)");
    expect(text).not.toContain("fn5");
  });

  it("ніколи не містить тексту помилки, заголовків, cookie, тіла чи рядка запиту", () => {
    const error = Object.assign(errorWithStack(USER_TEXT, FRAMES.slice(0, 2)), { digest: USER_TEXT });
    // Зайві поля, як у справжньому request з onRequestError: TypeScript їх не забороняє у змінній — тож і перевіряємо.
    const sneaky = {
      ...base,
      error,
      path: `/requests/new?note=${encodeURIComponent(USER_TEXT)}`,
      headers: { authorization: "Bearer test-token", cookie: "sb-access-token=test" },
      body: USER_TEXT,
    };
    const text = formatErrorReport(sneaky);
    for (const marker of SECRET_MARKERS) expect(text).not.toContain(marker);
  });

  it("назву помилки з довільним текстом замінює на Error, а метод — на «?»", () => {
    const error = new Error("x");
    error.name = USER_TEXT;
    const text = formatErrorReport({ ...base, error, method: USER_TEXT });
    expect(text).toContain("Помилка: Error");
    expect(text).toContain("Маршрут: ? ");
    for (const marker of SECRET_MARKERS) expect(text).not.toContain(marker);
  });

  it("без даних Vercel пише «?» і local, без рядка стеку — без розділу стеку", () => {
    const text = formatErrorReport({ ...base, branch: undefined, deploymentId: undefined, commitSha: undefined, error: "x" });
    expect(text).toContain("Середовище: staging\n");
    expect(text).toContain("Помилка: string");
    expect(text).toContain("Деплой: ?, коміт local");
    expect(text).not.toContain("Стек");
  });
});

describe("errorName, errorDigest, reportKey", () => {
  it("digest — лише короткий ідентифікатор, ключ паузи — маршрут і digest чи назва", () => {
    expect(errorDigest({ digest: "abc-123" })).toBe("abc-123");
    expect(errorDigest({ digest: "a b" })).toBe("");
    expect(errorDigest(null)).toBe("");
    expect(errorName(new TypeError("x"))).toBe("TypeError");
    expect(reportKey({ routePath: "/r", error: { digest: "42" } })).toBe("/r|42");
    expect(reportKey({ routePath: "/r", error: new RangeError("x") })).toBe("/r|RangeError");
  });
});

describe("onRequestError", () => {
  const request = { path: `/requests/new?note=${USER_TEXT}`, method: "GET", headers: { cookie: "sb-access-token=test" } };
  const context = {
    routerKind: "App Router",
    routePath: "/app/api/ops/server-error/route",
    routeType: "route",
    renderSource: "server-rendering",
    revalidateReason: undefined,
    renderType: "dynamic",
  } as const;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("без TELEGRAM_* нічого не надсилає і не кидає", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    const { onRequestError } = await import("@/instrumentation");
    await expect(onRequestError(new Error(USER_TEXT), request, context)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("надсилає одне повідомлення без тексту користувача, однакову помилку — не частіше разу на хвилину", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "-100");
    vi.stubEnv("APP_ENV", "staging");
    const { onRequestError } = await import("@/instrumentation");
    await onRequestError(new Error(USER_TEXT), request, context);
    await onRequestError(new Error(USER_TEXT), request, context);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bottest-token/sendMessage");
    const body = JSON.parse(String(init.body)) as { chat_id: string; text: string };
    expect(body.chat_id).toBe("-100");
    expect(body.text).toContain("Маршрут: GET /app/api/ops/server-error/route (route, App Router)");
    expect(body.text).toContain("Середовище: staging");
    for (const marker of SECRET_MARKERS) expect(body.text).not.toContain(marker);
  });

  it("збій Telegram не ламає запит, не пише токен у журнал, а ту саму помилку надсилає знову", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "-100");
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    fetchMock.mockRejectedValueOnce(new Error("network down https://api.telegram.org/bottest-token/sendMessage"));
    const { onRequestError } = await import("@/instrumentation");
    await expect(onRequestError(new Error("x"), request, context)).resolves.toBeUndefined();
    for (const spy of spies) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain("test-token");
    }
    // Невдале надсилання паузи не ставить: наступна така сама помилка йде в чат.
    await onRequestError(new Error("x"), request, context);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Telegram відповів не 2xx — теж не пауза.
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 502 }));
    await onRequestError(new RangeError("y"), request, context);
    await onRequestError(new RangeError("y"), request, context);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    vi.restoreAllMocks();
  });

  it("надсилає з таймаутом: у запиті є AbortSignal", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "-100");
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const { onRequestError } = await import("@/instrumentation");
    await onRequestError(new Error("x"), request, context);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(2_500);
    vi.restoreAllMocks();
  });

  it("дивне кинуте значення (геттер, що кидає) не ламає хук", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "-100");
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error(USER_TEXT);
        },
        getPrototypeOf() {
          throw new Error(USER_TEXT);
        },
      },
    );
    const { onRequestError } = await import("@/instrumentation");
    await expect(onRequestError(hostile, request, context)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
