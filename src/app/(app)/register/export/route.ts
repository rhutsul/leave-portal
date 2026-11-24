import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadRegister, registerExport } from "../load-register";

// Реєстр зав'язаний на сесію й поточні дані — ніколи не кешується.
export const dynamic = "force-dynamic";

/**
 * CSV реєстру погоджених відсутностей (ADR 0012): ті самі дані й та сама перевірка доступу, що на /register, —
 * public.register_divisions і public.approved_register. `?division=<code>&month=YYYY-MM` — обов'язкові. Без входу —
 * 401; без параметрів — 400; підрозділ не з доступних (зокрема працівнику) — 403.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const result = data?.claims
    ? registerExport(await loadRegister(supabase, params, { strict: true }))
    : { ok: false as const, status: 401, message: "Sign in to download the register." };

  if (!result.ok) {
    return new Response(result.message, {
      status: result.status,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return new Response(result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
