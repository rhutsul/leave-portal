"use client";

import { useActionState, useState } from "react";
import { CircleAlert, Trash2 } from "lucide-react";
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
import { RecordSummary } from "@/components/ui/record-summary";
import { RowMenu } from "@/components/ui/row-menu";
import { SubmitButton } from "@/components/ui/submit-button";
import { removeClosure, type ClosureActionState } from "./actions";

const INITIAL: ClosureActionState = { message: "", done: false };

/**
 * Дія адміністратора з рядком календаря (AC-CAL-09): «⋯» → «Remove closure» → Dialog з підсумком. Видалення не змінює
 * записів — дні знову стають робочими за розкладами; закриття можна додати знову, але Dialog однаково питає, бо
 * зміна діє на всю школу одразу.
 */
export function ClosureActions({ closureId, name, dates, time }: { closureId: number; name: string; dates: string; time: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(removeClosure, INITIAL);
  // Після успіху рядок зникає разом із компонентом; помилку показуємо в діалозі.
  const error = !state.done ? state.message : "";

  return (
    <>
      <RowMenu
        label={`Actions for closure ${name}`}
        items={[{ label: "Remove closure", icon: <Trash2 />, onSelect: () => setOpen(true), destructive: true }]}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form action={action} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Remove this closure?</DialogTitle>
              <DialogDescription>These days become working days again according to the schedules.</DialogDescription>
            </DialogHeader>
            <RecordSummary date={dates} hours={time ?? "Whole days"} meta={name} />
            <input type="hidden" name="closure_id" value={closureId} />
            {error && (
              <Alert variant="destructive" role="alert">
                <CircleAlert />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>Back</DialogClose>
              <SubmitButton variant="destructive" pendingLabel="Removing…">
                Remove closure
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
