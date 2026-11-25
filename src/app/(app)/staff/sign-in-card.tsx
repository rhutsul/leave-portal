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
import { INITIAL_STAFF_STATE, type EmployeeStatus as Status, type StaffActionState } from "@/lib/staff/employee";
import { issueLink, setActive } from "./actions";
import { LinkCard } from "./link-card";

type FormAction = (payload: FormData) => void;

function ActionAlert({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/**
 * Видане посилання, яке ще можна показати: успішна деактивація відкликає посилання людини, тож після реактивації
 * картка відкликаного токена не повертається (рев'ю CodeRabbit). Невдала деактивація посилання не чіпає.
 */
function useShownLink(linkState: StaffActionState, activeState: StaffActionState) {
  const [revoked, setRevoked] = useState<string | null>(null);
  const [seenActive, setSeenActive] = useState(activeState);
  if (seenActive !== activeState) {
    setSeenActive(activeState);
    if (activeState.done && linkState.link) setRevoked(linkState.link.token);
  }
  const link = linkState.done ? linkState.link : null;
  return link && link.token !== revoked ? link : null;
}

/** Підтвердження деактивації (незворотна для входу дія — DESIGN.md, розділ 2): питання, наслідок, «Deactivate» і «Back». */
function DeactivateDialog({
  open,
  onOpenChange,
  action,
  employeeId,
  name,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: FormAction;
  employeeId: string;
  name: string;
  error: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form action={action} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Deactivate {name}?</DialogTitle>
            <DialogDescription>
              They cannot sign in any more. Their records and balances stay in the history and the register.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="employee_id" value={employeeId} />
          <input type="hidden" name="intent" value="deactivate" />
          <ActionAlert message={error} />
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Back</DialogClose>
            <SubmitButton variant="destructive" pendingLabel="Deactivating…">
              Deactivate
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** «Reactivate» для деактивованого; «Deactivate» (відкриває діалог) — для решти, крім себе (розробник, D4). */
function ActiveButton({
  deactivated,
  own,
  action,
  employeeId,
  onDeactivate,
}: {
  deactivated: boolean;
  own: boolean;
  action: FormAction;
  employeeId: string;
  onDeactivate: () => void;
}) {
  if (deactivated) {
    return (
      <form action={action} className="max-sm:w-full">
        <input type="hidden" name="employee_id" value={employeeId} />
        <input type="hidden" name="intent" value="reactivate" />
        <SubmitButton variant="secondary" pendingLabel="Reactivating…" className="max-sm:w-full pointer-coarse:h-11">
          <UserCheck />
          Reactivate
        </SubmitButton>
      </form>
    );
  }
  if (own) return null;
  return (
    <Button type="button" variant="outline" onClick={onDeactivate} className="max-sm:w-full pointer-coarse:h-11">
      <UserX />
      Deactivate
    </Button>
  );
}

/**
 * Вхід працівника (AC-STAFF-01, -02, -08; D10): статус словом, нове одноразове посилання (попереднє стає недійсним),
 * деактивація через Dialog і реактивація. Себе адміністратор не деактивує — кнопки немає, а база однаково відмовляє.
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
  const shownLink = useShownLink(linkState, activeState);
  const deactivated = status === "deactivated";
  // Помилка деактивації — у діалозі; реактивації — під кнопками.
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
          <ActiveButton
            deactivated={deactivated}
            own={own}
            action={activeAction}
            employeeId={employeeId}
            onDeactivate={() => setConfirming(true)}
          />
        </div>
      </div>

      {deactivated && (
        <>
          <p className="text-xs text-muted-foreground">
            This person cannot sign in. Their records and balances stay in the history and the register.
          </p>
          <ActionAlert message={activeError} />
        </>
      )}
      <ActionAlert message={linkState.done ? "" : linkState.message} />
      {shownLink && !deactivated && (
        <>
          <p role="status" className="text-xs text-muted-foreground">
            A new link is ready. Any earlier link for this person no longer works.
          </p>
          <LinkCard link={shownLink} />
        </>
      )}

      <DeactivateDialog
        open={confirming && !deactivated}
        onOpenChange={setConfirming}
        action={activeAction}
        employeeId={employeeId}
        name={name}
        error={activeError}
      />
    </div>
  );
}
