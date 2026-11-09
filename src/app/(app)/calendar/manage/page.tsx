import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { kyivDate } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import { MAX_SCHOOL_YEAR, MIN_SCHOOL_YEAR } from "../../balances/load-balances";
import { loadClosures } from "../load-closures";
import { manageAccess } from "./access";
import { ClosureForm } from "./closure-form";

// Сторінка зміни шкільного календаря (AC-CAL-12): лише адміністратор. Інший користувач за прямим посиланням бачить
// пояснення без форми й даних (DESIGN.md, розділ 6); календар не змінюється — і дія, і база перевіряють роль удруге.
export default async function ManageCalendarPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle();
  const access = manageAccess(profile?.role ?? null);

  const breadcrumb = (
    <Link href="/calendar" className="hover:text-foreground">
      School calendar
    </Link>
  );

  if (!access.allowed) {
    return (
      <>
        <PageHeader title="Change the school calendar" breadcrumb={breadcrumb} />
        <EmptyState
          titleAs="h2"
          icon={<ShieldX className="size-5" aria-hidden="true" />}
          title={access.message}
          text="You can see the school calendar, but only an administrator adds or removes closures."
          action={
            <Link href="/calendar" className={buttonVariants({ variant: "outline" })}>
              Go to School calendar
            </Link>
          }
        />
      </>
    );
  }

  // Наявні закриття для перегляду поруч із формою (вигляд за розробником): перетин усе одно відхиляє база (AC-CAL-11),
  // тож без них форма працює — перегляд лише каже, що їх не показано.
  const closures = await loadClosures(supabase, `${MIN_SCHOOL_YEAR}-09-01`, `${MAX_SCHOOL_YEAR + 1}-08-31`).catch(
    () => null,
  );

  return (
    <>
      <PageHeader
        title="Add closure"
        breadcrumb={breadcrumb}
        description="A closure applies to the whole school. Days with leave records awaiting a decision, returned or approved cannot be closed."
      />
      <ClosureForm closures={closures} today={kyivDate(new Date())} />
    </>
  );
}
