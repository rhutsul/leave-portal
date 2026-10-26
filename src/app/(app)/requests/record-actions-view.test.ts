import { describe, expect, it } from "vitest";
import { employeeActions, RECORD_EDIT_MESSAGES } from "@/lib/leave/decision";
import { recordActionsView } from "./record-actions-view";

describe("My requests: record action dialogs", () => {
  it("AC-DECIDE-12: the record was approved while Change hours was open — the message shows under the row", () => {
    expect(recordActionsView("hours", employeeActions("approved"), RECORD_EDIT_MESSAGES.approved)).toEqual({
      panel: null,
      inDialog: "",
      underRow: "This record is already approved and cannot be changed",
    });
  });

  it("AC-DECIDE-12: the same holds for Cancel record on a record approved meanwhile", () => {
    expect(recordActionsView("cancel", employeeActions("approved"), RECORD_EDIT_MESSAGES.approved)).toEqual({
      panel: null,
      inDialog: "",
      underRow: RECORD_EDIT_MESSAGES.approved,
    });
  });

  it("AC-DECIDE-12: before approval Change hours stays open and its error shows inside the dialog", () => {
    expect(
      recordActionsView("hours", employeeActions("awaiting"), "Hours must be within your schedule: 08:30–15:30"),
    ).toEqual({ panel: "hours", inDialog: "Hours must be within your schedule: 08:30–15:30", underRow: "" });
  });

  it("AC-DECIDE-12: View details of an approved record stays open, and nothing shows without an error", () => {
    expect(recordActionsView("details", employeeActions("approved"), "")).toEqual({
      panel: "details",
      inDialog: "",
      underRow: "",
    });
    expect(recordActionsView(null, employeeActions("awaiting"), "")).toEqual({ panel: null, inDialog: "", underRow: "" });
  });
});
