import { LeaveTypeTag } from "@/components/ui/leave-type-tag";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { registerCells, registerTotals, totalsLabel, type RegisterRow } from "@/lib/register/register";

/** Другий рядок клітинки: дрібний приглушений текст. */
const NOTE = "block text-xs text-muted-foreground";

/** Підпис комірки, видимий лише на телефоні, де шапки таблиці немає (рядок — картка, DESIGN.md розділ 12). */
function PhoneLabel({ children }: { children: string }) {
  return <span className="text-muted-foreground md:hidden">{children} </span>;
}

/** Дні одним стовпцем на два рядки, кожне число — зі словом: «1.00 paid», «0.00 unpaid». */
function DaysLine({ days, label }: { days: string; label: string }) {
  return (
    <span className="block whitespace-nowrap tabular-nums">
      {days} <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

/**
 * Один запис реєстру; тексти комірок — ті самі, що в CSV (registerCells). Переносяться лише імена й назва посади:
 * email, дата, години й числа — ні, тож на 1280 px із бічною панеллю таблиця вміщається без прокрутки вбік.
 */
function RegisterRowView({ row }: { row: RegisterRow }) {
  const c = registerCells(row);
  return (
    <TableRow data-testid="register-row" className="hover:bg-transparent">
      <TableCell className="whitespace-normal max-md:font-medium">
        <span className="block">{c.employee}</span>
        <span className={`${NOTE} font-normal whitespace-nowrap`}>{c.email}</span>
      </TableCell>
      <TableCell className="whitespace-normal">
        <span className="block">{c.position}</span>
        <span className={NOTE}>{c.kind} position</span>
      </TableCell>
      <TableCell className="tabular-nums">{c.dateShort}</TableCell>
      <TableCell className="tabular-nums">
        {c.hours}
        <span className={NOTE}>{c.hoursNote}</span>
      </TableCell>
      <TableCell>
        <LeaveTypeTag type={row.leave_type} variant="inline" />
      </TableCell>
      <TableCell className="md:text-right">
        <DaysLine days={c.paid} label="paid" />
        <DaysLine days={c.unpaid} label="unpaid" />
      </TableCell>
      <TableCell className="whitespace-normal">
        <PhoneLabel>Approved by</PhoneLabel>
        <span>{c.approvedBy || "—"}</span>
        <span className={`${NOTE} whitespace-nowrap tabular-nums`}>{c.approvedOn || "—"}</span>
      </TableCell>
    </TableRow>
  );
}

/**
 * Реєстр погоджених відсутностей підрозділу за місяць (ADR 0012): рядок — запис; колонки — працівник, посада, дата,
 * години з тривалістю, тип, оплачувані й неоплачувані дні, хто й коли погодив. Вужче за `md` рядки стають картками
 * (`Table stack`). Під таблицею — підсумок: записи, години, оплачувані й неоплачувані дні. Дій у рядку немає: реєстр
 * лише для читання, рішення — у «Decisions».
 */
export function RegisterTable({ rows, caption }: { rows: readonly RegisterRow[]; caption: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-card max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
        <Table stack aria-label={caption}>
          <TableHeader className="bg-muted">
            <TableRow className="hover:bg-transparent">
              <TableHead>Employee</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Leave type</TableHead>
              <TableHead className="text-right">Days</TableHead>
              <TableHead>Approved</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <RegisterRowView key={r.record_id} row={r} />
            ))}
          </TableBody>
        </Table>
      </div>
      <p data-testid="register-totals" className="text-muted-foreground tabular-nums">
        <span className="font-medium text-foreground">Total:</span> {totalsLabel(registerTotals(rows))}
      </p>
    </div>
  );
}
