"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRecordStatus } from "@/components/ui/status-badge";
import {
  checkDecision,
  DECISION_MESSAGES,
  isDecision,
  parseRecordId,
  parseReviewedRecord,
  reviewedHours,
  type Role,
} from "@/lib/leave/decision";
import {
  CANCELLATION_MESSAGES,
  cancellationDecisionCheck,
  isCancellationDecision,
  managerCancelCheck,
} from "@/lib/leave/cancellation";
import type { RecordStatus } from "@/lib/leave/request";
import { EDIT_MESSAGES, editErrorMessage, parseEditForm } from "@/lib/leave/record-edit";
import { forEmployee } from "@/lib/leave/on-behalf";
import { kyivDate, TIME_MESSAGES } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import { afterCancellationDecision, afterDecision } from "./decisions-view";
import { loadWholeDay } from "./load-record-day";

export interface DecideState {
  message: string;
  /** Рішення збережено: панель програє печатку й відкриває наступний запис черги (ADR 0007). */
  done?: { status: RecordStatus; href: string; stamp?: boolean };
}

const FAILED = "The decision could not be saved. Please try again.";

/** Хто діє (getClaims; без входу — на /login) і запис із форми: лише додатне ціле, інше — null (як запис без доступу). */
async function signedInFor(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");
  return { supabase, claims, recordId: parseRecordId(formData.get("record_id")) };
}
const ROLES: readonly string[] = ["employee", "manager", "admin"] satisfies Role[];

