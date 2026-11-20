// WS11: UAT на staging за захистом Vercel (Standard Protection). Один раз перед прогоном — запит до розгорнутого хосту
// із заголовком x-vercel-protection-bypass і x-vercel-set-bypass-cookie: Vercel відповідає cookie обходу лише для
// цього хосту. Cookie кладемо в playwright/.auth/vercel.json (у .gitignore) — це стартовий storageState кожного
// контексту, тож і стани ролей з auth.setup.ts його успадковують. Сам секрет у браузер не потрапляє: заголовок не йде
// ні на Supabase, ні на інші сторонні адреси (друга думка до #105). Значення секрету не друкуємо.
// Локальний сервер (без UAT_BASE_URL) чи прогін без секрету — файл з порожнім станом, нічого не робимо.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { request } from "@playwright/test";

const VERCEL_STATE = "playwright/.auth/vercel.json";

export default async function globalSetup() {
  mkdirSync(path.dirname(VERCEL_STATE), { recursive: true });
  const base = process.env.UAT_BASE_URL?.replace(/\/+$/, "");
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!base || !secret) {
    writeFileSync(VERCEL_STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }
  const api = await request.newContext({ baseURL: base });
  try {
    const res = await api.get("/api/health", {
      headers: { "x-vercel-protection-bypass": secret, "x-vercel-set-bypass-cookie": "true" },
      maxRedirects: 0,
    });
    if (res.status() === 401 || res.status() === 403) {
      throw new Error(`Захист Vercel не пропустив перепустку (HTTP ${res.status()}) — звірте VERCEL_AUTOMATION_BYPASS_SECRET у .env.local`);
    }
    await api.storageState({ path: VERCEL_STATE });
  } finally {
    await api.dispose();
  }
}
