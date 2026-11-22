import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { ThemeMenu } from "@/components/ui/theme-menu";
import { UptimeBar } from "@/components/ui/uptime-bar";
import { checkHealth } from "@/lib/health-check";
import { kyivDate } from "@/lib/leave/time";
import { parseTheme, THEME_COOKIE } from "@/lib/preferences";
import { fetchSmokeRuns } from "@/lib/status/github";
import { buildHistory, describeDay, overallState, summarize } from "@/lib/status/history";
import { INCIDENTS, recentIncidents } from "@/lib/status/incidents";
import { cn } from "@/lib/utils";

// Публічна сторінка стану (WS11): для людей — чи працює Leave Portal і чи були збої за 30 днів. Без бази, комітів і
// змінних: технічні подробиці — у /api/health (для машин) і docs/runbook.md. Шлях — у PUBLIC_PATHS
// (src/lib/supabase/proxy.ts). Стан зараз — та сама перевірка, що в /api/health (src/lib/health-check.ts); історія —
// прогони smoke проду в GitHub Actions (src/lib/status/github.ts, кеш 10 хв); минулі збої — src/lib/status/incidents.ts.

export const metadata: Metadata = {
  title: "Status · Leave Portal",
  description: "Is Leave Portal working right now, and were there any disruptions in the last 30 days.",
};

export const dynamic = "force-dynamic";

const DAYS = 30;

const OVERALL = {
  operational: {
    title: "All systems operational",
    text: "Leave Portal is working normally.",
    dot: "bg-status-approved-foreground ring-status-approved-foreground/20 animate-pulse-slow",
  },
  outage: {
    title: "Service disruption",
    text: "Some parts of Leave Portal may not work right now. Please try again a little later.",
    dot: "bg-status-rejected-foreground ring-status-rejected-foreground/20",
  },
} as const;

function kyivTime(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" }).format(now);
}

function longDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export default async function StatusPage() {
  const now = new Date();
  const [{ health }, runs, cookieStore] = await Promise.all([checkHealth(), fetchSmokeRuns(now), cookies()]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const state = overallState(health.db === "ok");
  const overall = OVERALL[state];
  const history = runs ? buildHistory(runs, now, DAYS) : null;
  const totals = history ? summarize(history) : null;
  const incidents = recentIncidents(INCIDENTS, kyivDate(now), DAYS);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo className="size-6.5 flex-none" />
            <span className="text-sm font-semibold">Leave Portal</span>
            <span className="text-sm text-muted-foreground">Status</span>
          </Link>
          <ThemeMenu initial={theme} />
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl animate-page-in flex-col gap-4 px-4 py-8 md:px-6 md:py-12 motion-reduce:animate-none">
        <h1 className="sr-only">Leave Portal status</h1>

        <Card className="flex-row items-center gap-4 px-5">
          <span aria-hidden="true" className={cn("size-3 flex-none rounded-full ring-4 motion-reduce:animate-none", overall.dot)} />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold tracking-tight">{overall.title}</p>
            <p className="text-sm text-muted-foreground">{overall.text}</p>
          </div>
          <p className="hidden text-xs text-muted-foreground tabular-nums sm:block">Checked at {kyivTime(now)}, Kyiv time</p>
        </Card>

        <Card className="gap-3 px-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">Leave Portal</h2>
            {totals && totals.checked > 0 ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                {totals.clean} of {totals.checked} days without issues
              </p>
            ) : null}
          </div>
          {history ? (
            <>
              <UptimeBar days={history.map((day) => ({ date: day.date, state: day.state, label: describeDay(day) }))} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{DAYS} days ago</span>
                <span>Today</span>
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-[2px] bg-status-approved-foreground/80" />
                  No issues
                </li>
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-[2px] bg-status-awaiting-foreground/90" />
                  Some checks failed
                </li>
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-[2px] bg-muted" />
                  No checks that day
                </li>
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">History is temporarily unavailable. The current status above is live.</p>
          )}
        </Card>

        <Card className="gap-3 px-5">
          <h2 className="text-base font-semibold">Past incidents</h2>
          {incidents.length ? (
            <ul className="divide-y divide-border">
              {incidents.map((incident) => (
                <li key={`${incident.date}-${incident.title}`} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium">{incident.title}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{longDate(incident.date)}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{incident.summary}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No incidents in the last {DAYS} days.</p>
          )}
        </Card>

        <p className="pt-2 text-center text-xs text-muted-foreground">
          Checks run after every release and once a day.{" "}
          <Link href="/" className="text-primary underline-offset-4 hover:underline">
            Open Leave Portal
          </Link>
        </p>
      </main>
    </div>
  );
}