// Рішення щодо запису (/decisions). Спершу ті самі правила, що й decide_leave_record, чистими функціями
// (src/lib/leave/decision.ts) — для повідомлення; потім rpc, де база перевіряє все ще раз, сама рахує розподіл понад
// залишок і ухвалює лише перше рішення. Розподіл із форми не приходить — лише прапорець «з розподілом».
export async function decideRecord(_prev: DecideState, formData: FormData): Promise<DecideState> {
  const { supabase, claims, recordId } = await signedInFor(formData);
  const decision = formData.get("decision");
  const comment = formData.get("comment") ?? "";
  if (recordId === null) return { message: DECISION_MESSAGES.noAccess };
  if (typeof decision !== "string" || !isDecision(decision) || typeof comment !== "string") return { message: FAILED };
  const split = formData.get("split") === "1";

  // decision_records віддає лише записи посад користувача (адміністратору — усі): немає рядка — немає доступу.
  // Черга «Awaiting decision» до рішення — щоб після нього відкрити наступний запис (порядок той самий, що в списку).
  const [{ data: profile, error: profileError }, { data: row, error: rowError }, { data: queue }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle(),
    supabase.rpc("decision_records").eq("id", recordId).maybeSingle(),
    supabase.rpc("decision_records").select("id").eq("status", "awaiting"),
  ]);
  if (profileError || rowError) return { message: FAILED };
  if (!profile || !ROLES.includes(profile.role)) return { message: DECISION_MESSAGES.noAccess };

  const target =
    row && isRecordStatus(row.status)
      ? { employeeId: row.employee_id, status: row.status, managerIds: profile.role === "manager" ? [claims.sub] : [] }
      : null;
  const check = checkDecision({ id: claims.sub, role: profile.role as Role }, target, decision, comment);
  // Запис уже не чекає рішення (інший менеджер вирішив — AC-DECIDE-07, або працівник скасував): форми для нього вже
  // немає, тож повідомлення показує панель запису за його поточним статусом.
  if (!check.ok && row && row.status !== "awaiting") redirect(`/decisions?record=${recordId}&notice=decided`);
  if (!check.ok) return { message: check.message };
  // Працівник міг змінити години, поки менеджер дивився запис: рішення — лише щодо тих годин, які він бачив. Тут —
  // для повідомлення; ті самі години decide_leave_record ще раз звіряє атомарно в update (одночасна зміна не пройде).
  if (!row || formData.get("hours") !== reviewedHours(row.start_min, row.end_min)) {
    revalidatePath("/decisions");
    return { message: DECISION_MESSAGES.hoursChanged };
  }
  // Так само дата, тип і заміна, які бачив менеджер (D9 impl-on-behalf): інший менеджер міг змінити запис. Дату й тип
  // звіряємо тут для повідомлення; усі три decide_leave_record звіряє ще раз під lock працівника.
  const reviewed = parseReviewedRecord(formData.get("reviewed"));
  if (!reviewed) return { message: FAILED };
  if (reviewed.date !== row.date || reviewed.leaveType !== row.leave_type) {
    revalidatePath("/decisions");
    return { message: DECISION_MESSAGES.recordChanged };
  }

  const { error } = await supabase.rpc("decide_leave_record", {
    p_record_id: recordId,
    p_decision: decision,
    p_comment: check.comment ?? undefined,
    p_split: split,
    p_start_min: row.start_min,
    p_end_min: row.end_min,
    p_date: reviewed.date,
    p_leave_type: reviewed.leaveType,
    p_substitute_id: reviewed.substituteId,
  });
  if (error) {
    // Інший менеджер вирішив чи працівник скасував між читанням і rpc: те саме, що вище, — панель запису за статусом.
    if (error.code === "P0001") {
      const { data: now } = await supabase.rpc("decision_records").eq("id", recordId).maybeSingle();
      if (now && now.status !== "awaiting") {
        revalidatePath("/decisions");
        redirect(`/decisions?record=${recordId}&notice=decided`);
      }
    }
    // Залишок змінився з моменту рендеру (погодили інший запис — AC-BALANCE-14): оновлюємо сторінку, щоб попередження
    // й кнопка «Approve with split» відповідали стану бази; запис лишається в «Awaiting decision» разом із формою.
    revalidatePath("/decisions");
    // P0001 — тексти PM з функції бази (той самий другий рубіж); 42501 — без доступу; решту не показуємо.
    if (error.code === "P0001") return { message: error.message };
    if (error.code === "42501") return { message: DECISION_MESSAGES.noAccess };
    return { message: FAILED };
  }

  // Без redirect і без revalidatePath: інакше разом із відповіддю прийшла б оновлена сторінка, де запис уже вирішено,
  // і форма зникла б раніше, ніж почнеться рух рішення (на проді так і було). Панель спершу показує печатку, а тоді
  // клієнт сам переходить на наступний запис і оновлює сторінку з лічильниками (useDecisionMotion).
  return { message: "", done: { status: check.status, href: afterDecision((queue ?? []).map((r) => r.id), recordId, check.status) } };
}

/** Відповідь на рішення щодо прохання чи скасування з приміткою: field — помилка під полем коментаря чи примітки. */
export interface CancellationState extends DecideState {
  field?: boolean;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Запис для рішення щодо скасування: decision_records (лише записи посад користувача, адміністратору — усі; немає
 * рядка — немає доступу) і стан прохання з leave_records (D11). Черга «Awaiting decision» — записи, що чекають рішення,
 * і прохання, у порядку списку — щоб після рішення відкрити наступний.
 */
async function loadCancellationTarget(supabase: Supabase, userId: string, recordId: number) {
  const [profileResult, rowResult, queueResult, cancelResult, requestsResult] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabase.rpc("decision_records").eq("id", recordId).maybeSingle(),
    supabase.rpc("decision_records").select("id, status"),
    supabase.from("leave_records").select("cancel_reason, cancel_request_id").eq("id", recordId).maybeSingle(),
    supabase.from("leave_records").select("id").not("cancel_reason", "is", null),
  ]);
  const profile = profileResult.data;
  if (profileResult.error || rowResult.error || cancelResult.error || !profile || !ROLES.includes(profile.role)) return null;
  const row = rowResult.data;
  const cancel = cancelResult.data;
  const requested = new Set((requestsResult.data ?? []).map((r) => r.id));
  const target =
    row && isRecordStatus(row.status)
      ? {
          employeeId: row.employee_id,
          status: row.status,
          managerIds: profile.role === "manager" ? [userId] : [],
          date: row.date,
          cancelReason: cancel?.cancel_reason ?? null,
          cancelRequestId: cancel?.cancel_request_id ?? null,
        }
      : null;
  return {
    actor: { id: userId, role: profile.role as Role },
    target,
    queue: (queueResult.data ?? []).filter((r) => r.status === "awaiting" || requested.has(r.id)).map((r) => r.id),
  };
}

