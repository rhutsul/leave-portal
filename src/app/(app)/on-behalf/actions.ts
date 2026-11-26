"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RequestPayload } from "@/lib/leave/draft";
import { employeeIdOf, forEmployee, ON_BEHALF_MESSAGES, refusalOf } from "@/lib/leave/on-behalf";
import { buildRequestRecords, checkComment, checkLeaveType } from "@/lib/leave/request";
import { checkSubstitutes } from "@/lib/leave/substitutes";
import { isCalendarDate } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import { dateSpan, loadClosures } from "../calendar/load-closures";
import type { SubmitState } from "../requests/new/actions";
import { parsePayload, requestRpcArgs } from "../requests/new/request-payload";
import { loadEmployeeSubstitutes, loadOnBehalfPositions } from "./load";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const FAILED = "The request could not be saved. Please try again.";

/** Записи заявки з розкладу в базі (клієнту не довіряємо) — тими самими чистими функціями, що й власна заявка. */
async function checkedRequest(supabase: Supabase, employeeId: string, payload: RequestPayload) {
  const span = dateSpan(payload.dates.filter(isCalendarDate));
  const [positions, closures] = await Promise.all([
    loadOnBehalfPositions(supabase, employeeId),
    span ? loadClosures(supabase, span.from, span.to).catch(() => null) : Promise.resolve([]),
  ]);
  if (!positions.ok) return { message: refusalOf(positions.message) ?? FAILED };
  if (!closures) return { message: FAILED };
  const records = buildRequestRecords(positions.positions, payload.dates, payload.choices, closures);
  if (!records.ok) return { message: forEmployee(records.message) };
  const type = checkLeaveType(payload.leaveType, payload.relationship);
  if (!type.ok) return { message: type.message };
  const comment = checkComment(payload.comment);
  if (!comment.ok) return { message: comment.message };
  return { request: { records: records.records, skipped: records.skipped, type, comment: comment.comment } };
}

/** Заміна — лише зі списку працівника (AC-SUBST-04): текст відмови для менеджера або null. */
async function substituteRefusal(supabase: Supabase, employeeId: string, chosen: (string | undefined)[]) {
  if (!chosen.some(Boolean)) return null;
  const options = await loadEmployeeSubstitutes(supabase, employeeId);
  if (!options) return FAILED;
  const refused = checkSubstitutes(chosen, options);
  return refused ? forEmployee(refused) : null;
}

/** Адреса форми після подання: лише лічильники й дати без годин (AC-LEAVE-21), без email у URL. */
function submittedUrl(employeeId: string, result: unknown, skipped: string[]) {
  const counts = (result ?? {}) as { approved?: unknown; awaiting?: unknown };
  const params = new URLSearchParams({ submitted: `${Number(counts.approved) || 0}-${Number(counts.awaiting) || 0}` });
  const dates = skipped.filter(isCalendarDate);
  if (dates.length) params.set("skipped", dates.join(","));
  return `/on-behalf/${employeeId}?${params}`;
}

// Подання від імені працівника (D10 openspec/changes/impl-on-behalf/design.md). Тексти — для менеджера (forEmployee,
// D6). Перетин із записами працівника TS не перевіряє (менеджер не бачить усіх його записів) — його ловить база з
// текстом D6. submit_leave_request_on_behalf ще раз перевіряє право (D1) і все інше, створює записи цілком або нічого
// й погоджує записи посад подавача (D2).
export async function submitOnBehalf(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  const employeeId = employeeIdOf(formData.get("employeeId"));
  if (!employeeId) return { message: ON_BEHALF_MESSAGES.notYourEmployee };
  const payload = parsePayload(formData.get("payload"));
  if (!payload) return { message: FAILED };

  const checked = await checkedRequest(supabase, employeeId, payload);
  if (!checked.request) return { message: checked.message };
  const { records, skipped, type, comment } = checked.request;
  const refused = await substituteRefusal(supabase, employeeId, records.map((r) => r.substituteId));
  if (refused) return { message: refused };

  const { data: result, error } = await supabase.rpc("submit_leave_request_on_behalf", {
    p_employee_id: employeeId,
    ...requestRpcArgs(type, records, comment),
  });
  // P0001 — тексти перевірок (уже «this employee»); 42501 — лише відомі відмови D1, решту не показуємо.
  if (error) return { message: error.code === "P0001" ? error.message : (refusalOf(error.message) ?? FAILED) };

  revalidatePath("/decisions");
  redirect(submittedUrl(employeeId, result, skipped));
}
