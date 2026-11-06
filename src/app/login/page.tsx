import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";
import { ParticleField } from "@/components/ui/particle-field";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ThemeMenu } from "@/components/ui/theme-menu";
import { parseTheme, THEME_COOKIE } from "@/lib/preferences";
import { login } from "./actions";

const ERRORS: Record<string, string> = {
  missing: "Enter your email and password.",
  invalid: "Incorrect email or password.",
};

/**
 * Вхід, Sign in v2 (ADR 0007): тиха скляна картка ліворуч, праворуч — аркуш місяця з частинок, що злітається з
 * розсипу. Тло — та сама сітка з крапок, що на landing; вужче за 1100 px, без WebGL чи з reduced motion лишається лише
 * вона, а картка стає по центру.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div className="welcome-field relative flex flex-1 flex-col overflow-hidden text-sm text-foreground">
      <ParticleField variant="login" className="absolute inset-y-0 right-0 z-0 w-[62%]" />
      <header className="relative z-10 flex items-center justify-between px-12 py-4.5">
        <Link href="/welcome" className="flex items-center gap-2.5 text-[15px] font-semibold">
          <Logo className="size-6.5" />
          Leave Portal
        </Link>
        {/* Тема доступна й до входу (ADR 0005): той самий вибір, та сама cookie. */}
        <ThemeMenu initial={theme} />
      </header>
      <main className="relative z-10 mx-auto flex w-[400px] max-w-[calc(100%-48px)] flex-1 flex-col justify-center gap-4.5 pb-16 min-[1100px]:mx-0 min-[1100px]:ml-[max(48px,13%)]">
        <Card className="animate-rise gap-5 rounded-xl bg-card/82 p-7 shadow-lg backdrop-blur-md backdrop-saturate-125">
          <div className="flex flex-col gap-1.5">
            {/* Надпис — декор: те саме каже підзаголовок нижче, тож зчитувач екрана читає його один раз. */}
            <span aria-hidden="true" className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              Leave requests · decisions · balances
            </span>
            <h1 className="text-2xl leading-[30px] font-semibold tracking-tight">Sign in</h1>
            <p className="text-[13px] text-muted-foreground">Leave requests, decisions and balances in one place.</p>
          </div>
          {message && (
            <Alert variant="destructive" role="alert">
              <CircleAlert />
              <AlertDescription id="login-error">{message}</AlertDescription>
            </Alert>
          )}
          <form action={login} className="flex flex-col gap-3.5">
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
            <SubmitButton className="mt-1 h-10 w-full" pendingLabel="Signing in…">
              Sign in
            </SubmitButton>
          </form>
          <p className="text-center text-xs text-muted-foreground">No account? Your school administrator creates it.</p>
        </Card>
        {/* Тихе посилання на landing: що таке портал — для того, хто прийшов за посиланням без пояснень. */}
        <Link
          href="/welcome"
          className="inline-flex items-center gap-1.5 self-center text-[13px] text-muted-foreground transition-colors duration-(--duration-fast) hover:text-foreground"
        >
          What is Leave Portal?
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </main>
    </div>
  );
}
