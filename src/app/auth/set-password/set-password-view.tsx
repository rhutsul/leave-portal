"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/ui/submit-button";
import { MIN_PASSWORD_LENGTH } from "@/lib/account/password";
import { linkStateMessage, tokenFromHash } from "@/lib/staff/link";
import { checkLink, setPassword, type LinkCheck, type SetPasswordState } from "./actions";

const INITIAL: SetPasswordState = { errors: { next: null, confirm: null }, message: "" };

type View = { kind: "checking" } | { kind: "ready"; token: string; email: string } | { kind: "closed"; message: string };

/** Фрагмент адреси читаємо один раз і одразу прибираємо з історії браузера (D2). */
function takeToken(): string | null {
  const token = tokenFromHash(window.location.hash);
  if (window.location.hash) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  return token;
}

/**
 * Сторінка одноразового посилання (AC-STAFF-02, -03): токен — у фрагменті адреси, тож його бачить лише браузер.
 * Чинне посилання — форма пароля; прострочене — текст AC-STAFF-03 без форми; недійсне — текст розробника.
 */
export function SetPasswordView() {
  const [view, setView] = useState<View>({ kind: "checking" });
  // Токен беремо з адреси один раз і тримаємо тут: фрагмент прибрано, а ефект у StrictMode запускається двічі.
  const tokenRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (tokenRef.current === undefined) tokenRef.current = takeToken();
    const token = tokenRef.current;
    let live = true;
    // Без токена — та сама відповідь, що й недійсне посилання; стан ставимо у відповіді, а не просто в ефекті.
    const check: Promise<LinkCheck> = token ? checkLink(token) : Promise.resolve({ state: "invalid", email: null });
    check
      .then((result) => {
        if (!live) return;
        if (token && result.state === "valid" && result.email) setView({ kind: "ready", token, email: result.email });
        else setView({ kind: "closed", message: linkStateMessage(result.state === "valid" ? "invalid" : result.state) });
      })
      .catch(() => live && setView({ kind: "closed", message: linkStateMessage("invalid") }));
    return () => {
      live = false;
    };
  }, []);

  if (view.kind === "checking") {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Checking the link">
        <Skeleton className="h-4 w-56 max-w-full" />
        <Skeleton className="h-9 rounded-md" />
        <Skeleton className="h-9 rounded-md" />
      </div>
    );
  }

  if (view.kind === "closed") {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive" role="alert" data-testid="link-closed">
          <CircleAlert />
          <AlertDescription>{view.message}</AlertDescription>
        </Alert>
        <Link href="/login" className={buttonVariants({ variant: "outline", className: "self-start max-sm:w-full" })}>
          Go to sign in
        </Link>
      </div>
    );
  }

  return <PasswordForm token={view.token} email={view.email} />;
}

/**
 * Форма пароля для чинного посилання. Поля керовані: після невдалої спроби (не той повтор, правило пароля) React
 * скидає некеровані поля форми, а людина мала б вводити все знову. Паролі лишаються лише в цьому компоненті — у
 * стан дії сервера вони не потрапляють.
 */
function PasswordForm({ token, email }: { token: string; email: string }) {
  const ids = useId();
  const [state, action] = useActionState(setPassword, INITIAL);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const nextId = `${ids}-next`;
  const confirmId = `${ids}-confirm`;
  return (
    <form action={action} noValidate className="flex flex-col gap-3.5" data-testid="set-password-form">
      <p className="text-[13px] text-muted-foreground">
        Account: <span className="font-medium break-all text-foreground">{email}</span>
      </p>
      <input type="hidden" name="token" value={token} />
      {/* Для менеджерів паролів: логін поруч із новим паролем. */}
      <input type="hidden" name="username" autoComplete="username" value={email} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nextId}>New password</Label>
        <PasswordInput
          id={nextId}
          name="new_password"
          autoComplete="new-password"
          aria-required="true"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          aria-invalid={state.errors.next ? true : undefined}
          aria-describedby={state.errors.next ? `${nextId}-error` : `${nextId}-hint`}
        />
        <FieldError id={`${nextId}-error`} message={state.errors.next} />
        {!state.errors.next && (
          <p id={`${nextId}-hint`} className="text-xs text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={confirmId}>Repeat the new password</Label>
        <PasswordInput
          id={confirmId}
          name="confirm_password"
          autoComplete="new-password"
          aria-required="true"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          aria-invalid={state.errors.confirm ? true : undefined}
          aria-describedby={state.errors.confirm ? `${confirmId}-error` : undefined}
        />
        <FieldError id={`${confirmId}-error`} message={state.errors.confirm} />
      </div>
      {state.message && (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <SubmitButton className="mt-1 h-10 w-full pointer-coarse:h-11.5" pendingLabel="Setting password…">
        Set password
      </SubmitButton>
    </form>
  );
}
