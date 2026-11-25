"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_STAFF_STATE, ROLES, STAFF_MESSAGES, type EmployeeErrors, type Role } from "@/lib/staff/employee";
import { createEmployee, setRole, updateEmployee } from "./actions";
import { LinkCard } from "./link-card";

// На дотику — поле 44 px заввишки (ADR 0008); шрифт 16 px дає сам Input.
const TOUCH = "pointer-coarse:h-11";

/** Ім'я й email з підписами й помилками під полями (DESIGN.md, розділи 5–7). */
function NameEmailFields({
  errors,
  name,
  email,
  disabled,
}: {
  errors: EmployeeErrors;
  name?: string;
  email?: string;
  disabled?: boolean;
}) {
  const ids = useId();
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-name`}>Name</Label>
        <Input
          id={`${ids}-name`}
          name="full_name"
          autoComplete="off"
          defaultValue={name}
          disabled={disabled}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${ids}-name-error` : undefined}
          className={TOUCH}
        />
        <FieldError id={`${ids}-name-error`} message={errors.name} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-email`}>Email</Label>
        <Input
          id={`${ids}-email`}
          name="email"
          type="email"
          autoComplete="off"
          spellCheck={false}
          defaultValue={email}
          disabled={disabled}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? `${ids}-email-error` : undefined}
          className={TOUCH}
        />
        <FieldError id={`${ids}-email-error`} message={errors.email} />
      </div>
    </>
  );
}

function RoleSelect({
  value,
  onChange,
  disabled,
  describedBy,
}: {
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  const ids = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${ids}-role`}>Role</Label>
      <input type="hidden" name="role" value={value} />
      <Select
        value={value}
        items={ROLES}
        disabled={disabled}
        onValueChange={(next) => {
          const role = ROLES.find((r) => r.value === next)?.value;
          if (role) onChange(role);
        }}
      >
        <SelectTrigger id={`${ids}-role`} className={`w-full ${TOUCH}`} aria-describedby={describedBy}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ActionError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/**
 * «Add employee» (AC-STAFF-01): ім'я, email, роль → одна основна дія. Після успіху — повідомлення й картка
 * одноразового посилання; форма знову порожня (ключ форми змінюється), щоб наступного працівника додати одразу.
 */
export function NewEmployeeForm() {
  const [state, action] = useActionState(createEmployee, INITIAL_STAFF_STATE);
  const [role, setRoleValue] = useState<Role>("employee");
  const created = state.done ? state.link : null;

  return (
    <div className="flex flex-col gap-6">
      {created && (
        <>
          <Alert variant="info" role="status">
            <CircleCheck />
            <AlertTitle>Employee created</AlertTitle>
            <AlertDescription>
              {created.email} is Invited. Give them the one-time link below to set a password.{" "}
              <Link href={`/staff/${created.employeeId}`} className="font-medium text-primary underline-offset-4 hover:underline">
                Open employee
              </Link>
            </AlertDescription>
          </Alert>
          <LinkCard link={created} />
        </>
      )}
      <form
        key={created?.employeeId ?? "new"}
        action={action}
        noValidate
        className="flex max-w-md flex-col gap-4"
        data-testid="new-employee-form"
      >
        <NameEmailFields errors={state.done ? { name: null, email: null } : state.errors} />
        <RoleSelect value={role} onChange={setRoleValue} />
        <ActionError message={state.done ? "" : state.message} />
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Creating…" className="max-sm:w-full pointer-coarse:h-11">
            Create employee
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}

/** Ім'я й email наявного працівника (AC-STAFF-11): вхід — новим email і тим самим паролем. */
export function EmployeeDetailsForm({ employeeId, name, email }: { employeeId: string; name: string; email: string }) {
  const [state, action] = useActionState(updateEmployee, INITIAL_STAFF_STATE);
  return (
    <form action={action} noValidate className="flex flex-col gap-4" data-testid="employee-details-form">
      <input type="hidden" name="employee_id" value={employeeId} />
      <NameEmailFields errors={state.errors} name={name} email={email} />
      <ActionError message={state.message} />
      {state.done && (
        <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CircleCheck className="size-3.5" aria-hidden="true" />
          Saved. The person signs in with this email and the same password.
        </p>
      )}
      <div className="flex justify-end">
        <SubmitButton variant="secondary" pendingLabel="Saving…" className="max-sm:w-full pointer-coarse:h-11">
          Save changes
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * Роль (AC-STAFF-18): власну змінити не можна — поле вимкнене, поруч текст AC; та сама відмова приходить і з бази,
 * якщо форму обійти.
 */
export function RoleForm({ employeeId, role, own }: { employeeId: string; role: Role; own: boolean }) {
  const ids = useId();
  const [state, action] = useActionState(setRole, INITIAL_STAFF_STATE);
  const [value, setValue] = useState<Role>(role);
  return (
    <form action={action} className="flex flex-col gap-4" data-testid="role-form">
      <input type="hidden" name="employee_id" value={employeeId} />
      <RoleSelect value={value} onChange={setValue} disabled={own} describedBy={own ? `${ids}-own` : undefined} />
      {own && (
        <p id={`${ids}-own`} className="text-xs text-muted-foreground">
          {STAFF_MESSAGES.ownRole}
        </p>
      )}
      <ActionError message={state.message} />
      {state.done && (
        <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CircleCheck className="size-3.5" aria-hidden="true" />
          Role saved.
        </p>
      )}
      {!own && (
        <div className="flex justify-end">
          <SubmitButton
            variant="secondary"
            pendingLabel="Saving…"
            disabled={value === role}
            className="max-sm:w-full pointer-coarse:h-11"
          >
            Save role
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
