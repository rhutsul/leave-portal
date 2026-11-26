import Link from "next/link";
import { ShieldX, UsersRound } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ON_BEHALF_MESSAGES } from "@/lib/leave/on-behalf";

/**
 * Відмова чи порожній стан заявки від імені (D11): текст бази дослівно (AC-BEHALF-11, AC-BEHALF-12, AC-BEHALF-15),
 * жодних імен і email. Менеджер без працівників — `UsersRound` без дії; відмова в доступі — `ShieldX` і одна дія.
 */
export function OnBehalfRefusal({ message }: { message: string }) {
  if (message === ON_BEHALF_MESSAGES.noEmployees) {
    return (
      <EmptyState
        icon={<UsersRound className="size-5" aria-hidden="true" />}
        titleAs="h2"
        title={message}
        text="Employees of the positions you are responsible for will appear here."
      />
    );
  }
  const notYours = message === ON_BEHALF_MESSAGES.notYourEmployee;
  return (
    <EmptyState
      icon={<ShieldX className="size-5" aria-hidden="true" />}
      titleAs="h2"
      title={message}
      action={
        <Link href={notYours ? "/on-behalf" : "/"} className={buttonVariants({ variant: "outline" })}>
          {notYours ? "Back to the list" : "Go to Overview"}
        </Link>
      }
    />
  );
}
