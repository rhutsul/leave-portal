import { cookies } from "next/headers";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoginHero } from "@/components/ui/login-hero";
import { PasswordInput } from "@/components/ui/password-input";
import { Logo } from "@/components/ui/logo";
import { SubmitButton } from "@/components/ui/submit-button";
import { ThemeMenu } from "@/components/ui/theme-menu";
import { parseTheme, THEME_COOKIE } from "@/lib/preferences";
import { login } from "./actions";

const ERRORS: Record<string, string> = {
  missing: "Enter your email and password.",
  invalid: "Incorrect email or password.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <main className="relative flex flex-1 flex-col text-sm text-foreground">
      {/* Тема доступна й до входу (ADR 0005): той самий вибір, та сама cookie. */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeMenu initial={theme} />
      </div>
      <LoginHero>
        <div className="mb-7 flex items-center justify-center gap-2.5 text-base font-semibold">
          <Logo className="size-6.5" />
          Leave Portal
        </div>
        <Card className="gap-5 rounded-xl border-border/80 bg-card/85 px-6 py-6 shadow-lg backdrop-blur-md backdrop-saturate-125">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-[13px] text-muted-foreground">Leave requests, decisions and balances in one place.</p>
          </div>
          {message && (
            <Alert variant="destructive" role="alert">
              <CircleAlert />
              <AlertDescription id="login-error">{message}</AlertDescription>
            </Alert>
          )}
          <form action={login} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={message ? true : undefined}
                aria-describedby={message ? "login-error" : undefined}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                required
                aria-invalid={message ? true : undefined}
                aria-describedby={message ? "login-error" : undefined}
              />
            </div>
            <SubmitButton className="mt-1 w-full" pendingLabel="Signing in…">
              Sign in
            </SubmitButton>
          </form>
          <p className="text-center text-xs text-muted-foreground">No account? Your school administrator creates it.</p>
        </Card>
      </LoginHero>
    </main>
  );
}
