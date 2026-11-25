import Link from "next/link";
import { ShieldX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { STAFF_MESSAGES } from "@/lib/staff/employee";

/**
 * Відмова в доступі до сторінок працівників (AC-STAFF-13): текст AC дослівно, посилання на головну, жодних імен і
 * email (DESIGN.md, розділ 6). Та сама відповідь — коли працівника немає: не розкриваємо, хто є.
 */
export function StaffDenied() {
  return (
    <>
      <PageHeader title="Employees" />
      <EmptyState
        icon={<ShieldX className="size-5" aria-hidden="true" />}
        titleAs="h2"
        title={STAFF_MESSAGES.notAdmin}
        text="Employees, their sign-in links and roles are managed by the school administrators."
        action={
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Go to Overview
          </Link>
        }
      />
    </>
  );
}
