import type { Metadata } from "next";
import { UserRoundCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { formatDateLong, kyivDate } from "@/lib/leave/time";
import { DEPUTY_MESSAGES, DEPUTY_STATE_LABELS, deputyState } from "@/lib/staff/deputy";
import { ListTableHeader } from "../../substitutes/list-table-header";
import { staffSession } from "../admin-session";
import { StaffDenied } from "../denied";
import { loadManagerCandidates, type Person } from "../load-staff-positions";
import { AssignDeputyForm, DeputyMenu } from "./deputy-forms";

export const metadata: Metadata = { title: "Deputies · Leave portal" };

type Supabase = Awaited<ReturnType<typeof staffSession>>["supabase"];

/** Хто може бути відсутнім менеджером: той, хто відповідає хоча б за одну посаду (D9). */
async function loadResponsibleManagers(supabase: Supabase): Promise<Person[]> {
  const { data, error } = await supabase.from("position_managers").select("manager:profiles!position_managers_manager_id_fkey(id, full_name, email)");
  if (error) throw error;
  const byId = new Map<string, Person>();
  for (const row of data ?? []) {
    const m = row.manager;
    if (m) byId.set(m.id, { id: m.id, name: m.full_name ?? m.email ?? "", email: m.email ?? "" });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Заступники (AC-STAFF-09, -10, -19; D9, D10): список призначень зі станом «Current» / «Upcoming» / «Ended» за
 * сьогодні (Київ), «⋯» — «Remove», форма «Assign a deputy». Порожній список — текст AC-STAFF-19. Лише адміністратор
 * (AC-STAFF-13, -14). Два зовнішні ключі на profiles — embed лише з назвою ключа.
 */
export default async function DeputiesPage() {
  const { supabase, isAdmin } = await staffSession();
  if (!isAdmin) return <StaffDenied />;
  const today = kyivDate(new Date());

  const [{ data: rows, error: rowsError }, managers, people, { data: managerRoles, error: rolesError }] = await Promise.all([
    supabase
      .from("deputy_assignments")
      .select(
        "id, start_date, end_date, manager:profiles!deputy_assignments_manager_id_fkey(full_name, email), deputy:profiles!deputy_assignments_deputy_id_fkey(full_name, email)",
      )
      .order("start_date", { ascending: false }),
    loadResponsibleManagers(supabase),
    loadManagerCandidates(supabase),
    // Заступник — активний менеджер (D9): адміністраторів з кандидатів у менеджери посад тут не пропонуємо.
    supabase.from("profiles").select("id").eq("role", "manager").is("deactivated_at", null),
  ]);
  // Збій ролей — помилка сторінки, а не форма без кандидатів.
  const error = rowsError ?? rolesError;
  const assignments = rows ?? [];
  const managerIds = new Set((managerRoles ?? []).map((r) => r.id));
  const deputies = people.filter((p) => managerIds.has(p.id));

  return (
    <>
      <PageHeader
        title="Deputies"
        description="A deputy decides the records of an absent manager's positions on the days of the assignment."
      />
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>The deputies could not be loaded. Please reload the page.</AlertDescription>
        </Alert>
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={<UserRoundCheck className="size-5" aria-hidden="true" />}
          title={DEPUTY_MESSAGES.none}
          text="Assign a deputy below when a manager is going to be absent."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
          <Table stack>
            <ListTableHeader columns={["Absent manager", "Deputy", "Period", "State"]} last="Actions" />
            <TableBody>
              {assignments.map((a) => {
                const manager = a.manager?.full_name || a.manager?.email || "";
                const deputy = a.deputy?.full_name || a.deputy?.email || "";
                const period = `${formatDateLong(a.start_date)} – ${formatDateLong(a.end_date)}`;
                return (
                  <TableRow key={a.id} data-testid="deputy-row">
                    <TableCell className="whitespace-normal">
                      <span className="font-medium">{manager}</span>
                      <span className="block text-xs break-all text-muted-foreground">{a.manager?.email}</span>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="font-medium">{deputy}</span>
                      <span className="block text-xs break-all text-muted-foreground">{a.deputy?.email}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{period}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {DEPUTY_STATE_LABELS[deputyState(a.start_date, a.end_date, today)]}
                    </TableCell>
                    <TableCell data-cell="end" className="w-px align-top">
                      <DeputyMenu id={a.id} summary={`${deputy} for ${manager}, ${period}`} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {!rolesError && (
        <Card className="max-w-3xl gap-4">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Assign a deputy</CardTitle>
            <CardDescription>The absent manager keeps their rights too.</CardDescription>
          </CardHeader>
          <CardContent>
            <AssignDeputyForm managers={managers} deputies={deputies} today={today} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
