// /status (WS11): прогони smoke проду з публічного API GitHub Actions (репо публічне — без токена). Ліміт без токена —
// 60 запитів на годину з однієї адреси, тож кешуємо відповідь на 10 хв (fetch next.revalidate, кеш даних Next.js) і
// робимо три запити: щоденні (`schedule`) і після деплоїв `main` (`status`) — окремо успішні й невдалі, бо статус
// кожного іншого сервісу (CodeRabbit…) теж створює прогін `status`, лише пропущений, і 100 записів інакше не вистачило б
// на 30 днів. Будь-який збій — null: сторінка
// покаже «історія тимчасово недоступна», а не впаде. Репо — із системних змінних Vercel.
import type { SmokeRun } from "./history";

const REVALIDATE_SECONDS = 600;
const TIMEOUT_MS = 4_000;
const QUERIES = ["event=schedule", "event=status&status=success", "event=status&status=failure"] as const;

type ApiRun = { event?: unknown; conclusion?: unknown; created_at?: unknown; updated_at?: unknown };

export function smokeRepo(env: Partial<Record<string, string | undefined>> = process.env): string | null {
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const slug = env.VERCEL_GIT_REPO_SLUG;
  const ok = (v: string | undefined) => typeof v === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(v);
  return ok(owner) && ok(slug) ? `${owner}/${slug}` : null;
}

export function parseRuns(json: unknown): SmokeRun[] | null {
  const list = (json as { workflow_runs?: unknown })?.workflow_runs;
  if (!Array.isArray(list)) return null;
  return list.flatMap((r: ApiRun) =>
    typeof r.event === "string" && typeof r.created_at === "string" && typeof r.updated_at === "string"
      ? [
          {
            event: r.event,
            conclusion: typeof r.conclusion === "string" ? r.conclusion : null,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          },
        ]
      : [],
  );
}

/** Прогони smoke проду за останні `days` днів або null, якщо історію зараз не отримати. */
export async function fetchSmokeRuns(now: Date, days = 31, repo = smokeRepo()): Promise<SmokeRun[] | null> {
  if (!repo) return null;
  const since = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  try {
    const pages = await Promise.all(
      QUERIES.map(async (query) => {
        const url = `https://api.github.com/repos/${repo}/actions/workflows/smoke.yml/runs?${query}&created=%3E%3D${since}&per_page=100`;
        const res = await fetch(url, {
          headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
          next: { revalidate: REVALIDATE_SECONDS },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        return res.ok ? parseRuns(await res.json()) : null;
      }),
    );
    return pages.some((p) => p === null) ? null : pages.flat() as SmokeRun[];
  } catch {
    return null;
  }
}
