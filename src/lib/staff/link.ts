// Одноразове посилання для першого входу (вимога PM 07, AC-STAFF-01…03; D2 openspec/changes/impl-staff-management/
// design.md). Строк, адреса й тексти; сам токен перевіряє лише база (public.use_one_time_link).

export const LINK_MESSAGES = {
  // AC-STAFF-02
  passwordSet: "Your password is set",
  // AC-STAFF-03
  expired: "This link has expired. Ask the administrator for a new one",
  // Розробник (D2): використане, замінене новим, невідоме, людину деактивовано.
  invalid: "This link is no longer valid. Ask the administrator for a new one",
} as const;

/** Шлях сторінки, де людина задає пароль; `/auth/**` публічний у src/proxy.ts. */
export const SET_PASSWORD_PATH = "/auth/set-password";

/**
 * Останній дійсний день: день створення за Києвом + 7, включно (Assumptions PM: створене 2026-12-01 — до 2026-12-08).
 * Те саме правило, що valid_until у private.new_one_time_link.
 */
export function linkValidUntil(createdOn: string): string {
  const d = new Date(`${createdOn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

/** Токен — 32 байти в base64url без «=» (43 знаки), як його видає база. */
export function isTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

/**
 * Адреса посилання: токен — у фрагменті (#token=…), тож браузер не шле його на сервер ні в запиті сторінки, ні в
 * Referer, і він не потрапляє в журнали запитів (D2).
 */
export function oneTimeLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${SET_PASSWORD_PATH}#token=${encodeURIComponent(token)}`;
}

/** Токен із фрагмента адреси («#token=…»), або null. */
export function tokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("token");
  return token && isTokenShape(token) ? token : null;
}

export type LinkState = "valid" | "expired" | "invalid";

export function isLinkState(value: unknown): value is LinkState {
  return value === "valid" || value === "expired" || value === "invalid";
}

/** Текст для стану, який не дає задати пароль. */
export function linkStateMessage(state: Exclude<LinkState, "valid">): string {
  return state === "expired" ? LINK_MESSAGES.expired : LINK_MESSAGES.invalid;
}
