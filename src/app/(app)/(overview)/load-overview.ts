// Дані Overview v3 (ADR 0007). Права — у базі: власні записи — my_leave_records (RLS), записи посад менеджера —
// decision_records (адміністратору — усі), історія — record_histories (перевіряє доступ сама). Набір статусів у
// фільтрах — BLOCKING_STATUSES (AGENTS.md, «База даних»).
import { formatSchoolYear, schoolYearOf } from "@/lib/leave/balance";
import { historyLine } from "@/lib/leave/decision";
import { overviewRange } from "@/lib/leave/overview";
import { BLOCKING_STATUSES } from "@/lib/leave/request";
import { formatDateLong, formatRange } from "@/lib/leave/time";
import type { createClient } from "@/lib/supabase/server";
import { loadBalances } from "../balances/load-balances";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const ACTIVITY_LIMIT = 6;

async function loadOwn(supabase: Supabase, userId: string, today: string) {
  const { from, to } = overviewRange(today);
  const schoolYear = schoolYearOf(today);
  const [profile, mine, upcoming, returned, awaiting, balances] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", userId).maybeSingle(),
    supabase
      .from("my_leave_records")
      .select("id, date, start_min, end_min, status, position_id, position_title, division_name")
      .gte("date", from)
      .lte("date", to)
      .in("status", [...BLOCKING_STATUSES]),
    supabase
      .from("my_leave_records")
      .select("id, request_id, date, start_min, end_min, leave_type, status, position_title, division_name")
      .gte("date", today)
      .in("status", [...BLOCKING_STATUSES])
      .order("date", { ascending: true })
      .order("start_min", { ascending: true })
      .limit(20),
    supabase
      .from("my_leave_records")
      .select("id, date, start_min, end_min, position_title, division_name, manager_comment")
      .eq("status", "returned")
      .order("date", { ascending: true })
      .limit(3),
    supabase.from("my_leave_records").select("id", { count: "exact", head: true }).eq("status", "awaiting"),
    loadBalances(supabase, userId, schoolYear),
  ]);
  return {
    profile: profile.data,
    mine: mine.data ?? [],
    upcoming: upcoming.data ?? [],
    returned: returned.data ?? [],
    awaiting: awaiting.count ?? 0,
    balances,
    schoolYearLabel: formatSchoolYear(schoolYear),
  };
}

/** Блоки менеджера й адміністратора: хто з їхніх посад відсутній і що чекає їхнього рішення. */
async function loadDecider(supabase: Supabase, days: readonly string[]) {
  const [away, toDecide] = await Promise.all([
    supabase
      .rpc("decision_records")
      .select("id, employee_id, employee_name, position_title, division_name, date, start_min, end_min, status")
      .gte("date", days[0])
      .lte("date", days[9])
      .in("status", [...BLOCKING_STATUSES]),
    supabase
      .rpc("decision_records", undefined, { count: "exact" })
      .select("id, employee_name, position_title, division_name, date, start_min, end_min")
      .eq("status", "awaiting")
      .eq("can_decide", true)
      .order("date", { ascending: true })
      .limit(3),
  ]);
  return { away: away.data ?? [], toDecide: toDecide.data ?? [], toDecideCount: toDecide.count ?? 0 };
}

export interface ActivityLine {
  at: string;
  who: string;
  what: string;
  action: string;
  subject: string;
}

/**
 * Стрічка дій: останні події історії свіжих записів — власних (працівник) або записів посад (менеджер,
 * адміністратор). Тема рядка — дата й години запису, у менеджера ще й ім'я працівника.
 */
async function loadActivity(supabase: Supabase, decider: boolean): Promise<ActivityLine[]> {
  const subjects = new Map<number, string>();
  if (decider) {
    // Сортуємо тут, а не в запиті: order за полем, якого немає у вибірці функції, повертав порожньо.
    const { data } = await supabase.rpc("decision_records").select("id, employee_name, date, start_min, end_min, created_at");
    const fresh = [...(data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
    for (const r of fresh) subjects.set(r.id, `${r.employee_name} · ${formatDateLong(r.date)} · ${formatRange(r.start_min, r.end_min)}`);
  } else {
    const { data } = await supabase
      .from("my_leave_records")
      .select("id, date, start_min, end_min")
      .order("created_at", { ascending: false })
      .limit(8);
    for (const r of data ?? []) subjects.set(r.id!, `${formatDateLong(r.date!)} · ${formatRange(r.start_min!, r.end_min!)}`);
  }
  if (!subjects.size) return [];
  const { data } = await supabase.rpc("record_histories", { p_record_ids: [...subjects.keys()] });
  return [...(data ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, ACTIVITY_LIMIT)
    .map((h) => ({
      ...historyLine({ createdAt: h.created_at, action: h.action, actorName: h.actor_name, comment: h.comment }),
      action: h.action,
      subject: subjects.get(h.record_id) ?? "",
    }));
}

export async function loadOverview(supabase: Supabase, userId: string, today: string) {
  const own = await loadOwn(supabase, userId, today);
  // Пункт «Decisions» і його блоки — лише manager і admin (матриця прав requirements/product.md).
  const decider = own.profile?.role === "manager" || own.profile?.role === "admin";
  const { days } = overviewRange(today);
  const [deciderData, activity] = await Promise.all([
    decider ? loadDecider(supabase, days) : null,
    loadActivity(supabase, decider),
  ]);
  return { ...own, decider, deciderData, activity };
}

export type OverviewData = Awaited<ReturnType<typeof loadOverview>>;
