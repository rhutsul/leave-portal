// Дані Overview v3 (ADR 0007). Права — у базі: власні записи — my_leave_records (RLS), записи посад менеджера —
// decision_records (адміністратору — усі), історія — record_histories (перевіряє доступ сама). Набір статусів у
// фільтрах — BLOCKING_STATUSES (AGENTS.md, «База даних»).
import { formatSchoolYear, schoolYearOf } from "@/lib/leave/balance";
import { historyLine } from "@/lib/leave/decision";
import { overviewRange, twoWeeks } from "@/lib/leave/overview";
import { BLOCKING_STATUSES } from "@/lib/leave/request";
import { formatDateLong, formatRange } from "@/lib/leave/time";
import type { createClient } from "@/lib/supabase/server";
import { loadBalances } from "../balances/load-balances";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const ACTIVITY_LIMIT = 6;

/**
 * Збій запиту — не «порожньо»: інакше менеджер без профілю побачив би вигляд працівника, а збій записів — «No
 * upcoming leave». Помилка йде в (app)/error.tsx.
 */
function must<T extends { error: { message: string } | null }>(result: T, what: string): T {
  if (result.error) throw new Error(`Overview: ${what} could not be loaded: ${result.error.message}`);
  return result;
}

async function loadOwn(supabase: Supabase, userId: string, today: string, page: number) {
  // Місяць із точок і показані два тижні діаграми (сторінка `page`) — одним запитом.
  const { loadFrom: from, loadTo: to } = overviewRange(today, page);
  const schoolYear = schoolYearOf(today);
  const [profile, mine, upcoming, returned, returnedCount, awaiting, balances] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", userId).maybeSingle(),
    supabase
      .from("my_leave_records")
      .select("id, date, start_min, end_min, minutes, leave_type, status, position_id, position_title, division_name")
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
    // Лічильник — окремо від списку з трьох: повернених може бути більше.
    supabase.from("my_leave_records").select("id", { count: "exact", head: true }).eq("status", "returned"),
    supabase.from("my_leave_records").select("id", { count: "exact", head: true }).eq("status", "awaiting"),
    loadBalances(supabase, userId, schoolYear),
  ]);
  return {
    profile: must(profile, "the profile").data,
    mine: must(mine, "the records of the month").data ?? [],
    upcoming: must(upcoming, "the upcoming leave").data ?? [],
    returned: must(returned, "the returned records").data ?? [],
    returnedCount: must(returnedCount, "the returned records").count ?? 0,
    awaiting: must(awaiting, "the records awaiting decision").count ?? 0,
    balances,
    schoolYearLabel: formatSchoolYear(schoolYear),
  };
}

/** Блоки менеджера й адміністратора: хто з їхніх посад відсутній і що чекає їхнього рішення. */
async function loadDecider(supabase: Supabase, days: readonly string[], thisWeek: readonly string[] | null) {
  const [away, awayNow, toDecide] = await Promise.all([
    supabase
      .rpc("decision_records")
      .select("id, employee_id, employee_name, position_title, division_name, date, start_min, end_min, minutes, leave_type, status")
      .gte("date", days[0])
      .lte("date", days[9])
      .in("status", [...BLOCKING_STATUSES]),
    // «N people are away this week» у привітанні — завжди про цей тиждень: коли діаграму погортано, його записів
    // серед показаних немає, тож беремо їх окремо.
    thisWeek
      ? supabase.rpc("decision_records").select("employee_id, date, status").gte("date", thisWeek[0]).lte("date", thisWeek[4]).eq("status", "approved")
      : null,
    supabase
      .rpc("decision_records", undefined, { count: "exact" })
      .select("id, employee_name, position_title, division_name, date, start_min, end_min")
      .eq("status", "awaiting")
      .eq("can_decide", true)
      .order("date", { ascending: true })
      .limit(3),
  ]);
  return {
    away: must(away, "the leave of your positions").data ?? [],
    awayNow: awayNow ? (must(awayNow, "the leave of this week").data ?? []) : (away.data ?? []),
    toDecide: must(toDecide, "the records to decide").data ?? [],
    toDecideCount: toDecide.count ?? 0,
  };
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
 * адміністратор). Тема рядка — дата й години запису, у менеджера ще й ім'я працівника. Стрічка — не головне на
 * сторінці, тож її збій не валить сторінку: null — і замість рядків пояснення.
 */
