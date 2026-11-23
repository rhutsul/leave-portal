"use client";

import { useActionState, useId, useState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  hasPasswordErrors,
  INITIAL_CHANGE_PASSWORD,
  MIN_PASSWORD_LENGTH,
  passwordFieldErrors,
  type PasswordField,
  type PasswordFields,
} from "@/lib/account/password";
import { changePassword } from "./actions";

const EMPTY: PasswordFields = { current: "", next: "", confirm: "" };

const FIELDS: { field: PasswordField; name: string; label: string; autoComplete: string; hint?: string }[] = [
  { field: "current", name: "current_password", label: "Current password", autoComplete: "current-password" },
  {
    field: "next",
    name: "new_password",
    label: "New password",
    autoComplete: "new-password",
    hint: `At least ${MIN_PASSWORD_LENGTH} characters.`,
  },
  { field: "confirm", name: "confirm_password", label: "Confirm new password", autoComplete: "new-password" },
];

/**
 * Форма «Change password» (ADR 0011). Поля — керовані: після помилки введене лишається (DESIGN.md, розділ 6), після
 * успіху — форма порожня. Помилки полів — після спроби відправити, і зникають, щойно поле виправлено; server action
 * перевіряє те саме ще раз і додає те, що знає лише Auth (неправильний поточний пароль, слабкий пароль).
 */
export function ChangePasswordForm() {
  const ids = useId();
  const [state, action] = useActionState(changePassword, INITIAL_CHANGE_PASSWORD);
  const [fields, setFields] = useState<PasswordFields>(EMPTY);
  const [tried, setTried] = useState(false);
  // Поля, змінені після останньої відповіді дії: їхню помилку з сервера вже не показуємо (поле виправляють), а
  // повідомлення всієї дії ховаємо, щойно змінено будь-яке поле. Нова відповідь — список знову порожній.
  const [touched, setTouched] = useState<PasswordField[]>([]);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    setTouched([]);
    if (state.done) {
      setFields(EMPTY);
      setTried(false);
    }
  }
  const edited = touched.length > 0;

  const local = passwordFieldErrors(fields);
  const errorOf = (field: PasswordField) =>
    (tried ? local[field] : null) ?? (touched.includes(field) ? null : state.errors[field]);
  const errors = { current: errorOf("current"), next: errorOf("next"), confirm: errorOf("confirm") };

  function change(field: PasswordField, value: string) {
    setFields((was) => ({ ...was, [field]: value }));
    setTouched((was) => (was.includes(field) ? was : [...was, field]));
  }

  return (
    <form
      action={action}
      noValidate
      onSubmit={(event) => {
        // Свої тексти замість браузерних підказок; server action перевіряє те саме ще раз.
        if (!hasPasswordErrors(local)) return;
        event.preventDefault();
        setTried(true);
      }}
      className="flex max-w-md flex-col gap-4"
    >
      {state.done && !edited && (
        <Alert variant="info" role="status">
          <CircleCheck />
          <AlertTitle>Password changed</AlertTitle>
          <AlertDescription>Use the new password next time you sign in.</AlertDescription>
        </Alert>
      )}

      {FIELDS.map(({ field, name, label, autoComplete, hint }) => {
        const id = `${ids}-${field}`;
        const error = errors[field];
        // Під полем — або помилка, або підказка: поле описує те, що видно.
        const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
        return (
          <div key={field} className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <PasswordInput
              id={id}
              name={name}
              autoComplete={autoComplete}
              aria-required="true"
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              value={fields[field]}
              onChange={(event) => change(field, event.target.value)}
            />
            <FieldError id={`${id}-error`} message={error} />
            {hint && !error && (
              <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                {hint}
              </p>
            )}
          </div>
        );
      })}

      {state.message && !edited && (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Changing…" className="max-sm:w-full pointer-coarse:h-11">
          Change password
        </SubmitButton>
      </div>
    </form>
  );
}
