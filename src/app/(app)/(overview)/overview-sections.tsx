import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { LeaveTypeTag } from "@/components/ui/leave-type-tag";
import { isRecordStatus, StatusBadge } from "@/components/ui/status-badge";
import { timelineHref } from "@/lib/leave/overview";
import { positionLabel, type RecordStatus } from "@/lib/leave/request";
import { formatDateShort, formatRange } from "@/lib/leave/time";
import { cn } from "@/lib/utils";
import type { ActivityLine, OverviewData } from "./load-overview";

type Upcoming = OverviewData["upcoming"][number];
type Decide = NonNullable<OverviewData["deciderData"]>["toDecide"][number];
type Returned = OverviewData["returned"][number];

const hoursOf = (records: readonly { start_min: number | null; end_min: number | null }[]) =>
  records.map((r) => formatRange(r.start_min!, r.end_min!)).join(", ");

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-[15px] font-semibold">
      {children}
    </h2>
  );
}

function Statuses({ records }: { records: readonly { status: string | null }[] }) {
  const statuses = [...new Set(records.map((r) => r.status ?? ""))].filter(isRecordStatus);
  return (
    <span className="flex flex-col items-end gap-1">
      {statuses.map((s) => (
        <StatusBadge key={s} status={s} />
      ))}
    </span>
  );
}

function NextLeaveCard({ group }: { group: readonly Upcoming[] }) {
  const first = group[0];
  return (
    <div className="flex flex-col gap-1.5 px-4 pt-4 pb-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-mono text-[22px] leading-7 font-medium tracking-tight">{formatDateShort(first.date!)}</span>
        <Statuses records={group} />
      </div>
      <span className="font-mono text-[15px] text-primary tabular-nums">{hoursOf(group)}</span>
      <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
        <span className="truncate">
          {group.length === 1 ? positionLabel(first.division_name ?? "", first.position_title ?? "") : `${group.length} positions`}
        </span>
        ·
        <LeaveTypeTag type={first.leave_type ?? ""} variant="inline" />
      </span>
    </div>
  );
}

/** Посилання-кнопка гортання діаграми; за межею гортання (чи «Today» на поточних тижнях) — вимкнена. */
function PagerLink({ href, label, icon, children }: { href: string | null; label?: string; icon?: boolean; children: React.ReactNode }) {
  const className = buttonVariants({
    variant: icon ? "ghost" : "outline",
    size: icon ? "icon-sm" : "sm",
    className: cn("pointer-coarse:h-11", icon && "pointer-coarse:w-11", !href && "pointer-events-none opacity-50"),
  });
  if (!href) {
    return (
      <span role="link" aria-disabled="true" aria-label={label} className={className}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} aria-label={label} className={className}>
      {children}
    </Link>
  );
}

/** Гортання діаграми по два тижні (`?weeks=`): «Today» повертає до цього й наступного тижня. */
export function TimelinePager({ page }: { page: number }) {
  return (
    <nav aria-label="Weeks shown" className="flex items-center gap-1.5">
      <PagerLink href={page === 0 ? null : timelineHref(0)}>Today</PagerLink>
      <PagerLink href={timelineHref(page - 1)} label="Previous two weeks" icon>
        <ChevronLeft />
      </PagerLink>
      <PagerLink href={timelineHref(page + 1)} label="Next two weeks" icon>
        <ChevronRight />
      </PagerLink>
    </nav>
  );
}

