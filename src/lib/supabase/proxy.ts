// Оновлення сесії Supabase на кожен запит (викликається з src/proxy.ts).
// Офіційний патерн @supabase/ssr ≥ 0.10: setAll(cookies, headers) — заголовки
// Cache-Control/Expires/Pragma копіюємо у відповідь, щоб CDN не кешував auth-відповіді.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

// Шляхи, доступні без входу: сторінки входу й публічна перевірка здоров'я проду (D0).
const PUBLIC_PATHS = ["/login", "/auth", "/api/health"];
// Landing для відвідувача (ADR 0007) — лише точний шлях: `/welcome-anything` за входом, як і решта.
const WELCOME_PATH = "/welcome";

/**
 * Куди відправити гостя (без входу), або null — шлях публічний. Гість, що відкрив саме `/`, бачить landing; на будь-якому
 * іншому захищеному шляху — сторінку входу, як і раніше (AC-CAL-14 з вимог PM: календар за прямим посиланням).
 */
export function guestRedirect(pathname: string): string | null {
  if (pathname === WELCOME_PATH) return null;
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) return null;
  return pathname === "/" ? WELCOME_PATH : "/login";
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Між createServerClient і getClaims() не додавайте жодного коду:
  // інакше користувачів може випадково «розлогінювати».
  // getClaims() перевіряє підпис JWT; getSession() для авторизації НЕ використовуємо.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const target = claims ? null : guestRedirect(request.nextUrl.pathname);
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url);
  }

  // Повертаємо саме supabaseResponse: у ньому оновлені cookie сесії.
  return supabaseResponse;
}
