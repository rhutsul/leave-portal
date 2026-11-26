// Рішення в «Decisions» (server action decideRecord, крок 2 D9 openspec/changes/impl-on-behalf/design.md): що бачив
// менеджер (приховане поле reviewed) звіряється з рядком черги й іде в decide_leave_record як p_date, p_leave_type,
// p_substitute_id. Підмінено лише зовнішнє: серверний клієнт Supabase, next/cache і next/navigation. Без AC ID у назвах:
// AC-BEHALF-06…08 (правка запису) ще «відкладено»; саму відмову бази після чужої правки доводить tests/db/on-behalf.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const MANAGER = "a0000000-0000-0000-0000-000000000002";
const EMPLOYEE = "a0000000-0000-0000-0000-000000000004";
const SUB = "a0000000-0000-0000-0000-000000000005";

const h = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  rpcError: null as { code: string; message: string } | null,
  decide: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect ${url}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: MANAGER } }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: "manager" }, error: null }) }) }),
    }),
    rpc: (name: string, args?: unknown) => {
      if (name === "decide_leave_record") {
        h.decide(args);
        return Promise.resolve({ error: h.rpcError });
      }
      // decision_records: .eq(id).maybeSingle() — рядок запису; .select("id").eq(status) — черга.
      return {
        eq: () => ({ maybeSingle: async () => ({ data: h.row, error: null }) }),
        select: () => ({ eq: async () => ({ data: h.row ? [{ id: h.row.id }] : [], error: null }) }),
      };
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));

const { decideRecord } = await import("@/app/(app)/decisions/actions");
const { DECISION_MESSAGES, reviewedHours, reviewedRecord } = await import("@/lib/leave/decision");

const FAILED = "The decision could not be saved. Please try again.";

function form(reviewed: string | null, hours = reviewedHours(510, 930)) {
  const data = new FormData();
  data.set("record_id", "7");
  data.set("decision", "approve");
  data.set("hours", hours);
  if (reviewed !== null) data.set("reviewed", reviewed);
  return data;
}

beforeEach(() => {
  h.decide.mockClear();
  h.revalidatePath.mockClear();
  h.rpcError = null;
  h.row = {
    id: 7,
    employee_id: EMPLOYEE,
    status: "awaiting",
    start_min: 510,
    end_min: 930,
    date: "2026-12-04",
    leave_type: "sick",
  };
});

describe("decideRecord sends what the manager saw", () => {
  it("passes the reviewed date, leave type and substitute to decide_leave_record", async () => {
    const state = await decideRecord({ message: "" }, form(reviewedRecord({ date: "2026-12-04", leaveType: "sick", substituteId: SUB })));
    expect(state.message).toBe("");
    expect(h.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        p_record_id: 7,
        p_decision: "approve",
        p_start_min: 510,
        p_end_min: 930,
        p_date: "2026-12-04",
        p_leave_type: "sick",
        p_substitute_id: SUB,
      }),
    );
  });

  it("sends «No substitute» as null, not as «don't check»", async () => {
    await decideRecord({ message: "" }, form(reviewedRecord({ date: "2026-12-04", leaveType: "sick", substituteId: null })));
    expect(h.decide).toHaveBeenCalledWith(expect.objectContaining({ p_substitute_id: null }));
  });

  it("a date or leave type changed since the panel was shown is reported without calling the database", async () => {
    for (const seen of [
      { date: "2026-12-03", leaveType: "sick", substituteId: null },
      { date: "2026-12-04", leaveType: "personal", substituteId: null },
    ]) {
      const state = await decideRecord({ message: "" }, form(reviewedRecord(seen)));
      expect(state.message).toBe(DECISION_MESSAGES.recordChanged);
    }
    expect(h.decide).not.toHaveBeenCalled();
    expect(h.revalidatePath).toHaveBeenCalledWith("/decisions");
  });

  it("a missing or forged reviewed field is an honest failure, not a decision", async () => {
    for (const reviewed of [null, "", "2026-12-04|sick|teacher2", "garbage"]) {
      const state = await decideRecord({ message: "" }, form(reviewed));
      expect(state.message).toBe(FAILED);
    }
    expect(h.decide).not.toHaveBeenCalled();
  });

  it("the database's own refusal after another manager's change is shown verbatim", async () => {
    h.rpcError = { code: "P0001", message: DECISION_MESSAGES.recordChanged };
    const state = await decideRecord({ message: "" }, form(reviewedRecord({ date: "2026-12-04", leaveType: "sick", substituteId: SUB })));
    expect(state.message).toBe(DECISION_MESSAGES.recordChanged);
  });
});
