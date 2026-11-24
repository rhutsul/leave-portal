// Зміна власного пароля (ADR 0011): правила перевірки введення й тексти помилок. Чисті функції — їх ділять форма
// (перевірка до відправки) і server action (та сама перевірка ще раз, бо форму можна обійти).
// Вимог PM до цієї фічі ще немає (requirements/product.md, «later»), тож правила й тексти — припущення розробника.

/** Мінімум — 8 знаків (як DEMO_USER_PASSWORD); Auth сам вимагає ≥ 6. */
export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt у Supabase Auth бере лише перші 72 байти; довший пароль Auth відхиляє. Рахуємо байти UTF-8, не знаки. */
export const MAX_PASSWORD_BYTES = 72;

export type PasswordFields = { current: string; next: string; confirm: string };
export type PasswordField = keyof PasswordFields;
export type PasswordErrors = Record<PasswordField, string | null>;

export const NO_PASSWORD_ERRORS: PasswordErrors = { current: null, next: null, confirm: null };

export const PASSWORD_MESSAGES = {
  currentMissing: "Enter your current password.",
  currentWrong: "Current password is incorrect.",
  nextMissing: "Enter a new password.",
  nextShort: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  nextLong: `This password is too long. Use at most ${MAX_PASSWORD_BYTES} bytes. Letters A–Z and a–z, digits 0–9, and symbols such as ! and @ use 1 byte each. Other characters may use more.`,
  nextSame: "The new password must be different from the current one.",
  nextWeak: "This password is too easy to guess. Choose a longer or less common one.",
  confirmMissing: "Repeat the new password.",
  confirmMismatch: "The passwords don't match.",
  rateLimited: "Too many attempts. Try again in a few minutes.",
  reauthenticate: "For your security, sign out, sign in again and then change your password.",
  failed: "The password was not changed. Try again.",
} as const;

/** Поля форми як є: пароль не обрізаємо — пробіли на краях теж його частина. */
export function readPasswordFields(form: FormData): PasswordFields {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  return { current: text("current_password"), next: text("new_password"), confirm: text("confirm_password") };
}

function newPasswordError(next: string, current: string): string | null {
  if (!next) return PASSWORD_MESSAGES.nextMissing;
  // Довжина — у кодових точках (емодзі — один знак), а не в одиницях UTF-16.
  if ([...next].length < MIN_PASSWORD_LENGTH) return PASSWORD_MESSAGES.nextShort;
  if (new TextEncoder().encode(next).length > MAX_PASSWORD_BYTES) return PASSWORD_MESSAGES.nextLong;
  if (current && next === current) return PASSWORD_MESSAGES.nextSame;
  return null;
}

/** Помилка кожного поля або null. Підтвердження порівнюємо, лише коли новий пароль сам по собі прийнятний. */
export function passwordFieldErrors({ current, next, confirm }: PasswordFields): PasswordErrors {
  const nextError = newPasswordError(next, current);
  let confirmError: string | null = null;
  if (!confirm) confirmError = PASSWORD_MESSAGES.confirmMissing;
  else if (!nextError && confirm !== next) confirmError = PASSWORD_MESSAGES.confirmMismatch;
  return {
    current: current ? null : PASSWORD_MESSAGES.currentMissing,
    next: nextError,
    confirm: confirmError,
  };
}

export function hasPasswordErrors(errors: PasswordErrors): boolean {
  return Object.values(errors).some((e) => e != null);
}

/** Що повертає server action формі. `done` — пароль змінено; `message` — помилка всієї дії (Alert над кнопкою). */
export type ChangePasswordState = { errors: PasswordErrors; message: string; done: boolean };

export const INITIAL_CHANGE_PASSWORD: ChangePasswordState = { errors: NO_PASSWORD_ERRORS, message: "", done: false };

/** Помилка Auth — лише код і статус; текст Auth користувачеві не показуємо. */
export type AuthFailure = { code?: string | null; status?: number | null };

function rateLimited({ code, status }: AuthFailure): boolean {
  return status === 429 || (typeof code === "string" && code.startsWith("over_") && code.endsWith("_rate_limit"));
}

function fieldFailure(field: PasswordField, message: string): ChangePasswordState {
  return { errors: { ...NO_PASSWORD_ERRORS, [field]: message }, message: "", done: false };
}

function actionFailure(message: string): ChangePasswordState {
  return { errors: NO_PASSWORD_ERRORS, message, done: false };
}

/**
 * Перевірка поточного пароля входом не вдалась. Як на /login — без подробиць Auth: неправильний пароль і будь-яка
 * інша відмова входу (400) дають один текст під полем «Current password»; ліміт спроб — свій текст; решта (мережа,
 * 5xx) — загальний.
 */
export function verifyFailure(error: AuthFailure): ChangePasswordState {
  if (rateLimited(error)) return actionFailure(PASSWORD_MESSAGES.rateLimited);
  if (error.code === "invalid_credentials" || error.status === 400) {
    return fieldFailure("current", PASSWORD_MESSAGES.currentWrong);
  }
  return actionFailure(PASSWORD_MESSAGES.failed);
}

/** `updateUser({ password })` відмовив: відомі коди Auth — свої тексти, решта — загальний. */
export function updateFailure(error: AuthFailure): ChangePasswordState {
  if (rateLimited(error)) return actionFailure(PASSWORD_MESSAGES.rateLimited);
  switch (error.code) {
    case "weak_password":
      return fieldFailure("next", PASSWORD_MESSAGES.nextWeak);
    case "same_password":
      return fieldFailure("next", PASSWORD_MESSAGES.nextSame);
    // Налаштування Auth «Require current password when changing password» (ADR 0011).
    case "current_password_mismatch":
    case "current_password_required":
      return fieldFailure("current", PASSWORD_MESSAGES.currentWrong);
    // «Secure password change»: сесія старша за 24 год — Auth хоче повторного входу (ADR 0011).
    case "reauthentication_needed":
    case "reauthentication_not_valid":
      return actionFailure(PASSWORD_MESSAGES.reauthenticate);
    default:
      return actionFailure(PASSWORD_MESSAGES.failed);
  }
}
