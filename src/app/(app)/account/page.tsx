import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Account" };

const ROLE_LABELS: Record<string, string> = {
  employee: "Employee",
  manager: "Manager",
  admin: "Administrator",
};

/**
 * Акаунт (ADR 0011): однаково для кожної ролі. Ім'я, email і роль — лише для читання (ім'я й email змінює
 * адміністратор, requirements/product.md); пароль — свій, з поточним паролем.
 */
export default async function AccountPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  // RLS: користувач бачить лише власний профіль.
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, role")
    .eq("id", claims.sub)
    .maybeSingle();
  const email = profile?.email ?? claims.email ?? "";
  const name = profile?.full_name ?? email;
  const role = profile?.role ? (ROLE_LABELS[profile.role] ?? profile.role) : "—";

  return (
    <>
      <PageHeader title="Account" description="Your details and password." />
      <div className="flex flex-wrap items-start gap-6">
        <Card className="min-w-0 flex-[1_1_280px]">
          <CardHeader>
            <CardTitle>Your details</CardTitle>
            <CardDescription>Your school administrator changes your name and email.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3.5">
              <Detail label="Name" value={name} />
              <Detail label="Email" value={email} />
              <Detail label="Role" value={role} />
            </dl>
          </CardContent>
        </Card>
        <Card className="min-w-0 flex-[999_1_420px]">
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>You stay signed in here; other devices are signed out.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}
