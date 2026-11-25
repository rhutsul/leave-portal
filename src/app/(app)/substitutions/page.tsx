import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { isRecordStatus, StatusBadge } from "@/components/ui/status-badge";
import { UpgradeBadge } from "@/components/ui/substitute-note";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RecordStatus } from "@/lib/leave/request";
import { SUBSTITUTE_MESSAGES } from "@/lib/leave/substitutes";
import { formatMonth, formatRange, isoWeekday, WEEKDAY_SHORT } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My substitutions · Leave portal" };

/** "Wed 2" — у таблиці, згрупованій за місяцем (DESIGN.md, розділ 1). */
function dayLabel(date: string) {
  return `${WEEKDAY_SHORT[isoWeekday(date) - 1]} ${Number(date.slice(8))}`;
}

// «My substitutions» (AC-SUBST-10, AC-SUBST-15; D6, D7 openspec/changes/impl-substitutes/design.md): записи, де
// користувач — заміна, у статусах «Awaiting decision», «Returned for revision», «Approved» (my_substitutions()). Лише
// дата, години, відсутній працівник, статус і позначка підвищення: тип відсутності й коментарі заміні не потрібні.
// Гостя на вхід веде src/proxy.ts ще до рендеру (AC-SUBST-14); getClaims — другий рубіж.
export default async function SubstitutionsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  const { data: rows, error } = await supabase.rpc("my_substitutions");
  const records = (rows ?? []).filter((r) => isRecordStatus(r.status));
  const months = new Map<string, typeof records>();
  for (const r of records) {
    const month = r.date.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), r]);
  }

  return (
    <>
      <PageHeader title="My substitutions" description="Records where you cover for someone." />
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>The substitutions could not be loaded. Please reload the page.</AlertDescription>
        </Alert>
      ) : records.length === 0 ? (
        <EmptyState
          icon={<UserRound className="size-5" aria-hidden="true" />}
          title={SUBSTITUTE_MESSAGES.notCovering}
          text="Records where you are chosen as the substitute will appear here."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
          <Table stack>
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            {[...months.entries()].map(([month, items]) => (
              <TableBody key={month}>
                <TableRow className="border-t hover:bg-transparent">
                  <TableHead scope="rowgroup" colSpan={4} className="h-auto bg-background py-2">
                    {formatMonth(month)}
                  </TableHead>
                </TableRow>
                {items.map((r) => (
                  <TableRow key={r.record_id} data-testid="substitution">
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {dayLabel(r.date)}
                      <span className="sr-only"> ({r.date})</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatRange(r.start_min, r.end_min)}</TableCell>
                    <TableCell className="break-all">{r.employee_email}</TableCell>
                    <TableCell data-cell="end">
                      <StatusBadge status={r.status as RecordStatus} />
                      {r.upgrade_minutes != null && <UpgradeBadge minutes={r.upgrade_minutes} className="mt-1.5 flex" />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            ))}
          </Table>
        </div>
      )}
    </>
  );
}
