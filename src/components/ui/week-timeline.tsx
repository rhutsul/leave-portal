import { segmentBox, type BlockingStatus, type DayClosure, type TimelineSegment } from "@/lib/leave/overview";
import { RECORD_STATUSES } from "@/lib/leave/request";
import { cn } from "@/lib/utils";

export interface WeekTimelineDay {
  date: string;
  /** "Mon 2". */
  label: string;
  /** Повна дата для зчитувача екрана: "Mon, 2 Nov 2026". */
  long: string;
  today: boolean;
  /** Закриття школою: цілий день (from 0) чи з години; null — відкрито. */
  closure?: DayClosure | null;
}

export interface WeekTimelineBar {
  col: number;
  status: BlockingStatus;
  hours: string;
  /** Записи клітинки за часом; два й більше — кожен своїм сегментом на шкалі дня (08:00–18:00). */
  segments?: readonly TimelineSegment[];
}

export interface WeekTimelineRow {
  key: string;
  name: string;
  sub: string;
  bars: readonly WeekTimelineBar[];
}

// Смуга — колір статусу з прозорістю; «Awaiting decision» — пунктирна межа (DESIGN.md, `WeekTimeline`).
const BAR: Record<BlockingStatus, string> = {
  approved: "border-status-approved-foreground/70 bg-status-approved-foreground/20",
  returned: "border-status-returned-foreground/70 bg-status-returned-foreground/20",
  awaiting: "border-dashed border-status-awaiting-foreground/70 bg-status-awaiting-foreground/15",
};

const GRID = "grid grid-cols-[170px_repeat(10,minmax(0,1fr))]";

// Закрито школою — діагональна штриховка, той самий знак, що в календарі заявки й у DotMonth.
const HATCH = "bg-[repeating-linear-gradient(135deg,transparent_0_4px,var(--border)_4px_5px)]";

/** Штриховка закритої частини дня в колонці: цілий день — уся колонка, скорочений — від години закриття праворуч. */
function ClosedHatch({ closure, col }: { closure: DayClosure; col: number }) {
  return (
    <span aria-hidden="true" className="relative row-start-1" style={{ gridColumn: col + 2 }}>
      <span className={cn("absolute inset-y-0 right-0", HATCH)} style={{ left: `${closure.from * 100}%` }} />
    </span>
  );
}

/**
 * Кілька записів одного рядка в один день: кожен — сегмент на своїх годинах шкали дня, кольором свого статусу
 * («Awaiting decision» — пунктир); скорочений день — сегменти лише до години закриття. У клітинці — лічильник
 * («2 records», у вузькій колонці «×2»), години й статус кожного — у `title` і для зчитувача екрана.
 */
function SegmentedCell({ bar, day }: { bar: WeekTimelineBar & { segments: readonly TimelineSegment[] }; day: WeekTimelineDay }) {
  const each = bar.segments.map((seg) => `${seg.hours} · ${RECORD_STATUSES[seg.status]}`);
  const closedFrom = day.closure?.time ? day.closure.from : null;
  return (
    <span
      role="cell"
      title={`${day.long} · ${each.join("; ")}`}
      className="@container relative row-start-1 mx-0.5 h-7 min-w-0 self-center text-[11px] tracking-tight tabular-nums"
      style={{ gridColumn: bar.col + 2 }}
    >
      <span className="sr-only">
        {day.long}, {bar.segments.length} records: {each.join("; ")}
      </span>
      {bar.segments.map((seg) => {
        const box = segmentBox(seg, closedFrom);
        return (
          <span
            key={`${seg.start_min}-${seg.end_min}-${seg.status}`}
            aria-hidden="true"
            className={cn("absolute inset-y-0 rounded-[4px] border", BAR[seg.status])}
            style={{ left: `${box.left * 100}%`, width: `${box.width * 100}%` }}
          />
        );
      })}
      <span aria-hidden="true" className="relative flex h-full items-center justify-center px-1 font-medium">
        <span className="@min-[64px]:hidden">×{bar.segments.length}</span>
        <span className="hidden truncate @min-[64px]:inline">{bar.segments.length} records</span>
      </span>
    </span>
  );
}

/** Для зчитувача екрана й підказки: "Mon, 28 Dec 2026 · School closed: Winter break". */
function dayTitle(d: WeekTimelineDay): string {
  if (!d.closure) return d.long;
  return `${d.long} · ${d.closure.time ? "School closes early" : "School closed"}: ${d.closure.label}`;
}

