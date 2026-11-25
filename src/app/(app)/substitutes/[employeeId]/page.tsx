import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, X } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import type { SubstituteOption } from "@/lib/leave/substitutes";
import { createClient } from "@/lib/supabase/server";
import { SubstitutesDenied } from "../denied";
import { AddSubstituteForm, SubstituteListTable } from "./editor";
import { loadSubstituteList } from "./load-substitute-list";

export const metadata: Metadata = { title: "Substitute list · Leave portal" };

/** Щойно доданий (redirect з addSubstitute): Alert info над списком. */
function AddedAlert({ employeeId, added }: { employeeId: string; added: SubstituteOption | undefined }) {
  if (!added) return null;
  return (
    <Alert variant="info" role="status">
      <CircleCheck />
      <AlertTitle>{added.email} added</AlertTitle>
      <AlertDescription>The employee can now choose them as the substitute for a record.</AlertDescription>
      <AlertAction>
        <Link href={`/substitutes/${employeeId}`} aria-label="Dismiss" className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
          <X />
        </Link>
      </AlertAction>
    </Alert>
  );
}

// Редактор списку замін працівника (AC-SUBST-01; D7 openspec/changes/impl-substitutes/design.md). Без права — лише
// текст AC-SUBST-12, без імен і без форми (AC-SUBST-12); запис у таблицю й так відкидає RLS (AC-SUBST-13).
export default async function SubstituteListPage({ params, searchParams }: PageProps<"/substitutes/[employeeId]">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  const { employeeId } = await params;
  const loaded = await loadSubstituteList(supabase, employeeId);
  if (loaded.kind === "denied") return <SubstitutesDenied />;
  if (loaded.kind === "failed") {
    return (
      <>
        <PageHeader title="Substitute list" />
        <Alert variant="destructive" role="alert">
          <AlertDescription>The substitute list could not be loaded. Please reload the page.</AlertDescription>
        </Alert>
      </>
    );
  }

  const { added: addedId } = await searchParams;
  const added = loaded.members.find((m) => m.id === addedId);
  return (
    <>
      <PageHeader
        title={loaded.email}
        description={["Substitute list", loaded.position].filter(Boolean).join(" · ")}
        breadcrumb={
          <Link href="/substitutes" className="text-primary underline-offset-2 hover:underline">
            ← Substitutes
          </Link>
        }
      />
      <AddedAlert employeeId={employeeId} added={added} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <SubstituteListTable employeeId={employeeId} members={loaded.members} flashId={added?.id ?? null} />
        <AddSubstituteForm employeeId={employeeId} options={loaded.options} />
      </div>
    </>
  );
}
