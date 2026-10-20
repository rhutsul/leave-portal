"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  buildDayRecords,
  checkLeaveType,
  positionsOnDate,
  toRpcRecords,
  type PositionChoice,
} from "@/lib/leave/request";
import { createClient } from "@/lib/supabase/server";
import { loadOwnPositions } from "./load-positions";

export interface SubmitState {
  message: string;
}

interface Payload {
  date: string;
  leaveType: string;
  relationship: string;
  choices: PositionChoice[];
}

const FAILED = "The request could not be saved. Please try again.";

function parsePayload(raw: FormDataEntryValue | null): Payload | null {
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw) as Partial<Payload>;
    if (typeof value.date !== "string" || typeof value.leaveType !== "string" || !Array.isArray(value.choices)) {
      return null;
    }
    const choices = value.choices.map((c) => ({
      positionId: Number(c.positionId),
      include: c.include === true,
      wholeDay: c.wholeDay === true,
      start: typeof c.start === "string" ? c.start : undefined,
      end: typeof c.end === "string" ? c.end : undefined,
    }));
    return { date: value.date, leaveType: value.leaveType, relationship: String(value.relationship ?? ""), choices };
  } catch {
    return null;
  }
}

// Подання заявки після підсумку. Записи будуємо заново з розкладу в базі (клієнту не довіряємо), а
// submit_leave_request перевіряє все ще раз і створює заявку цілком або нічого.
export async function submitLeaveRequest(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const payload = parsePayload(formData.get("payload"));
  if (!payload) return { message: FAILED };

  const day = positionsOnDate(await loadOwnPositions(supabase, claims.sub), payload.date);
  if (!day.ok) return { message: day.message };
  const records = buildDayRecords(payload.date, day.positions, payload.choices);
  if (!records.ok) return { message: records.message };
  const type = checkLeaveType(payload.leaveType, payload.relationship);
  if (!type.ok) return { message: type.message };

  const { error } = await supabase.rpc("submit_leave_request", {
    p_leave_type: type.leaveType,
    p_records: toRpcRecords(records.records),
    p_relationship: type.relationship ?? undefined,
  });
  if (error) {
    // P0001 — тексти PM з функції бази (той самий другий рубіж); решту працівнику не показуємо.
    return { message: error.code === "P0001" ? error.message : FAILED };
  }

  revalidatePath("/requests");
  redirect("/requests?submitted=1");
}