/** Заголовок колонки дня: "Mon 2"; закритий школою — штриховка й «closed», скорочений — час закриття. */
function DayHeader({ day: d, weekStart }: { day: WeekTimelineDay; weekStart: boolean }) {
  return (
    <span
      role="columnheader"
      aria-label={dayTitle(d)}
      title={d.closure ? dayTitle(d) : undefined}
      className={cn(
        "flex flex-col items-center justify-center py-2 text-center font-mono text-[11px] text-muted-foreground",
        weekStart && "border-l border-border",
        d.today && "bg-highlight/10 font-medium text-foreground",
        d.closure && !d.closure.time && HATCH,
      )}
    >
      {d.label}
      {d.closure && <ClosureTime time={d.closure.time} />}
    </span>
  );
}

/**
 * У вузькій колонці (телефон) «from 12:00» не вміщається — «· 12:00» під датою, тобто «Mon 9 · 12:00»; від 64 px —
 * «from 12:00». Повністю («School closes early: … from 12:00») — у `title` і в назві заголовка для зчитувача.
 */
function ClosureTime({ time }: { time: string | null }) {
  if (!time) return <span className="px-0.5 text-[10px] leading-3">closed</span>;
  return (
    <span className="@container w-full px-0.5 text-[10px] leading-3">
      <span className="@min-[64px]:hidden">· {time.replace(/^from /, "")}</span>
      <span className="hidden @min-[64px]:inline">{time}</span>
    </span>
  );
}

/**
 * Діаграма на два робочі тижні (ADR 0007): рядок — людина (менеджер) або посада (працівник), смуга — записи дня
 * кольором статусу; сьогодні — колонка `highlight`. Статус і дата кожної смуги — словами для зчитувача екрана й у
 * підказці; ширше за картку — прокрутка всередині.
 */
export function WeekTimeline({
  days,
  rows,
  empty,
  label,
}: {
  days: readonly WeekTimelineDay[];
  rows: readonly WeekTimelineRow[];
  empty: string;
  label: string;
}) {
  const today = days.findIndex((d) => d.today);
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <div role="table" aria-label={label} className="min-w-[640px]">
        <div role="row" className={cn(GRID, "border-b border-border")}>
          {/* Перша колонка — імена: заголовок лише для зчитувача, але сама клітинка лишається в сітці. */}
          <span role="columnheader">
            <span className="sr-only">Who</span>
          </span>
          {days.map((d, i) => (
            <DayHeader key={d.date} day={d} weekStart={i === 5} />
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">{empty}</p>
        ) : (
          rows.map((row) => (
            <div key={row.key} role="row" className={cn(GRID, "min-h-12 border-b border-border last:border-b-0")}>
              <span role="rowheader" className="row-start-1 flex min-w-0 flex-col justify-center px-3 py-1.5">
                <span className="truncate text-[13px] font-medium">{row.name}</span>
                <span className="truncate text-[11px] text-muted-foreground">{row.sub}</span>
              </span>
              {today >= 0 && <span aria-hidden="true" className="row-start-1 bg-highlight/10" style={{ gridColumn: today + 2 }} />}
              {days.map((d, i) => d.closure && <ClosedHatch key={d.date} closure={d.closure} col={i} />)}
              {row.bars.map((b) =>
                b.segments && b.segments.length > 1 ? (
                  <SegmentedCell key={b.col} bar={b as WeekTimelineBar & { segments: readonly TimelineSegment[] }} day={days[b.col]} />
                ) : (
                  <span
                    key={b.col}
                    role="cell"
                    title={`${days[b.col].long} · ${b.hours} · ${RECORD_STATUSES[b.status]}`}
                    className={cn(
                      "row-start-1 mx-0.5 flex h-7 min-w-0 items-center self-center rounded-[5px] border px-1 text-[11px] tracking-tight tabular-nums",
                      BAR[b.status],
                    )}
                    style={{ gridColumn: b.col + 2 }}
                  >
                    <span className="sr-only">
                      {days[b.col].long}, {RECORD_STATUSES[b.status]}:{" "}
                    </span>
                    <span className="truncate">{b.hours}</span>
                  </span>
                ),
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
