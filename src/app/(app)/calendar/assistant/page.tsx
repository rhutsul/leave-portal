import Link from "next/link";
import { ShieldX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { kyivDate } from "@/lib/leave/time";
import { adminSession } from "../admin-session";
import { AssistantForm } from "./assistant-form";

// Помічник календаря (AC-ASSIST-11, design.md D1): лише адміністратор. Інший користувач за прямим посиланням бачить
// пояснення без форми й даних; дії й база перевіряють роль удруге, тож модель не викликається, а закриття не пишуться.
export default async function CalendarAssistantPage() {
  const { access } = await adminSession();

  const breadcrumb = (
    <Link href="/calendar" className="hover:text-foreground">
      School calendar
    </Link>
  );

  if (!access.allowed) {
    return (
      <>
        <PageHeader title="Calendar assistant" breadcrumb={breadcrumb} />
        <EmptyState
          titleAs="h2"
          icon={<ShieldX className="size-5" aria-hidden="true" />}
          title={access.message}
          text="You can see the school calendar, but only an administrator adds closures."
          action={
            <Link href="/calendar" className={buttonVariants({ variant: "outline" })}>
              Go to School calendar
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Calendar assistant"
        breadcrumb={breadcrumb}
        description="Paste the school calendar text, review the suggested closures, and save the ones that are right."
      />
      <AssistantForm today={kyivDate(new Date())} />
    </>
  );
}
