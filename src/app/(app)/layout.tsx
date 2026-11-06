import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MobileNav } from "@/components/mobile-nav";
import { Sidebar } from "@/components/sidebar";
import { isSidebarCollapsed, parseTheme, SIDEBAR_COOKIE, THEME_COOKIE } from "@/lib/preferences";
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

  // RLS: користувач бачить лише власний профіль; my_leave_records — лише власні записи. Лічильник «Decisions» —
  // записи, які користувач може вирішити (decision_records: посади менеджера, адміністратору — усі); працівнику
  // can_decide завжди false, тож запит іде разом з іншими, а не після профілю — на одну подорож до бази менше.
  const [{ data: profile }, { count: awaiting }, { count: decidable }] = await Promise.all([
    supabase.from("profiles").select("email, full_name, role").eq("id", claims.sub).maybeSingle(),
    supabase.from("my_leave_records").select("id", { count: "exact", head: true }).eq("status", "awaiting"),
    supabase
      .rpc("decision_records", undefined, { count: "exact", head: true })
      .eq("status", "awaiting")
      .eq("can_decide", true),
  ]);
  // Пункт «Decisions» — лише manager і admin.
  const canDecide = profile?.role === "manager" || profile?.role === "admin";
  const toDecide = canDecide ? decidable : 0;
  const email = profile?.email ?? claims.email ?? "";
  // Тема й згорнута панель — з cookie (ADR 0005), щоб перша відповідь сервера вже була в потрібному вигляді.
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const name = profile?.full_name ?? email;

  // Від lg — бічна панель; вужче — шапка з кнопкою меню (ADR 0008). Поля сторінки — p-4 / md:p-6 / lg:p-8.
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-sm text-foreground lg:flex-row">
      <Sidebar
        name={name}
        email={email}
        awaiting={awaiting ?? 0}
        toDecide={toDecide ?? 0}
        canDecide={canDecide}
        theme={theme}
        initialCollapsed={isSidebarCollapsed(cookieStore.get(SIDEBAR_COOKIE)?.value)}
      />
      <MobileNav
        name={name}
        email={email}
        awaiting={awaiting ?? 0}
        toDecide={toDecide ?? 0}
        canDecide={canDecide}
        theme={theme}
      />
      <main className="min-w-0 flex-1 px-4 pt-4 pb-10 md:px-6 md:pt-6 lg:px-8 lg:pt-8 lg:pb-12">
        <div className="mx-auto flex max-w-[1220px] flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
