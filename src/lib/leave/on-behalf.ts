// Заявка від імені працівника — тексти й чисті правила (D1, D6, D10 openspec/changes/archive/2026-11-27-impl-on-behalf/design.md; вимога
// PM requirements/08-on-behalf-and-edit.md). Що записано й хто має право, вирішує база
// (20261125200521_on_behalf_and_edit.sql); тут — тексти сторінок і перевірок форми до подання.

/** Тексти AC (дослівно) і власні тексти зрізу (розробник). */
export const ON_BEHALF_MESSAGES = {
  /** AC-BEHALF-11. */
  notYourEmployee: "You can submit requests only for employees of your positions",
  /** AC-BEHALF-12. */
  employeeRole: "Only a manager or an administrator can submit a request on behalf of an employee",
  /** AC-BEHALF-15. */
  noEmployees: "You have no employees to submit requests for",
  /** AC-BEHALF-10. */
  alreadyDecided: "This record is already decided and cannot be changed",
  /** Розробник (D1): власна заявка — з «New request»; той самий рядок у базі. */
  ownRequest: "Submit your own leave from New request",
  /** Розробник (D11): фільтр списку нічого не знайшов. */
  noMatch: "No employees match",
  /** Розробник (D11): банер над формою від імені. */
  managerNote: "Records of your positions are approved at once; others go to their managers.",
  adminNote: "All records are approved at once.",
  /** Розробник: у працівника ще немає списку замін (AC-SUBST-11 для менеджера). */
  noSubstitutes: "No substitutes are on this employee's list yet",
} as const;

/**
 * Тексти працівника → тексти для менеджера (Assumptions PM: «you» / «your» для працівника — «this employee»;
 * AC-BEHALF-05, AC-BEHALF-09). Та сама таблиця — private.on_behalf_message у базі (тест порівнює обидві).
 * [початок тексту працівника, початок для менеджера, точний збіг?]
 */
export const ON_BEHALF_REPLACEMENTS: readonly (readonly [string, string, boolean])[] = [
  ["You have no working hours on this day", "This employee has no working hours on this day", true],
  ["Hours must be within your schedule: ", "Hours must be within the schedule: ", false],
  ["You already have a request for this time: ", "This employee already has a request for this time: ", false],
  ["This substitute is no longer on your substitute list", "This substitute is no longer on this employee's substitute list", true],
];

/** Текст перевірки, як його бачить менеджер, що подає від імені; невідомі тексти — як є. */
export function forEmployee(message: string): string {
  for (const [from, to, exact] of ON_BEHALF_REPLACEMENTS) {
    if (exact ? message === from : message.startsWith(from)) return to + message.slice(from.length);
  }
  // «Your Sick leave balance is 0.50 day. Another …» — попередження понад залишок (Assumptions PM: його бачить менеджер).
  if (message.startsWith("Your ") && message.includes(" balance is ")) return `This employee's ${message.slice("Your ".length)}`;
  return message;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** id працівника з адреси: лише uuid (інше — як чужий працівник, AC-BEHALF-11). */
export function employeeIdOf(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;
}

/** Повідомлення про успіх: «Request submitted: 1 approved, 1 awaiting decision» (розробник, D10). */
export function submittedMessage(approved: number, awaiting: number): string {
  const parts = [approved > 0 && `${approved} approved`, awaiting > 0 && `${awaiting} awaiting decision`].filter(Boolean);
  return parts.length ? `Request submitted: ${parts.join(", ")}` : "Request submitted";
}

/** «?submitted=1-1» → лічильники; сміття — null (сторінка тоді не показує повідомлення). */
export function parseSubmitted(value: unknown): { approved: number; awaiting: number } | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,3})-(\d{1,3})$/.exec(value);
  return match ? { approved: Number(match[1]), awaiting: Number(match[2]) } : null;
}

/** Відмови бази, які сторінка показує дослівно замість форми (AC-BEHALF-11, AC-BEHALF-12, AC-BEHALF-15). */
export function refusalOf(message: string | null | undefined): string | null {
  const known: string[] = [ON_BEHALF_MESSAGES.notYourEmployee, ON_BEHALF_MESSAGES.employeeRole, ON_BEHALF_MESSAGES.noEmployees];
  return message && known.includes(message) ? message : null;
}
