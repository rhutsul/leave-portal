import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { createClient } from "@/lib/supabase/server";

// Спільна оболонка сторінок після входу: бічне меню й вміст. /login — поза цією групою.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();

  // getClaims() перевіряє JWT. getSession() для авторизації на сервері не використовуємо.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect("/login");
  }

  // RLS: користувач бачить лише власний профіль; my_leave_records — лише власні записи.
  const [{ data: profile }, { count: awaiting }] = await Promise.all([
    supabase.from("profiles").select("email, full_name, role").eq("id", claims.sub).maybeSingle(),
    supabase.from("my_leave_records").select("id", { count: "exact", head: true }).eq("status", "awaiting"),
  ]);
  const email = profile?.email ?? claims.email ?? "";

  return (
    <div className="flex min-h-full flex-1 bg-canvas text-sm text-ink">
      <Sidebar
        name={profile?.full_name ?? email}
        email={email}
        awaiting={awaiting ?? 0}
        canDecide={profile?.role === "manager" || profile?.role === "admin"}
      />
      <main className="min-w-0 flex-1 px-10 pt-8 pb-12">
        <div className="mx-auto flex max-w-270 flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
