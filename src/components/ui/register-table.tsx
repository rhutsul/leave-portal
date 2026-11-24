import { LeaveTypeTag } from "@/components/ui/leave-type-tag";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { registerCells, registerTotals, totalsLabel, type RegisterRow } from "@/lib/register/register";

/** Підпис комірки, видимий лише на телефоні, де шапки таблиці немає (рядок — картка, DESIGN.md розділ 12). */
function PhoneLabel({ children }: { children: string }) {
  return <span className="text-muted-foreground md:hidden">{children} </span>;
}

const NUMBER = "whitespace-nowrap tabular-nums md:text-right";

/** Один запис реєстру; тексти комірок — ті самі, що в CSV (registerCells). */
function RegisterRowView({ row }: { row: RegisterRow }) {
  const c = registerCells(row);
  return (
    <TableRow data-testid="register-row" className="hover:bg-transparent">
      <TableCell className="max-md:font-medium">
        <span className="block">{c.employee}</span>
        <span className="block text-xs font-normal text-muted-foreground">{c.email}</span>
      </TableCell>
      <TableCell>
        <span className="whitespace-nowrap">{c.position}</span>
        <span className="block text-xs text-muted-foreground">{c.kind} position</span>
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">{c.dateLong}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {c.hours}
        <span className="block text-xs text-muted-foreground">{c.hoursDetail}</span>
      </TableCell>
      <TableCell className={NUMBER}>
        <PhoneLabel>Duration</PhoneLabel>
        {c.duration}
      </TableCell>
      <TableCell>
        <LeaveTypeTag type={row.leave_type} variant="inline" />
      </TableCell>
      <TableCell className={NUMBER}>
        <PhoneLabel>Paid days</PhoneLabel>
        {c.paid}
      </TableCell>
      <TableCell className={NUMBER}>
        <PhoneLabel>Unpaid days</PhoneLabel>
        {c.unpaid}
      </TableCell>
      <TableCell>
        <PhoneLabel>Approved by</PhoneLabel>
        <span className="whitespace-nowrap">{c.approvedBy || "—"}</span>
        <span className="block text-xs whitespace-nowrap text-muted-foreground tabular-nums">{c.approvedOn || "—"}</span>
      </TableCell>
    </TableRow>
  );
}

/**
 * Реєстр погоджених відсутностей підрозділу за місяць (ADR 0012): рядок — запис; колонки — працівник, посада, дата,
 * години, тривалість, тип, оплачувані й неоплачувані дні, хто й коли погодив. Вужче за `md` рядки стають картками
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
              <TableHead className="text-right">Duration</TableHead>
              <TableHead>Leave type</TableHead>
              <TableHead className="text-right">Paid days</TableHead>
              <TableHead className="text-right">Unpaid days</TableHead>
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
