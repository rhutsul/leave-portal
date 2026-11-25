"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { CircleAlert, UserMinus, UsersRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { RowMenu } from "@/components/ui/row-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { SubstituteOption } from "@/lib/leave/substitutes";
import { cn } from "@/lib/utils";
import { addSubstitute, removeSubstitute, type SubstituteActionState } from "../actions";
import { ListTableHeader } from "../list-table-header";

const INITIAL: SubstituteActionState = { message: "" };

/**
 * Список замін працівника (AC-SUBST-01): email і основна посада; дія рядка — лише в «⋯» (DESIGN.md, розділ 5):
 * «Remove from list», `destructive`. Прибирання оборотне (людину можна додати знову) і наявних записів не змінює —
 * тому без Dialog.
 */
export function SubstituteListTable({
  employeeId,
  members,
  flashId,
}: {
  employeeId: string;
  members: SubstituteOption[];
  /** Щойно доданий — рядок спалахує highlight один раз. */
  flashId: string | null;
}) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function remove(substituteId: string) {
    setMessage("");
    startTransition(async () => {
      const result = await removeSubstitute(employeeId, substituteId);
      setMessage(result.message);
    });
  }

  return (
    <Card className="gap-4" aria-busy={pending || undefined}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Substitute list</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 max-md:px-0">
        {message && (
          <Alert variant="destructive" role="alert">
            <CircleAlert />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {members.length === 0 ? (
          <EmptyState
            icon={<UsersRound className="size-5" aria-hidden="true" />}
            title="No substitutes yet"
            text="Add the people who can cover for this employee. The employee chooses a substitute only from this list."
            className="py-8"
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border max-md:overflow-visible max-md:border-0">
            <Table stack>
              <ListTableHeader columns={["Substitute", "Main position"]} last="Actions" />
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id} data-testid="substitute-member" className={cn(m.id === flashId && "animate-row-flash")}>
                    <TableCell className="break-all">{m.email}</TableCell>
                    <TableCell className="text-muted-foreground">{m.position || "—"}</TableCell>
                    <TableCell data-cell="end" className="w-px align-top">
                      <RowMenu
                        label={`Actions for ${m.email}`}
                        items={[
                          {
                            label: "Remove from list",
                            icon: <UserMinus />,
                            destructive: true,
                            disabled: pending,
                            onSelect: () => remove(m.id),
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Додати людину (AC-SUBST-01): Select кандидатів (усі, крім самого працівника й тих, хто вже в списку) і одна основна
 * дія «Add to list». Помилка (AC-SUBST-12, дубль) — під полем, межа destructive.
 */
export function AddSubstituteForm({ employeeId, options }: { employeeId: string; options: SubstituteOption[] }) {
  const ids = useId();
  const [state, formAction] = useActionState(addSubstitute, INITIAL);
  const [chosen, setChosen] = useState<string | null>(null);
  const items = options.map((o) => ({ value: o.id, label: o.email, hint: o.position }));
  const errorId = `${ids}-error`;

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Add a substitute</CardTitle>
      </CardHeader>
      <CardContent>
        {options.length === 0 ? (
          <p className="text-muted-foreground">Everyone who can be added is already on the list.</p>
        ) : (
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="employeeId" value={employeeId} />
            <input type="hidden" name="substituteId" value={chosen ?? ""} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-person`}>Person</Label>
              <Select value={chosen} items={items} onValueChange={(value) => setChosen(value ? String(value) : null)}>
                <SelectTrigger
                  id={`${ids}-person`}
                  className="w-full pointer-coarse:h-11"
                  aria-invalid={state.message ? true : undefined}
                  aria-describedby={state.message ? errorId : undefined}
                >
                  <SelectValue placeholder="Choose a person…" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                      {item.hint && <span className="text-muted-foreground"> · {item.hint}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id={errorId} message={state.message || null} />
            </div>
            <SubmitButton pendingLabel="Adding…" className="self-start max-md:w-full pointer-coarse:h-11">
              Add to list
            </SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
