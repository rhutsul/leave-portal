"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRecordStatus } from "@/components/ui/status-badge";
import {
  checkEmployeeAction,
  checkRecordEdit,
  parseRecordId,
  RECORD_EDIT_MESSAGES,
  type EmployeeAction,
  type OwnRecord,
  type RecordEdit,
} from "@/lib/leave/decision";
import { BLOCKING_STATUSES } from "@/lib/leave/request";
import { isoWeekday } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import { loadOwnPositions } from "./new/load-positions";

export interface RecordActionState {
  message: string;
  done: boolean;
}

const FAILED = "The change could not be saved. Please try again.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function signedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return { supabase, userId: data.claims.sub };
}

/** Власний запис працівника; чужий і неіснуючий — однаково null (RLS показує менеджеру й записи його посад). */
async function loadOwnRecord(supabase: Supabase, userId: string, recordId: number) {
  const { data, error } = await supabase
    .from("leave_records")
    .select("id, position_id, date, start_min, end_min, leave_type, status")
    .eq("id", recordId)
    .eq("employee_id", userId)
    .maybeSingle();
  if (error) return { error: true as const };
  if (!data || !isRecordStatus(data.status)) return { error: false as const, record: null };
  const record: OwnRecord = {
    id: data.id,
    positionId: data.position_id,
    date: data.date,
    leaveType: data.leave_type,
    status: data.status,
  };
  return { error: false as const, record };
}

/** Помилка rpc: P0001 — тексти PM з функції бази (другий рубіж); 42501 — чужий чи неіснуючий запис; решту не показуємо. */
function rpcMessage(error: { code: string; message: string }): string {
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") return RECORD_EDIT_MESSAGES.notFound;
  return FAILED;
}

/** Поле, яке працівник намагається змінити, крім годин (AC-DECIDE-21): є у формі — порівнюємо з записом. */
function optionalField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  if (value === null) return undefined;
  return typeof value === "string" ? value : "";
}

// Зміна годин власного запису до рішення (AC-DECIDE-16, AC-DECIDE-06 — перед повторним поданням). Спершу ті самі
// правила, що й private.update_leave_record_hours, чистими функціями з розкладу й записів у базі (клієнту не довіряємо):
// статус, лише години, розклад посади на дату, перетин з іншими записами посади; потім rpc перевіряє все ще раз.
export async function changeRecordHours(_prev: RecordActionState, formData: FormData): Promise<RecordActionState> {
  const { supabase, userId } = await signedIn();

  const recordId = parseRecordId(formData.get("record_id"));
  if (recordId === null) return { message: RECORD_EDIT_MESSAGES.notFound, done: false };
  const start = formData.get("start");
  const end = formData.get("end");
  if (typeof start !== "string" || typeof end !== "string") return { message: FAILED, done: false };
  const positionField = optionalField(formData, "position_id");
  const edit: RecordEdit = {
    start,
    end,
    date: optionalField(formData, "date"),
    positionId: positionField === undefined ? undefined : Number(positionField),
    leaveType: optionalField(formData, "leave_type"),
  };

  const own = await loadOwnRecord(supabase, userId, recordId);
  if (own.error) return { message: FAILED, done: false };
  if (!own.record) return { message: RECORD_EDIT_MESSAGES.notFound, done: false };
  const record = own.record;

  let positions;
  try {
    positions = await loadOwnPositions(supabase, userId);
  } catch {
    return { message: FAILED, done: false };
  }
  const weekday = isoWeekday(record.date);
  const blocks = (positions.find((p) => p.id === record.positionId)?.blocks ?? [])
    .filter((b) => b.weekday === weekday)
    .map(({ start: s, end: e }) => ({ start: s, end: e }));

  const { data: others, error: othersError } = await supabase
    .from("leave_records")
    .select("id, position_id, date, start_min, end_min, status")
    .eq("employee_id", userId)
    .eq("position_id", record.positionId)
    .eq("date", record.date)
    .in("status", [...BLOCKING_STATUSES]);
  if (othersError) return { message: FAILED, done: false };

  const check = checkRecordEdit(
    record,
    edit,
    blocks,
    others.map((o) => ({
      id: o.id,
      positionId: o.position_id,
      date: o.date,
      start: o.start_min,
      end: o.end_min,
      status: o.status,
    })),
  );
  if (!check.ok) {
    // Статус міг змінитися з моменту рендеру (менеджер погодив запис): оновлюємо рядок разом із повідомленням.
    revalidatePath("/requests");
    return { message: check.message, done: false };
  }

  const { error } = await supabase.rpc("update_leave_record_hours", {
    p_record_id: recordId,
    p_start_min: check.start,
    p_end_min: check.end,
  });
  revalidatePath("/requests");
  if (error) return { message: rpcMessage(error), done: false };
  return { message: "", done: true };
}

/** Повторне подання й скасування: статус перевіряємо до rpc для повідомлення, база перевіряє ще раз під блокуванням. */
async function statusAction(
  formData: FormData,
  action: Exclude<EmployeeAction, "changeHours">,
): Promise<RecordActionState> {
  const { supabase, userId } = await signedIn();

  const recordId = parseRecordId(formData.get("record_id"));
  if (recordId === null) return { message: RECORD_EDIT_MESSAGES.notFound, done: false };

  const own = await loadOwnRecord(supabase, userId, recordId);
  if (own.error) return { message: FAILED, done: false };
  if (!own.record) return { message: RECORD_EDIT_MESSAGES.notFound, done: false };
  const check = checkEmployeeAction(own.record.status, action);
  if (!check.ok) {
    revalidatePath("/requests");
    return { message: check.message, done: false };
  }

  const { error } =
    action === "resubmit"
      ? await supabase.rpc("resubmit_leave_record", { p_record_id: recordId })
      : await supabase.rpc("cancel_leave_record", { p_record_id: recordId });
  revalidatePath("/requests");
  if (error) return { message: rpcMessage(error), done: false };
  return { message: "", done: true };
}

// «Returned for revision» → «Awaiting decision», знову в списку тих самих менеджерів (AC-DECIDE-06).
export async function resubmitRecord(_prev: RecordActionState, formData: FormData): Promise<RecordActionState> {
  return statusAction(formData, "resubmit");
}

// Скасування запису до рішення чи поверненого (AC-DECIDE-13, AC-DECIDE-17).
export async function cancelRecord(_prev: RecordActionState, formData: FormData): Promise<RecordActionState> {
  return statusAction(formData, "cancel");
}
