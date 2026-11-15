"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { closeUnlessDraft, Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AssistantForm } from "./assistant-form";

/** Є що загубити: набраний текст календаря чи пропозиції, ще не збережені. */
function hasDraft(popup: Element | null): boolean {
  const text = popup?.querySelector("textarea")?.value.trim();
  return Boolean(text) || Boolean(popup?.querySelector("[data-suggestion]"));
}

/**
 * Помічник календаря — панель справа на «School calendar» (design.md D1): сітку року видно під панеллю, а
 * пропозиції підсвічені на ній до збереження. Відкрита, коли в посиланні є `?assistant=1`; закрити — повернутись до
 * календаря того ж року. Esc і клік повз панель не закривають її, поки є набраний текст чи пропозиції (щоб не
 * загубити їх); хрестик і «Back to calendar» закривають завжди. Телефон (ADR 0008) — панель на весь екран.
 * Не адміністратор за прямим посиланням бачить у панелі лише пояснення, без форми (AC-ASSIST-11).
 */
export function AssistantSheet({
  closeHref,
  today,
  denied,
}: {
  closeHref: string;
  today: string;
  /** Повідомлення відмови (AC-ASSIST-11) або null — адміністратор. */
  denied: string | null;
}) {
  const router = useRouter();
  const close = () => router.replace(closeHref, { scroll: false });
  return (
    <Sheet open onOpenChange={closeUnlessDraft(close, hasDraft)}>
      <SheetContent className="max-md:max-w-none max-md:border-0">
        <SheetHeader
          className="border-b-0"
          closeClassName="max-md:hidden"
          leading={
            <Button variant="ghost" size="icon" className="-ml-2 size-11 md:hidden" aria-label="Back to calendar" onClick={close}>
              <ChevronLeft className="size-5" />
            </Button>
          }
        >
          <SheetTitle className="text-lg leading-6">Calendar assistant</SheetTitle>
          <SheetDescription className="whitespace-normal">
            Paste the school calendar text, review the suggested closures, and save the ones that are right.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="pt-1 pb-0">
          {denied ? (
            <EmptyState
              titleAs="h2"
              icon={<ShieldX className="size-5" aria-hidden="true" />}
              title={denied}
              text="You can see the school calendar, but only an administrator adds closures."
            />
          ) : (
            <AssistantForm today={today} />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
