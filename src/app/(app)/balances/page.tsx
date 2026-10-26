import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { BalanceCards } from "@/components/balance-cards";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatSchoolYear, schoolYearOf } from "@/lib/leave/balance";
import { kyivDate } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import { balancesQuery, loadBalances, MAX_SCHOOL_YEAR, MIN_SCHOOL_YEAR } from "./load-balances";

function balancesHref(employee: string | undefined, year: number) {
  const params = new URLSearchParams();
  if (employee) params.set("employee", employee);
  params.set("year", String(year));
  return `/balances?${params}`;
}

// Порожнє значення Select означає «свої залишки»: Base UI не приймає "" як значення пункту.
const OWN = "me";

// Залишки (D6): свої; `?employee=` — повний залишок працівника для менеджера будь-якої його посади й адміністратора
// (AC-BALANCE-20). Право перевіряє база; без права сторінка залишків не показує (AC-BALANCE-12, AC-BALANCE-13).
// `?year=` — навчальний рік (рік початку), за замовчуванням — поточний за Києвом.
export default async function BalancesPage({ searchParams }: PageProps<"/balances">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const params = await searchParams;
  const currentYear = schoolYearOf(kyivDate(new Date()));
  const { employee: employeeParam, year } = balancesQuery(
    { ...params, employee: params.employee === OWN ? undefined : params.employee },
    claims.sub,
    currentYear,
  );

  const [result, { data: employees, error: employeesError }] = await Promise.all([
    loadBalances(supabase, employeeParam ?? claims.sub, year),
    supabase.rpc("balance_employees"),
  ]);

  const others = employees ?? [];
  const items = [
    { value: OWN, label: "My balances" },
    ...others.map((e) => ({ value: e.id, label: e.full_name || e.email || "Employee" })),
  ];
  // Шапка однакова для своїх і чужих залишків: вибір працівника завжди праворуч угорі, а чиї це залишки —
  // в описі й у рядку навчального року.
  const whose = employeeParam && result.ok ? result.employee.name : null;

  return (
    <>
      {/* Навмисне порушення для доказу check:ui (draft PR, не зливати). */}
      <button type="button">Raw button</button>
      <PageHeader
        title="Balances"
        description={whose ? `${whose}. Days of leave for the school year.` : "Your days of leave for the school year."}
        actions={
          others.length > 0 ? (
            <form action="/balances" className="flex items-end gap-2">
              <input type="hidden" name="year" value={year} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="balances-employee">Employee</Label>
                <Select name="employee" defaultValue={employeeParam ?? OWN} items={items}>
                  <SelectTrigger id="balances-employee" className="min-w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* GET-форма без серверної дії: useFormStatus її не бачить, тож звичайна кнопка, без «Showing…». */}
              <Button type="submit" variant="outline">
                Show
              </Button>
            </form>
          ) : employeesError ? (
            // Без списку менеджер не відкриє залишки працівника — кажемо чому, а не ховаємо вибір мовчки.
            <Alert variant="destructive" role="alert" className="max-w-sm">
              <AlertDescription>The list of employees could not be loaded. Please reload the page.</AlertDescription>
            </Alert>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          {whose ? `${whose} · ` : ""}School year {formatSchoolYear(year)}
        </h2>
        <nav aria-label="School year" className="flex items-center gap-2">
          {/* На межах діапазону balancesQuery посилання за межу немає: 1999 чи 2100 відкрили б поточний рік. */}
          {year > MIN_SCHOOL_YEAR && (
            <Link href={balancesHref(employeeParam, year - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ChevronLeft />
              {formatSchoolYear(year - 1)}
            </Link>
          )}
          {year !== currentYear && (
            <Link href={balancesHref(employeeParam, currentYear)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Current year
            </Link>
          )}
          {year < MAX_SCHOOL_YEAR && (
            <Link href={balancesHref(employeeParam, year + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {formatSchoolYear(year + 1)}
              <ChevronRight />
            </Link>
          )}
        </nav>
      </div>

      {result.ok ? (
        <BalanceCards balances={result.balances} detailed />
      ) : result.reason === "not-shown" ? (
        <EmptyState
          icon={<Lock className="size-5" aria-hidden="true" />}
          title="These balances are not available to you."
          text="You can see your own balances and the balances of employees whose positions you manage."
        />
      ) : (
        <Alert variant="destructive" role="alert">
          <AlertDescription>The balances could not be loaded. Please reload the page.</AlertDescription>
        </Alert>
      )}
    </>
  );
}
