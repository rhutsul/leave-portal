import Link from "next/link";
import { ShieldX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SUBSTITUTE_MESSAGES } from "@/lib/leave/substitutes";

/**
 * Відмова в доступі до списку замін (AC-SUBST-12): текст AC дослівно, посилання на головну, жодних імен і email
 * (DESIGN.md, розділ 6). Та сама відповідь — коли працівника немає чи id нечитабельний: не розкриваємо, хто є.
 */
export function SubstitutesDenied() {
  return (
    <>
      <PageHeader title="Substitutes" />
      <EmptyState
        icon={<ShieldX className="size-5" aria-hidden="true" />}
        titleAs="h2"
        title={SUBSTITUTE_MESSAGES.notManager}
        text="Substitute lists are kept by the managers of the employee's positions and by administrators."
        action={
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Go to Overview
          </Link>
        }
      />
    </>
  );
}