/** Помилка rpc скасування: P0001 — тексти з функції бази (другий рубіж); 42501 — без доступу; решту не показуємо. */
function cancellationRpcMessage(error: { code: string; message: string }): CancellationState {
  if (error.code === "P0001") {
    const field =
      error.message === CANCELLATION_MESSAGES.declineComment ||
      error.message === CANCELLATION_MESSAGES.cancelNote ||
      error.message === CANCELLATION_MESSAGES.commentTooLong;
    return { message: error.message, field };
  }
  if (error.code === "42501") return { message: DECISION_MESSAGES.noAccess };
  return { message: FAILED };
}

// Рішення щодо прохання про скасування (D4, D11): підтвердити чи відхилити з коментарем. Спершу ті самі правила, що й
// decide_record_cancellation, чистою функцією — для повідомлення; потім rpc, де база перевіряє все ще раз під
// блокуванням рядка, зокрема що прохання те саме, яке бачив менеджер (request_id зі схованого поля форми).
export async function decideCancellation(_prev: CancellationState, formData: FormData): Promise<CancellationState> {
  const { supabase, claims, recordId } = await signedInFor(formData);
  const requestId = parseRecordId(formData.get("request_id"));
  const decision = formData.get("decision");
  const comment = formData.get("comment") ?? "";
  if (recordId === null) return { message: DECISION_MESSAGES.noAccess };
  if (!isCancellationDecision(decision) || typeof comment !== "string") return { message: FAILED };

  const loaded = await loadCancellationTarget(supabase, claims.sub, recordId);
  if (!loaded) return { message: FAILED };
  const check = cancellationDecisionCheck(loaded.actor, loaded.target, decision, comment, requestId);
  if (!check.ok) {
    // Прохання вже вирішив інший менеджер чи працівник подав нове: сторінка оновлюється разом із відповіддю.
    if (!check.field) revalidatePath("/decisions");
    return { message: check.message, field: check.field };
  }

  const { data: status, error } = await supabase.rpc("decide_record_cancellation", {
    p_record_id: recordId,
    p_request_id: requestId!,
    p_decision: decision,
    p_comment: check.comment ?? undefined,
  });
  if (error || typeof status !== "string" || !isRecordStatus(status)) {
    revalidatePath("/decisions");
    return error ? cancellationRpcMessage(error) : { message: FAILED };
  }
  // Як decideRecord: без revalidatePath — клієнт сам переходить на наступний запис і оновлює сторінку (useDecisionMotion).
  return {
    message: "",
    done: { status, href: afterCancellationDecision(loaded.queue, recordId, decision), stamp: false },
  };
}

// Скасування погодженого запису менеджером з приміткою (D5, D11). Ті самі правила, що й cancel_approved_record.
export async function cancelApprovedRecord(_prev: CancellationState, formData: FormData): Promise<CancellationState> {
  const { supabase, claims, recordId } = await signedInFor(formData);
  const note = formData.get("note") ?? "";
  if (recordId === null) return { message: DECISION_MESSAGES.noAccess };
  if (typeof note !== "string") return { message: FAILED };

  const loaded = await loadCancellationTarget(supabase, claims.sub, recordId);
  if (!loaded) return { message: FAILED };
  const check = managerCancelCheck(loaded.actor, loaded.target, kyivDate(new Date()), note);
  if (!check.ok) return { message: check.message, field: check.field };

  const { error } = await supabase.rpc("cancel_approved_record", { p_record_id: recordId, p_note: check.comment ?? "" });
  if (error) {
    revalidatePath("/decisions");
    return cancellationRpcMessage(error);
  }
  revalidatePath("/decisions");
  revalidatePath("/requests");
  redirect(`/decisions?tab=history&record=${recordId}&decided=cancelled`);
}

