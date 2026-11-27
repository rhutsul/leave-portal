// Рішення щодо запису так, як його шле форма «Decisions» після contract (крок 3 D9 impl-on-behalf): години, дата, тип
// і заміна — ті, що менеджер бачить зараз. Стару 6-параметрову сигнатуру прибрано, тож тести, яким звірка D9 не
// потрібна, беруть дату, тип і заміну з самого запису — як приховані поля форми (loadReviewed).
import type { LeaveDb } from "./supabase-pglite";

export interface DecideResult {
  status: string;
  paid_days: number | null;
  unpaid_days: number | null;
}

/** Що менеджер бачить у панелі запису — дата, тип і заміна (читає service_role, як RLS дала б менеджеру посади). */
async function seenOf(t: LeaveDb, recordId: number) {
  const [row] = await t.asService<{ date: string; leave_type: string; substitute_id: string | null }>(
    "select date::text as date, leave_type, substitute_id from public.leave_records where id = $1",
    [recordId],
  );
  // Запису немає (чужий id, перевірка відмови) — шлемо порожнє: функція відмовить раніше, ніж звірить дату.
  return row ?? { date: null, leave_type: null, substitute_id: null };
}

/** public.decide_leave_record від імені userId з годинами startMin–endMin і тим, що менеджер бачить зараз. */
export async function decideAsSeen(
  t: LeaveDb,
  userId: string,
  recordId: number,
  decision: string,
  startMin: number | null,
  endMin: number | null,
  comment: string | null = null,
  split = false,
): Promise<DecideResult> {
  const seen = await seenOf(t, recordId);
  const [row] = await t.asUser<{ result: DecideResult }>(
    userId,
    "select public.decide_leave_record($1, $2, $3, $4, $5::date, $6, $7::uuid, $8, $9) as result",
    [recordId, decision, startMin, endMin, seen.date, seen.leave_type, seen.substitute_id, comment, split],
  );
  return row.result;
}
