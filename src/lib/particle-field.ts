/**
 * Поле частинок для `/welcome` і `/login` (ADR 0007, DESIGN.md `ParticleField`): чиста геометрія і логіка стадій,
 * окремо від three.js, щоб перевірити тестами без WebGL.
 *
 * Кожна точка має п'ять форм (позиція + тон для кожної), між сусідніми формами шейдер плавно переводить точки з
 * розкидом у часі. Тон — індекс кольору палітри токенів і вага (прозорість): кольори не «зашиті» в геометрію, тож
 * зміна теми лише оновлює палітру.
 */

export const FORM_COUNT = 5;

/** Палітра з токенів (DESIGN.md, розділ 2), у порядку індексів тону. */
export const PALETTE_TOKENS = [
  "--foreground",
  "--primary",
  "--status-awaiting-foreground",
  "--status-approved-foreground",
  "--status-returned-foreground",
  "--highlight",
] as const;

/** Індекси палітри (PALETTE_TOKENS). */
const Tone = { Neutral: 0, Primary: 1, Awaiting: 2, Approved: 3, Returned: 4, Highlight: 5 } as const;
type Tone = (typeof Tone)[keyof typeof Tone];

export type FieldVariant = "login" | "welcome";

/** Скільки точок: до 24 000 на landing, менше на вході (ADR 0007: стеля 32 000). */
export const POINTS: Record<FieldVariant, number> = { welcome: 24_000, login: 16_000 };

export interface FieldGeometry {
  count: number;
  /** FORM_COUNT масивів по count × 3: позиція точки в кожній формі. */
  positions: Float32Array[];
  /** FORM_COUNT масивів по count × 2: індекс палітри і вага (0..1) у кожній формі. */
  tones: Float32Array[];
  /** count × 4 випадкових чисел: розкид у часі, розмір, мерехтіння. */
  random: Float32Array;
  /** Сфера ролі точки (0, 1, 2) або -1: на неї світить наведена картка ролі. */
  group: Float32Array;
}

type Vec3 = [number, number, number];
type Point = { p: Vec3; tone: Tone; weight: number };
type Rand = () => number;

