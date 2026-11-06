import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { ShowcaseCount } from "@/components/ui/motion";
import { ThemeMenu } from "@/components/ui/theme-menu";
import { parseTheme, THEME_COOKIE } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { OverviewPreview } from "./overview-preview";
import { TryIt } from "./try-it";

export const metadata: Metadata = {
  title: "Leave Portal",
  description: "Leave by your schedule, decided record by record.",
};

const KICKER = "font-mono text-[11px] tracking-wide text-muted-foreground uppercase";
const H2 = "text-4xl leading-11 font-semibold tracking-tight";

const FACTS = [
  { figure: "150 / 420 = 0.36", text: "150 of 420 working minutes on a date is 0.36 day." },
  { figure: "≤ 1.00 per date", text: "One date never counts as more than one day, across all positions." },
  { figure: "Carried over", text: "Unused Sick and Personal leave days move to the next school year." },
];

// Ролі й права — з матриці прав продукту (requirements/product.md), без нових правил.
const ROLES = [
  {
    name: "Employee",
    id: "employee",
    text: "Teachers, assistants and office staff.",
    can: [
      "Requests leave by the day or by the hour",
      "Changes the hours of or cancels own records awaiting a decision or returned for revision",
      "Sees own schedule and balances",
    ],
  },
  {
    name: "Manager",
    id: "manager",
    text: "Responsible for one or more positions.",
    can: [
      "Decides on each record of own positions",
      "Never decides on own records",
      "Sees balances of employees of own positions",
    ],
  },
  {
    name: "Administrator",
    id: "admin",
    text: "Keeps the school running in the portal.",
    can: [
      "Can decide on any record",
      "Keeps the school calendar: holidays and early dismissals",
      "Creates employees and positions, assigns managers",
    ],
  },
];

/** Кнопка входу або переходу в портал: той, хто ввійшов, бачить «Open the portal» (ADR 0007). */
function PortalLink({ signedIn, className, size }: { signedIn: boolean; className?: string; size?: "sm" | "lg" }) {
  return (
    <Link href={signedIn ? "/" : "/login"} className={buttonVariants({ size, className })}>
      {signedIn ? "Open the portal" : "Sign in"}
    </Link>
  );
}

function Header({ signedIn, theme }: { signedIn: boolean; theme: ReturnType<typeof parseTheme> }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border/60 bg-background/75 backdrop-blur-md">
      <nav aria-label="Main" className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-12 py-3.5">
        <Link href="/welcome" className="flex items-center gap-2.5 text-[15px] font-semibold">
          <Logo className="size-6.5" />
          Leave Portal
        </Link>
        <div className="flex items-center gap-5.5 text-sm">
          <a href="#try" className="text-muted-foreground transition-colors duration-(--duration-fast) hover:text-foreground">
            Try it
          </a>
          <a href="#balances" className="text-muted-foreground transition-colors duration-(--duration-fast) hover:text-foreground">
            Balances
          </a>
          <a href="#roles" className="text-muted-foreground transition-colors duration-(--duration-fast) hover:text-foreground">
            Who uses it
          </a>
          <ThemeMenu initial={theme} />
          <PortalLink signedIn={signedIn} size="sm" />
        </div>
      </nav>
    </header>
  );
}

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="hero-title" className="relative mx-auto flex min-h-[720px] w-full max-w-[1280px] items-center px-12 pt-10 pb-20">
      <div className="flex w-[560px] max-w-full flex-col gap-6.5">
        <span className={KICKER}>Leave requests · decisions · balances</span>
        <h1 id="hero-title" className="text-[56px] leading-[60px] font-semibold tracking-[-0.03em]">
          Leave by your schedule, decided record by record
        </h1>
        <p className="max-w-[480px] text-[17px] leading-[26px] text-muted-foreground">
          Request a whole day or specific hours for each of your positions. Each responsible manager decides on their own
          records, and balances are counted to 0.01 day.
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <PortalLink signedIn={signedIn} size="lg" />
          <a href="#try" className={buttonVariants({ variant: "outline", size: "lg", className: "bg-transparent" })}>
            Try a request
          </a>
        </div>
        <div className="flex w-fit gap-5.5 border-t border-border pt-2 font-mono text-xs text-muted-foreground">
          <span>3 roles</span>
          <span>1 record per position and date</span>
          <span>0.01 day precision</span>
        </div>
      </div>
    </section>
  );
}

function TrySection() {
  return (
    <section id="try" aria-labelledby="try-title" className="welcome-reveal mx-auto flex w-full max-w-[1280px] scroll-mt-16 flex-col gap-9 px-12 py-30">
      <div className="flex max-w-[640px] flex-col gap-2.5">
        <span className={KICKER}>01 · Try it</span>
        <h2 id="try-title" className={H2}>
          One request becomes records, one per position and date
        </h2>
        <p className="text-base text-muted-foreground">
          Pick days, positions and hours. Watch the request split by schedule, then see each manager decide on their own
          record. Nothing here is saved.
        </p>
      </div>
      <TryIt />
    </section>
  );
}

