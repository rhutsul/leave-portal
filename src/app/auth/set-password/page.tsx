import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { ThemeMenu } from "@/components/ui/theme-menu";
import { parseTheme, THEME_COOKIE } from "@/lib/preferences";
import { SetPasswordView } from "./set-password-view";

export const metadata: Metadata = { title: "Set your password · Leave portal" };

/**
 * Сторінка одноразового посилання від адміністратора (AC-STAFF-02, -03; D2 impl-staff-management): публічна
 * (`/auth/**` у src/proxy.ts), без даних, доки база не підтвердить посилання. Тиха картка, як вхід, без поля
 * частинок: людина прийшла з посилання, щоб задати пароль.
 */
export default async function SetPasswordPage() {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <div className="welcome-field relative flex flex-1 flex-col bg-background text-sm text-foreground">
      <header className="flex h-14 items-center justify-between pr-2 pl-4 md:px-12 lg:h-auto lg:py-4.5">
        <Link href="/welcome" className="flex items-center gap-2.5 text-[15px] font-semibold">
          <Logo className="size-6.5" />
          Leave Portal
        </Link>
        <span className="flex pointer-coarse:*:size-11">
          <ThemeMenu initial={theme} />
        </span>
      </header>
      <main className="mx-auto flex w-[420px] max-w-[calc(100%-32px)] flex-1 flex-col justify-center gap-4 py-10">
        <Card className="animate-rise gap-5 rounded-xl px-4.5 py-5.5 shadow-lg sm:p-7">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl leading-[30px] font-semibold tracking-tight">Set your password</h1>
            <p className="text-[13px] text-muted-foreground">
              Your administrator gave you this one-time link. Choose a password to sign in to the portal.
            </p>
          </div>
          <noscript>
            <p className="text-[13px] text-muted-foreground">
              Turn on JavaScript to use this link, or ask the administrator for a new one.
            </p>
          </noscript>
          <SetPasswordView />
        </Card>
      </main>
    </div>
  );
}
