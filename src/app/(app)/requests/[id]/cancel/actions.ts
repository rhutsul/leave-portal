"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRecordStatus } from "@/components/ui/status-badge";
import { CANCELLATION_MESSAGES, cancellationRequestCheck } from "@/lib/leave/cancellation";
import { parseRecordId } from "@/lib/leave/decision";
import { kyivDate } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import { loadOwnCancellable } from "./load-record";

export interface CancelRequestState {
  message: string;
  /** Помилка причини — під полем; решта — над формою. */
  field: boolean;
}

const FAILED = "The change could not be saved. Please try again.";

// Прохання про скасування погодженого запису (D9 openspec/changes/impl-cancel-approved/design.md). Спершу ті самі
// правила, що й private.request_record_cancellation, чистою функцією з запису в базі (клієнту не довіряємо): чужий
// запис, статус, дата за Києвом, прохання вже є, причина; потім rpc перевіряє все ще раз під блокуванням рядка.
export async function requestCancellation(_prev: CancelRequestState, formData: FormData): Promise<CancelRequestState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  const recordId = parseRecordId(formData.get("record_id"));
  const reason = formData.get("reason");
  if (recordId === null) return { message: CANCELLATION_MESSAGES.notOwn, field: false };
  if (typeof reason !== "string") return { message: FAILED, field: false };

  const own = await loadOwnCancellable(supabase, data.claims.sub, recordId);
  if (own.error) return { message: FAILED, field: false };
  const record =
    own.record && isRecordStatus(own.record.status)
      ? {
          date: own.record.date,
          status: own.record.status,
          cancelReason: own.record.cancel_reason,
          cancelRequestId: own.record.cancel_request_id,
        }
      : null;
  const check = cancellationRequestCheck(record, kyivDate(new Date()), reason);
  if (!check.ok) {
    const field = check.message === CANCELLATION_MESSAGES.reason || check.message === CANCELLATION_MESSAGES.commentTooLong;
    return { message: check.message, field };
  }

  const { error } = await supabase.rpc("request_record_cancellation", { p_record_id: recordId, p_reason: check.text });
  if (error) {
    // P0001 — тексти з функції бази (другий рубіж, напр. одночасне друге прохання); 42501 — чужий чи неіснуючий запис.
    if (error.code === "P0001") return { message: error.message, field: false };
    if (error.code === "42501") return { message: CANCELLATION_MESSAGES.notOwn, field: false };
    return { message: FAILED, field: false };
  }

  revalidatePath("/requests");
  revalidatePath("/decisions");
  redirect(`/requests?status=approved&cancellation=${recordId}`);
}
