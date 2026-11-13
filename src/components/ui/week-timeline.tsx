"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties, type FocusEvent, type ReactNode } from "react";
import { XIcon } from "lucide-react";
import { barBox, cellLayout, closureShare, type BlockingStatus, type DayClosure, type DayScale } from "@/lib/leave/overview";
import { isLeaveType, LEAVE_TYPES, RECORD_STATUSES } from "@/lib/leave/request";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "./button";
import { LeaveTypeTag } from "./leave-type-tag";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "./popover";
import { StatusBadge } from "./status-badge";

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

export interface WeekTimelineRecord {
  id: number;
  start_min: number;
  end_min: number;
  status: BlockingStatus;
  /** "08:30–12:00". */
  hours: string;
  /** Тип відсутності ключем ("sick") — назву й колір дає LeaveTypeTag. */
  type: string;
  /** "3 h 30 min". */
  duration: string;
  /** Куди веде «Open record»: менеджеру — запис у «Decisions», працівнику — запис у «My requests». */
  href: string;
}

export interface WeekTimelineRow {
  key: string;
  name: string;
  sub: string;
  /** Шкала кожної колонки — робочий день посади рядка на цю дату; null чи немає — 08:00–18:00. */
  scales?: readonly (DayScale | null)[];
  cells: readonly { col: number; records: readonly WeekTimelineRecord[] }[];
}

// Смуга — колір статусу з прозорістю; «Awaiting decision» — пунктирна межа (DESIGN.md, `WeekTimeline`).
const BAR: Record<BlockingStatus, string> = {
  approved: "border-status-approved-foreground/70 bg-status-approved-foreground/20",
  returned: "border-status-returned-foreground/70 bg-status-returned-foreground/20",
  awaiting: "border-dashed border-status-awaiting-foreground/70 bg-status-awaiting-foreground/15",
};

// Тло лічильника «3 records» — рівні частки кольорами статусів записів за часом.
const TONE: Record<BlockingStatus, string> = {
  approved: "var(--status-approved-foreground)",
  returned: "var(--status-returned-foreground)",
  awaiting: "var(--status-awaiting-foreground)",
};

const GRID = "grid grid-cols-[150px_repeat(10,minmax(0,1fr))] md:grid-cols-[200px_repeat(10,minmax(0,1fr))]";

// Смуга й лічильник — кнопки: 32 px заввишки в рядку 56 px, на дотику — 44 px (ADR 0008).
const MARK =
  "absolute inset-y-3 cursor-pointer overflow-hidden rounded-[6px] border px-1.5 text-left text-[11px] font-medium whitespace-nowrap text-foreground tabular-nums outline-none transition-shadow duration-(--duration-fast) ease-out hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:ring-2 aria-expanded:ring-ring pointer-coarse:inset-y-1.5";

// Закрито школою — діагональна штриховка, той самий знак, що в DotMonth: лінії `muted-foreground` 75 % — контраст
// ≥ 3:1 до `card` і `background` в обох темах (DESIGN.md, таблиця контрасту): скорочений день видно лише за нею.
const HATCH =
  "bg-[repeating-linear-gradient(135deg,transparent_0_5px,color-mix(in_oklab,var(--muted-foreground)_75%,transparent)_5px_6px)]";

/**
 * Тло колонки дня в рядку: сьогодні — `highlight`, понеділок другого тижня — межа, закрита частина дня — штриховка
 * (скорочений день — від години закриття на шкалі дня посади рядка).
 */
function DayBackdrop({ day, col, scale }: { day: WeekTimelineDay; col: number; scale: DayScale | null }) {
  const from = day.closure ? closureShare(day.closure, scale) : 1;
  const closure = day.closure && from < 1 ? { from } : null;
  if (!day.today && col !== 5 && !closure) return null;
  return (
    <span
      aria-hidden="true"
      className={cn("relative row-start-1", day.today && "bg-highlight/10", col === 5 && "border-l border-border")}
      style={{ gridColumn: col + 2 }}
    >
      {closure && <span className={cn("absolute inset-y-0 right-0", HATCH)} style={{ left: `${closure.from * 100}%` }} />}
    </span>
  );
}

/** Скільки після закриття картки фокус, що повертається на смугу, не відкриває її знову, мс. */
const REFOCUS_MS = 300;

/**
 * Картка відкривається кліком, наведенням і фокусом з клавіатури; Esc і клік повз закривають. Фокус лишається на
 * смузі (Tab веде в картку), а після закриття фокус, що повернувся на смугу, картку знову не відкриває.
 */
function useCard() {
  const [open, setOpen] = useState(false);
  const closedAt = useRef(0);
  return {
    open,
    onOpenChange: (next: boolean) => {
      if (!next) closedAt.current = Date.now();
      setOpen(next);
    },
    trigger: {
      onFocus: (event: FocusEvent<HTMLElement>) => {
        if (Date.now() - closedAt.current > REFOCUS_MS && event.currentTarget.matches(":focus-visible")) setOpen(true);
      },
    },
  };
}

