// Заміни для записів — чисті правила (D3, D7 openspec/changes/impl-substitutes/design.md; вимога PM
// requirements/06-substitutes.md). Те саме правило підвищення — private.upgrade_applies у міграції
// 20261125000321_substitutes.sql: що записано, вирішує база, а тут — попередній перегляд у формі й тексти сторінок.

/** Тексти AC (дослівно) і власні тексти зрізу. */
export const SUBSTITUTE_MESSAGES = {
  /** AC-SUBST-03. */
  noSubstitute: "No substitute",
  /** AC-SUBST-11. */
  emptyList: "Your manager has not added substitutes for you yet",
  /** AC-SUBST-12. */
  notManager: "Only the manager of this employee's position can change the substitute list",
  /** AC-SUBST-15. */
  notCovering: "You are not covering for anyone",
  /** Власний текст (D5): людину прибрали зі списку, поки форма була відкрита. Той самий рядок — у базі. */
  notOnList: "This substitute is no longer on your substitute list",
  /** Власний текст (D7): та сама людина двічі. */
  alreadyOnList: "This person is already on the list",
} as const;

/** Значення пункту «No substitute» у списку вибору (справжній id — uuid, тож не збігається). */
export const NO_SUBSTITUTE = "none";

/** Людина зі списку замін працівника, як її повертає my_substitute_options(). */
export interface SubstituteOption {
  id: string;
  email: string;
  /** «Elementary school / Assistant» — основна посада; порожньо, якщо її немає. */
  position: string;
  /** Назва основної посади без підрозділу — для правила підвищення. */
  mainTitle: string;
}

/**
 * Позначка підвищення (Assumptions 06): посада відсутнього в записі має назву з «teacher» (будь-який регістр,
 * «Math teacher» теж), а основна посада заміни — «Assistant» (точний збіг без регістру й крайових пробілів; PM дає
 * лише точну назву).
 */
export function upgradeApplies(positionTitle: string, substituteMainTitle: string | null | undefined): boolean {
  return positionTitle.toLowerCase().includes("teacher") && (substituteMainTitle ?? "").trim().toLowerCase() === "assistant";
}

/** Хвилини позначки — хвилини запису в межах розкладу, тобто його тривалість; null — позначки немає. */
export function upgradeMinutes(
  positionTitle: string,
  substituteMainTitle: string | null | undefined,
  minutes: number,
): number | null {
  return upgradeApplies(positionTitle, substituteMainTitle) ? minutes : null;
}

/** «With upgrade: 210 min» (AC-SUBST-08). */
export function upgradeLabel(minutes: number): string {
  return `With upgrade: ${minutes} min`;
}

/** Що показати про заміну запису: email або «No substitute» (AC-SUBST-02, AC-SUBST-03). */
export function substituteLabel(email: string | null | undefined): string {
  return email ? email : SUBSTITUTE_MESSAGES.noSubstitute;
}

/**
 * Поле «Substitute» у формі заявки: порожній список — замість вибору повідомлення AC-SUBST-11, і заявку подають
 * без заміни; не завантажився (null) — поля немає зовсім (D11: функції ще немає на проді, тож заміну не надсилаємо).
 */
export type SubstituteField =
  | { kind: "hidden" }
  | { kind: "empty"; message: string }
  | { kind: "choice"; items: { value: string; label: string; hint: string }[] };

export function substituteField(options: readonly SubstituteOption[] | null): SubstituteField {
  if (options === null) return { kind: "hidden" };
  if (options.length === 0) return { kind: "empty", message: SUBSTITUTE_MESSAGES.emptyList };
  return {
    kind: "choice",
    items: [
      { value: NO_SUBSTITUTE, label: SUBSTITUTE_MESSAGES.noSubstitute, hint: "" },
      ...options.map((o) => ({ value: o.id, label: o.email, hint: o.position })),
    ],
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Вибір із форми → id заміни або undefined («No substitute», порожньо чи сміття). */
export function substituteIdOf(value: unknown): string | undefined {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : undefined;
}

/**
 * Перевірка вибору перед поданням (AC-SUBST-04): кожна вибрана заміна — зі списку працівника. Повертає текст відмови
 * або null. Другий рубіж — submit_leave_request (той самий текст).
 */
export function checkSubstitutes(chosen: readonly (string | undefined)[], options: readonly SubstituteOption[]): string | null {
  const allowed = new Set(options.map((o) => o.id));
  return chosen.some((id) => id !== undefined && !allowed.has(id)) ? SUBSTITUTE_MESSAGES.notOnList : null;
}

/** «2 substitutes», «1 substitute», «No substitutes» — підсумок рядка на /substitutes. */
export function substituteCount(n: number): string {
  if (n === 0) return "No substitutes";
  return n === 1 ? "1 substitute" : `${n} substitutes`;
}

/** Рядок my_substitute_options() / substitute_list() → опис людини. */
export function toSubstituteOption(row: {
  substitute_id: string;
  email: string | null;
  main_title: string | null;
  division_name: string | null;
}): SubstituteOption {
  return {
    id: row.substitute_id,
    email: row.email ?? "",
    position: row.main_title ? (row.division_name ? `${row.division_name} / ${row.main_title}` : row.main_title) : "",
    mainTitle: row.main_title ?? "",
  };
}
