// Місяць із точок (DotMonth, ADR 0007): розкладка точок і один кадр малювання — окремо від React, щоб їх можна було
// перевірити тестом і щоб компонент лишався коротким.
export type DotTone = "base" | "today" | "awaiting" | "returned" | "approved";

export interface Dot {
  cell: number;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  delay: number;
  tone: DotTone;
  alpha: number;
  size: number;
}

export const COLS = 7;
const DOT_COLS = 7;
const DOT_ROWS = 3;
const GAP = 6;
const FLY_MS = 700;
const PUSH_RADIUS = 46;

export interface DotStyle {
  tone: DotTone;
  alpha: number;
  size: number;
  /** Частка дня (0–1), з якої школа закрита: точки правіше — приглушені; 0 — закрито цілий день; null — відкрито. */
  closedFrom: number | null;
}

/** Приглушена точка закритої частини дня: тихіша за вихідний, щоб штриховка під нею читалась. */
const CLOSED = { alpha: 0.1, size: 1.2 } as const;

/**
 * Вигляд точки дня: поза місяцем — немає; вихідний — тихіше; запис — колір статусу; сьогодні — `highlight`. Закриття
 * школою (`closedFrom`) лише приглушує точки без запису: записи й «сьогодні» лишаються як є.
 */
export function dotLook(cell: {
  inMonth: boolean;
  weekend: boolean;
  status: DotTone | null;
  today: boolean;
  closedFrom?: number | null;
}): DotStyle | null {
  if (!cell.inMonth) return null;
  const closedFrom = cell.closedFrom ?? null;
  if (cell.today) return { tone: "today", alpha: 1, size: 2.1, closedFrom };
  if (cell.status) return { tone: cell.status, alpha: 0.95, size: 1.9, closedFrom };
  return { tone: "base", alpha: cell.weekend ? 0.16 : 0.34, size: 1.5, closedFrom };
}

/**
 * Чи точка в стовпці `col` (0–6) блоку дня потрапляє в закриту частину дня. Закриття о 18:00 і пізніше (частка 1) —
 * поза шкалою дня: закритої частини немає, як і штриховки (layoutHatch).
 */
export function inClosedPart(col: number, closedFrom: number | null): boolean {
  return closedFrom !== null && closedFrom < 1 && col / (DOT_COLS - 1) >= closedFrom;
}

/** Сітка 7 × 3 точок на кожен день; звідки точка злітає й коли — з детермінованого «випадку», щоб кадр був сталим. */
export function layoutDots(
  cells: readonly (string | null)[],
  look: (cell: number, date: string | null) => DotStyle | null,
  width: number,
  height: number,
): Dot[] {
  const rows = Math.ceil(cells.length / COLS);
  const cw = width / COLS;
  const ch = height / rows;
  const sx = (cw - GAP * 2) / (DOT_COLS - 1);
  const sy = (ch - GAP * 2) / (DOT_ROWS - 1);
  let seed = 11;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const dots: Dot[] = [];
  cells.forEach((date, cell) => {
    const style = look(cell, date);
    if (!style) return;
    const x0 = (cell % COLS) * cw + GAP;
    const y0 = Math.floor(cell / COLS) * ch + GAP;
    for (let i = 0; i < DOT_COLS * DOT_ROWS; i++) {
      const muted = style.tone === "base" && inClosedPart(i % DOT_COLS, style.closedFrom);
      dots.push({
        cell,
        x: x0 + (i % DOT_COLS) * sx,
        y: y0 + Math.floor(i / DOT_COLS) * sy,
        fromX: rand() * width,
        fromY: height + rand() * 40,
        delay: (cell / cells.length) * 260 + rand() * 220,
        tone: style.tone,
        alpha: muted ? CLOSED.alpha : style.alpha,
        size: muted ? CLOSED.size : style.size,
      });
    }
  });
  return dots;
}

export interface HatchRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Штриховка закритої частини дня (той самий знак «закрито школою», що в календарі заявки): цілий день — уся клітинка,
 * скорочений день — від `closedFrom` праворуч.
 */
