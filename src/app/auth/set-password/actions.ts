"use server";

import { redirect } from "next/navigation";
import { newPasswordError, PASSWORD_MESSAGES } from "@/lib/account/password";
import { isLinkState, isTokenShape, linkStateMessage, type LinkState } from "@/lib/staff/link";
import { createClient } from "@/lib/supabase/server";

export type LinkCheck = { state: LinkState; email: string | null };

export type SetPasswordState = {
  errors: { next: string | null; confirm: string | null };
  message: string;
};

const FAILED = "The password was not set. Please try again.";

/**
 * Стан посилання без пароля (AC-STAFF-02, -03): гість кличе єдину функцію, доступну anon, — public.use_one_time_link
 * (ADR 0013). Токен лише в тілі запиту до бази, не в адресі сторінки.
 */
export async function checkLink(token: string): Promise<LinkCheck> {
  if (!isTokenShape(token)) return { state: "invalid", email: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("use_one_time_link", { p_token: token });
  const row = data?.[0];
  if (error || !row || !isLinkState(row.state)) return { state: "invalid", email: null };
  return { state: row.state, email: row.state === "valid" ? row.email : null };
}

const NO_ERRORS: SetPasswordState["errors"] = { next: null, confirm: null };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Ті самі правила й тексти, що на /account: новий пароль, потім підтвердження (лише коли новий сам по собі гаразд). */
function passwordErrors(next: string, confirm: string): SetPasswordState["errors"] {
  const nextError = newPasswordError(next);
  let confirmError: string | null = null;
  if (!confirm) confirmError = PASSWORD_MESSAGES.confirmMissing;
  else if (!nextError && confirm !== next) confirmError = PASSWORD_MESSAGES.confirmMismatch;
  return { next: nextError, confirm: confirmError };
}

type Redeemed = { email: string } | { message: string };

/** Пароль через базу: email для входу — лише з чинного посилання; інакше — текст для людини. */
async function redeem(supabase: Awaited<ReturnType<typeof createClient>>, token: string, next: string): Promise<Redeemed> {
  const { data, error } = await supabase.rpc("use_one_time_link", { p_token: token, p_password: next });
  // Правила пароля база перевіряє ще раз (P0001 — тексти для людини); решта — загальний текст.
  if (error) return { message: error.code === "P0001" ? error.message : FAILED };
  const row = data?.[0];
  if (!row || !isLinkState(row.state)) return { message: FAILED };
  if (row.state === "valid" && row.email) return { email: row.email };
  return { message: linkStateMessage(row.state === "valid" ? "invalid" : row.state) };
}

/**
 * Пароль за посиланням (AC-STAFF-02): правила — ті самі, що на /account (≥ 8 знаків, ≤ 72 байти); база перевіряє
 * посилання ще раз, ставить пароль і позначає посилання використаним. Потім звичайний вхід паролем (cookie сесії) —
 * і Overview з «Your password is set».
 */
export async function setPassword(_prev: SetPasswordState, formData: FormData): Promise<SetPasswordState> {
  const token = text(formData, "token");
  const next = text(formData, "new_password");
  const errors = passwordErrors(next, text(formData, "confirm_password"));
  if (errors.next || errors.confirm) return { errors, message: "" };
  if (!isTokenShape(token)) return { errors: NO_ERRORS, message: linkStateMessage("invalid") };

  const supabase = await createClient();
  const result = await redeem(supabase, token, next);
  if ("message" in result) return { errors: NO_ERRORS, message: result.message };

  const { error: signInError } = await supabase.auth.signInWithPassword({ email: result.email, password: next });
  // Пароль уже задано: якщо вхід не вдався (мережа, ліміт), людина входить сама на /login.
  if (signInError) redirect("/login");
  redirect("/?notice=password-set");
}
