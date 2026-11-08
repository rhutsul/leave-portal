import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, Plus } from "lucide-react";
import { SchoolYearSwitcher } from "@/components/school-year-switcher";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSchoolYear, schoolYearOf } from "@/lib/leave/balance";
import {
  closuresInSchoolYear,
  emptyCalendarMessage,
  formatClosureDates,
  formatClosureTime,
  toClosure,
} from "@/lib/leave/calendar";
import { kyivDate } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { ClosureActions } from "./closure-actions";

const MIN_YEAR = 2000;
const MAX_YEAR = 2099;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// «School calendar» (openspec/specs/school-calendar, design.md D5): закриття одного навчального року за датами для
// всіх, хто увійшов (AC-CAL-02); порожній рік — текст AC-CAL-15. Адміністратор додає закриття на /calendar/manage і
// видаляє з меню рядка (AC-CAL-09). Гостя proxy веде на вхід, а RLS і так не дає anon читати (AC-CAL-14).
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const params = await searchParams;
  const currentYear = schoolYearOf(kyivDate(new Date()));
  const asked = Number(first(params.year));
  const year = Number.isInteger(asked) && asked >= MIN_YEAR && asked <= MAX_YEAR ? asked : currentYear;
  const added = Number(first(params.added));

  const [{ data: profile }, { data: rows, error }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle(),
    supabase
      .from("school_closures")
      .select("id, name, start_date, end_date, closes_at")
      .lte("start_date", `${year + 1}-08-31`)
      .gte("end_date", `${year}-09-01`),
  ]);
  const isAdmin = profile?.role === "admin";
  const closures = closuresInSchoolYear((rows ?? []).map(toClosure), year);
  const justAdded = closures.find((c) => c.id === added);

  return (
    <>
      <PageHeader
        title="School calendar"
        description="Holidays, school breaks and early dismissals of the whole school. Closed days and hours cannot be taken as leave."
        actions={
          isAdmin && (
            <Link href="/calendar/manage" className={buttonVariants()}>
              <Plus />
              Add closure
            </Link>
          )
        }
      />

      {justAdded && (
        <Alert variant="info" role="status">
          <CircleCheck />
          <AlertTitle>Closure added</AlertTitle>
          <AlertDescription>
            {justAdded.name} · {formatClosureDates(justAdded)}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
        <h2 className="text-base font-semibold">School year {formatSchoolYear(year)}</h2>
        <SchoolYearSwitcher
          year={year}
          current={currentYear}
          min={MIN_YEAR}
          max={MAX_YEAR}
          href={(y) => `/calendar?year=${y}`}
        />
      </div>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>The school calendar could not be loaded. Please reload the page.</AlertDescription>
        </Alert>
      ) : closures.length === 0 ? (
        <EmptyState title={emptyCalendarMessage(year)} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
          <Table stack>
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead>Dates</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Closed</TableHead>
                {isAdmin && (
                  <TableHead className="w-px">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {closures.map((c) => {
                const dates = formatClosureDates(c);
                const time = formatClosureTime(c);
                return (
                  <TableRow
                    key={c.id}
                    data-testid="closure"
                    className={cn(c.id === added && "animate-row-flash")}
                  >
                    <TableCell className="whitespace-nowrap tabular-nums">{dates}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {time ? `Early dismissal ${time}` : "Whole days"}
                    </TableCell>
                    {isAdmin && (
                      <TableCell data-cell="end" className="w-px align-top">
                        <ClosureActions closureId={c.id} name={c.name} dates={dates} time={time} />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
