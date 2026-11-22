// /status (WS11): читання прогонів smoke з GitHub — без мережі (fetch підмінено). Без AC ID: сторінка експлуатації.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSmokeRuns, parseRuns, smokeRepo } from "@/lib/status/github";

afterEach(() => vi.unstubAllGlobals());

const NOW = new Date("2026-11-22T12:00:00Z");
const body = (runs: unknown[]) => new Response(JSON.stringify({ workflow_runs: runs }), { status: 200 });

describe("status: GitHub smoke runs", () => {
  it("takes the repo from Vercel system variables and rejects anything that is not a plain owner/name", () => {
    expect(smokeRepo({ VERCEL_GIT_REPO_OWNER: "rhutsul", VERCEL_GIT_REPO_SLUG: "leave-portal" })).toBe("rhutsul/leave-portal");
    expect(smokeRepo({ VERCEL_GIT_REPO_OWNER: "a/b", VERCEL_GIT_REPO_SLUG: "c" })).toBeNull();
    expect(smokeRepo({})).toBeNull();
  });

  it("keeps only the fields it needs and skips malformed runs", () => {
    expect(
      parseRuns({
        workflow_runs: [
          { event: "schedule", conclusion: "success", created_at: "a", updated_at: "b", head_sha: "x", actor: {} },
          { event: "status", conclusion: null, created_at: "c", updated_at: "d" },
          { event: 1 },
        ],
      }),
    ).toEqual([
      { event: "schedule", conclusion: "success", createdAt: "a", updatedAt: "b" },
      { event: "status", conclusion: null, createdAt: "c", updatedAt: "d" },
    ]);
    expect(parseRuns({ message: "API rate limit exceeded" })).toBeNull();
  });

  it("asks for schedule runs and finished status runs of smoke.yml, cached for 10 minutes", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      body([{ event: url.includes("event=schedule") ? "schedule" : "status", conclusion: "success", created_at: "t", updated_at: "t" }]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const runs = await fetchSmokeRuns(NOW, 31, "rhutsul/leave-portal");
    expect(runs?.map((r) => r.event).toSorted()).toEqual(["schedule", "status", "status"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((x) => x.includes("event=status&status=success"))).toBe(true);
    expect(urls.some((x) => x.includes("event=status&status=failure"))).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { next?: { revalidate?: number } }];
    expect(url).toContain("/repos/rhutsul/leave-portal/actions/workflows/smoke.yml/runs?event=");
    expect(url).toContain("created=%3E%3D2026-10-22");
    expect(init.next?.revalidate).toBe(600);
  });

  it("returns null when GitHub has more runs than one page holds, instead of a silently cut history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ total_count: 101, workflow_runs: [{ event: "schedule", conclusion: "success", created_at: "t", updated_at: "t" }] }),
          { status: 200 },
        ),
      ),
    );
    expect(await fetchSmokeRuns(NOW, 31, "rhutsul/leave-portal")).toBeNull();
  });

  it("returns null (history unavailable) on rate limit, network error or a missing repo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    expect(await fetchSmokeRuns(NOW, 31, "rhutsul/leave-portal")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await fetchSmokeRuns(NOW, 31, "rhutsul/leave-portal")).toBeNull();
    expect(await fetchSmokeRuns(NOW, 31, null)).toBeNull();
  });
});
