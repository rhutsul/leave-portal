import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";
import { NavLinks } from "./nav-links";

// Спільна оболонка сторінок після входу: шапка з навігацією, хто увійшов, вихід. /login — поза цією групою.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();

  // getClaims() перевіряє JWT. getSession() для авторизації на сервері не використовуємо.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect("/login");
  }

  // RLS: користувач бачить лише власний профіль.
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, role")
    .eq("id", claims.sub)
    .maybeSingle();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-8 px-6">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Leave portal
          </Link>
          <NavLinks />
          <div className="ml-auto flex items-center gap-4 text-sm">
            <div className="text-right leading-tight">
              <div data-testid="user-email" className="font-medium">
                {profile?.full_name ?? profile?.email ?? claims.email}
              </div>
              <div data-testid="user-role" className="text-xs text-zinc-500">
                {profile?.email ?? claims.email} · {profile?.role ?? "no profile"}
              </div>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">{children}</main>
    </div>
  );
}
