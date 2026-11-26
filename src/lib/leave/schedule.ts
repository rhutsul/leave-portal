// Розклад «з дати» (вимога PM 07, AC-STAFF-04, AC-STAFF-07; D7 openspec/changes/impl-staff-management/design.md).
// Блок розкладу діє з valid_from (null — від початку) до valid_to (не включно; null — без кінця). Те саме правило —
// private.blocks_in_effect у базі (міграція 20261125082128_staff_management.sql). Записи зберігають свої години:
// новий розклад їх не змінює.
import { formatDateLong, isoWeekday } from "./time";

export interface DatedBlock {
  weekday: number;
  start: number;
  end: number;
  /** Перший день дії ("YYYY-MM-DD"); null чи немає — від початку. */
  validFrom?: string | null;
  /** День, з якого блок уже не діє (не включно); null чи немає — без кінця. */
  validTo?: string | null;
}

/** Чи діє блок на дату (без дня тижня). */
export function inEffect(block: DatedBlock, date: string): boolean {
  return (block.validFrom == null || block.validFrom <= date) && (block.validTo == null || date < block.validTo);
}

/** Блоки розкладу на дату: її день тижня й версія, що діє в цей день. */
export function blocksOnDate<B extends DatedBlock>(blocks: readonly B[], date: string): B[] {
  const weekday = isoWeekday(date);
  return blocks.filter((b) => b.weekday === weekday && inEffect(b, date));
}

export interface ScheduleVersion<B extends DatedBlock> {
  /** Перший день дії; null — від початку. */
  from: string | null;
  blocks: B[];
}

/** Версії розкладу посади за датою початку (від найранішої). */
export function scheduleVersions<B extends DatedBlock>(blocks: readonly B[]): ScheduleVersion<B>[] {
  const byFrom = new Map<string, B[]>();
  for (const b of blocks) {
    const key = b.validFrom ?? "";
    byFrom.set(key, [...(byFrom.get(key) ?? []), b]);
  }
  return [...byFrom.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([from, list]) => ({ from: from || null, blocks: list }));
}

/**
 * Розклад, що діє сьогодні, і наступна версія (якщо вона вже задана): так «Your weekly schedule» показує й розклад,
 * що почне діяти пізніше (AC-STAFF-04: розклад «from 2026-12-07» видно й до цієї дати).
 */
export function currentAndNext<B extends DatedBlock>(
  blocks: readonly B[],
  today: string,
): { current: B[]; next: ScheduleVersion<B> | null } {
  const current = blocks.filter((b) => inEffect(b, today));
  const next = scheduleVersions(blocks).find((v) => v.from != null && v.from > today) ?? null;
  return { current, next };
}

/**
 * Рядок «Your weekly schedule»: розклад, що діє сьогодні, і наступна версія — «From Mon, 7 Dec 2026: …». `format` —
 * тижневий розклад одним рядком (weeklySchedule у request.ts).
 */
export function scheduleSummary<B extends DatedBlock>(
  blocks: readonly B[],
  today: string,
  format: (blocks: B[]) => string,
): string {
  const { current, next } = currentAndNext(blocks, today);
  const parts: string[] = [];
  if (current.length) parts.push(format(current));
  if (next) parts.push(`From ${formatDateLong(next.from!)}: ${format(next.blocks)}`);
  return parts.join(" · ") || "No working hours";
}
