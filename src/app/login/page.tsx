import { buttonClass } from "@/components/ui/legacy-button";
import { Card } from "@/components/ui/legacy-card";
import { FieldError } from "@/components/ui/field-error";
import { CalendarIcon } from "@/components/ui/icons";
import { login } from "./actions";

const ERRORS: Record<string, string> = {
  missing: "Enter your email and password.",
  invalid: "Incorrect email or password.",
};

const inputClass = "h-10 rounded-lg border border-input bg-card px-3 text-foreground";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-6 py-16 text-sm text-foreground">
      <Card className="flex w-full max-w-sm flex-col gap-6 p-8">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CalendarIcon />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Leave portal</h1>
            <p className="text-muted-foreground">Sign in with your work email.</p>
          </div>
        </div>
        <form action={login} className="flex flex-col gap-4">
          <label htmlFor="email" className="flex flex-col gap-1.5 font-medium">
            Email
            <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
          </label>
          <label htmlFor="password" className="flex flex-col gap-1.5 font-medium">
            Password
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </label>
          <FieldError message={message} />
          <button type="submit" className={buttonClass("primary", "w-full")}>
            Sign in
          </button>
        </form>
      </Card>
    </main>
  );
}
