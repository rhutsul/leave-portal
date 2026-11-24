"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NoteField } from "@/components/ui/note-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { requestCancellation, type CancelRequestState } from "./actions";

const INITIAL: CancelRequestState = { message: "", field: false };

/**
 * Форма прохання (D12): запис (RecordSummary), причина — NoteField (Textarea з Label і лічильником), основна дія
 * «Request cancellation». Прохання не незворотне (вирішує менеджер), тому без Dialog. На телефоні кнопки прикріплені
 * внизу з відступом від смуги жестів (DESIGN.md, розділ 12). Поле кероване: після помилки введене лишається.
 */
export function CancelRequestForm({ recordId, summary }: { recordId: number; summary: ReactNode }) {
  const [state, action] = useActionState(requestCancellation, INITIAL);
  const [reason, setReason] = useState("");

  return (
    <form action={action} className="flex flex-col gap-5 max-md:pb-24">
      <input type="hidden" name="record_id" value={recordId} />
      {state.message && !state.field && (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <Card className="gap-4 px-5 py-5">
        {summary}
        <NoteField
          name="reason"
          label="Reason"
          hint="Your manager sees the reason with the request."
          placeholder="For example: Plans changed"
          value={reason}
          error={state.field ? state.message : null}
          onChange={setReason}
        />
      </Card>
      <div className="flex items-center gap-2 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-10 max-md:grid max-md:grid-cols-[auto_1fr] max-md:border-t max-md:border-border max-md:bg-popover/95 max-md:px-4 max-md:pt-3 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] max-md:backdrop-blur-md max-md:*:h-11">
        <Link href="/requests" className={buttonVariants({ variant: "outline" })}>
          Back
        </Link>
        <SubmitButton pendingLabel="Requesting…">Request cancellation</SubmitButton>
      </div>
    </form>
  );
}