/** Детермінований генератор (mulberry32): та сама картинка на кожному завантаженні. */
export function rng(seed: number): Rand {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Точка на периметрі прямокутника. */
function edge(R: Rand, x0: number, y0: number, w: number, h: number): [number, number] {
  const t = R() * 2 * (w + h);
  if (t < w) return [x0 + t, y0];
  if (t < w + h) return [x0 + w, y0 + (t - w)];
  if (t < 2 * w + h) return [x0 + w - (t - w - h), y0 + h];
  return [x0, y0 + h - (t - 2 * w - h)];
}

/** Точка на сфері радіуса `radius` з центром `c`, сплющена по осях `squash`. */
function sphere(R: Rand, radius: number, c: Vec3 = [0, 0, 0], squash: Vec3 = [1, 1, 1]): Vec3 {
  const u = R() * Math.PI * 2;
  const v = Math.acos(2 * R() - 1);
  return [
    c[0] + radius * Math.sin(v) * Math.cos(u) * squash[0],
    c[1] + radius * Math.sin(v) * Math.sin(u) * squash[1],
    c[2] + radius * Math.cos(v) * squash[2],
  ];
}

const CELL_W = 1.6 / 7;
const CELL_H = 1.4 / 5;
// Позначені дні аркуша: сьогодні, «Awaiting decision», «Returned for revision», «Approved».
const MARKS = [
  { cell: 3, tone: Tone.Highlight },
  { cell: 10, tone: Tone.Awaiting },
  { cell: 15, tone: Tone.Returned },
  { cell: 25, tone: Tone.Approved },
];

/** Форма 0 — аркуш місяця: контур, смуга шапки, кільця, клітинки днів і позначені дні. */
function sheetPoint(R: Rand, dx: number): Point {
  const r = R();
  let q: [number, number];
  let tone: Tone = Tone.Neutral;
  let weight: number;
  if (r < 0.16) {
    q = edge(R, -0.8, -0.95, 1.6, 1.8);
    weight = 0.85;
  } else if (r < 0.27) {
    q = [-0.8 + R() * 1.6, 0.55 + R() * 0.3];
    tone = Tone.Primary;
    weight = 0.7 + 0.3 * R();
  } else if (r < 0.31) {
    const side = R() < 0.5 ? -0.45 : 0.45;
    const a = R() * Math.PI * 2;
    q = [side + 0.06 * Math.cos(a), 0.9 + 0.08 * Math.sin(a)];
    weight = 0.9;
  } else if (r < 0.8) {
    const cell = Math.floor(R() * 35);
    const col = cell % 7;
    const row = Math.floor(cell / 7);
    q = edge(R, -0.8 + col * CELL_W + 0.02, 0.5 - (row + 1) * CELL_H + 0.02, CELL_W - 0.04, CELL_H - 0.04);
    weight = col >= 5 ? 0.35 : 0.55 + 0.25 * R();
  } else {
    const mark = MARKS[Math.floor(R() * MARKS.length)];
    const col = mark.cell % 7;
    const row = Math.floor(mark.cell / 7);
    q = [-0.8 + col * CELL_W + 0.03 + R() * (CELL_W - 0.06), 0.5 - (row + 1) * CELL_H + 0.03 + R() * (CELL_H - 0.06)];
    tone = mark.tone;
    weight = 1;
  }
  return { p: [q[0] + dx, q[1], (R() - 0.5) * 0.03], tone, weight };
}

const CARD_TONES = [Tone.Neutral, Tone.Primary, Tone.Awaiting, Tone.Approved, Tone.Returned];

/** Форма 1 — віяло з п'яти карток-днів. */
function fanPoint(R: Rand): Point {
  const k = Math.floor(R() * 5);
  const q = R();
  let l: [number, number];
  let tone: Tone = Tone.Neutral;
  let weight = 0.45;
  if (q < 0.35) {
    l = edge(R, -0.31, -0.41, 0.62, 0.82);
    weight = 0.85;
  } else if (q < 0.6) {
    l = [-0.27 + R() * 0.54, 0.22 + R() * 0.15];
    tone = CARD_TONES[k];
    weight = 0.85;
  } else {
    l = [-0.25 + R() * 0.5 * (0.4 + 0.6 * R()), -0.32 + Math.floor(R() * 5) * 0.1];
  }
  const angle = (k - 2) * 0.22;
  const x = l[0] * 1.25;
  const y = (l[1] + 0.85) * 1.25;
  return {
    p: [
      x * Math.cos(angle) - y * Math.sin(angle),
      x * Math.sin(angle) + y * Math.cos(angle) - 1,
      (k - 2) * 0.08 + (R() - 0.5) * 0.02,
    ],
    tone,
    weight,
  };
}

/** Частка залишку на кільці: 16.64 з 18.00 (той самий приклад, що в секції «Balances»). */
export const RING_LEFT = 16.64 / 18;

/** Форма 2 — кільце залишку: частка, що лишилась, — `primary`, використана — тьмяна. */
function ringPoint(R: Rand): Point {
  const th = R() * Math.PI * 2;
  if (R() < 0.84) {
    const ph = R() * Math.PI * 2;
    const rr = 0.82 + 0.08 * Math.cos(ph);
    // Частка кола за годинниковою стрілкою від верху.
    const frac = ((((Math.PI / 2 - th) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
    const left = frac < RING_LEFT;
    return {
      p: [rr * Math.cos(th), rr * Math.sin(th) - 0.02, 0.08 * Math.sin(ph)],
      tone: left ? Tone.Primary : Tone.Neutral,
      weight: left ? 0.75 + 0.25 * R() : 0.3,
    };
  }
  const rr = 1.05 + R() * 0.3;
  return { p: [rr * Math.cos(th), rr * Math.sin(th), (R() - 0.5) * 0.1], tone: Tone.Neutral, weight: 0.22 };
}

const ROLE_TONES = [Tone.Primary, Tone.Returned, Tone.Highlight];

/** Форма 3 — три сфери ролей над картками ролей. */
function rolePoint(R: Rand, role: number): Point {
  return {
    p: sphere(R, 0.3 * (0.8 + 0.2 * R()), [(role - 1) * 1.5, 0.35, 0]),
    tone: ROLE_TONES[role],
    weight: 0.65 + 0.35 * R(),
  };
}

/** Форма 4 — широке поле, що «дихає» хвилею. */
function wavePoint(R: Rand): Point {
  const accent = R() < 0.12;
  return {
    p: [(R() - 0.5) * 5.2, -0.45, (R() - 0.5) * 2.4],
    tone: accent ? Tone.Primary : Tone.Neutral,
    weight: accent ? 0.8 : 0.4 + 0.2 * R(),
  };
}

/** Розсіяна хмара: на вході з неї складається аркуш, на landing вона — тло всіх форм. */
function cloudPoint(R: Rand, spread: [number, number]): Point {
  return { p: sphere(R, spread[0] + R() * spread[1], [0, 0, 0], [1.6, 1, 0.6]), tone: Tone.Neutral, weight: 0.22 + R() * 0.15 };
}

/** П'ять форм точки на landing: аркуш (праворуч від тексту hero) → віяло → кільце → сфери ролей → поле. */
function welcomeForms(R: Rand): { forms: Point[]; group: number } {
  if (R() < 0.07) {
    const cloud = cloudPoint(R, [1.4, 1.2]);
    return { forms: Array.from({ length: FORM_COUNT }, () => cloud), group: -1 };
  }
  const role = Math.floor(R() * 3);
  return { forms: [sheetPoint(R, 1.15), fanPoint(R), ringPoint(R), rolePoint(R, role), wavePoint(R)], group: role };
}

/** На вході: з хмари (форма 0) точки складаються в аркуш місяця (форма 1) і далі стоять у ньому. */
function loginForms(R: Rand): { forms: Point[]; group: number } {
  const cloud = cloudPoint(R, [1.6, 1.4]);
  const sheet = R() < 0.07 ? cloudPoint(R, [1.3, 1.1]) : sheetPoint(R, 0);
  return { forms: [cloud, sheet, sheet, sheet, sheet], group: -1 };
}

/** Геометрія поля: позиції й тони всіх форм, випадкові числа й групи. */
export function buildField(variant: FieldVariant, count = POINTS[variant]): FieldGeometry {
  const R = rng(7);
  const positions = Array.from({ length: FORM_COUNT }, () => new Float32Array(count * 3));
  const tones = Array.from({ length: FORM_COUNT }, () => new Float32Array(count * 2));
  const random = new Float32Array(count * 4);
  const group = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 4; k++) random[i * 4 + k] = R();
    const { forms, group: g } = variant === "welcome" ? welcomeForms(R) : loginForms(R);
    forms.forEach((form, s) => {
      positions[s].set(form.p, i * 3);
      tones[s].set([form.tone, form.weight], i * 2);
    });
    group[i] = g;
  }
  return { count, positions, tones, random, group };
}

/** Зміна форми — за останні 420 px перед наступною секцією (DESIGN.md, розділ 11). */
export const MORPH_SPAN = 420;

/**
 * Стадія поля з прокрутки: `tops` — верхи секцій-форм на сторінці, `probe` — точка зору (55 % висоти вікна від верху
 * сторінки). Ціла частина — форма поточної секції, дробова — перехід до наступної за останні `span` px.
 */
export function stageAt(tops: readonly number[], probe: number, span = MORPH_SPAN): number {
  if (!tops.length) return 0;
  let i = 0;
  tops.forEach((top, k) => {
    if (top <= probe) i = k;
  });
  const next = tops[i + 1];
  const stage = next === undefined ? i : i + Math.min(1, Math.max(0, (probe - (next - span)) / span));
  return Math.min(FORM_COUNT - 1, stage);
}

/** Плавне наближення до цілі за час `dt` (секунди): та сама швидкість на швидкій і повільній машині. */
export function approach(current: number, target: number, dt: number, rate: number): number {
  return current + (target - current) * Math.min(1, dt * rate);
}
