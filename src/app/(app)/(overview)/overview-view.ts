// Перетворення даних Overview (load-overview.ts) у те, що малюють компоненти: числа смуги, позначки місяця, рядки
// діаграми. Без запитів до бази.
import type { DotMonthMark } from "@/components/ui/dot-month";
import type { Stat } from "@/components/ui/stat-strip";
import type { WeekTimelineRow } from "@/components/ui/week-timeline";
import { formatDays } from "@/lib/leave/balance";
import type { Closure } from "@/lib/leave/calendar";
import { dayClosures, isBlocking, monthClosures, monthMarks, nextClosureLine, timelineDays, timelineRows } from "@/lib/leave/overview";
import { LEAVE_TYPES, positionLabel, RECORD_STATUSES } from "@/lib/leave/request";
import { formatDateShort, formatRange } from "@/lib/leave/time";
import type { OverviewData } from "./load-overview";

const records = (n: number) => (n === 1 ? "record" : "records");

export function buildStats(data: OverviewData): Stat[] {
  const stats: Stat[] = [];
  if (data.balances.ok) {
    for (const type of ["sick", "personal"] as const) {
      const b = data.balances.balances.limited[type];
      stats.push({
        label: `${LEAVE_TYPES[type]} left`,
        value: formatDays(b.remaining),
        decimals: 2,
        unit: "days",
        sub: `${formatDays(b.used)} of ${formatDays(b.granted + b.carriedOver)} used · ${data.schoolYearLabel}`,
      });
    }
  }
  stats.push({
    label: "Your records awaiting decision",
    value: String(data.awaiting),
    unit: records(data.awaiting),
    sub: "Open My requests",
    href: "/requests?status=awaiting",
  });
  if (data.deciderData) {
    const n = data.deciderData.toDecideCount;
    stats.push({ label: "To decide", value: String(n), unit: records(n), sub: "Open Decisions", href: "/decisions", tone: "primary" });
  } else {
    const n = data.returnedCount;
    stats.push({
      label: "Returned for revision",
      value: String(n),
      unit: records(n),
      sub: "Open the records",
      href: "/requests?status=returned",
      tone: n > 0 ? "returned" : "default",
    });
  }
  return stats;
}

/** Позначки місяця: клік по дню з майбутнім записом відкриває його в «Next leave», по минулому — «My requests». */
export function buildMarks(data: OverviewData, month: string, today: string): Record<number, DotMonthMark> {
  const marks: Record<number, DotMonthMark> = {};
  const mine = data.mine.map((r) => ({ date: r.date!, status: r.status, start: r.start_min!, end: r.end_min! }));
  for (const [day, status] of monthMarks(mine, month)) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const hours = mine.filter((r) => r.date === date).map((r) => formatRange(r.start, r.end)).join(", ");
    marks[day] = {
      status,
      label: `${formatDateShort(date)} · ${hours} · ${RECORD_STATUSES[status]}`,
      href: date >= today ? `/?day=${date}` : "/requests",
    };
  }
  return marks;
}

/** Рядки діаграми: менеджеру — люди його посад («You» — він сам), працівнику — його посади. */
export function buildRows(data: OverviewData, days: readonly string[], userId: string): WeekTimelineRow[] {
  if (data.deciderData) {
    const away = data.deciderData.away.flatMap((r) => (isBlocking(r.status) ? [{ ...r, status: r.status }] : []));
    return timelineRows(away, days, (r) => ({
      key: r.employee_id,
      name: r.employee_id === userId ? "You" : r.employee_name,
      sub: positionLabel(r.division_name, r.position_title),
    }));
  }
  const mine = data.mine.flatMap((r) =>
    isBlocking(r.status) ? [{ ...r, date: r.date!, start_min: r.start_min!, end_min: r.end_min!, status: r.status }] : [],
  );
  return timelineRows(mine, days, (r) => ({ key: String(r.position_id), name: r.division_name ?? "", sub: r.position_title ?? "" }));
}

/** Скільки інших людей посад менеджера мають схвалений запис цього тижня (перші п'ять днів діаграми). */
export function awayThisWeek(data: OverviewData, days: readonly string[], userId: string): number {
  const away = data.deciderData?.away ?? [];
  return new Set(away.filter((r) => r.status === "approved" && r.date <= days[4] && r.employee_id !== userId).map((r) => r.employee_id))
    .size;
}

/**
 * Закриття школи для Overview: рядок під привітанням (місяць із точок — декор, тож факт має бути текстом), позначки
 * місяця й дні діаграми з закриттями. `closures` null — їх не вдалося завантажити: сторінка лишається, а рядок це каже.
 */
export function buildClosureView(
  closures: readonly Closure[] | null,
  range: { month: string; days: readonly string[]; to: string },
  today: string,
) {
  const list = closures ?? [];
  const closed = dayClosures(list, range.days);
  return {
    line: closures ? nextClosureLine(closures, today, range.to) : "The school calendar could not be loaded.",
    month: monthClosures(list, range.month),
    timeline: timelineDays(range.days, today).map((d, i) => ({ ...d, closure: closed[i] })),
    anyInTimeline: closed.some(Boolean),
  };
}
