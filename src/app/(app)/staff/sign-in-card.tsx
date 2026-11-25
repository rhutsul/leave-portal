"use client";

import { useActionState, useState } from "react";
import { CircleAlert, KeyRound, UserCheck, UserX } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmployeeStatus } from "@/components/ui/employee-status";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_STAFF_STATE, type EmployeeStatus as Status } from "@/lib/staff/employee";
import { issueLink, setActive } from "./actions";
import { LinkCard } from "./link-card";

/**
 * Вхід працівника (AC-STAFF-01, -02, -08; D10): статус словом, нове одноразове посилання (попереднє стає недійсним),
 * деактивація через Dialog (незворотна для входу дія — DESIGN.md, розділ 2) і реактивація. Себе адміністратор не
 * деактивує (розробник, D4) — кнопки немає, а база однаково відмовляє.
 */
export function SignInCard({
  employeeId,
  name,
  email,
  status,
  own,
}: {
  employeeId: string;
  name: string;
  email: string;
  status: Status;
  own: boolean;
}) {
  const [linkState, linkAction] = useActionState(issueLink, INITIAL_STAFF_STATE);
  const [activeState, activeAction] = useActionState(setActive, INITIAL_STAFF_STATE);
  const [confirming, setConfirming] = useState(false);
  // Успішна деактивація відкликає видані посилання: після реактивації картка відкликаного токена не повертається.
  const [revoked, setRevoked] = useState<string | null>(null);
  const [seenActive, setSeenActive] = useState(activeState);
  if (seenActive !== activeState) {
    setSeenActive(activeState);
    if (activeState.done && linkState.link) setRevoked(linkState.link.token);
  }
  const shownLink = linkState.done && linkState.link && linkState.link.token !== revoked ? linkState.link : null;
  const deactivated = status === "deactivated";
  // Помилка деактивації показується в діалозі; реактивації — під кнопками.
  const activeError = activeState.done ? "" : activeState.message;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Status</span>
          <EmployeeStatus status={status} />
        </div>
        <div className="flex flex-wrap gap-2 max-sm:w-full">
          {!deactivated && (
            <form action={linkAction} className="max-sm:w-full">
              <input type="hidden" name="employee_id" value={employeeId} />
              <input type="hidden" name="email" value={email} />
              <SubmitButton variant="secondary" pendingLabel="Creating…" className="max-sm:w-full pointer-coarse:h-11">
                <KeyRound />
                Create a sign-in link
              </SubmitButton>
            </form>
          )}
          {deactivated ? (
            <form action={activeAction} className="max-sm:w-full">
              <input type="hidden" name="employee_id" value={employeeId} />
              <input type="hidden" name="intent" value="reactivate" />
              <SubmitButton variant="secondary" pendingLabel="Reactivating…" className="max-sm:w-full pointer-coarse:h-11">
                <UserCheck />
                Reactivate
              </SubmitButton>
            </form>
          ) : (
            !own && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirming(true)}
                className="max-sm:w-full pointer-coarse:h-11"
              >
                <UserX />
                Deactivate
              </Button>
            )
          )}
        </div>
      </div>

      {deactivated && (
        <p className="text-xs text-muted-foreground">
          This person cannot sign in. Their records and balances stay in the history and the register.
        </p>
      )}
      {deactivated && activeError && (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertDescription>{activeError}</AlertDescription>
        </Alert>
      )}
      {linkState.message && !linkState.done && (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertDescription>{linkState.message}</AlertDescription>
        </Alert>
      )}
      {shownLink && !deactivated && (
        <>
          <p role="status" className="text-xs text-muted-foreground">
            A new link is ready. Any earlier link for this person no longer works.
          </p>
          <LinkCard link={shownLink} />
        </>
      )}

      <Dialog open={confirming && !deactivated} onOpenChange={setConfirming}>
        <DialogContent>
          <form action={activeAction} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Deactivate {name}?</DialogTitle>
              <DialogDescription>
                They cannot sign in any more. Their records and balances stay in the history and the register.
              </DialogDescription>
            </DialogHeader>
            <input type="hidden" name="employee_id" value={employeeId} />
            <input type="hidden" name="intent" value="deactivate" />
            {activeError && (
              <Alert variant="destructive" role="alert">
                <CircleAlert />
                <AlertDescription>{activeError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>Back</DialogClose>
              <SubmitButton variant="destructive" pendingLabel="Deactivating…">
                Deactivate
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
