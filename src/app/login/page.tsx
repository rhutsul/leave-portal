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

// На дотику (ADR 0008): поле 44 px заввишки — ціль для пальця (шрифт 16 px дає сам Input, висоту поля пароля —
// PasswordInput).
const TOUCH_FIELD = "pointer-coarse:h-11";

const ERRORS: Record<string, string> = {
  missing: "Enter your email and password.",
  invalid: "Incorrect email or password.",
};

/**
 * Вхід, Sign in v2 (ADR 0007): тиха скляна картка ліворуч, праворуч — аркуш місяця з частинок, що злітається з
 * розсипу. Тло — та сама сітка з крапок, що на landing. Вужче за lg (ADR 0008) аркуш — смугою вгорі, а картка нижче,
 * ближче до пальця; без WebGL, з reduced motion, з Save-Data чи на слабкому пристрої лишається лише сітка.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div className="welcome-field group/login relative flex flex-1 flex-col overflow-hidden text-sm text-foreground">
      <ParticleField
        variant="login"
        className="absolute inset-x-0 top-14 z-0 h-[330px] lg:inset-x-auto lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[62%]"
      />
      <header className="relative z-10 flex h-14 items-center justify-between pr-2 pl-4 md:px-12 lg:h-auto lg:py-4.5">
        <Link href="/welcome" className="flex items-center gap-2.5 text-[15px] font-semibold">
          <Logo className="size-6.5" />
          Leave Portal
        </Link>
        {/* Тема доступна й до входу (ADR 0005): той самий вибір, та сама cookie. */}
        <span className="flex pointer-coarse:*:size-11">
          <ThemeMenu initial={theme} />
        </span>
      </header>
      {/* Вужче за lg: картка внизу (під аркушем), але не вище за 15rem від верху — аркуш лишається видно й на низькому
          екрані, сторінка тоді прокручується. Без поля цей відступ не потрібен. */}
      <main className="relative z-10 mx-auto flex w-[400px] max-w-[calc(100%-32px)] flex-1 flex-col justify-end gap-3 pt-60 pb-7 lg:mx-0 lg:ml-[max(48px,13%)] lg:max-w-[calc(100%-48px)] lg:justify-center lg:gap-4.5 lg:pt-0 lg:pb-16 max-lg:motion-reduce:pt-6 max-lg:group-has-[[data-field-tier=none]]/login:pt-6">
        <Card className="animate-rise gap-5 rounded-xl bg-card/82 px-4.5 py-5.5 shadow-lg backdrop-blur-md backdrop-saturate-125 sm:p-7">
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
                className={TOUCH_FIELD}
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
            <SubmitButton className="mt-1 h-10 w-full pointer-coarse:h-11.5" pendingLabel="Signing in…">
              Sign in
            </SubmitButton>
          </form>
          <p className="text-center text-xs text-muted-foreground">No account? Your school administrator creates it.</p>
        </Card>
        {/* Тихе посилання на landing: що таке портал — для того, хто прийшов за посиланням без пояснень. */}
        <Link
          href="/welcome"
          className="inline-flex items-center pointer-coarse:min-h-11 gap-1.5 self-center text-[13px] text-muted-foreground transition-colors duration-(--duration-fast) hover:text-foreground"
        >
          What is Leave Portal?
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </main>
    </div>
  );
}
