import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, FileSpreadsheet, ShieldX } from "lucide-react";
import { DivisionPicker } from "@/components/division-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { PageHeader } from "@/components/ui/page-header";
import { RegisterTable } from "@/components/ui/register-table";
import { addMonths } from "@/lib/leave/time";
import { exportFileName, exportHref, MONTH_RANGE, registerHref, type RegisterRow } from "@/lib/register/register";
import { createClient } from "@/lib/supabase/server";
import { loadRegister, type RegisterLoad } from "./load-register";

export const metadata: Metadata = { title: "Register · Leave portal" };

const DESCRIPTION = "Approved leave of a division for one month — for payroll.";

type Loaded = Extract<RegisterLoad, { ok: true }>;

function LoadError() {
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>The register could not be loaded. Please reload the page.</AlertDescription>
    </Alert>
  );
}

/** Відмова в доступі — пояснення й посилання на головну, без даних (DESIGN.md, розділ 6). */
function Denied() {
  return (
    <>
      <PageHeader title="Register" />
      <EmptyState
        icon={<ShieldX className="size-5" aria-hidden="true" />}
        title="You can't see the register"
        text="The register of approved leave is available to managers and administrators. Your own records are in My requests."
        action={
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Go to Overview
          </Link>
        }
      />
    </>
  );
}

/** Менеджер без жодної посади чи збій бази до вибору підрозділу. */
function Unavailable({ reason }: { reason: Extract<RegisterLoad, { ok: false }>["reason"] }) {
  return (
    <>
      <PageHeader title="Register" description={DESCRIPTION} />
      {reason === "no-divisions" ? (
        <EmptyState
          icon={<FileSpreadsheet className="size-5" aria-hidden="true" />}
          title="No divisions to show"
          text="The register shows the divisions where you manage at least one position."
        />
      ) : (
        <LoadError />
      )}
    </>
  );
}

function Records({ rows, divisionName, monthLabel }: { rows: RegisterRow[] | null; divisionName: string; monthLabel: string }) {
  if (rows === null) return <LoadError />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<FileSpreadsheet className="size-5" aria-hidden="true" />}
        title="No approved leave in this month"
        text={`Approved records of ${divisionName} for ${monthLabel} will appear here.`}
      />
    );
  }
  return <RegisterTable rows={rows} caption={`${divisionName} · ${monthLabel}`} />;
}

function Register({ divisions, division, month, monthLabel, currentMonth, rows }: Loaded) {
  const download =
    rows === null ? undefined : (
      // Обробник маршруту віддає файл (Content-Disposition: attachment), тож звичайне посилання без prefetch.
      <a href={exportHref(division.code, month)} download={exportFileName(division.code, month)} className={buttonVariants()}>
        <Download />
        Download CSV
      </a>
    );
  return (
    <>
      <PageHeader title="Register" description={DESCRIPTION} actions={download} />

      {/* Панель вибору: ліворуч — підрозділ, праворуч — місяць (як вибір працівника й року на /balances). */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
        <DivisionPicker divisions={divisions} selected={division.code} month={month} />
        <MonthSwitcher
          month={month}
          current={currentMonth}
          min={addMonths(currentMonth, -MONTH_RANGE)}
          max={addMonths(currentMonth, MONTH_RANGE)}
          href={(m) => registerHref(division.code, m)}
        />
      </div>

      <h2 className="text-base font-semibold">
        {division.name} · {monthLabel}
      </h2>

      <Records rows={rows} divisionName={division.name} monthLabel={monthLabel} />
    </>
  );
}

// Реєстр погоджених відсутностей (ADR 0012, ініціатива розробника до вимог PM; requirements/product.md — матриця прав
// «See the register of approved leave»): manager — записи посад, які він веде, admin — усі; employee — відмова.
// Що видно, вирішує база (public.register_divisions, public.approved_register); роль тут — лише для тексту відмови.
// `?division=<code>&month=YYYY-MM`, за замовчуванням — перший доступний підрозділ і поточний місяць за Києвом.
export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const [{ data: profile }, result] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle(),
    loadRegister(supabase, await searchParams),
  ]);

  if (profile?.role !== "manager" && profile?.role !== "admin") return <Denied />;
  if (!result.ok) return <Unavailable reason={result.reason} />;
  return <Register {...result} />;
}
