import { reviewedHours, reviewedRecord } from "@/lib/leave/decision";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Що бачить менеджер у панелі запису: години й «дата|тип|заміна» для прихованих полів форми рішення. */
export interface Reviewed {
  hours: string;
  record: string;
}

/**
 * Що бачить менеджер у панелі вибраного запису — години, а також дата, тип і заміна (D9 impl-on-behalf). id заміни —
 * з leave_records (RLS дає менеджеру записи його посад, адміністратору — усі); рішення звіряє все це з базою під lock
 * працівника. Немає вибраного запису — порожньо.
 */
export async function loadReviewed(
  supabase: Supabase,
  selected: { id: number; date: string; leave_type: string; start_min: number; end_min: number } | null | undefined,
): Promise<Reviewed> {
  if (!selected) return { hours: "", record: "" };
  const { data } = await supabase.from("leave_records").select("substitute_id").eq("id", selected.id).maybeSingle();
  return {
    hours: reviewedHours(selected.start_min, selected.end_min),
    record: reviewedRecord({ date: selected.date, leaveType: selected.leave_type, substituteId: data?.substitute_id ?? null }),
  };
}
