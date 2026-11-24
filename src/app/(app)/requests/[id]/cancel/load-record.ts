import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface OwnCancellable {
  id: number;
  date: string;
  start_min: number;
  end_min: number;
  leave_type: string;
  status: string;
  position_title: string;
  division_name: string;
  cancel_reason: string | null;
  cancel_request_id: number | null;
}

/**
 * Власний запис працівника для прохання про скасування (D9): посада й підрозділ — з view my_leave_records (лише власні
 * записи), стан прохання — з leave_records (нові колонки, D13). Чужий і неіснуючий — однаково null (AC-CANCEL-10).
 */
export async function loadOwnCancellable(
  supabase: Supabase,
  userId: string,
  recordId: number,
): Promise<{ error: true } | { error: false; record: OwnCancellable | null }> {
  const [{ data: row, error }, { data: cancel, error: cancelError }] = await Promise.all([
    supabase
      .from("my_leave_records")
      .select("id, date, start_min, end_min, leave_type, status, position_title, division_name")
      .eq("id", recordId)
      .maybeSingle(),
    supabase
      .from("leave_records")
      .select("cancel_reason, cancel_request_id")
      .eq("id", recordId)
      .eq("employee_id", userId)
      .maybeSingle(),
  ]);
  if (error || cancelError) return { error: true };
  if (!row || !cancel || row.id === null || row.date === null || row.status === null) return { error: false, record: null };
  return {
    error: false,
    record: {
      id: row.id,
      date: row.date,
      start_min: row.start_min ?? 0,
      end_min: row.end_min ?? 0,
      leave_type: row.leave_type ?? "",
      status: row.status,
      position_title: row.position_title ?? "",
      division_name: row.division_name ?? "",
      cancel_reason: cancel.cancel_reason,
      cancel_request_id: cancel.cancel_request_id,
    },
  };
}