/** Відповідь правки: текст бази чи перевірки дослівно над формою; введене лишається (форма кероване). */
export interface EditState {
  message: string;
}

/**
 * Чи змінився запис, поки форму правки було відкрито: години, дата, тип чи заміна не ті, що бачив менеджер (друга думка
 * до PR 144). Без цього форма, що шле всі поля, мовчки повернула б чужу зміну. Звіряємо, як decideRecord (D9); вікно
 * між цим читанням і rpc лишається — атомарна звірка в базі потребує нової сигнатури edit_leave_record (expand → contract).
 */
async function changedSinceOpened(supabase: Supabase, recordId: number, formData: FormData): Promise<string | null> {
  const seen = parseReviewedRecord(formData.get("reviewed"));
  if (!seen) return EDIT_MESSAGES.failed;
  const { data: row, error } = await supabase
    .from("leave_records")
    .select("date, start_min, end_min, leave_type, substitute_id")
    .eq("id", recordId)
    .maybeSingle();
  if (error) return EDIT_MESSAGES.failed;
  if (!row) return DECISION_MESSAGES.noAccess;
  const same =
    formData.get("hours_seen") === reviewedHours(row.start_min, row.end_min) &&
    seen.date === row.date &&
    seen.leaveType === row.leave_type &&
    seen.substituteId === (row.substitute_id ?? null);
  if (same) return null;
  revalidatePath("/decisions");
  return EDIT_MESSAGES.changed;
}

/** Години «Whole day» на нову дату: робочий день посади; інакше — текст для форми. */
async function wholeDayHours(supabase: Supabase, recordId: number, date: string): Promise<{ start: number; end: number } | string> {
  const day = await loadWholeDay(supabase, recordId, date);
  if (day === null) return EDIT_MESSAGES.failed;
  return day === "none" ? forEmployee(TIME_MESSAGES.noWorkingHours) : day;
}

/**
 * Правка запису до рішення (крок 4 D9, D7 і D10 impl-on-behalf; AC-BEHALF-06…10). Форма шле всі поля; тут — лише
 * формат і години «Whole day» на нову дату, усе інше (хто може, статус, розклад, закриття, перетин, список замін) звіряє
 * edit_leave_record під lock працівника й відповідає текстами PM. Успіх — та сама панель запису з новими значеннями,
 * рядками історії й «Record updated».
 */
export async function editRecord(_prev: EditState, formData: FormData): Promise<EditState> {
  const { supabase, recordId } = await signedInFor(formData);
  if (recordId === null) return { message: DECISION_MESSAGES.noAccess };
  const parsed = parseEditForm((name) => formData.get(name));
  if (!parsed.ok) return { message: forEmployee(parsed.message) };
  const stale = await changedSinceOpened(supabase, recordId, formData);
  if (stale) return { message: stale };
  const f = parsed.fields;

  const hours = f.wholeDay ? await wholeDayHours(supabase, recordId, f.date) : { start: f.start!, end: f.end! };
  if (typeof hours === "string") return { message: hours };

  const { error } = await supabase.rpc("edit_leave_record", {
    p_record_id: recordId,
    p_date: f.date,
    p_start_min: hours.start,
    p_end_min: hours.end,
    p_leave_type: f.leaveType,
    p_relationship: f.relationship,
    p_substitute_id: f.substituteId,
  });
  if (error) return { message: editErrorMessage(error) };
  revalidatePath("/decisions");
  revalidatePath("/requests");
  redirect(`/decisions?record=${recordId}&updated=1`);
}
