// Залишки відпусток — чисті функції (D5 openspec/changes/impl-leave-ws6/design.md, requirements/03-leave-balance.md).
// Дані дає функція бази get_balance_inputs (D4): лише підсумки по датах, без деталей записів.
// Дні рахуємо в сотих (цілі числа): частка дня округлюється half-up до 0.01, тож дробові числа JS тут зайві.

import type { LeaveType } from "./request";

/** Днів «Sick leave» і «Personal leave» на навчальний рік, окремо (Assumptions 03-leave-balance). */
export const ANNUAL_DAYS = 18;

/** Типи з лімітом; «Unpaid leave» і «Family celebration» лише рахуються. */
export const LIMITED_TYPES = ["sick", "personal"] as const satisfies readonly LeaveType[];
export type LimitedType = (typeof LIMITED_TYPES)[number];

/**
 * Перший навчальний рік порталу — 2026–2027. Перенесені дні на його початок вносить розробник як тестові дані
 * (public.balance_carryovers, Assumptions 03-leave-balance); з наступних років переносимо залишок попереднього.
 */
export const FIRST_SCHOOL_YEAR = 2026;

const HUNDREDTHS = 100;

/** Навчальний рік дати "YYYY-MM-DD" — рік його початку: 1 вересня — 31 серпня наступного року. */
export function schoolYearOf(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return m >= 9 ? y : y - 1;
}

/** "2026–2027". */
export function formatSchoolYear(year: number): string {
  return `${year}–${year + 1}`;
}

/** Соті дня → "0.36". */
export function formatDays(hundredths: number): string {
  const sign = hundredths < 0 ? "-" : "";
  const abs = Math.abs(hundredths);
  return `${sign}${Math.floor(abs / HUNDREDTHS)}.${String(abs % HUNDREDTHS).padStart(2, "0")}`;
}

/**
 * Частка дня в сотих: хвилини записів ÷ усі робочі хвилини працівника на дату за розкладами всіх посад,
 * half-up до 0.01 (0.355 → 0.36), не більше 1.00 (AC-BALANCE-02, AC-BALANCE-03, AC-BALANCE-05, AC-BALANCE-06).
 */
export function dayShare(minutes: number, workingMinutes: number): number {
  if (workingMinutes <= 0 || minutes <= 0) return 0;
  // round(minutes × 100 ÷ working) half-up у цілих: ⌊(2 × minutes × 100 + working) ÷ (2 × working)⌋.
  const share = Math.floor((2 * minutes * HUNDREDTHS + workingMinutes) / (2 * workingMinutes));
  return Math.min(share, HUNDREDTHS);
}

/** Хвилини записів одного типу й статусу на дату (без записів із розподілом) — рядок get_balance_inputs. */
export interface DayMinutes {
  date: string;
  /** Усі робочі хвилини працівника на дату за розкладами всіх його посад. */
  workingMinutes: number;
  leaveType: string;
  status: string;
  minutes: number;
}

/** Погоджений запис із розподілом (задача 4): платна частина — свого типу, решта — «Unpaid leave». */
export interface SplitDays {
  date: string;
  leaveType: string;
  paidDays: number;
  unpaidDays: number;
}

export interface Carryover {
  schoolYear: number;
  leaveType: string;
  days: number;
}

export interface BalanceInputs {
  days: DayMinutes[];
  splits: SplitDays[];
  carryovers: Carryover[];
}

export type UsedDays = Record<LeaveType, number>;

const toHundredths = (days: number) => Math.round(days * HUNDREDTHS);

/**
 * Використані дні за навчальний рік у сотих. Рахуються лише погоджені записи (AC-BALANCE-04, AC-BALANCE-07);
 * частка — для кожної дати окремо, баланс — сума округлених часток (Assumptions 03-leave-balance).
 */
