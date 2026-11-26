"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isLimitedType, schoolYearOf } from "@/lib/leave/balance";
import {
  BLOCKING_STATUSES,
  buildRequestRecords,
  checkComment,
  checkLeaveType,
  findOverlap,
  overlapMessage,
  type DraftRecord,
} from "@/lib/leave/request";
import { checkSubstitutes } from "@/lib/leave/substitutes";
import { isCalendarDate } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import { loadRemaining } from "../../balances/load-balances";
import { dateSpan, loadClosures } from "../../calendar/load-closures";
import { loadOwnPositions } from "./load-positions";
import { loadSubstituteOptions } from "./load-substitutes";
import { parsePayload, requestRpcArgs } from "./request-payload";
import { submitRedirect } from "./submit-redirect";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface SubmitState {
  message: string;
}

const FAILED = "The request could not be saved. Please try again.";

/**
 * Посади працівника й закриття шкільного календаря на дати заявки (AC-CAL-03 … AC-CAL-05) — для тих самих чистих
 * функцій, що й у формі. Збій — null.
 */
async function loadRequestContext(supabase: Supabase, employeeId: string, dates: readonly string[]) {
  const span = dateSpan(dates.filter(isCalendarDate));
  try {
    const [positions, closures] = await Promise.all([
      loadOwnPositions(supabase, employeeId),
      span ? loadClosures(supabase, span.from, span.to) : Promise.resolve([]),
    ]);
    return { positions, closures };
  } catch {
    return null;
  }
}

/**
 * Заміна — лише зі списку працівника (AC-SUBST-04): текст відмови або null. Зайнятість заміни (AC-SUBST-05,
 * AC-SUBST-06) перевіряє лише база — чужі записи працівнику не видно; її текст приходить як P0001 з submit_leave_request.
 */
async function checkChosenSubstitutes(supabase: Supabase, records: readonly { substituteId?: string }[]) {
  const chosen = records.map((r) => r.substituteId);
  if (!chosen.some(Boolean)) return null;
  const options = await loadSubstituteOptions(supabase);
  return options ? checkSubstitutes(chosen, options) : FAILED;
}

/**
 * Перетин із власними записами тих самих дат (AC-LEAVE-13, AC-LEAVE-16): текст або null. RLS показує менеджеру й
 * записи його посад — тож фільтр за employee_id. Одночасні заявки ловить exclusion-обмеження в базі.
 */
async function overlapWithOwn(supabase: Supabase, employeeId: string, records: DraftRecord[]): Promise<string | null> {
  const { data: existing, error } = await supabase
    .from("leave_records")
    .select("position_id, date, start_min, end_min, status")
    .eq("employee_id", employeeId)
    .in("date", [...new Set(records.map((r) => r.date))])
    .in("status", [...BLOCKING_STATUSES]);
  if (error) return FAILED;
  const conflict = findOverlap(
    records,
    existing.map((r) => ({ positionId: r.position_id, date: r.date, start: r.start_min, end: r.end_min, status: r.status })),
  );
  return conflict ? overlapMessage(conflict) : null;
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

  // Збій читання посад чи закриттів — повідомлення у формі, а не сторінка помилки: введена заявка має лишитися.
  const context = await loadRequestContext(supabase, claims.sub, payload.dates);
  if (!context) return { message: FAILED };
  const { positions, closures } = context;
  const records = buildRequestRecords(positions, payload.dates, payload.choices, closures);
  if (!records.ok) return { message: records.message };
  const type = checkLeaveType(payload.leaveType, payload.relationship);
  if (!type.ok) return { message: type.message };
  const comment = checkComment(payload.comment);
  if (!comment.ok) return { message: comment.message };

  const refused =
    (await checkChosenSubstitutes(supabase, records.records)) ?? (await overlapWithOwn(supabase, claims.sub, records.records));
  if (refused) return { message: refused };

  // Залишок на момент подання — для одного попередження на всю заявку (AC-BALANCE-08, AC-BALANCE-15, AC-BALANCE-17).
  // Попередження не зупиняє подання; якщо залишок не завантажився, «My requests» скаже, що його не перевірено.
  const limitedType = isLimitedType(type.leaveType) ? type.leaveType : null;
  const remaining = limitedType
    ? await loadRemaining(
        supabase,
        claims.sub,
        records.records.map((r) => schoolYearOf(r.date)),
      ).catch(() => null)
    : null;

  const { error } = await supabase.rpc("submit_leave_request", requestRpcArgs(type, records.records, comment.comment));
  if (error) {
    // P0001 — тексти PM з функції бази (той самий другий рубіж); решту працівнику не показуємо.
    return { message: error.code === "P0001" ? error.message : FAILED };
  }

  revalidatePath("/requests");
  // Дати без робочих годин не прийнято (AC-LEAVE-21): «My requests» показує їх із текстом PM поруч з успіхом,
  // а перевищення залишку — попередженням.
  redirect(
    submitRedirect({
      limitedType,
      remaining,
      records: records.records,
      blocks: positions.flatMap((p) => p.blocks),
      closures,
      skipped: records.skipped,
    }),
  );
}
