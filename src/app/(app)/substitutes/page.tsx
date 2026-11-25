import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, UsersRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { substituteCount } from "@/lib/leave/substitutes";
import { createClient } from "@/lib/supabase/server";
import { SubstitutesDenied } from "./denied";
import { ListTableHeader } from "./list-table-header";

export const metadata: Metadata = { title: "Substitutes · Leave portal" };

// Списки замін (D7 openspec/changes/impl-substitutes/design.md): менеджер — працівники його посад, адміністратор — усі
// (manageable_employees()). Рядок цілком — посилання на редактор списку, праворуч стрілка (як черга «Decisions»).
// Працівник за прямим посиланням — текст AC-SUBST-12 без даних.
export default async function SubstitutesPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  const [{ data: profile }, { data: rows, error }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", data.claims.sub).maybeSingle(),
    supabase.rpc("manageable_employees"),
  ]);
  if (profile?.role !== "manager" && profile?.role !== "admin") return <SubstitutesDenied />;

  const employees = rows ?? [];
  return (
    <>
      <PageHeader
        title="Substitutes"
        description={
          profile.role === "admin"
            ? "Each employee's substitute list. Employees choose a substitute for a record only from their list."
            : "Substitute lists of the employees of your positions. Employees choose a substitute only from their list."
        }
      />
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>The employees could not be loaded. Please reload the page.</AlertDescription>
        </Alert>
      ) : employees.length === 0 ? (
        <EmptyState
          icon={<UsersRound className="size-5" aria-hidden="true" />}
          title="No employees in your positions"
          text="Employees of the positions you are responsible for will appear here."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
          <Table stack>
            <ListTableHeader columns={["Employee", "Substitute list"]} last="Open" />
            <TableBody>
              {employees.map((e) => (
                // Увесь рядок відкриває редактор: посилання в першій клітинці розтягнуто на рядок (after:inset-0).
                <TableRow key={e.employee_id} data-testid="substitute-employee" className="relative cursor-pointer">
                  <TableCell className="min-w-44 whitespace-normal">
                    <Link
                      href={`/substitutes/${e.employee_id}`}
                      className="font-medium break-all text-foreground outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
                    >
                      {e.email}
                    </Link>
                    {e.main_title && (
                      <span className="block text-xs text-muted-foreground">
                        {e.division_name ? `${e.division_name} / ${e.main_title}` : e.main_title}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {substituteCount(e.substitute_count)}
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
