// Перетворення даних Overview (load-overview.ts) у те, що малюють компоненти: числа смуги, позначки місяця, рядки
// діаграми. Без запитів до бази.
import type { DotMonthMark } from "@/components/ui/dot-month";
import type { Stat } from "@/components/ui/stat-strip";
import type { WeekTimelineRecord, WeekTimelineRow } from "@/components/ui/week-timeline";
import { formatDays } from "@/lib/leave/balance";
import type { Closure } from "@/lib/leave/calendar";
import {
  closuresText,
  dayClosures,
  isBlocking,
  monthClosures,
  monthMarks,
  nextClosureLine,
  timelineDays,
  timelineRows,
  positionScale,
  timelineSummary,
  type BlockingStatus,
  type DayScale,
  type TimelineRow,
} from "@/lib/leave/overview";
import { LEAVE_TYPES, positionLabel, RECORD_STATUSES } from "@/lib/leave/request";
import { formatDateShort, formatDuration, formatRange } from "@/lib/leave/time";
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

/** Запис у клітинці діаграми: години й тривалість текстом і посилання «Open record». */
function timelineRecord(
  r: { id: number; start_min: number; end_min: number; minutes: number | null; leave_type: string | null; status: BlockingStatus },
  href: string,
): WeekTimelineRecord {
  return {
    id: r.id,
    start_min: r.start_min,
    end_min: r.end_min,
    status: r.status,
    hours: formatRange(r.start_min, r.end_min),
    type: r.leave_type ?? "",
    duration: formatDuration(r.minutes ?? r.end_min - r.start_min),
    href,
  };
}

/**
 * Рядки діаграми: менеджеру — людина й посада («You» — він сам), працівнику — його посади; записи різних посад не
 * зливаються. «Open record» веде менеджера в «Decisions», працівника — до деталей запису в «My requests». Поруч — підсумок
 * над діаграмою («6 records of your positions · 3 awaiting decision»).
 */
export function buildTimeline(data: OverviewData, days: readonly string[], userId: string): { rows: WeekTimelineRow[]; summary: string | null } {
  if (data.deciderData) {
    const away = data.deciderData.away.flatMap((r) => (isBlocking(r.status) ? [{ ...r, status: r.status }] : []));
    const rows = timelineRows(away, days, (r) => ({
      // Посада — з leave_records (schedules), а якщо її не завантажено — підрозділ і назва в межах людини.
      key: `${r.employee_id}|${data.schedules?.positionOf.get(r.id) ?? `${r.division_name}|${r.position_title}`}`,
      name: r.employee_id === userId ? "You" : r.employee_name,
      sub: positionLabel(r.division_name, r.position_title),
    }));
    return {
      rows: withRecords(rows, (r) => timelineRecord(r, `/decisions?record=${r.id}`), scalesOf(data, days)),
      summary: summaryOf(rows, true),
    };
  }
  const mine = data.mine.flatMap((r) =>
    isBlocking(r.status) ? [{ ...r, id: r.id!, date: r.date!, start_min: r.start_min!, end_min: r.end_min!, status: r.status }] : [],
  );
  const rows = timelineRows(mine, days, (r) => ({ key: String(r.position_id), name: r.division_name ?? "", sub: r.position_title ?? "" }));
  return {
    rows: withRecords(rows, (r) => timelineRecord(r, `/requests?record=${r.id}`), scalesOf(data, days)),
    summary: summaryOf(rows, false),
  };
}

/** Шкала клітинок рядка — робочий день його посади на кожну з показаних дат (за першим записом рядка). */
function scalesOf(data: OverviewData, days: readonly string[]) {
  return (recordId: number): (DayScale | null)[] => {
    const position = data.schedules?.positionOf.get(recordId);
    const blocks = position === undefined ? [] : (data.schedules?.blocks.get(position) ?? []);
    return days.map((d) => positionScale(blocks, d));
  };
}

function withRecords<T extends { id: number }>(
  rows: readonly TimelineRow<T>[],
  toRecord: (record: T) => WeekTimelineRecord,
  scales: (recordId: number) => (DayScale | null)[],
): WeekTimelineRow[] {
  return rows.map((row) => ({
    ...row,
    scales: scales(row.cells[0].records[0].id),
    cells: row.cells.map((c) => ({ col: c.col, records: c.records.map(toRecord) })),
  }));
}

function summaryOf(rows: readonly TimelineRow<{ status: BlockingStatus }>[], decider: boolean): string | null {
  return timelineSummary(rows.flatMap((row) => row.cells.flatMap((c) => c.records.map((r) => r.status))), decider);
}

/** Скільки інших людей посад менеджера мають схвалений запис цього тижня (`thisWeek` — його робочі дні). */
export function awayThisWeek(data: OverviewData, thisWeek: readonly string[], userId: string): number {
  const away = data.deciderData?.awayNow ?? [];
  const inWeek = (date: string) => date >= thisWeek[0] && date <= thisWeek[4];
  return new Set(away.filter((r) => r.status === "approved" && inWeek(r.date) && r.employee_id !== userId).map((r) => r.employee_id)).size;
}

/**
 * Закриття школи для Overview: рядок під привітанням (місяць із точок — декор, тож факт має бути текстом), позначки
 * місяця й дні діаграми з закриттями. `closures` null — їх не вдалося завантажити: сторінка лишається, а рядок це каже.
 */
export function buildClosureView(
  closures: readonly Closure[] | null,
  range: { month: string; days: readonly string[]; from: string; to: string },
  today: string,
) {
  const list = closures ?? [];
  const closed = dayClosures(list, range.days);
  return {
    line: closures ? nextClosureLine(closures, today, range.to) : "The school calendar could not be loaded.",
    all: closuresText(list, range.from, range.to),
    month: monthClosures(list, range.month),
    timeline: timelineDays(range.days, today).map((d, i) => ({ ...d, closure: closed[i] })),
  };
}
