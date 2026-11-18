// WS11, B: навмисна помилка сервера — доказ, що трекер (onRequestError у src/instrumentation.ts) надсилає повідомлення.
// Лише для адміністратора: getClaims() (JWT), роль — з profiles.role, не з user_metadata і не getSession(). Гість чи
// інша роль — 404, ніби маршруту немає (proxy гостя ще раніше відправляє на /login). Помилка не несе даних користувача;
// її текст у повідомлення все одно не йде — лише назва класу, маршрут і рядки стеку.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Окремий клас, щоб у чаті було видно: це навмисна перевірка, а не збій. */
class DeliberateServerError extends Error {
  override name = "DeliberateServerError";
}

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return notFound();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profile?.role !== "admin") return notFound();
  throw new DeliberateServerError("deliberate server error for the error tracker check");
}

function notFound() {
  return NextResponse.json({ error: "not found" }, { status: 404, headers: { "cache-control": "no-store" } });
}
