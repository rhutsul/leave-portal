// Правка в «Decisions» (server action editRecord, крок 4 D9 openspec/changes/archive/2026-11-27-impl-on-behalf/design.md):
// форма шле всі поля, тож перед edit_leave_record дія звіряє, що запис не змінився, поки форму було відкрито (друга
// думка до #144) — інакше правка мовчки повернула б чужу зміну. Підмінено лише зовнішнє: серверний клієнт Supabase,
// next/cache і next/navigation. Без AC ID у назвах: це охорона від гонки, а не поведінка з AC; самі AC-BEHALF-06…10
// доводять tests/db/on-behalf.test.ts і tests/e2e/on-behalf-edit.spec.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const MANAGER = "a0000000-0000-0000-0000-000000000002";
const SUB = "a0000000-0000-0000-0000-000000000005";

const h = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  rpcError: null as { code: string; message: string } | null,
  edit: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect ${url}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: MANAGER } }, error: null }) },
    // leave_records: .select(…).eq(id).maybeSingle() — поточний рядок запису.
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.row, error: null }) }) }),
    }),
    rpc: (name: string, args?: unknown) => {
      if (name === "edit_leave_record") h.edit(args);
      return Promise.resolve({ error: h.rpcError });
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));

const { editRecord } = await import("@/app/(app)/decisions/actions");
const { reviewedHours, reviewedRecord } = await import("@/lib/leave/decision");
const { EDIT_MESSAGES } = await import("@/lib/leave/record-edit");

/** Форма, відкрита на записі 2026-12-04 08:30–15:30 «Sick leave» без заміни; менеджер міняє лише тип. */
function form(seen = { date: "2026-12-04", leaveType: "sick", substituteId: null as string | null }, hours = reviewedHours(510, 930)) {
  const data = new FormData();
  data.set("record_id", "7");
  data.set("hours_seen", hours);
  data.set("reviewed", reviewedRecord(seen));
  data.set("date", "2026-12-04");
  data.set("whole_day", "0");
  data.set("start", "08:30");
  data.set("end", "15:30");
  data.set("leave_type", "personal");
  data.set("substitute_id", "none");
  return data;
}

beforeEach(() => {
  h.edit.mockClear();
  h.revalidatePath.mockClear();
  h.redirect.mockClear();
  h.rpcError = null;
  h.row = { date: "2026-12-04", start_min: 510, end_min: 930, leave_type: "sick", substitute_id: null };
});

describe("editRecord does not overwrite a change made while the form was open", () => {
  it("saves when the record is as the manager saw it", async () => {
    await expect(editRecord({ message: "" }, form())).rejects.toThrow("redirect /decisions?record=7&updated=1");
    expect(h.edit).toHaveBeenCalledWith(expect.objectContaining({ p_record_id: 7, p_leave_type: "personal", p_start_min: 510 }));
  });

  it.each([
    ["the employee changed the hours", { start_min: 540 }],
    ["another manager moved the date", { date: "2026-12-03" }],
    ["another manager changed the leave type", { leave_type: "unpaid" }],
    ["another manager set a substitute", { substitute_id: SUB }],
  ])("refuses when %s, without calling edit_leave_record", async (_, change) => {
    h.row = { ...h.row, ...change };
    const state = await editRecord({ message: "" }, form());
    expect(state.message).toBe(EDIT_MESSAGES.changed);
    expect(h.edit).not.toHaveBeenCalled();
    expect(h.revalidatePath).toHaveBeenCalledWith("/decisions");
  });

  it("refuses without what the manager saw (no hidden reviewed value) instead of guessing", async () => {
    const data = form();
    data.delete("reviewed");
    const state = await editRecord({ message: "" }, data);
    expect(state.message).toBe(EDIT_MESSAGES.failed);
    expect(h.edit).not.toHaveBeenCalled();
  });
});
