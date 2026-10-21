import Link from "next/link";
import { redirect } from "next/navigation";
import { BalanceCards } from "@/components/balance-cards";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
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
  const { employee: employeeParam, year } = balancesQuery(params, claims.sub, currentYear);

  const [result, { data: employees, error: employeesError }] = await Promise.all([
    loadBalances(supabase, employeeParam ?? claims.sub, year),
    supabase.rpc("balance_employees"),
  ]);

  const others = employees ?? [];
  // Шапка однакова для своїх і чужих залишків: вибір працівника завжди праворуч угорі, а чиї це залишки —
  // в описі й у рядку навчального року (довгий заголовок з іменем переносив вибір під себе).
  const whose = employeeParam && result.ok ? result.employee.name : null;

  return (
    <>
      <PageHeader
        title="Balances"
        description={`${whose ? `${whose}. ` : ""}Days, to 0.01. Only approved records count.`}
        actions={
          others.length > 0 ? (
            <form action="/balances" className="flex items-end gap-2">
              <input type="hidden" name="year" value={year} />
              <label className="flex flex-col gap-1 text-[13px] text-muted">
                Employee
                <select
                  name="employee"
                  defaultValue={employeeParam ?? ""}
                  className="h-10 min-w-56 rounded-lg border border-line-strong bg-surface px-2.5 text-sm text-ink"
                >
                  <option value="">My balances</option>
                  {others.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name || e.email || "Employee"}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" variant="ghost">
                Show
              </Button>
            </form>
          ) : employeesError ? (
            // Без списку менеджер не відкриє залишки працівника — кажемо чому, а не ховаємо вибір мовчки.
            <p role="alert" className="text-[13px] text-danger">
              The list of employees could not be loaded. Please reload the page.
            </p>
          ) : undefined
        }
      />

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[17px] font-semibold">
          {whose ? `${whose} · ` : ""}School year {formatSchoolYear(year)}
        </h2>
        <nav aria-label="School year" className="flex items-center gap-2">
          {/* На межах діапазону balancesQuery посилання за межу немає: 1999 чи 2100 відкрили б поточний рік. */}
          {year > MIN_SCHOOL_YEAR && (
            <Link
              href={balancesHref(employeeParam, year - 1)}
              className="flex min-h-9 items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 text-ink-2 hover:bg-subtle hover:text-ink"
            >
              <ChevronLeftIcon />
              {formatSchoolYear(year - 1)}
            </Link>
          )}
          {year !== currentYear && (
            <Link
              href={balancesHref(employeeParam, currentYear)}
              className="min-h-9 rounded-lg px-2.5 py-2 text-brand-strong underline-offset-2 hover:underline"
            >
              Current year
            </Link>
          )}
          {year < MAX_SCHOOL_YEAR && (
            <Link
              href={balancesHref(employeeParam, year + 1)}
              className="flex min-h-9 items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 text-ink-2 hover:bg-subtle hover:text-ink"
            >
              {formatSchoolYear(year + 1)}
              <ChevronRightIcon />
            </Link>
          )}
        </nav>
      </div>

      {result.ok ? (
        <BalanceCards balances={result.balances} />
      ) : result.reason === "not-shown" ? (
        <Card as="div" className="border-dashed border-line-strong px-6 py-10 text-center">
          <p className="font-semibold">These balances are not available to you.</p>
          <p className="mt-1.5 text-muted">
            You can see your own balances and the balances of employees whose positions you manage.
          </p>
        </Card>
      ) : (
        <p role="alert" className="text-danger">
          The balances could not be loaded. Please reload the page.
        </p>
      )}
    </>
  );
}
