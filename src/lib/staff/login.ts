// Відмова входу → код помилки для /login (AC-STAFF-08; D6 openspec/changes/impl-staff-management/design.md).
// Текстів Auth людині не показуємо (вони підказали б, чи існує email); виняток — деактивований: Auth відмовляє йому
// з кодом user_banned, бо private.deactivate_employee ставить бан (ADR 0013).

export type LoginError = "invalid" | "deactivated";

export function loginErrorOf(error: { code?: string | null }): LoginError {
  return error.code === "user_banned" ? "deactivated" : "invalid";
}
