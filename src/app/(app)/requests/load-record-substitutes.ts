import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface RecordSubstitute {
  email: string;
  /** Хвилини позначки «With upgrade»; null — позначки немає (AC-SUBST-09). */
  upgradeMinutes: number | null;
}

/**
 * Заміна запису за id: null — «No substitute» (AC-SUBST-03); undefined — заміни не завантажились, рядка не показуємо.
 */
export function substituteLookup(
  substitutes: ReadonlyMap<number, RecordSubstitute> | null,
): (recordId: number) => RecordSubstitute | null | undefined {
  return (recordId) => (substitutes ? (substitutes.get(recordId) ?? null) : undefined);
}

/**
 * Заміна й позначка показаних записів одним викликом record_substitutes() (D6): email заміни профіль за RLS не дає.
 * Запис без заміни в мапі відсутній — «No substitute» (AC-SUBST-03). Збій (зокрема функції ще немає, D11) — null:
 * сторінка показує записи без рядка заміни.
 */
export async function loadRecordSubstitutes(
  supabase: Supabase,
  recordIds: number[],
): Promise<Map<number, RecordSubstitute> | null> {
  if (recordIds.length === 0) return new Map();
  const { data, error } = await supabase.rpc("record_substitutes", { p_record_ids: recordIds });
  if (error) return null;
  return new Map(
    (data ?? []).map((r) => [r.record_id, { email: r.substitute_email, upgradeMinutes: r.upgrade_minutes ?? null }]),
  );
}
