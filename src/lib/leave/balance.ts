// Залишки відпусток — чисті функції (D5 openspec/changes/archive/2026-10-21-impl-leave-ws6/design.md, requirements/03-leave-balance.md).
// Дані дає функція бази get_balance_inputs (D4): лише підсумки по датах, без деталей записів.
// Дні рахуємо в сотих (цілі числа): частка дня округлюється half-up до 0.01, тож дробові числа JS тут зайві.

import type { LeaveType } from "./request";
import { isoWeekday } from "./time";

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

const LIMITED_LABELS: Record<LimitedType, string> = { sick: "Sick leave", personal: "Personal leave" };

export function isLimitedType(value: string): value is LimitedType {
  return (LIMITED_TYPES as readonly string[]).includes(value);
}

/**
 * Пропонований розподіл запису понад залишок у сотих: оплачувана частина — до залишку (не менше 0), решта — «Unpaid
 * leave» (AC-BALANCE-09, AC-BALANCE-19). share — частка запису на момент рішення, remaining — залишок року його дати;
 * обидва числа дає public.decision_balance, тож тут та сама арифметика, що й у decide_leave_record.
 */
export function suggestedSplit(share: number, remaining: number): { paid: number; unpaid: number; over: boolean } {
  const paid = Math.min(share, Math.max(remaining, 0));
  return { paid, unpaid: share - paid, over: share > remaining };
}

/** Попередження менеджеру, коли запис перевищує залишок (AC-BALANCE-09, AC-BALANCE-14). */
export function managerWarning(type: LimitedType, share: number, remaining: number): string | null {
  const split = suggestedSplit(share, remaining);
  if (!split.over) return null;
  const label = LIMITED_LABELS[type];
  return (
    `This request exceeds the ${label} balance (${formatDays(Math.max(remaining, 0))} day). ` +
    `Suggested: ${formatDays(split.paid)} day ${label}, ${formatDays(split.unpaid)} day Unpaid leave`
  );
}

/** Відмова погодити понад залишок без розподілу (AC-BALANCE-16) — той самий текст повертає decide_leave_record. */
export function splitRequiredMessage(type: LimitedType, remaining: number): string {
  return `The ${LIMITED_LABELS[type]} balance is ${formatDays(Math.max(remaining, 0))} day: approve with the suggested split or reject`;
}

/** Розподіл на погодженому записі: "0.50 Personal leave + 0.50 Unpaid leave" (AC-BALANCE-18, AC-BALANCE-19). */
export function formatSplit(type: LimitedType, paid: number, unpaid: number): string {
  return `${formatDays(paid)} ${LIMITED_LABELS[type]} + ${formatDays(unpaid)} Unpaid leave`;
}

/** Числа з бази ("0.50" чи 0.5) → соті. */
export function daysToHundredths(days: number | string): number {
  return toHundredths(Number(days));
}

// ── Попередження працівнику про перевищення залишку (AC-BALANCE-08, AC-BALANCE-15, AC-BALANCE-17) ──

/** Блок розкладу будь-якої посади працівника: weekday 1 = понеділок … 7 = неділя. */
export interface WeekdayBlock {
  weekday: number;
  start: number;
  end: number;
}

/** Усі робочі хвилини працівника на дату за розкладами всіх посад — знаменник частки дня, як working_minutes у базі. */
export function workingMinutesOn(blocks: readonly WeekdayBlock[], date: string): number {
  const weekday = isoWeekday(date);
  return blocks.filter((b) => b.weekday === weekday).reduce((sum, b) => sum + b.end - b.start, 0);
}

/** Частка заявки в сотих за навчальним роком: для кожної дати — dayShare усіх хвилин заявки на цю дату. */
export function requestShares(
  records: readonly { date: string; minutes: number }[],
  blocks: readonly WeekdayBlock[],
): Map<number, number> {
  const perDate = new Map<string, number>();
  for (const r of records) perDate.set(r.date, (perDate.get(r.date) ?? 0) + r.minutes);
  const shares = new Map<number, number>();
  for (const [date, minutes] of perDate) {
    const year = schoolYearOf(date);
    shares.set(year, (shares.get(year) ?? 0) + dayShare(minutes, workingMinutesOn(blocks, date)));
  }
  return shares;
}

/**
 * Одне попередження на всю заявку (AC-BALANCE-17): сума часток заявки понад залишок на момент подання — решта піде як
 * «Unpaid leave»; заявку все одно створюємо (AC-BALANCE-08, AC-BALANCE-15). share і remaining — у сотих.
 */
export function employeeWarning(type: LimitedType, share: number, remaining: number): string | null {
  const balance = Math.max(remaining, 0);
  if (share <= balance) return null;
  return (
    `Your ${LIMITED_LABELS[type]} balance is ${formatDays(balance)} day. ` +
    `Another ${formatDays(share - balance)} day will be counted as Unpaid leave`
  );
}

/** Перевищення залишку в заявці: по навчальному року дат заявки (зазвичай один рік — одне попередження). */
export interface RequestOverBalance {
  schoolYear: number;
  share: number;
  remaining: number;
}

/**
 * Роки заявки, де її частка більша за залишок. remainingOf — залишок типу на рік у сотих; null — залишку цього року
 * немає під рукою (рік не перевіряємо). «Unpaid leave» і «Family celebration» не обмежені — порожньо.
 */
export function requestOverBalance(
  leaveType: string,
  records: readonly { date: string; minutes: number }[],
  blocks: readonly WeekdayBlock[],
  remainingOf: (schoolYear: number) => number | null,
): RequestOverBalance[] {
  if (!isLimitedType(leaveType)) return [];
  const over: RequestOverBalance[] = [];
  for (const [schoolYear, share] of [...requestShares(records, blocks)].sort(([a], [b]) => a - b)) {
    const remaining = remainingOf(schoolYear);
    if (remaining !== null && employeeWarning(leaveType, share, remaining)) over.push({ schoolYear, share, remaining });
  }
  return over;
}
