"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

/**
 * Кнопка відправки форми з Server Action: поки дія виконується — спінер, підпис `pendingLabel` і aria-busy
 * (кнопка лишається читабельною, DESIGN.md, розділ 6). Повторне натискання заблоковано.
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, "type"> & { pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending || undefined} {...props}>
      {pending && (
        <span aria-hidden="true" className="size-3.5 motion-safe:animate-spin rounded-full border-2 border-current border-r-transparent" />
      )}
      {pending ? pendingLabel : children}
    </Button>
  );
}