export function layoutHatch(
  cells: readonly (string | null)[],
  closedFrom: (cell: number, date: string) => number | null,
  width: number,
  height: number,
): HatchRect[] {
  const rows = Math.ceil(cells.length / COLS);
  const cw = width / COLS;
  const ch = height / rows;
  const rects: HatchRect[] = [];
  cells.forEach((date, cell) => {
    const from = date ? closedFrom(cell, date) : null;
    if (from === null || from >= 1) return;
    const x = (cell % COLS) * cw + 2;
    const w = cw - 4;
    rects.push({ x: x + w * from, y: Math.floor(cell / COLS) * ch + 2, w: w * (1 - from), h: ch - 4 });
  });
  return rects;
}

const HATCH_STEP = 6;
// `muted-foreground` 75 %: контраст ліній ≥ 3:1 до тла в обох темах (DESIGN.md, таблиця контрасту).
export const HATCH_ALPHA = 0.75;

/** Діагональні лінії в кожному прямокутнику; проявляються разом із прольотом точок (`elapsed`, Infinity — одразу). */
export function drawHatch(ctx: CanvasRenderingContext2D, rects: readonly HatchRect[], color: string, elapsed: number) {
  if (rects.length === 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = HATCH_ALPHA * Math.min(1, Math.max(0, elapsed / FLY_MS));
  for (const r of rects) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.beginPath();
    for (let o = -r.h; o < r.w; o += HATCH_STEP) {
      ctx.moveTo(r.x + o, r.y + r.h);
      ctx.lineTo(r.x + o + r.h, r.y);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/** Клітинка під курсором або null (поза полотном чи порожня клітинка до 1-го числа). */
export function cellAt(cells: readonly (string | null)[], x: number, y: number, width: number, height: number): number | null {
  const rows = Math.ceil(cells.length / COLS);
  const col = Math.floor((x / width) * COLS);
  const row = Math.floor((y / height) * rows);
  if (col < 0 || col >= COLS || row < 0 || row >= rows) return null;
  const cell = row * COLS + col;
  return cells[cell] ? cell : null;
}

/** Де точка в цей момент: проліт за `FLY_MS` з розкидом у часі і легке розступання біля курсора. */
export function dotPosition(dot: Dot, elapsed: number, mouse: readonly [number, number] | null) {
  const t = Math.min(1, Math.max(0, (elapsed - dot.delay) / FLY_MS));
  const e = 1 - Math.pow(1 - t, 3);
  let x = dot.fromX + (dot.x - dot.fromX) * e;
  let y = dot.fromY + (dot.y - dot.fromY) * e;
  if (mouse) {
    const dx = x - mouse[0];
    const dy = y - mouse[1];
    const dist = Math.hypot(dx, dy);
    if (dist < PUSH_RADIUS && dist > 0) {
      const push = (1 - dist / PUSH_RADIUS) * 5;
      x += (dx / dist) * push;
      y += (dy / dist) * push;
    }
  }
  return { x, y, e };
}

/** Один кадр: `elapsed` — мс від початку (Infinity — без руху), `pulse` — 0.5–1 для «сьогодні». */
export function drawDots(
  ctx: CanvasRenderingContext2D,
  dots: readonly Dot[],
  colors: Readonly<Record<DotTone, string>>,
  frame: { elapsed: number; pulse: number; hover: number | null; mouse: readonly [number, number] | null },
) {
  for (const d of dots) {
    const { x, y, e } = dotPosition(d, frame.elapsed, frame.mouse);
    const hovered = d.cell === frame.hover;
    const size = hovered ? d.size * 1.6 : d.size;
    const alpha = Math.min(1, d.alpha * e + (hovered ? 0.35 : 0)) * (d.tone === "today" ? frame.pulse : 1);
    ctx.fillStyle = colors[d.tone];
    if (d.tone === "today") {
      ctx.globalAlpha = 0.18 * e;
      ctx.beginPath();
      ctx.arc(x, y, size * 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * Підпис дня під місяцем: запис — його підпис; закриття школою — назва ("Winter break", "Teachers' meeting from
 * 12:00"), разом із записом — через « · »; інакше — "12 · no records".
 */
export function dayLabel(
  date: string,
  today: string,
  mark: { label: string } | undefined,
  closure: { label: string } | undefined,
): string {
  if (mark) return closure ? `${mark.label} · ${closure.label}` : mark.label;
  return `${date === today ? "Today · " : ""}${Number(date.slice(8))} · ${closure ? closure.label : "no records"}`;
}
