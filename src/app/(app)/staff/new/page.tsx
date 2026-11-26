import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { staffSession } from "../admin-session";
import { StaffDenied } from "../denied";
import { NewEmployeeForm } from "../employee-forms";

export const metadata: Metadata = { title: "Add employee · Leave portal" };

/**
 * «Add employee» (AC-STAFF-01): ім'я, email і роль; після збереження — одноразове посилання на цій самій сторінці.
 * Не адміністратор за прямим посиланням бачить лише текст AC-STAFF-13.
 */
export default async function NewEmployeePage() {
  const { isAdmin } = await staffSession();
  if (!isAdmin) return <StaffDenied />;

  return (
    <>
      <PageHeader
        title="Add employee"
        description="The portal sends no emails: give the one-time link to the person yourself."
        breadcrumb={
          <Link href="/staff" className="hover:text-foreground">
            Employees
          </Link>
        }
      />
      <Card className="max-w-2xl gap-4">
        <CardHeader>
          <CardTitle className="text-base font-semibold">New employee</CardTitle>
          <CardDescription>
            The employee is Invited until they set a password by the link. Positions and schedules are added on the
            employee&apos;s page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewEmployeeForm />
        </CardContent>
      </Card>
    </>
  );
}
