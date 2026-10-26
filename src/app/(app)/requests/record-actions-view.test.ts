import { describe, expect, it } from "vitest";
import { employeeActions, RECORD_EDIT_MESSAGES } from "@/lib/leave/decision";
import { errorPlacement, visiblePanel } from "./record-actions-view";

describe("My requests: record action dialogs", () => {
  it("AC-DECIDE-12: the record was approved while Change hours was open — the message shows under the row", () => {
    const panel = visiblePanel("hours", employeeActions("approved"));
    expect(panel).toBeNull();
    expect(errorPlacement(panel, RECORD_EDIT_MESSAGES.approved)).toEqual({
      inDialog: "",
      underRow: "This record is already approved and cannot be changed",
    });
  });

  it("AC-DECIDE-12: the same holds for Cancel record on a record approved meanwhile", () => {
    const panel = visiblePanel("cancel", employeeActions("approved"));
    expect(panel).toBeNull();
    expect(errorPlacement(panel, RECORD_EDIT_MESSAGES.approved).underRow).toBe(RECORD_EDIT_MESSAGES.approved);
  });

  it("AC-DECIDE-12: before approval Change hours stays open and its error shows inside the dialog", () => {
    const panel = visiblePanel("hours", employeeActions("awaiting"));
    expect(panel).toBe("hours");
    expect(errorPlacement(panel, "Hours must be within your schedule: 08:30–15:30")).toEqual({
      inDialog: "Hours must be within your schedule: 08:30–15:30",
      underRow: "",
    });
  });

  it("AC-DECIDE-12: View details of an approved record stays open, and nothing shows without an error", () => {
    expect(visiblePanel("details", employeeActions("approved"))).toBe("details");
    expect(visiblePanel(null, employeeActions("awaiting"))).toBeNull();
    expect(errorPlacement(null, "")).toEqual({ inDialog: "", underRow: "" });
  });
});
