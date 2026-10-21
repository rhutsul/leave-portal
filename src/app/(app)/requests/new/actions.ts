"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RequestPayload } from "@/lib/leave/draft";
import {
  BLOCKING_STATUSES,
  buildRequestRecords,
  checkComment,
  checkLeaveType,
  findOverlap,
  overlapMessage,
  toRpcRecords,
} from "@/lib/leave/request";
import { isCalendarDate } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import { loadOwnPositions } from "./load-positions";

export interface SubmitState {
  message: string;
}

const FAILED = "The request could not be saved. Please try again.";

function parsePayload(raw: FormDataEntryValue | null): RequestPayload | null {
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw) as Partial<RequestPayload>;
    if (
      !Array.isArray(value.dates) ||
      !value.dates.every((d) => typeof d === "string") ||
      typeof value.leaveType !== "string" ||
      !Array.isArray(value.choices)
    ) {
      return null;
    }
    const choices = value.choices.map((c) => ({
      date: String(c.date),
      positionId: Number(c.positionId),
      include: c.include === true,
      wholeDay: c.wholeDay === true,
      start: typeof c.start === "string" ? c.start : undefined,
      end: typeof c.end === "string" ? c.end : undefined,
    }));
    return {
      dates: value.dates,
      leaveType: value.leaveType,
      relationship: String(value.relationship ?? ""),
      comment: typeof value.comment === "string" ? value.comment : "",
      choices,
    };
  } catch {
    return null;
  }
}

// Подання заявки після підсумку. Записи будуємо заново з розкладу в базі (клієнту не довіряємо), перевіряємо тими
// самими чистими функціями, що й форма, а submit_leave_request перевіряє все ще раз і створює записи прийнятих дат
// цілком або нічого. Дату без робочих годин не приймаємо, інші дати лишаються (AC-LEAVE-21).
export async function submitLeaveRequest(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const payload = parsePayload(formData.get("payload"));
  if (!payload) return { message: FAILED };

  // Збій читання посад — повідомлення у формі, а не сторінка помилки: введена заявка має лишитися.
  let positions;
  try {
    positions = await loadOwnPositions(supabase, claims.sub);
  } catch {
    return { message: FAILED };
  }
  const records = buildRequestRecords(positions, payload.dates, payload.choices);
  if (!records.ok) return { message: records.message };
  const type = checkLeaveType(payload.leaveType, payload.relationship);
  if (!type.ok) return { message: type.message };
  const comment = checkComment(payload.comment);
  if (!comment.ok) return { message: comment.message };

  // Перетин із власними записами тих самих дат (AC-LEAVE-13, AC-LEAVE-16). RLS показує менеджеру й записи його
  // посад — тож фільтр за employee_id. Одночасні заявки ловить exclusion-обмеження в базі.
  const { data: existing, error: existingError } = await supabase
    .from("leave_records")
    .select("position_id, date, start_min, end_min, status")
    .eq("employee_id", claims.sub)
    .in("date", [...new Set(records.records.map((r) => r.date))])
    .in("status", [...BLOCKING_STATUSES]);
  if (existingError) return { message: FAILED };
  const conflict = findOverlap(
    records.records,
    existing.map((r) => ({ positionId: r.position_id, date: r.date, start: r.start_min, end: r.end_min, status: r.status })),
  );
  if (conflict) return { message: overlapMessage(conflict) };

  const { error } = await supabase.rpc("submit_leave_request", {
    p_leave_type: type.leaveType,
    p_records: toRpcRecords(records.records),
    p_relationship: type.relationship ?? undefined,
    p_comment: comment.comment ?? undefined,
  });
  if (error) {
    // P0001 — тексти PM з функції бази (той самий другий рубіж); решту працівнику не показуємо.
    return { message: error.code === "P0001" ? error.message : FAILED };
  }

  revalidatePath("/requests");
  // Дати без робочих годин не прийнято (AC-LEAVE-21): «My requests» показує їх із текстом PM поруч з успіхом.
  const skippedDates = records.skipped.filter(isCalendarDate);
  const skipped = skippedDates.length ? `&skipped=${skippedDates.join(",")}` : "";
  redirect(`/requests?submitted=1${skipped}`);
}