async function loadActivity(supabase: Supabase, decider: boolean): Promise<ActivityLine[] | null> {
  const subjects = new Map<number, { name: string | null; text: string }>();
  if (decider) {
    const { data, error } = await supabase
      .rpc("decision_records")
      .select("id, employee_name, date, start_min, end_min, created_at")
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) return null;
    for (const r of data ?? []) subjects.set(r.id, { name: r.employee_name, text: `${formatDateLong(r.date)} · ${formatRange(r.start_min, r.end_min)}` });
  } else {
    const { data, error } = await supabase
      .from("my_leave_records")
      .select("id, date, start_min, end_min, created_at")
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) return null;
    for (const r of data ?? []) subjects.set(r.id!, { name: null, text: `${formatDateLong(r.date!)} · ${formatRange(r.start_min!, r.end_min!)}` });
  }
  if (!subjects.size) return [];
  const { data, error } = await supabase.rpc("record_histories", { p_record_ids: [...subjects.keys()] });
  if (error) return null;
  return [...(data ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, ACTIVITY_LIMIT)
    .map((h) => {
      const line = historyLine({ createdAt: h.created_at, action: h.action, actorName: h.actor_name, comment: h.comment });
      const subject = subjects.get(h.record_id);
      // Ім'я працівника — лише коли дію зробив хтось інший: «Андрій · Андрій · …» нічого не додає.
      const whose = subject?.name && subject.name !== line.who ? `${subject.name} · ` : "";
      return { ...line, action: h.action, subject: `${whose}${subject?.text ?? ""}` };
    });
}

/** Блок тижневого розкладу посади: weekday 1 = понеділок, хвилини від півночі. */
export interface PositionBlock {
  weekday: number;
  start: number;
  end: number;
}

/**
 * Розклад посад записів діаграми — шкала її клітинок (робочий день посади). Посаду запису менеджера дає leave_records
 * (decision_records її id не віддає); розклад — schedule_blocks. Обидва за наявним RLS: власні, керовані посади,
 * адміністратору — усі. Діаграма без розкладу лишається (шкала 08:00–18:00), тож збій — null, а не помилка сторінки.
 */
async function loadTimelineSchedules(
  supabase: Supabase,
  recordIds: readonly number[],
  known: ReadonlyMap<number, number> | null,
): Promise<{ positionOf: Map<number, number>; blocks: Map<number, PositionBlock[]> } | null> {
  if (recordIds.length === 0) return { positionOf: new Map(), blocks: new Map() };
  let positionOf = known ? new Map(known) : null;
  if (!positionOf) {
    const { data, error } = await supabase.from("leave_records").select("id, position_id").in("id", [...recordIds]);
    if (error) return null;
    positionOf = new Map((data ?? []).map((r) => [r.id, r.position_id]));
  }
  const positions = [...new Set(positionOf.values())];
  const { data, error } = await supabase.from("schedule_blocks").select("position_id, weekday, start_min, end_min").in("position_id", positions);
  if (error) return null;
  const blocks = new Map<number, PositionBlock[]>();
  for (const b of data ?? []) blocks.set(b.position_id, [...(blocks.get(b.position_id) ?? []), { weekday: b.weekday, start: b.start_min, end: b.end_min }]);
  return { positionOf, blocks };
}

export async function loadOverview(supabase: Supabase, userId: string, today: string, page = 0) {
  const own = await loadOwn(supabase, userId, today, page);
  // Пункт «Decisions» і його блоки — лише manager і admin (матриця прав requirements/product.md).
  const decider = own.profile?.role === "manager" || own.profile?.role === "admin";
  const { days } = overviewRange(today, page);
  const [deciderData, activity] = await Promise.all([
    decider ? loadDecider(supabase, days, page === 0 ? null : twoWeeks(today)) : null,
    loadActivity(supabase, decider),
  ]);
  const schedules = await (deciderData
    ? loadTimelineSchedules(supabase, deciderData.away.map((r) => r.id), null)
    : loadTimelineSchedules(
        supabase,
        own.mine.map((r) => r.id!),
        new Map(own.mine.map((r) => [r.id!, r.position_id!])),
      )
  ).catch(() => null);
  return { ...own, decider, deciderData, activity, schedules };
}

export type OverviewData = Awaited<ReturnType<typeof loadOverview>>;
