// Публічна сторінка стану /status (WS11): лише те, що важить відвідувачу, — чи працює застосунок і чи були збої.
// Історія — з прогонів smoke ПРОДУ в GitHub Actions (.github/workflows/smoke.yml): події `schedule` (щодня) і
// `status` (після кожного деплою main) запускають лише job `prod`. `repository_dispatch` (preview, staging) і ручний
// `workflow_dispatch` (навмисно червоні тести алерту) прод не перевіряють — їх не рахуємо. Чиста логіка без мережі.
import { kyivDate } from "@/lib/leave/time";

/** Один прогін smoke, як його віддає GitHub API (лише потрібні поля). */
export type SmokeRun = { event: string; conclusion: string | null; createdAt: string; updatedAt: string };

export type DayState = "ok" | "issues" | "none";
export type DayStatus = {
  /** Календарна дата за Києвом, YYYY-MM-DD. */
  date: string;
  state: DayState;
  /** Скільки перевірок проду того дня впало. */
  failures: number;
  /** Найдовший збій того дня, хв (від червоної перевірки до наступної зеленої); null — не було чи ще триває. */
  longestMinutes: number | null;
  /** Збій того дня ще не закрито (зеленої перевірки після нього немає). */
  ongoing: boolean;
};

const PROD_EVENTS = new Set(["schedule", "status"]);
const DAY_MS = 86_400_000;

/** Лише прогони, що справді перевіряли прод і дійшли до результату. */
export function prodRuns(runs: SmokeRun[]): SmokeRun[] {
  return runs
    .filter((r) => PROD_EVENTS.has(r.event) && (r.conclusion === "success" || r.conclusion === "failure"))
    .toSorted((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** Останні `days` днів за Києвом, від найстаршого до сьогодні, зі станом кожного. */
export function buildHistory(runs: SmokeRun[], now: Date, days = 30): DayStatus[] {
  const checks = prodRuns(runs);
  const out = new Map<string, DayStatus>();
  // Календарні дні від сьогоднішньої дати за Києвом, а не «мінус 24 год»: у день переходу на зимовий час доба
  // довша, і крок у 24 год пропустив би дату.
  const today = Date.parse(`${kyivDate(now)}T00:00:00Z`);
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today - i * DAY_MS).toISOString().slice(0, 10);
    out.set(date, { date, state: "none", failures: 0, longestMinutes: null, ongoing: false });
  }
  checks.forEach((run, index) => {
    const day = out.get(kyivDate(new Date(run.createdAt)));
    if (!day) return;
    if (run.conclusion === "success") {
      if (day.state === "none") day.state = "ok";
      return;
    }
    day.state = "issues";
    day.failures += 1;
    // Відновлення — зелена перевірка, що й завершилась після червоної (почати пізніше могла, а закінчити — раніше).
    const failedAt = Date.parse(run.updatedAt);
    const recovered = checks
      .slice(index + 1)
      .find((r) => r.conclusion === "success" && Date.parse(r.updatedAt) >= failedAt);
    if (!recovered) {
      day.ongoing = true;
      return;
    }
    const minutes = Math.max(1, Math.round((Date.parse(recovered.updatedAt) - failedAt) / 60_000));
    day.longestMinutes = Math.max(day.longestMinutes ?? 0, minutes);
  });
  return [...out.values()];
}

/** Короткий підпис дня для підказки й зчитувача екрана. */
export function describeDay(day: DayStatus): string {
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day.date}T12:00:00Z`),
  );
  if (day.state === "none") return `${date} — no checks`;
  if (day.state === "ok") return `${date} — no issues`;
  const checks = `${day.failures} failed ${day.failures === 1 ? "check" : "checks"}`;
  if (day.ongoing) return `${date} — ${checks}, not resolved yet`;
  return `${date} — ${checks}, resolved in ${formatMinutes(day.longestMinutes ?? 0)}`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Скільки днів із перевірками пройшли без збоїв — чесніше за «99.9%» з нічого. */
export function summarize(history: DayStatus[]): { clean: number; checked: number } {
  const checked = history.filter((d) => d.state !== "none");
  return { clean: checked.filter((d) => d.state === "ok").length, checked: checked.length };
}

export type OverallState = "operational" | "outage";

/** Загальний стан зараз: база відповідає — працює; ні — збій. */
export function overallState(dbOk: boolean): OverallState {
  return dbOk ? "operational" : "outage";
}
