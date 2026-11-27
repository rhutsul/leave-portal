import { clipBlocks, closureOn } from "@/lib/leave/calendar";
import { blocksOnDate } from "@/lib/leave/schedule";
import { isoWeekday, wholeDay, type TimeBlock } from "@/lib/leave/time";
import type { createClient } from "@/lib/supabase/server";
import { loadClosures } from "../calendar/load-closures";
import type { PositionDay } from "./decisions-view";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Блоки розкладу посади запису на дату: як записано в розкладі (`raw`) і обрізані скороченим днем шкільного
 * календаря (`clipped`), як у «My requests». Розклад посади менеджеру й адміністратору дає RLS (schedule_blocks:
 * власні, керовані посади, адміністратор — усі). null — щось не завантажилось.
 */
async function loadDayBlocks(
  supabase: Supabase,
  recordId: number,
  date: string,
): Promise<{ raw: TimeBlock[]; clipped: TimeBlock[] } | null> {
  const [record, closures] = await Promise.all([
    supabase.from("leave_records").select("position_id").eq("id", recordId).maybeSingle(),
    loadClosures(supabase, date, date).catch(() => null),
  ]);
  if (record.error || !record.data || closures === null) return null;
  const { data: blocks, error } = await supabase
    .from("schedule_blocks")
    .select("weekday, start_min, end_min, valid_from, valid_to")
    .eq("position_id", record.data.position_id)
    .eq("weekday", isoWeekday(date));
  if (error) return null;
  // Розклад, що діє на дату (AC-STAFF-07): інші версії того самого дня тижня — не для цієї дати.
  const raw = blocksOnDate(
    (blocks ?? []).map((b) => ({ weekday: b.weekday, start: b.start_min, end: b.end_min, validFrom: b.valid_from, validTo: b.valid_to })),
    date,
  ).map(({ start, end }) => ({ start, end }));
  return { raw, clipped: clipBlocks(raw, closureOn(closures, date)) };
}

/**
 * Робочий день посади на дату запису — для смуги годин у панелі рішення («7 h of 7 h», «Whole day»). null — розкладу на
 * цю дату немає або щось не завантажилось: смуга тоді показує лише години запису, рішення це не зупиняє.
 */
export async function loadRecordDay(supabase: Supabase, recordId: number, date: string): Promise<PositionDay | null> {
  const day = await loadDayBlocks(supabase, recordId, date);
  return day?.clipped.length ? wholeDay(day.clipped) : null;
}

/**
 * Години «Whole day» для правки запису на нову дату (D10 impl-on-behalf): робочий день посади, обрізаний скороченим
 * днем, як у новій заявці. Школа закрита весь день — розклад як є: база відповість текстом закриття (AC-CAL-03), а не
 * «немає годин». Розкладу немає — `none` (текст AC-BEHALF-05); не завантажилось — null.
 */
export async function loadWholeDay(
  supabase: Supabase,
  recordId: number,
  date: string,
): Promise<{ start: number; end: number } | "none" | null> {
  const day = await loadDayBlocks(supabase, recordId, date);
  if (!day) return null;
  const blocks = day.clipped.length ? day.clipped : day.raw;
  if (!blocks.length) return "none";
  const { start, end } = wholeDay(blocks);
  return { start, end };
}
