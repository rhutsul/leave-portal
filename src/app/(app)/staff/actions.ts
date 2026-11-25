"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  employeeFieldErrors,
  fieldOfMessage,
  hasErrors,
  isRole,
  messageOfDbError,
  readEmployeeFields,
  STAFF_MESSAGES,
  uuidOf,
  type DbFailure,
  type EmployeeErrors,
  type StaffActionState,
} from "@/lib/staff/employee";
import { createClient } from "@/lib/supabase/server";

const NO_ERRORS: EmployeeErrors = { name: null, email: null };

function failure(error: DbFailure): StaffActionState {
  const message = messageOfDbError(error);
  const field = fieldOfMessage(message);
  return field
    ? { errors: { ...NO_ERRORS, [field]: message }, message: "", done: false, link: null }
    : { errors: NO_ERRORS, message, done: false, link: null };
}

async function signedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return supabase;
}

/**
 * Новий працівник і його одноразове посилання (AC-STAFF-01): одна функція бази створює обліковий запис, профіль і
 * посилання (ADR 0013). Право перевіряє база першим кроком (AC-STAFF-13, AC-STAFF-14).
 */
export async function createEmployee(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const fields = readEmployeeFields(formData);
  const errors = employeeFieldErrors(fields);
  if (hasErrors(errors)) return { errors, message: "", done: false, link: null };
  const role = formData.get("role");
  if (!isRole(role)) return { errors: NO_ERRORS, message: STAFF_MESSAGES.failed, done: false, link: null };

  const supabase = await signedIn();
  const { data, error } = await supabase.rpc("create_employee", {
    p_full_name: fields.name,
    p_email: fields.email,
    p_role: role,
  });
  const row = data?.[0];
  if (error || !row) return failure(error ?? {});

  revalidatePath("/staff");
  return {
    errors: NO_ERRORS,
    message: "",
    done: true,
    link: { employeeId: row.employee_id, email: fields.email, token: row.token, validUntil: row.valid_until },
  };
}

/** Нове посилання наявному працівнику — попереднє стає недійсним (Assumptions PM, D2). */
export async function issueLink(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const employeeId = uuidOf(formData.get("employee_id"));
  const email = String(formData.get("email") ?? "");
  if (!employeeId) return { errors: NO_ERRORS, message: STAFF_MESSAGES.notAdmin, done: false, link: null };

  const supabase = await signedIn();
  const { data, error } = await supabase.rpc("issue_one_time_link", { p_employee_id: employeeId });
  const row = data?.[0];
  if (error || !row) return failure(error ?? {});
  revalidatePath(`/staff/${employeeId}`);
  return { errors: NO_ERRORS, message: "", done: true, link: { employeeId, email, token: row.token, validUntil: row.valid_until } };
}

/** Ім'я й email (AC-STAFF-11): пароль лишається той самий, записи показують нові дані. */
export async function updateEmployee(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const employeeId = uuidOf(formData.get("employee_id"));
  if (!employeeId) return { errors: NO_ERRORS, message: STAFF_MESSAGES.notAdmin, done: false, link: null };
  const fields = readEmployeeFields(formData);
  const errors = employeeFieldErrors(fields);
  if (hasErrors(errors)) return { errors, message: "", done: false, link: null };

  const supabase = await signedIn();
  const { error } = await supabase.rpc("update_employee", {
    p_employee_id: employeeId,
    p_full_name: fields.name,
    p_email: fields.email,
  });
  if (error) return failure(error);
  revalidatePath("/staff");
  revalidatePath(`/staff/${employeeId}`);
  return { errors: NO_ERRORS, message: "", done: true, link: null };
}

/** Роль (AC-STAFF-18): власну змінити не можна — відповідь бази показуємо дослівно. */
export async function setRole(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const employeeId = uuidOf(formData.get("employee_id"));
  const role = formData.get("role");
  if (!employeeId) return { errors: NO_ERRORS, message: STAFF_MESSAGES.notAdmin, done: false, link: null };
  if (!isRole(role)) return { errors: NO_ERRORS, message: STAFF_MESSAGES.failed, done: false, link: null };

  const supabase = await signedIn();
  const { error } = await supabase.rpc("set_employee_role", { p_employee_id: employeeId, p_role: role });
  if (error) return failure(error);
  revalidatePath("/staff");
  revalidatePath(`/staff/${employeeId}`);
  return { errors: NO_ERRORS, message: "", done: true, link: null };
}

/** Деактивація чи реактивація (AC-STAFF-08): записи, залишки й історія лишаються. */
export async function setActive(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const employeeId = uuidOf(formData.get("employee_id"));
  const intent = formData.get("intent");
  if (!employeeId) return { errors: NO_ERRORS, message: STAFF_MESSAGES.notAdmin, done: false, link: null };
  if (intent !== "deactivate" && intent !== "reactivate") {
    return { errors: NO_ERRORS, message: STAFF_MESSAGES.failed, done: false, link: null };
  }

  const supabase = await signedIn();
  const { error } = await supabase.rpc(intent === "deactivate" ? "deactivate_employee" : "reactivate_employee", {
    p_employee_id: employeeId,
  });
  if (error) return failure(error);
  revalidatePath("/staff");
  revalidatePath(`/staff/${employeeId}`);
  return { errors: NO_ERRORS, message: "", done: true, link: null };
}