/** Найближчі відпустки: вибрана — великим, інші — посилання (кнопки з клавіатури), що відкривають їх тут же. */
export function NextLeave({ groups, selected }: { groups: readonly (readonly Upcoming[])[]; selected: readonly Upcoming[] | undefined }) {
  return (
    <section aria-labelledby="next-title" className="flex flex-col gap-2.5">
      <SectionTitle id="next-title">Next leave</SectionTitle>
      <div className="flex flex-col rounded-lg border border-border bg-card">
        {selected ? <NextLeaveCard group={selected} /> : (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
            No upcoming leave. Records you submit for future dates appear here.
          </p>
        )}
        {groups.length > 1 && (
          <ul className="border-t border-border">
            {groups.map((g) => (
              <li key={`${g[0].request_id}|${g[0].date}`} className="border-b border-border last:border-b-0">
                <Link
                  href={`/?day=${g[0].date}`}
                  scroll={false}
                  aria-current={g === selected ? "true" : undefined}
                  className={cn("flex items-center gap-3 px-4 py-2 text-[13px] hover:bg-accent", g === selected && "bg-accent/60")}
                >
                  <span className="w-24 shrink-0 font-mono">{formatDateShort(g[0].date!)}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground tabular-nums">{hoursOf(g)}</span>
                  <Statuses records={g.slice(0, 1)} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Що чекає рішення менеджера чи адміністратора: три найближчі за датою записи, рядок — посилання на запис. */
export function ToDecide({ records, count }: { records: readonly Decide[]; count: number }) {
  return (
    <section aria-labelledby="decide-title" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <SectionTitle id="decide-title">
          To decide <span className="font-mono font-normal text-muted-foreground">{count}</span>
        </SectionTitle>
        <Link href="/decisions" className={buttonVariants({ variant: "link", size: "sm" })}>
          All
        </Link>
      </div>
      <div className="rounded-lg border border-border bg-card">
        {records.length ? (
          <ul>
            {records.map((r) => (
              <li key={r.id} className="border-b border-border last:border-b-0">
                <Link href={`/decisions?record=${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium">{r.employee_name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{positionLabel(r.division_name, r.position_title)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="font-mono text-xs">{formatDateShort(r.date)}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{formatRange(r.start_min, r.end_min)}</span>
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">No records awaiting decision</p>
        )}
      </div>
    </section>
  );
}

/** Повернені працівнику записи з причиною менеджера під статусом (DESIGN.md, розділ 8). */
export function NeedsAttention({ records }: { records: readonly Returned[] }) {
  if (!records.length) return null;
  return (
    <section aria-labelledby="attention-title" className="flex flex-col gap-2.5">
      <SectionTitle id="attention-title">Needs your attention</SectionTitle>
      <ul className="flex flex-col gap-2">
        {records.map((r) => (
          <li key={r.id} className="flex flex-col gap-1.5 rounded-lg border border-status-returned-foreground/40 bg-card px-4 py-3">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[13px]">
                {formatDateShort(r.date!)} · {formatRange(r.start_min!, r.end_min!)}
              </span>
              <StatusBadge status="returned" />
            </span>
            <span className="truncate text-xs text-muted-foreground">{positionLabel(r.division_name ?? "", r.position_title ?? "")}</span>
            {r.manager_comment && (
              <span className="border-l-2 border-border pl-2.5 text-[13px] break-words">
                <span className="text-muted-foreground">Manager:</span> {r.manager_comment}
              </span>
            )}
          </li>
        ))}
      </ul>
      <Link href="/requests?status=returned" className={buttonVariants({ variant: "outline", size: "sm", className: "self-start" })}>
        Open the records
      </Link>
    </section>
  );
}

function ActivityWhat({ line }: { line: ActivityLine }) {
  return isRecordStatus(line.action) ? <StatusBadge status={line.action as RecordStatus} /> : <span className="font-medium">{line.what}</span>;
}

/** Стрічка дій: коли, що, хто й щодо якого запису. */
export function Activity({ lines }: { lines: readonly ActivityLine[] | null }) {
  return (
    <section aria-labelledby="activity-title" className="flex flex-col gap-2.5">
      <SectionTitle id="activity-title">Activity</SectionTitle>
      {lines === null ? (
        <p role="alert" className="text-[13px] text-destructive">
          The activity could not be loaded.
        </p>
      ) : lines.length ? (
        <ol className="rounded-lg border border-border bg-card">
          {lines.map((a, i) => (
            <li key={i} className="flex items-center gap-4 border-b border-border px-4 py-2.5 text-[13px] last:border-b-0">
              <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground">{a.at}</span>
              <span className="w-44 shrink-0 truncate">
                <ActivityWhat line={a} />
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="text-muted-foreground">{a.who} · </span>
                {a.subject}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-muted-foreground">No activity yet.</p>
      )}
    </section>
  );
}

/**
 * Найближче закриття школи — видимим рядком; усі закриття показаного місяця й двох тижнів — списком для зчитувача
 * екрана, бо місяць із точок (`aria-hidden`) і штриховка діаграми — лише графіка. Без закриттів — нічого.
 */
export function ClosureLine({ text, all }: { text: string | null; all: readonly string[] }) {
  return (
    <>
      {text && (
        <p className="text-sm text-muted-foreground">
          {text} ·{" "}
          <Link href="/calendar" className="text-primary underline-offset-4 hover:underline">
            School calendar
          </Link>
        </p>
      )}
      {all.length > 0 && (
        <ul className="sr-only" aria-label="School closures this month and the next two weeks">
          {all.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </>
  );
}
