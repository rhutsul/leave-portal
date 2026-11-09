import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { DotMonth } from "@/components/ui/dot-month";
import { StatStrip } from "@/components/ui/stat-strip";
import { WeekTimeline } from "@/components/ui/week-timeline";
import { groupByRequestDate, headline, overviewRange } from "@/lib/leave/overview";
import { formatDateLong, kyivDate, kyivHour } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import { loadClosures } from "../calendar/load-closures";
import { loadOverview } from "./load-overview";
import { Activity, ClosureLine, NeedsAttention, NextLeave, ToDecide } from "./overview-sections";
import { awayThisWeek, buildClosureView, buildMarks, buildRows, buildStats } from "./overview-view";

const UPCOMING_LIMIT = 4;

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Overview v3 (ADR 0007): шапка з місяцем із точок, смуга чисел, діаграма на два тижні, найближча відпустка,
 * «To decide» (manager, admin) або «Needs your attention», стрічка дій. Права — у базі (load-overview.ts).
 */
export default async function Overview({ searchParams }: PageProps<"/">) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const claims = auth?.claims;
  if (!claims) redirect("/login");

  const { day } = await searchParams;
  const now = new Date();
  const today = kyivDate(now);
  const { month, days, from, to } = overviewRange(today);
  // Закриття школи — для позначок місяця й діаграми; їхній збій не валить сторінку: тоді лише рядок-пояснення.
  const [data, closures] = await Promise.all([
    loadOverview(supabase, claims.sub, today),
    loadClosures(supabase, from, to).catch((error: unknown) => {
      // Сторінка лишається (рядок каже, що календар не завантажився), а причина — у журналі сервера.
      console.error("Overview: the school closures could not be loaded", error);
      return null;
    }),
  ]);

  // Вибрану відпустку шукаємо серед усіх найближчих (клік по дню місяця може вести далі за четверту), а список
  // посилань обмежуємо, лишаючи в ньому вибрану.
  const all = groupByRequestDate(data.upcoming);
  const selected = all.find((g) => g[0].date === day) ?? all[0];
  const groups = all.slice(0, UPCOMING_LIMIT);
  if (selected && !groups.includes(selected)) groups.push(selected);
  const firstName = data.profile?.full_name?.split(/\s+/)[0];
  const decider = data.deciderData;
  const line = decider
    ? headline({ decider: true, toDecide: decider.toDecideCount, awayThisWeek: awayThisWeek(data, days, claims.sub) })
    : headline({ decider: false, nextDate: selected?.[0].date ?? null, returned: data.returnedCount });

  const closed = buildClosureView(closures, { month, days, from, to }, today);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 border-b border-border pb-6">
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2.5">
          <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">{formatDateLong(today)}</span>
          <h1 className="text-2xl leading-8 font-semibold tracking-tight md:text-[28px] md:leading-9">
            {[greeting(kyivHour(now)), firstName].filter(Boolean).join(", ")}
          </h1>
          <p className="text-muted-foreground">{line}</p>
          <ClosureLine text={closed.line} all={closed.all} />
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Link href="/requests/new" className={buttonVariants()}>
              <Plus />
              New request
            </Link>
            {decider && (
              <Link href="/decisions" className={buttonVariants({ variant: "outline" })}>
                Open Decisions
              </Link>
            )}
          </div>
        </div>
        <DotMonth
          month={month}
          today={today}
          marks={buildMarks(data, month, today)}
          closures={closed.month}
          className="w-full min-w-0 sm:min-w-[320px] sm:flex-[0_1_400px]"
        />
      </header>

      {data.balances.ok ? (
        <StatStrip stats={buildStats(data)} />
      ) : (
        // Власні залишки видно завжди, тож тут можливий лише збій завантаження.
        <Alert variant="destructive" role="alert">
          <AlertDescription>The balances could not be loaded. Please reload the page.</AlertDescription>
        </Alert>
      )}

      {/* Діаграма — на всю ширину: на 1000–1280 px години в смугах інакше не вміщаються. */}
      <section aria-labelledby="timeline-title" className="flex min-w-0 flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="timeline-title" className="text-[15px] font-semibold">
            {decider ? "Away · this week and next" : "Your leave · this week and next"}
          </h2>
          <span className="text-xs text-muted-foreground">
            {decider ? "Records of your positions; dashed — awaiting decision" : "By position; dashed — awaiting decision"}
            {closed.anyInTimeline && "; hatched — closed by the school"}
          </span>
        </div>
        <WeekTimeline
          days={closed.timeline}
          rows={buildRows(data, days, claims.sub)}
          label={decider ? "Leave of your positions this week and next" : "Your leave this week and next"}
          empty={decider ? "Nobody is away these two weeks." : "No leave in these two weeks."}
        />
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-6">
        <NextLeave groups={groups} selected={selected} />
        {decider ? <ToDecide records={decider.toDecide} count={decider.toDecideCount} /> : <NeedsAttention records={data.returned} />}
      </div>

      <Activity lines={data.activity} />
    </>
  );
}
