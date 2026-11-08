import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { ShowcaseCount } from "@/components/ui/motion";
import { ParticleField } from "@/components/ui/particle-field";
import { ThemeMenu } from "@/components/ui/theme-menu";
import { parseTheme, THEME_COOKIE } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { OverviewPreview } from "./overview-preview";
import { SectionMenu } from "./section-menu";
import { TryIt } from "./try-it";

export const metadata: Metadata = {
  title: "Leave Portal",
  description: "Leave by your schedule, decided record by record.",
};

const KICKER = "font-mono text-[11px] tracking-wide text-muted-foreground uppercase";
const H2 = "text-[28px] leading-9 font-semibold tracking-tight md:text-4xl md:leading-11";
// Поля секцій (ADR 0008): 16 px на телефоні, 48 px від md.
const GUTTER = "px-4 md:px-12";

// Розділи сторінки: у шапці від md, вужче — у меню з кнопки (SectionMenu).
const SECTIONS = [
  { href: "#try", label: "Try it" },
  { href: "#balances", label: "Balances" },
  { href: "#roles", label: "Who uses it" },
] as const;

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
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-3 pr-2 pl-4 md:h-auto md:px-12 md:py-3.5"
      >
        <Link href="/welcome" className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold">
          <Logo className="size-6.5 flex-none" />
          <span className="truncate">Leave Portal</span>
        </Link>
        <div className="flex flex-none items-center gap-1 text-sm md:gap-5.5">
          {SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="hidden text-muted-foreground transition-colors duration-(--duration-fast) hover:text-foreground md:inline"
            >
              {section.label}
            </a>
          ))}
          <span className="flex pointer-coarse:*:size-11">
            <ThemeMenu initial={theme} />
          </span>
          <PortalLink signedIn={signedIn} size="sm" className="pointer-coarse:h-9" />
          <span className="flex md:hidden">
            <SectionMenu sections={SECTIONS} />
          </span>
        </div>
      </nav>
    </header>
  );
}

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    // Вужче за lg аркуш місяця з частинок — над заголовком (ADR 0008, пункт 10): текст починається нижче за нього.
    <section
      data-field-stage
      aria-labelledby="hero-title"
      className={cn(
        "relative mx-auto flex w-full max-w-[1280px] items-start pt-[max(9rem,calc(34vh-3rem))] pb-14 lg:min-h-[720px] lg:items-center lg:pt-10 lg:pb-20",
        GUTTER,
      )}
    >
      <div className="flex w-[560px] max-w-full flex-col gap-5 md:gap-6.5">
        <span className={KICKER}>Leave requests · decisions · balances</span>
        <h1 id="hero-title" className="text-[34px] leading-[38px] font-semibold tracking-[-0.03em] md:text-[56px] md:leading-[60px]">
          Leave by your schedule, decided record by record
        </h1>
        <p className="max-w-[480px] text-[15px] leading-[22px] text-muted-foreground md:text-[17px] md:leading-[26px]">
          Request a whole day or specific hours for each of your positions. Each responsible manager decides on their own
          records, and balances are counted to 0.01 day.
        </p>
        {/* На телефоні кнопки одна під одною на всю ширину (ADR 0008). */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5">
          <PortalLink signedIn={signedIn} size="lg" className="h-11.5 sm:h-10" />
          <a href="#try" className={buttonVariants({ variant: "outline", size: "lg", className: "h-11.5 bg-transparent sm:h-10" })}>
            Try a request
          </a>
        </div>
        <div className="flex w-fit max-w-full flex-wrap gap-x-5.5 gap-y-1.5 border-t border-border pt-2 font-mono text-[11px] text-muted-foreground md:text-xs">
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
    <section id="try" data-field-stage aria-labelledby="try-title" className={cn("welcome-reveal mx-auto flex w-full max-w-[1280px] scroll-mt-16 flex-col gap-6 py-16 md:gap-9 md:py-30", GUTTER)}>
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
      data-field-stage
      aria-labelledby="balances-title"
      className={cn(
        "welcome-reveal mx-auto flex w-full max-w-[1280px] scroll-mt-16 flex-col items-center justify-between gap-10 py-16 md:gap-14 md:py-30 lg:min-h-[900px]",
        GUTTER,
      )}
    >
      <div className="flex max-w-[640px] flex-col items-center gap-2.5 text-center">
        <span className={KICKER}>02 · Balances</span>
        <h2 id="balances-title" className={H2}>
          Counted in working days, to 0.01 day
        </h2>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-[64px] leading-[64px] font-semibold tracking-[-0.04em] tabular-nums md:text-[96px] md:leading-[96px]">
          <ShowcaseCount value="16.64" />
        </span>
        <span className="text-center text-[15px] text-muted-foreground">days of Personal leave left · 1.36 of 18.00 used</span>
      </div>
      <div className="grid w-full gap-3 md:grid-cols-3 md:gap-4">
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
    <section
      id="roles"
      data-field-stage
      aria-labelledby="roles-title"
      className={cn("welcome-reveal mx-auto flex w-full max-w-[1280px] scroll-mt-16 flex-col gap-6 py-16 md:gap-8 md:py-30", GUTTER)}
    >
      <div className="flex flex-col items-center gap-2.5 text-center">
        <span className={KICKER}>03 · Who uses it</span>
        <h2 id="roles-title" className={H2}>
          Three roles. One person can hold several.
        </h2>
      </div>
      {/* Місце для трьох сфер ролей поля частинок; вужче за lg сфери менші, тож і місця менше. */}
      <div aria-hidden="true" className="h-28 lg:h-55" />
      <ul className="grid gap-3 md:grid-cols-3 md:gap-5">
        {ROLES.map((role, index) => (
          // Наведення на картку підсвічує сферу цієї ролі в полі частинок (ParticleField).
          <li key={role.id} data-field-focus={index}>
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
      data-field-stage
      aria-labelledby="preview-title"
      className={cn(
        "welcome-reveal mx-auto grid w-full max-w-[1280px] items-center gap-10 pt-16 pb-14 md:pt-30 md:pb-20 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-14",
        GUTTER,
      )}
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
    <section aria-labelledby="cta-title" className={cn("mx-auto flex w-full max-w-[1280px] flex-col gap-12 pt-20 pb-8 md:gap-16 md:pt-35 md:pb-10", GUTTER)}>
      <div className="welcome-reveal flex flex-col items-center gap-5.5 text-center">
        <h2 id="cta-title" className="max-w-[760px] text-[30px] leading-9 font-semibold tracking-[-0.03em] md:text-[44px] md:leading-[50px]">
          Your administrator creates your account. Then sign in and request leave.
        </h2>
        <PortalLink signedIn={signedIn} size="lg" className="h-11.5 w-full sm:h-10 sm:w-auto" />
      </div>
      <footer className="flex flex-col gap-1.5 border-t border-border pt-5 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4">
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
    // overflow-x-clip: декор, що виступає за край (картки прев'ю Overview), не дає прокрутки вбік, а sticky поля працює.
    <div className="welcome-field flex flex-1 flex-col overflow-x-clip text-foreground">
      {/* Одне поле на всю сторінку: липке за вмістом, форма змінюється за прокруткою (ADR 0007). */}
      <ParticleField variant="welcome" className="sticky top-0 z-0 -mb-[100vh] h-screen" />
      <Header signedIn={signedIn} theme={theme} />
      <main className="relative z-1 flex flex-col">
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
