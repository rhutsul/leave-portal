import { formatMonth, kyivDate } from "@/lib/leave/time";
import { registerCsv } from "@/lib/register/csv";
import {
  exportFileName,
  monthInRange,
  monthOf,
  registerQuery,
  type RegisterDivision,
  type RegisterRow,
} from "@/lib/register/register";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Params = { division?: string | string[]; month?: string | string[] };
type Failure = "error" | "bad-request" | "not-available" | "no-divisions";

export type RegisterLoad =
  | { ok: false; reason: Failure }
  | {
      ok: true;
      divisions: RegisterDivision[];
      division: RegisterDivision;
      month: string;
      monthLabel: string;
      currentMonth: string;
      /** null — записи не завантажились (підрозділи є). */
      rows: RegisterRow[] | null;
    };

type Selection = { division: RegisterDivision; month: string } | { reason: Failure };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** CSV: підрозділ і місяць мають бути явними й правильними; підрозділ не з доступних — відмова. */
function strictSelection(params: Params, divisions: readonly RegisterDivision[], currentMonth: string): Selection {
  const code = typeof params.division === "string" ? params.division : "";
  const month = typeof params.month === "string" ? params.month : "";
  if (!code || !MONTH.test(month) || !monthInRange(month, currentMonth)) return { reason: "bad-request" };
  const division = divisions.find((d) => d.code === code);
  return division ? { division, month } : { reason: "not-available" };
}

/** Сторінка: перший доступний підрозділ і поточний місяць, якщо в адресі нічого придатного. */
function pageSelection(params: Params, divisions: readonly RegisterDivision[], currentMonth: string): Selection {
  const { division, month } = registerQuery(params, divisions, currentMonth);
  return division ? { division, month } : { reason: "no-divisions" };
}

/**
 * Підрозділи й записи реєстру для /register і його CSV. Доступ вирішує база: public.register_divisions дає лише
 * підрозділи, доступні користувачу (адміністратору — усі, менеджеру — де веде посаду, решті — жодного), а
 * public.approved_register — лише погоджені записи, які користувач може бачити. `strict` — для CSV.
 */
export async function loadRegister(
  supabase: Supabase,
  params: Params,
  { strict = false, now = new Date() }: { strict?: boolean; now?: Date } = {},
): Promise<RegisterLoad> {
  const currentMonth = monthOf(kyivDate(now));
  const { data: divisions, error } = await supabase.rpc("register_divisions");
  if (error) return { ok: false, reason: "error" };
  const list = (divisions ?? []) as RegisterDivision[];
  const picked = (strict ? strictSelection : pageSelection)(params, list, currentMonth);
  if ("reason" in picked) return { ok: false, reason: picked.reason };

  const { data: rows, error: rowsError } = await supabase.rpc("approved_register", {
    p_division_id: picked.division.id,
    p_month: `${picked.month}-01`,
  });
  return {
    ok: true,
    divisions: list,
    ...picked,
    monthLabel: formatMonth(picked.month),
    currentMonth,
    rows: rowsError ? null : ((rows ?? []) as RegisterRow[]),
  };
}

const EXPORT_FAILURES: Record<Failure, { status: number; message: string }> = {
  "bad-request": { status: 400, message: "Choose a division and a month." },
  "not-available": { status: 403, message: "The register of this division is not available to you." },
  "no-divisions": { status: 403, message: "The register of this division is not available to you." },
  error: { status: 500, message: "The register could not be loaded. Please try again." },
};

/** Відповідь CSV: файл з ім'ям за підрозділом і місяцем або статус із текстом відмови. */
export function registerExport(
  result: RegisterLoad,
): { ok: true; fileName: string; csv: string } | { ok: false; status: number; message: string } {
  if (!result.ok) return { ok: false, ...EXPORT_FAILURES[result.reason] };
  if (result.rows === null) return { ok: false, ...EXPORT_FAILURES.error };
  return {
    ok: true,
    fileName: exportFileName(result.division.code, result.month),
    csv: registerCsv(result.rows),
  };
}