function BalancesSection() {
  return (
    <section
      id="balances"
      aria-labelledby="balances-title"
      className="welcome-reveal mx-auto flex w-full max-w-[1280px] scroll-mt-16 flex-col items-center gap-14 px-12 py-30"
    >
      <div className="flex max-w-[640px] flex-col items-center gap-2.5 text-center">
        <span className={KICKER}>02 · Balances</span>
        <h2 id="balances-title" className={H2}>
          Counted in working days, to 0.01 day
        </h2>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-[96px] leading-[96px] font-semibold tracking-[-0.04em] tabular-nums">
          <ShowcaseCount value="16.64" />
        </span>
        <span className="text-[15px] text-muted-foreground">days of Personal leave left · 1.36 of 18.00 used</span>
      </div>
      <div className="grid w-full grid-cols-3 gap-4">
        {FACTS.map((fact) => (
          <Card key={fact.figure} className="gap-1.5 bg-card/85 p-5 backdrop-blur-md">
            <span className="font-mono text-[22px] font-medium text-primary">{fact.figure}</span>
            <span className="text-sm text-muted-foreground">{fact.text}</span>
          </Card>
        ))}
      </div>
    </section>
  );
}

function RolesSection() {
  return (
    <section id="roles" aria-labelledby="roles-title" className="welcome-reveal mx-auto flex w-full max-w-[1280px] scroll-mt-16 flex-col gap-8 px-12 py-30">
      <div className="flex flex-col items-center gap-2.5 text-center">
        <span className={KICKER}>03 · Who uses it</span>
        <h2 id="roles-title" className={H2}>
          Three roles. One person can hold several.
        </h2>
      </div>
      <ul className="grid grid-cols-3 gap-5">
        {ROLES.map((role) => (
          <li key={role.id}>
            <Card className="h-full gap-2.5 bg-card/85 p-6 backdrop-blur-md transition-[translate,border-color] duration-(--duration-base) ease-out hover:-translate-y-1 hover:border-primary">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[17px] font-semibold">{role.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{role.id}</span>
              </span>
              <span className="text-sm text-muted-foreground">{role.text}</span>
              <ul className="mt-1 flex flex-col gap-1.5 text-[13px]">
                {role.can.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check aria-hidden="true" className="mt-0.5 size-3.5 flex-none text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PreviewSection() {
  return (
    <section
      aria-labelledby="preview-title"
      className="welcome-reveal mx-auto grid w-full max-w-[1280px] grid-cols-[minmax(0,4fr)_minmax(0,7fr)] items-center gap-14 px-12 pt-30 pb-20"
    >
      <div className="flex flex-col gap-3.5">
        <span className={KICKER}>04 · Overview</span>
        <h2 id="preview-title" className={H2}>
          Start the day on one screen
        </h2>
        <p className="text-[15px] leading-[22px] text-muted-foreground">
          Your next leave, records returned to you, and for managers: what to decide and who is away this week.
        </p>
      </div>
      <OverviewPreview />
    </section>
  );
}

function Closing({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="cta-title" className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-12 pt-35 pb-10">
      <div className="welcome-reveal flex flex-col items-center gap-5.5 text-center">
        <h2 id="cta-title" className="max-w-[760px] text-[44px] leading-[50px] font-semibold tracking-[-0.03em]">
          Your administrator creates your account. Then sign in and request leave.
        </h2>
        <PortalLink signedIn={signedIn} size="lg" />
      </div>
      <footer className="flex items-center justify-between gap-4 border-t border-border pt-5 text-[13px] text-muted-foreground">
        <span>Leave Portal · internal portal for school staff</span>
        <span className="font-mono text-xs">Requests · Decisions · Balances</span>
      </footer>
    </section>
  );
}

/**
 * Landing для відвідувача (ADR 0007): що таке портал, пісочниця заявки, правила балансу, ролі й прев'ю Overview.
 * Публічна сторінка (proxy пускає саме `/welcome`); гість на `/` потрапляє сюди. Той, хто ввійшов, бачить ту саму
 * сторінку з «Open the portal». Одна тема на всю сторінку (ADR 0005), секції не змінюють тло.
 */
export default async function WelcomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div className={cn("welcome-field flex flex-1 flex-col text-foreground")}>
      <Header signedIn={signedIn} theme={theme} />
      <main className="flex flex-col">
        <Hero signedIn={signedIn} />
        <TrySection />
        <BalancesSection />
        <RolesSection />
        <PreviewSection />
        <Closing signedIn={signedIn} />
      </main>
    </div>
  );
}
