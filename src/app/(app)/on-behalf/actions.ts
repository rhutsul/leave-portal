"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { employeeIdOf, forEmployee, ON_BEHALF_MESSAGES, refusalOf } from "@/lib/leave/on-behalf";
import { buildRequestRecords, checkComment, checkLeaveType, toRpcRecords } from "@/lib/leave/request";
import { checkSubstitutes } from "@/lib/leave/substitutes";
import { isCalendarDate } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import { dateSpan, loadClosures } from "../calendar/load-closures";
import type { SubmitState } from "../requests/new/actions";
import { parsePayload } from "../requests/new/request-payload";
import { loadEmployeeSubstitutes, loadOnBehalfPositions } from "./load";

const FAILED = "The request could not be saved. Please try again.";

// Подання від імені працівника (D10 openspec/changes/impl-on-behalf/design.md). Записи будуємо заново з розкладу в
// базі тими самими чистими функціями, що й власна заявка, тексти — для менеджера (forEmployee, D6). Перетин із
// записами працівника TS не перевіряє (менеджер не бачить усіх його записів) — його ловить база з текстом D6.
// submit_leave_request_on_behalf ще раз перевіряє право (D1) і все інше, створює записи цілком або нічого й погоджує
// записи посад подавача (D2).
export async function submitOnBehalf(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const employeeId = employeeIdOf(formData.get("employeeId"));
  if (!employeeId) return { message: ON_BEHALF_MESSAGES.notYourEmployee };
  const payload = parsePayload(formData.get("payload"));
  if (!payload) return { message: FAILED };

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

  const chosen = records.records.map((r) => r.substituteId);
  if (chosen.some(Boolean)) {
    const options = await loadEmployeeSubstitutes(supabase, employeeId);
    if (!options) return { message: FAILED };
    const refused = checkSubstitutes(chosen, options);
    if (refused) return { message: forEmployee(refused) };
  }

  const { data: result, error } = await supabase.rpc("submit_leave_request_on_behalf", {
    p_employee_id: employeeId,
    p_leave_type: type.leaveType,
    p_records: toRpcRecords(records.records),
    p_relationship: type.relationship ?? undefined,
    p_comment: comment.comment ?? undefined,
  });
  if (error) {
    // P0001 — тексти перевірок (уже «this employee»); 42501 — лише відомі відмови D1, решту не показуємо.
    return { message: error.code === "P0001" ? error.message : (refusalOf(error.message) ?? FAILED) };
  }

  const counts = result as { approved?: unknown; awaiting?: unknown } | null;
  const params = new URLSearchParams({
    submitted: `${Number(counts?.approved) || 0}-${Number(counts?.awaiting) || 0}`,
  });
  const skipped = records.skipped.filter(isCalendarDate);
  if (skipped.length) params.set("skipped", skipped.join(","));
  revalidatePath("/decisions");
  redirect(`/on-behalf/${employeeId}?${params}`);
}