export function usedDays(inputs: BalanceInputs, schoolYear: number): UsedDays {
  const used: UsedDays = { sick: 0, personal: 0, unpaid: 0, family: 0 };
  const perDate = new Map<string, { type: LeaveType; minutes: number; working: number }>();
  for (const d of inputs.days) {
    if (d.status !== "approved" || schoolYearOf(d.date) !== schoolYear || !(d.leaveType in used)) continue;
    const key = `${d.date}|${d.leaveType}`;
    const current = perDate.get(key);
    perDate.set(key, {
      type: d.leaveType as LeaveType,
      minutes: (current?.minutes ?? 0) + d.minutes,
      working: d.workingMinutes,
    });
  }
  for (const { type, minutes, working } of perDate.values()) used[type] += dayShare(minutes, working);
  for (const s of inputs.splits) {
    if (schoolYearOf(s.date) !== schoolYear || !(s.leaveType in used)) continue;
    used[s.leaveType as LeaveType] += toHundredths(s.paidDays);
    used.unpaid += toHundredths(s.unpaidDays);
  }
  return used;
}

export interface LimitedBalance {
  type: LimitedType;
  granted: number;
  carriedOver: number;
  used: number;
  remaining: number;
}

export interface Balances {
  schoolYear: number;
  limited: Record<LimitedType, LimitedBalance>;
  /** «Unpaid leave» і «Family celebration» — лише використано. */
  unlimited: { unpaid: number; family: number };
}

/**
 * Залишки за навчальний рік у сотих. Невикористані дні переходять у наступний рік повністю, без обмеження
 * (AC-BALANCE-11): перенесене в рік N — залишок року N − 1; на початок першого року — тестові дані.
 */
export function computeBalances(inputs: BalanceInputs, schoolYear: number): Balances {
  const granted = ANNUAL_DAYS * HUNDREDTHS;
  const initial = (type: LimitedType, year: number) =>
    toHundredths(inputs.carryovers.find((c) => c.leaveType === type && c.schoolYear === year)?.days ?? 0);

  const carried: Record<LimitedType, number> = { sick: 0, personal: 0 };
  const first = Math.min(FIRST_SCHOOL_YEAR, schoolYear);
  for (const type of LIMITED_TYPES) carried[type] = initial(type, first);
  for (let year = first; year < schoolYear; year++) {
    const used = usedDays(inputs, year);
    for (const type of LIMITED_TYPES) carried[type] = Math.max(0, granted + carried[type] - used[type]);
  }

  const used = usedDays(inputs, schoolYear);
  const limited = Object.fromEntries(
    LIMITED_TYPES.map((type) => [
      type,
      { type, granted, carriedOver: carried[type], used: used[type], remaining: granted + carried[type] - used[type] },
    ]),
  ) as Record<LimitedType, LimitedBalance>;
  return { schoolYear, limited, unlimited: { unpaid: used.unpaid, family: used.family } };
}

/** Відповідь get_balance_inputs (jsonb) → вхід computeBalances. */
export function parseBalanceInputs(raw: unknown): BalanceInputs {
  const value = (raw ?? {}) as {
    days?: { date: string; working_minutes: number; leave_type: string; status: string; minutes: number }[];
    splits?: { date: string; leave_type: string; paid_days: number; unpaid_days: number }[];
    carryovers?: { school_year: number; leave_type: string; days: number }[];
  };
  return {
    days: (value.days ?? []).map((d) => ({
      date: d.date,
      workingMinutes: Number(d.working_minutes),
      leaveType: d.leave_type,
      status: d.status,
      minutes: Number(d.minutes),
    })),
    splits: (value.splits ?? []).map((s) => ({
      date: s.date,
      leaveType: s.leave_type,
      paidDays: Number(s.paid_days),
      unpaidDays: Number(s.unpaid_days),
    })),
    carryovers: (value.carryovers ?? []).map((c) => ({
      schoolYear: Number(c.school_year),
      leaveType: c.leave_type,
      days: Number(c.days),
    })),
  };
}
