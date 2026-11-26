import { uuidOf } from "@/lib/staff/employee";
import { staffSession } from "./admin-session";
import { loadStaffPositions, type StaffPosition } from "./load-staff-positions";

/**
 * Працівник для сторінок посад (D10): лише адміністратору; неіснуючий працівник чи посада — та сама відмова, що й без
 * права (AC-STAFF-13). null — показати StaffDenied.
 */
export async function employeeContext(rawId: string, rawPositionId?: string) {
  const { supabase, isAdmin } = await staffSession();
  if (!isAdmin) return null;
  const id = uuidOf(rawId);
  if (!id) return null;
  const { data } = await supabase.rpc("staff_employees").eq("id", id);
  const employee = data?.[0];
  if (!employee) return null;
  const positions = await loadStaffPositions(supabase, id);
  let position: StaffPosition | null = null;
  if (rawPositionId !== undefined) {
    position = positions.find((p) => String(p.id) === rawPositionId) ?? null;
    if (!position) return null;
  }
  return { supabase, employee, positions, position, name: employee.full_name || employee.email };
}
