import { clipBlocks, closureOn } from "@/lib/leave/calendar";
import { isoWeekday, wholeDay } from "@/lib/leave/time";
import type { createClient } from "@/lib/supabase/server";
import { loadClosures } from "../calendar/load-closures";
import type { PositionDay } from "./decisions-view";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Робочий день посади на дату запису — для смуги годин у панелі рішення («7 h of 7 h», «Whole day»). Розклад посади
 * менеджеру й адміністратору дає RLS (schedule_blocks: власні, керовані посади, адміністратор — усі); скорочений день
 * шкільного календаря обрізає розклад, як у «My requests». null — розкладу на цю дату немає або щось не
 * завантажилось: смуга тоді показує лише години запису, рішення це не зупиняє.
 */
export async function loadRecordDay(supabase: Supabase, recordId: number, date: string): Promise<PositionDay | null> {
  const [record, closures] = await Promise.all([
    supabase.from("leave_records").select("position_id").eq("id", recordId).maybeSingle(),
    loadClosures(supabase, date, date).catch(() => null),
  ]);
  if (record.error || !record.data || closures === null) return null;
  const { data: blocks, error } = await supabase
    .from("schedule_blocks")
    .select("start_min, end_min")
    .eq("position_id", record.data.position_id)
    .eq("weekday", isoWeekday(date));
  if (error) return null;
  const day = clipBlocks((blocks ?? []).map((b) => ({ start: b.start_min, end: b.end_min })), closureOn(closures, date));
  return day.length ? wholeDay(day) : null;
}