function CardShell({ label, head, children }: { label: string; head: ReactNode; children: ReactNode }) {
  return (
    <PopoverContent aria-label={label} initialFocus={false} className="flex w-[300px] flex-col gap-2 rounded-xl px-3.5 py-3 shadow-lg">
      <span className="flex items-center justify-between gap-2">
        {head}
        <PopoverClose render={<Button variant="ghost" size="icon-xs" aria-label="Close" className="pointer-coarse:size-11" />}>
          <XIcon />
        </PopoverClose>
      </span>
      {children}
    </PopoverContent>
  );
}

/** Смуга робочого дня посади із записом на своїх годинах — та сама шкала, що в клітинці діаграми. */
function MiniDay({ record, scale }: { record: Pick<WeekTimelineRecord, "start_min" | "end_min">; scale: DayScale | null }) {
  const box = barBox(record, scale);
  return (
    <span aria-hidden="true" className="relative h-1.5 rounded-full bg-muted">
      <span className="absolute inset-y-0 rounded-full bg-primary" style={{ left: `${box.left * 100}%`, width: `${box.width * 100}%` }} />
    </span>
  );
}

/** Вміст картки запису: статус словом, дата й години, смуга дня, хто й посада, тип і тривалість, «Open record». */
export function RecordCard({
  record,
  day,
  who,
  scale = null,
}: {
  record: WeekTimelineRecord;
  day: WeekTimelineDay;
  who: string;
  scale?: DayScale | null;
}) {
  return (
    <>
      <span className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-semibold tabular-nums">
        <span>{day.long}</span>
        <span className="text-primary">{record.hours}</span>
      </span>
      <MiniDay record={record} scale={scale} />
      <span className="text-xs text-muted-foreground">{who}</span>
      <span className="mt-0.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs">
          <LeaveTypeTag type={record.type} variant="inline" />
          <span className="text-muted-foreground">· {record.duration}</span>
        </span>
        <Link href={record.href} className={buttonVariants({ size: "sm", className: "pointer-coarse:h-11" })}>
          Open record
        </Link>
      </span>
    </>
  );
}

