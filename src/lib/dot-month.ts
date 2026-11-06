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

/** Вигляд точки дня: поза місяцем — немає; вихідний — тихіше; запис — колір статусу; сьогодні — `highlight`. */
export function dotLook(cell: { inMonth: boolean; weekend: boolean; status: DotTone | null; today: boolean }) {
  if (!cell.inMonth) return null;
  if (cell.today) return { tone: "today" as const, alpha: 1, size: 2.1 };
  if (cell.status) return { tone: cell.status, alpha: 0.95, size: 1.9 };
  return { tone: "base" as const, alpha: cell.weekend ? 0.16 : 0.34, size: 1.5 };
}

/** Сітка 7 × 3 точок на кожен день; звідки точка злітає й коли — з детермінованого «випадку», щоб кадр був сталим. */
export function layoutDots(
  cells: readonly (string | null)[],
  look: (cell: number, date: string | null) => ReturnType<typeof dotLook>,
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
      dots.push({
        cell,
        x: x0 + (i % DOT_COLS) * sx,
        y: y0 + Math.floor(i / DOT_COLS) * sy,
        fromX: rand() * width,
        fromY: height + rand() * 40,
        delay: (cell / cells.length) * 260 + rand() * 220,
        ...style,
      });
    }
  });
  return dots;
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
