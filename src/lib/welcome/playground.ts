import { dayShare } from "@/lib/leave/balance";

/**
 * Пісочниця «Try it» на landing `/welcome` (ADR 0007): заявка на синтетичних даних, без бази. Показує правила з вимог
 * PM — заявка ділиться на записи, один на посаду й дату; частка дня — хвилини записів від усіх робочих хвилин дати,
 * округлена half-up до 0.01 для кожної дати окремо (загальне правило: 150 / 420 = 0.36), тож одна дата не дає більше
 * 1.00; кожен запис вирішує менеджер своєї посади. Рахує той самий `dayShare`, що й баланс портала. Чиста логіка —
 * окремо від компонента, щоб перевірити тестами.
 */

export interface PlaygroundPosition {
  title: string;
  /** Дні тижня розкладу: 1 — понеділок … 5 — п'ятниця. */
  weekdays: readonly number[];
  /** Робочий час посади, хвилини від півночі. */
  from: number;
  to: number;
  schedule: string;
  manager: string;
}

export interface PlaygroundDate {
  day: number;
  weekday: number;
  short: string;
}

export const POSITIONS: readonly PlaygroundPosition[] = [
  {
    title: "Elementary school / Teacher",
    weekdays: [1, 2, 3, 4, 5],
    from: 510,
    to: 720,
    schedule: "Mon–Fri · 08:30–12:00",
    manager: "Elementary school manager",
  },
  {
    title: "High school / Math teacher",
    weekdays: [1, 2, 3, 4],
    from: 750,
    to: 930,
    schedule: "Mon–Thu · 12:30–15:30",
    manager: "High school manager",
  },
];

export const DATES: readonly PlaygroundDate[] = [
  { day: 9, weekday: 1, short: "Mon" },
  { day: 10, weekday: 2, short: "Tue" },
  { day: 11, weekday: 3, short: "Wed" },
  { day: 12, weekday: 4, short: "Thu" },
  { day: 13, weekday: 5, short: "Fri" },
];

/** Межі смуги робочого дня в пісочниці: від початку першої посади до кінця останньої. */
export const DAY_START = 510;
export const DAY_END = 930;
const STEP = 30;

/** Залишок «Personal leave» синтетичного працівника до заявки і річна норма. */
export const PERSONAL_LEFT = 16.64;
export const PERSONAL_GRANTED = 18;

export type Mode = "whole" | "hours";

export interface PlaygroundState {
  days: readonly number[];
  positions: readonly boolean[];
  mode: Mode;
  start: number;
  end: number;
}

export const INITIAL: PlaygroundState = { days: [12], positions: [true, true], mode: "whole", start: 540, end: 690 };

export interface PlaygroundRecord {
  key: string;
  /** День листопада 2026: записи однієї дати рахуються разом. */
  day: number;
  date: string;
  position: string;
  manager: string;
  from: number;
  to: number;
  minutes: number;
  /** Усі робочі хвилини цієї дати за розкладами обох посад. */
  workingMinutes: number;
}

function works(position: PlaygroundPosition, date: PlaygroundDate) {
  return position.weekdays.includes(date.weekday);
}

/** Години запису на посаді: увесь робочий час або перетин з обраними годинами. */
function span(position: PlaygroundPosition, state: PlaygroundState): [number, number] {
  if (state.mode === "whole") return [position.from, position.to];
  return [Math.max(position.from, state.start), Math.min(position.to, state.end)];
}

/** Записи заявки: один на посаду й дату, лише там, де посада працює і години перетинаються з розкладом. */
export function playgroundRecords(state: PlaygroundState): PlaygroundRecord[] {
  return DATES.filter((date) => state.days.includes(date.day)).flatMap((date) => {
    const total = POSITIONS.filter((p) => works(p, date)).reduce((sum, p) => sum + p.to - p.from, 0);
    return POSITIONS.flatMap((position, index) => {
      if (!state.positions[index] || !works(position, date)) return [];
      const [from, to] = span(position, state);
      if (to <= from) return [];
      return [
        {
          key: `${date.day}-${index}`,
          day: date.day,
          date: `${date.short}, ${date.day} Nov`,
          position: position.title,
          manager: position.manager,
          from,
          to,
          minutes: to - from,
          workingMinutes: total,
        },
      ];
    });
  });
}

/** Сума часток днів у сотих, як баланс портала: частка кожної дати округлюється окремо, потім сумується. */
function totalHundredths(records: readonly PlaygroundRecord[]): number {
  const byDay = new Map<number, { minutes: number; working: number }>();
  for (const r of records) {
    const day = byDay.get(r.day) ?? { minutes: 0, working: r.workingMinutes };
    day.minutes += r.minutes;
    byDay.set(r.day, day);
  }
  return [...byDay.values()].reduce((sum, d) => sum + dayShare(d.minutes, d.working), 0);
}

/** Сума часток днів записів, до 0.01. */
export function totalDays(records: readonly PlaygroundRecord[]): number {
  return totalHundredths(records) / 100;
}

/** Залишок після записів, які вже схвалено: перші `decided` записів заявки. */
export function personalLeft(records: readonly PlaygroundRecord[], decided: number): number {
  return (Math.round(PERSONAL_LEFT * 100) - totalHundredths(records.slice(0, decided))) / 100;
}

/** Чому записів немає: не обрано дату чи посаду, або обрані години не перетинаються з розкладом посад. */
export function emptyReason(state: PlaygroundState): string {
  if (!state.days.length || !state.positions.some(Boolean)) {
    return "Choose a working day and a position: records appear here.";
  }
  return "The chosen hours are outside the schedule of the selected positions on these days.";
}

/** «08:30» з хвилин від півночі. */
export function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** «3 h 30 min», «45 min», «2 h». */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

/** «2 records · 1.00 days» над списком записів; порожньо, коли записів немає. */
export function summary(records: readonly PlaygroundRecord[]): string {
  if (!records.length) return "";
  const count = records.length === 1 ? "1 record" : `${records.length} records`;
  return `${count} · ${totalDays(records).toFixed(2)} days`;
}

/** Варіанти «From» і «To» з кроком 30 хв у межах дня; «To» завжди пізніше за «From». */
export const START_OPTIONS = Array.from({ length: (DAY_END - DAY_START) / STEP }, (_, i) => DAY_START + i * STEP);
export const END_OPTIONS = START_OPTIONS.map((m) => m + STEP);

/** Новий «From»: якщо «To» вже не пізніше, «To» зсувається на крок. */
export function withStart(state: PlaygroundState, start: number): PlaygroundState {
  return { ...state, start, end: Math.max(state.end, start + STEP) };
}

/** Новий «To»: якщо «From» вже не раніше, «From» зсувається на крок. */
export function withEnd(state: PlaygroundState, end: number): PlaygroundState {
  return { ...state, end, start: Math.min(state.start, end - STEP) };
}

/** Дата в заявці або поза нею. */
export function toggleDay(state: PlaygroundState, day: number): PlaygroundState {
  const days = state.days.includes(day) ? state.days.filter((d) => d !== day) : [...state.days, day];
  return { ...state, days };
}

/** Посада в заявці або поза нею. */
export function togglePosition(state: PlaygroundState, index: number): PlaygroundState {
  return { ...state, positions: state.positions.map((on, i) => (i === index ? !on : on)) };
}