/** Вміст картки дня з трьома й більше записами: кожен запис — посилання з годинами, типом і статусом. */
export function DayCard({ records, who }: { records: readonly WeekTimelineRecord[]; who: string }) {
  return (
    <>
      <span className="text-xs text-muted-foreground">{who}</span>
      <ul className="flex flex-col">
        {records.map((r) => (
          <li key={r.id} className="border-t border-border">
            <Link
              href={r.href}
              className="grid grid-cols-[96px_1fr_auto] items-center gap-2 rounded-sm py-2 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
            >
              <span className="text-[13px] font-semibold text-primary tabular-nums">{r.hours}</span>
              <LeaveTypeTag type={r.type} variant="inline" className="min-w-0 gap-1.5 text-xs" />
              <StatusBadge status={r.status} />
              <span className="sr-only">, open record</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

const typeName = (type: string) => (isLeaveType(type) ? LEAVE_TYPES[type] : type);

function RecordBar({
  record,
  box,
  day,
  who,
  scale,
}: {
  record: WeekTimelineRecord;
  box: { left: number; width: number; whole: boolean };
  day: WeekTimelineDay;
  who: string;
  scale: DayScale | null;
}) {
  const card = useCard();
  return (
    <Popover open={card.open} onOpenChange={card.onOpenChange}>
      <PopoverTrigger
        openOnHover
        delay={120}
        closeDelay={120}
        aria-label={`${who}, ${day.long}, ${record.hours}, ${typeName(record.type)}, ${RECORD_STATUSES[record.status]}`}
        className={cn(MARK, "@container min-w-3.5", BAR[record.status])}
        style={{ left: `calc(${box.left * 100}% + 3px)`, width: `calc(${box.width * 100}% - 6px)` }}
        {...card.trigger}
      >
        {/* Підпис — лише де вміщається (ширина вмісту смуги, без відступів): «Whole day» чи години; повністю — у назві
            кнопки й у картці. */}
        <span aria-hidden="true" className={cn("hidden", box.whole ? "@min-[50px]:inline" : "@min-[64px]:inline")}>
          {box.whole ? "Whole day" : record.hours}
        </span>
      </PopoverTrigger>
      <CardShell label="Record" head={<StatusBadge status={record.status} />}>
        <RecordCard record={record} day={day} who={who} scale={scale} />
      </CardShell>
    </Popover>
  );
}

/** Три й більше записів дня — лічильник; тло поділене кольорами статусів, картка перелічує записи. */
function CountButton({ records, statuses, day, who }: { records: readonly WeekTimelineRecord[]; statuses: readonly BlockingStatus[]; day: WeekTimelineDay; who: string }) {
  const card = useCard();
  const stops = statuses.map(
    (s, i) => `color-mix(in oklch, ${TONE[s]} 30%, transparent) ${(i / statuses.length) * 100}% ${((i + 1) / statuses.length) * 100}%`,
  );
  const style: CSSProperties = { backgroundImage: `linear-gradient(90deg, ${stops.join(", ")})` };
  const each = records.map((r) => `${r.hours} ${RECORD_STATUSES[r.status]}`).join("; ");
  return (
    <Popover open={card.open} onOpenChange={card.onOpenChange}>
      <PopoverTrigger
        openOnHover
        delay={120}
        closeDelay={120}
        aria-label={`${who}, ${day.long}, ${records.length} records: ${each}`}
        className={cn(MARK, "@container inset-x-[3px] border-input text-center font-semibold")}
        style={style}
        {...card.trigger}
      >
        <span aria-hidden="true" className="@min-[60px]:hidden">×{records.length}</span>
        <span aria-hidden="true" className="hidden @min-[60px]:inline">{records.length} records</span>
      </PopoverTrigger>
      <CardShell label="Records of the day" head={<span className="text-[15px] font-semibold tabular-nums">{day.long}</span>}>
        <DayCard records={records} who={who} />
      </CardShell>
    </Popover>
  );
}

function Cell({
  records,
  day,
  col,
  who,
  scale,
}: {
  records: readonly WeekTimelineRecord[];
  day: WeekTimelineDay;
  col: number;
  who: string;
  scale: DayScale | null;
}) {
  // Скорочений день — смуги лише до години закриття; закритий цілий день записів не обрізає.
  const layout = cellLayout(records, scale, day.closure?.closesAt ?? null);
  return (
    <span role="cell" className="relative row-start-1 min-w-0" style={{ gridColumn: col + 2 }}>
      {layout.collapsed ? (
        <CountButton records={records} statuses={layout.statuses} day={day} who={who} />
      ) : (
        layout.bars.map((b) => <RecordBar key={b.record.id} record={b.record} box={b} day={day} who={who} scale={scale} />)
      )}
    </span>
  );
}

/** Для зчитувача екрана й підказки: "Mon, 28 Dec 2026 · School closed: Winter break". */
function dayTitle(d: WeekTimelineDay): string {
  if (!d.closure) return d.long;
  return `${d.long} · ${d.closure.time ? "School closes early" : "School closed"}: ${d.closure.label}`;
}

/**
 * Заголовок колонки дня: "Mon 2"; закритий школою — «closed», скорочений — час закриття. Штриховка — лише в рядках:
 * під текстом заголовка вона заважала б читати.
 */
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

const LEGEND = ["approved", "awaiting", "returned"] as const satisfies readonly BlockingStatus[];

/** Легенда під сіткою: статуси словом із крапкою і що означає смуга; зі закриттями — ще й штриховка. */
function Legend({ closures }: { closures: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4.5 gap-y-1.5 border-t border-border px-3.5 py-2.5 text-xs text-muted-foreground">
      {LEGEND.map((s) => (
        <StatusBadge key={s} status={s} className="text-muted-foreground" />
      ))}
      <span className="md:ml-auto">
        A bar spans the hours of the record within the working day of the position · select a bar to see the record
        {closures && " · hatched — closed by the school"}
      </span>
    </div>
  );
}

/**
 * Діаграма на два робочі тижні (ADR 0007, v2): рядок — людина й посада (менеджер) або посада (працівник); кожен запис —
 * своя смуга на своїх годинах шкали 08:00–18:00, кольором статусу; три й більше записів дня — лічильник. Смуга —
 * кнопка з повною назвою (хто, дата, години, тип, статус), що відкриває картку запису. Сьогодні — колонка `highlight`,
 * закриті школою дні — штриховка. Ширше за картку — прокрутка всередині.
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
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <div role="table" aria-label={label} className="min-w-[680px]">
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
            rows.map((row) => {
              const who = `${row.name} · ${row.sub}`;
              return (
                <div key={row.key} role="row" className={cn(GRID, "min-h-14 border-b border-border last:border-b-0")}>
                  <span role="rowheader" className="row-start-1 flex min-w-0 flex-col justify-center px-3.5 py-2">
                    <span className="truncate text-[13px] font-semibold">{row.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{row.sub}</span>
                  </span>
                  {days.map((d, i) => (
                    <DayBackdrop key={d.date} day={d} col={i} scale={row.scales?.[i] ?? null} />
                  ))}
                  {row.cells.map((c) => (
                    <Cell key={c.col} records={c.records} day={days[c.col]} col={c.col} who={who} scale={row.scales?.[c.col] ?? null} />
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
      <Legend closures={days.some((d) => d.closure)} />
    </div>
  );
}
