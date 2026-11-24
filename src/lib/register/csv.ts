// CSV реєстру погоджених відсутностей (ADR 0012): UTF-8 з BOM, щоб Excel відкрив кирилицю в іменах, роздільник —
// кома, рядки — CRLF (RFC 4180). Без залежностей.
import { formatDays } from "@/lib/leave/balance";
import { hoursDecimal, recordsLabel, registerCells, registerTotals, type RegisterRow } from "./register";

export const CSV_BOM = String.fromCharCode(0xfeff);

/**
 * Одна клітинка: у лапках, якщо є кома, лапки чи перенос рядка (лапки подвоюються). Клітинка, що починається з
 * `=`, `+`, `-`, `@`, табуляції чи CR, у таблиці стала б формулою (CSV injection, OWASP) — попереду ставимо апостроф.
 * Числа реєстру (години, дні) — невід'ємні, тож захист їх не зачіпає.
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvLine(cells: readonly (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

export const CSV_HEADER = [
  "Employee",
  "Email",
  "Position",
  "Position type",
  "Date",
  "Hours",
  "From",
  "To",
  "Duration (h)",
  "Leave type",
  "Paid days",
  "Unpaid days",
  "Approved by",
  "Approved on",
] as const;

/**
 * Файл реєстру: шапка, рядок на запис, порожній рядок і підсумок (записи, години, оплачувані й неоплачувані дні).
 * `title` — перший рядок над шапкою: підрозділ і місяць, щоб файл читався й без назви.
 */
export function registerCsv(rows: readonly RegisterRow[], title: string): string {
  const totals = registerTotals(rows);
  const lines = [
    csvLine([title]),
    csvLine(CSV_HEADER),
    ...rows.map((r) => {
      const c = registerCells(r);
      return csvLine([
        c.employee,
        c.email,
        c.position,
        c.kind,
        c.date,
        c.hours,
        c.from,
        c.to,
        c.durationHours,
        c.type,
        c.paid,
        c.unpaid,
        c.approvedBy,
        c.approvedOn,
      ]);
    }),
    "",
    csvLine([
      "Total",
      recordsLabel(totals.records),
      "",
      "",
      "",
      "",
      "",
      "",
      hoursDecimal(totals.minutes),
      "",
      formatDays(totals.paid),
      formatDays(totals.unpaid),
      "",
      "",
    ]),
  ];
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}
