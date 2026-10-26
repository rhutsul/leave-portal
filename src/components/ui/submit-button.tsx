"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

/**
 * Кнопка відправки форми з Server Action: поки дія виконується — спінер, підпис `pendingLabel` і aria-busy
 * (кнопка лишається читабельною, DESIGN.md, розділ 6). Повторне натискання заблоковано. Кілька кнопок однієї форми
 * (name і value) — спінер лише на тій, що відправила форму.
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, "type"> & { pendingLabel: string }) {
  const { pending, data } = useFormStatus();
  const mine = pending && (props.name === undefined || data?.get(props.name) === String(props.value ?? ""));
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={mine || undefined} {...props}>
      {mine && (
        <span aria-hidden="true" className="size-3.5 motion-safe:animate-spin rounded-full border-2 border-current border-r-transparent" />
      )}
      {mine ? pendingLabel : children}
    </Button>
  );
}
