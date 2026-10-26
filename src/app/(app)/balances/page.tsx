import { redirect } from "next/navigation";
import { CircleAlert, Lock } from "lucide-react";
import { BalanceCards } from "@/components/balance-cards";
import { EmployeePicker } from "@/components/employee-picker";
import { SchoolYearSwitcher } from "@/components/school-year-switcher";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
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

  const others = (employees ?? []).map((e) => ({ id: e.id, name: e.full_name || e.email || "Employee", email: e.email ?? "" }));
  // Чиї це залишки — у рядку над картками; шапка однакова для своїх і чужих.
  const whose = employeeParam && result.ok ? result.employee.name : null;

  return (
    <>
      <PageHeader
        title="Balances"
        description={others.length > 0 ? "Days of leave for the school year." : "Your days of leave for the school year."}
      />

      {/* Панель вибору: ліворуч — чиї залишки (менеджеру й адміністратору), праворуч — навчальний рік. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm">
        {others.length > 0 ? (
          <EmployeePicker employees={others} selected={employeeParam ?? OWN} own={OWN} year={year} />
        ) : employeesError ? (
          // Без списку менеджер не відкриє залишки працівника — кажемо чому, а не ховаємо вибір мовчки.
          <p role="alert" className="flex items-center gap-2 text-[13px] text-destructive">
            <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
            The list of employees could not be loaded. Please reload the page.
          </p>
        ) : (
          <span className="text-[13px] font-medium">My balances</span>
        )}
        <SchoolYearSwitcher
          year={year}
          current={currentYear}
          min={MIN_SCHOOL_YEAR}
          max={MAX_SCHOOL_YEAR}
          href={(y) => balancesHref(employeeParam, y)}
        />
      </div>

      <h2 className="text-base font-semibold">
        {whose ? `${whose} · ` : ""}School year {formatSchoolYear(year)}
      </h2>

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
