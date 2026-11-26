"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { messageOfDbError, uuidOf } from "@/lib/staff/employee";
import { isPositionKind, POSITION_MESSAGES, readBlocks } from "@/lib/staff/position";
import { isCalendarDate } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";

export type PositionActionState = { message: string };

const FAILED = "The change was not saved. Please try again.";

async function signedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return supabase;
}

function managerIds(formData: FormData): string[] {
  return formData.getAll("manager_id").map(uuidOf).filter((id): id is string => id != null);
}

function validFrom(formData: FormData): string | null {
  const value = formData.get("valid_from");
  return typeof value === "string" && isCalendarDate(value) ? value : null;
}

/**
 * Нова посада (AC-STAFF-04, -05, -06): одна функція бази перевіряє «рівно одну основну», перетин розкладів з іншими
 * посадами працівника на будь-яку дату й менеджерів — тексти AC приходять звідти дослівно.
 */
export async function createPosition(_prev: PositionActionState, formData: FormData): Promise<PositionActionState> {
  const employeeId = uuidOf(formData.get("employee_id"));
  const kind = formData.get("kind");
  const divisionId = Number(formData.get("division_id"));
  const from = validFrom(formData);
  const blocks = readBlocks(formData.get("blocks"));
  if (!employeeId || !isPositionKind(kind) || !blocks) return { message: FAILED };
  if (!Number.isInteger(divisionId) || divisionId <= 0) return { message: POSITION_MESSAGES.noDivision };
  if (!from) return { message: POSITION_MESSAGES.noDate };

  const supabase = await signedIn();
  const { error } = await supabase.rpc("create_position", {
    p_employee_id: employeeId,
    p_kind: kind,
    p_division_id: divisionId,
    p_title: String(formData.get("title") ?? ""),
    p_valid_from: from,
    p_blocks: blocks,
    p_manager_ids: managerIds(formData),
  });
  if (error) return { message: messageOfDbError(error) };
  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?saved=position`);
}

/** Новий розклад з дати (AC-STAFF-07): записи не змінюються, попередня версія діє до цієї дати. */
export async function setSchedule(_prev: PositionActionState, formData: FormData): Promise<PositionActionState> {
  const employeeId = uuidOf(formData.get("employee_id"));
  const positionId = Number(formData.get("position_id"));
  const from = validFrom(formData);
  const blocks = readBlocks(formData.get("blocks"));
  if (!employeeId || !Number.isInteger(positionId) || !blocks) return { message: FAILED };
  if (!from) return { message: POSITION_MESSAGES.noDate };

  const supabase = await signedIn();
  const { error } = await supabase.rpc("set_position_schedule", {
    p_position_id: positionId,
    p_valid_from: from,
    p_blocks: blocks,
  });
  if (error) return { message: messageOfDbError(error) };
  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?saved=schedule`);
}

/** Відповідальні менеджери посади (AC-STAFF-04): набір замінюється цілком. */
export async function setManagers(_prev: PositionActionState, formData: FormData): Promise<PositionActionState> {
  const employeeId = uuidOf(formData.get("employee_id"));
  const positionId = Number(formData.get("position_id"));
  if (!employeeId || !Number.isInteger(positionId)) return { message: FAILED };

  const supabase = await signedIn();
  const { error } = await supabase.rpc("set_position_managers", {
    p_position_id: positionId,
    p_manager_ids: managerIds(formData),
  });
  if (error) return { message: messageOfDbError(error) };
  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?saved=managers`);
}
