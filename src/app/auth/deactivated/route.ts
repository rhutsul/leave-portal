import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Деактивований із ще чинним токеном (AC-STAFF-08, D6): оболонка (app)/layout.tsx веде сюди, бо серверний компонент
 * cookie не змінює. Тут сесію закриваємо (лише цю, scope "local") і показуємо вхід із текстом AC. Права в базі вже
 * закриті (current_app_role, acting_manager_ids, require_active) — це лише виводить людину з інтерфейсу.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "?error=deactivated";
  return NextResponse.redirect(url);
}
