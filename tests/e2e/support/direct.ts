// «Напряму, оминаючи сторінки порталу» (AC-CAL-13): запит до Data API Supabase з сесією користувача, що увійшов, —
// так, як це зробив би він сам із консолі браузера. Сесію беремо з cookie збереженого стану ролі
// (playwright/.auth/<role>.json, @supabase/ssr: sb-<ref>-auth-token, можливо частинами .0, .1, з префіксом base64-).
// Значення токена не друкуємо й не прикріплюємо до звіту — лише статус і код відповіді.
import { readFileSync } from "node:fs";

function accessToken(role: string): string {
  const state = JSON.parse(readFileSync(`playwright/.auth/${role}.json`, "utf8")) as {
    cookies: { name: string; value: string }[];
  };
  const parts = state.cookies
    .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => Number(a.name.split(".").pop()) - Number(b.name.split(".").pop()));
  if (parts.length === 0) throw new Error(`немає cookie сесії Supabase у стані ролі ${role}`);
  let raw = parts.map((c) => decodeURIComponent(c.value)).join("");
  if (raw.startsWith("base64-")) raw = Buffer.from(raw.slice("base64-".length), "base64url").toString("utf8");
  const session = JSON.parse(raw) as { access_token?: string };
  if (!session.access_token) throw new Error(`у сесії ролі ${role} немає access_token`);
  return session.access_token;
}

/** Запит до Data API від імені ролі; повертає статус і код помилки Postgres (без тіла з даними). */
export async function asRole(
  role: string,
  path: string,
  init: { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown },
): Promise<{ status: number; code: string | null; message: string | null }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Для прямого запиту потрібні NEXT_PUBLIC_SUPABASE_URL і NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: init.method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken(role)}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let code: string | null = null;
  let message: string | null = null;
  try {
    const parsed = JSON.parse(text) as { code?: string; message?: string };
    code = parsed.code ?? null;
    message = parsed.message ?? null;
  } catch {
    // порожнє тіло (204) — не помилка розбору
  }
  return { status: res.status, code, message };
}
