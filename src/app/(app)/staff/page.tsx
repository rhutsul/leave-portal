import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus, UsersRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { EmployeeStatus } from "@/components/ui/employee-status";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { isEmployeeStatus, roleLabel } from "@/lib/staff/employee";
import { cn } from "@/lib/utils";
import { ListTableHeader } from "../substitutes/list-table-header";
import { staffSession } from "./admin-session";
import { StaffDenied } from "./denied";

export const metadata: Metadata = { title: "Employees · Leave portal" };

/**
 * Працівники (AC-STAFF-01, -02, -08; D10 openspec/changes/impl-staff-management/design.md): лише адміністратор
 * (AC-STAFF-13), гостя веде на вхід проксі (AC-STAFF-15). Рядок цілком — посилання на сторінку працівника (як черга
 * «Decisions» і списки замін), праворуч стрілка; деактивовані — унизу, теж зі статусом словом.
 */
export default async function StaffPage() {
  const { supabase, isAdmin } = await staffSession();
  if (!isAdmin) return <StaffDenied />;

  const { data: rows, error } = await supabase.rpc("staff_employees");
  const employees = rows ?? [];

  return (
    <>
      <PageHeader
        title="Employees"
        description="Everyone who can sign in to the portal, their role and main position."
        actions={
          <Link href="/staff/new" className={buttonVariants()}>
            <Plus />
            Add employee
          </Link>
        }
      />
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>The employees could not be loaded. Please reload the page.</AlertDescription>
        </Alert>
      ) : employees.length === 0 ? (
        <EmptyState
          icon={<UsersRound className="size-5" aria-hidden="true" />}
          title="No employees yet"
          text="Add an employee and give them the one-time sign-in link."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
          <Table stack>
            <ListTableHeader columns={["Employee", "Role", "Main position", "Status"]} last="Open" />
            <TableBody>
              {employees.map((e) => (
                <TableRow
                  key={e.id}
                  data-testid="staff-row"
                  className={cn("relative cursor-pointer", e.deactivated_at && "text-muted-foreground")}
                >
                  <TableCell className="min-w-44 whitespace-normal">
                    {/* Увесь рядок відкриває сторінку працівника: посилання розтягнуто на рядок (after:inset-0). */}
                    <Link
                      href={`/staff/${e.id}`}
                      className="font-medium text-foreground outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
                    >
                      {e.full_name || e.email}
                    </Link>
                    <span className="block text-xs break-all text-muted-foreground">{e.email}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{roleLabel(e.role)}</TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">{e.main_position || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {isEmployeeStatus(e.status) ? <EmployeeStatus status={e.status} /> : e.status}
                  </TableCell>
                  <TableCell data-cell="end" className="w-px text-muted-foreground max-md:p-2.5!">
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
