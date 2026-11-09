import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, Plus } from "lucide-react";
import { SchoolYearSwitcher } from "@/components/school-year-switcher";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ClosureSwatch, SchoolCalendarLegend, SchoolYearCalendar } from "@/components/ui/school-calendar";
import { formatSchoolYear, schoolYearOf } from "@/lib/leave/balance";
import {
  closuresInSchoolYear,
  type Closure,
  emptyCalendarMessage,
  formatClosureDates,
  formatClosureTime,
  toClosure,
} from "@/lib/leave/calendar";
import { buildSchoolYear } from "@/lib/leave/calendar-grid";
import { kyivDate } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { balancesQuery, MAX_SCHOOL_YEAR, MIN_SCHOOL_YEAR } from "../balances/load-balances";
import { ClosureActions } from "./closure-actions";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// «School calendar» (openspec/specs/school-calendar, design.md D5): закриття одного навчального року за датами для
// всіх, хто увійшов (AC-CAL-02); порожній рік — текст AC-CAL-15. Вигляд за розробником (DESIGN.md, розділи 5–6):
// сітка 12 місяців і поруч список тих самих закриттів — його читає зчитувач екрана, у ньому дії адміністратора. Адміністратор додає закриття на /calendar/manage і
// видаляє з меню рядка (AC-CAL-09). Гостя proxy веде на вхід, а RLS і так не дає anon читати (AC-CAL-14).
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const params = await searchParams;
  const today = kyivDate(new Date());
  const currentYear = schoolYearOf(today);
  const { year } = balancesQuery({ year: params.year }, claims.sub, currentYear);
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
          min={MIN_SCHOOL_YEAR}
          max={MAX_SCHOOL_YEAR}
          href={(y) => `/calendar?year=${y}`}
        />
      </div>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>The school calendar could not be loaded. Please reload the page.</AlertDescription>
        </Alert>
      ) : (
        // Від lg список праворуч від сітки, вужче — під нею (ADR 0008).
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card className="gap-5 px-3 md:px-5">
            <SchoolYearCalendar months={buildSchoolYear(year, closures, today)} />
            <SchoolCalendarLegend className="border-t border-border pt-4" />
          </Card>
          {closures.length === 0 ? (
            <EmptyState title={emptyCalendarMessage(year)} />
          ) : (
            <ClosuresList closures={closures} isAdmin={isAdmin} added={added} />
          )}
        </div>
      )}
    </>
  );
}

/** Закриття навчального року за датою початку; у адміна — «⋯» → «Remove closure» (AC-CAL-09). */
function ClosuresList({ closures, isAdmin, added }: { closures: Closure[]; isAdmin: boolean; added: number }) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold">Closures</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{closures.length}</span>
      </div>
      <ul>
        {closures.map((c) => {
          const dates = formatClosureDates(c);
          const time = formatClosureTime(c);
          return (
            <li
              key={c.id}
              data-testid="closure"
              className={cn(
                "flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0",
                c.id === added && "animate-row-flash",
              )}
            >
              <ClosureSwatch early={time != null} className="mt-0.5" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">{c.name}</span>
                <span className="tabular-nums">{dates}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {time ? `Early dismissal ${time}` : "Whole days"}
                </span>
              </div>
              {isAdmin && <ClosureActions closureId={c.id} name={c.name} dates={dates} time={time} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
