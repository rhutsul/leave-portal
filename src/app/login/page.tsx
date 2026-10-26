import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoginHero } from "@/components/ui/login-hero";
import { SubmitButton } from "@/components/ui/submit-button";
import { login } from "./actions";

const ERRORS: Record<string, string> = {
  missing: "Enter your email and password.",
  invalid: "Incorrect email or password.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <main className="flex flex-1 flex-col text-sm text-foreground">
      <LoginHero>
        <div className="mb-7 flex items-center justify-center gap-2.5 text-base font-semibold">
          <span aria-hidden="true" className="size-6.5 rounded-sm bg-primary" />
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
              <AlertDescription>{message}</AlertDescription>
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
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                aria-invalid={message ? true : undefined}
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
