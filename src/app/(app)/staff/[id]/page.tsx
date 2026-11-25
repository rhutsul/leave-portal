import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeStatus } from "@/components/ui/employee-status";
import { PageHeader } from "@/components/ui/page-header";
import { isEmployeeStatus, isRole, roleLabel, uuidOf } from "@/lib/staff/employee";
import { staffSession } from "../admin-session";
import { StaffDenied } from "../denied";
import { EmployeeDetailsForm, RoleForm } from "../employee-forms";
import { SignInCard } from "../sign-in-card";

export const metadata: Metadata = { title: "Employee · Leave portal" };

/**
 * Сторінка працівника (D10): «Details» — ім'я й email (AC-STAFF-11), «Role» (AC-STAFF-18), «Sign-in» — статус, нове
 * одноразове посилання, деактивація й реактивація (AC-STAFF-01, -08). Посади й розклади — наступним кроком зрізу.
 * Неіснуючий працівник і не адміністратор — та сама відмова (AC-STAFF-13): не розкриваємо, хто є.
 */
export default async function EmployeePage({ params }: PageProps<"/staff/[id]">) {
  const { supabase, userId, isAdmin } = await staffSession();
  if (!isAdmin) return <StaffDenied />;

  const id = uuidOf((await params).id);
  const { data: rows } = id ? await supabase.rpc("staff_employees").eq("id", id) : { data: null };
  const employee = rows?.[0];
  if (!id || !employee || !isRole(employee.role) || !isEmployeeStatus(employee.status)) return <StaffDenied />;

  const own = employee.id === userId;
  const name = employee.full_name || employee.email;

  return (
    <>
      <PageHeader
        title={name}
        description={`${employee.email} · ${roleLabel(employee.role)}${employee.main_position ? ` · ${employee.main_position}` : ""}`}
        breadcrumb={
          <Link href="/staff" className="hover:text-foreground">
            Employees
          </Link>
        }
        actions={<EmployeeStatus status={employee.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Details</CardTitle>
            <CardDescription>Records show the current name and email. The password does not change.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmployeeDetailsForm employeeId={employee.id} name={employee.full_name ?? ""} email={employee.email} />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Sign-in</CardTitle>
              <CardDescription>A new one-time link is valid for 7 days, including today.</CardDescription>
            </CardHeader>
            <CardContent>
              <SignInCard employeeId={employee.id} name={name} email={employee.email} status={employee.status} own={own} />
            </CardContent>
          </Card>
          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Role</CardTitle>
              <CardDescription>Managers decide records of their positions; administrators manage everything.</CardDescription>
            </CardHeader>
            <CardContent>
              <RoleForm employeeId={employee.id} role={employee.role} own={own} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
