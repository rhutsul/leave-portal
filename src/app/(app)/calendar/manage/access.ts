import { CALENDAR_MESSAGES } from "@/lib/leave/calendar";

export type ManageAccess = { allowed: true } | { allowed: false; message: string };

/**
 * Хто може відкрити сторінку зміни шкільного календаря: лише адміністратор (AC-CAL-12, матриця прав product.md).
 * Роль — з profiles, не з user_metadata. Це перший рубіж; другий — private.add_school_closure у базі (AC-CAL-13).
 */
export function manageAccess(role: string | null): ManageAccess {
  return role === "admin" ? { allowed: true } : { allowed: false, message: CALENDAR_MESSAGES.adminOnly };
}
