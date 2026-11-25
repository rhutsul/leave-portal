import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MobileNav } from "@/components/mobile-nav";
import { Sidebar } from "@/components/sidebar";
import { isSidebarCollapsed, parseTheme, SIDEBAR_COOKIE, THEME_COOKIE } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";

type NavProfile = { role: string; email: string | null; full_name: string | null } | null;

/**
 * Що показує меню: пункт «Decisions» — лише manager і admin; «Employees» — лише admin (AC-STAFF-13). Лічильник
 * «Decisions» — записи, які користувач може вирішити, і прохання про скасування (власні вирішує адміністратор, тож
 * менеджеру їх не рахуємо).
 */
function navState(
  profile: NavProfile,
  userId: string,
  decidable: number | null,
  requests: { employee_id: string }[] | null,
) {
  const role = profile?.role;
  const canDecide = role === "manager" || role === "admin";
  const cancellations = (requests ?? []).filter((r) => role === "admin" || r.employee_id !== userId).length;
  return { canDecide, isAdmin: role === "admin", toDecide: canDecide ? (decidable ?? 0) + cancellations : 0 };
}

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
  // Прохання про скасування погоджених записів (D11) — теж чекають рішення: RLS показує менеджеру записи його посад
  // (і власні — їх вирішує адміністратор, тож не рахуємо), адміністратору — усі. Збій — без них.
  const [{ data: profile }, { count: awaiting }, { count: decidable }, { data: requests }] = await Promise.all([
    supabase.from("profiles").select("email, full_name, role, deactivated_at").eq("id", claims.sub).maybeSingle(),
    supabase.from("my_leave_records").select("id", { count: "exact", head: true }).eq("status", "awaiting"),
    supabase
      .rpc("decision_records", undefined, { count: "exact", head: true })
      .eq("status", "awaiting")
      .eq("can_decide", true),
    supabase.from("leave_records").select("employee_id").not("cancel_reason", "is", null),
  ]);
  // Деактивований із ще чинним токеном (AC-STAFF-08): вихід і вхід із текстом AC (cookie змінює лише route handler).
  if (profile?.deactivated_at) redirect("/auth/deactivated");
  const { canDecide, isAdmin, toDecide } = navState(profile, claims.sub, decidable, requests);
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
        isAdmin={isAdmin}
        theme={theme}
        initialCollapsed={isSidebarCollapsed(cookieStore.get(SIDEBAR_COOKIE)?.value)}
      />
      <MobileNav
        name={name}
        email={email}
        awaiting={awaiting ?? 0}
        toDecide={toDecide ?? 0}
        canDecide={canDecide}
        isAdmin={isAdmin}
        theme={theme}
      />
      <main className="min-w-0 flex-1 px-4 pt-4 pb-10 md:px-6 md:pt-6 lg:px-8 lg:pt-8 lg:pb-12">
        <div className="mx-auto flex max-w-[1220px] flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
