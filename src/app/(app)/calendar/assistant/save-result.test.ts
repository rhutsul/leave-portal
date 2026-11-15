import { describe, expect, it } from "vitest";
import { applySaveResult, submittedKeys } from "./save-result";

type Item = { key: number; name: string; error: string | null };
const item = (key: number, name: string): Item => ({ key, name, error: null });
const A = item(1, "Winter break");
const B = item(2, "Spring break");
const C = item(3, "Staff day");

describe("applySaveResult", () => {
  it("AC-ASSIST-04: the rejected suggestion stays with the database message, the saved one disappears", () => {
    expect(applySaveResult([A, B], [1, 2], { saved: 1, failed: [{ index: 1, message: "2027-03-22 is already closed: Spring break" }] })).toEqual([
      { ...B, error: "2027-03-22 is already closed: Spring break" },
    ]);
  });

  it("AC-ASSIST-04: a card removed while saving does not shift the result onto another card", () => {
    // Надіслано [A, B]; поки сервер зберігав, людина прибрала A. A збережено, B відхилено (index 1).
    expect(applySaveResult([B], [1, 2], { saved: 1, failed: [{ index: 1, message: "rejected" }] })).toEqual([{ ...B, error: "rejected" }]);
  });

  it("AC-ASSIST-02: suggestions that were not in the submitted form stay untouched", () => {
    expect(applySaveResult([A, C], [1], { saved: 1, failed: [] })).toEqual([C]);
  });

  it("AC-ASSIST-03: a form the server did not accept keeps every suggestion and its edits", () => {
    expect(applySaveResult([A, B], [1, 2], { saved: 0, failed: [] })).toEqual([A, B]);
  });
});

describe("submittedKeys", () => {
  it("AC-ASSIST-02: reads the keys of the submitted suggestions in form order", () => {
    const form = new FormData();
    form.set("keys", "7,3,12");
    expect(submittedKeys(form)).toEqual([7, 3, 12]);
    expect(submittedKeys(new FormData())).toEqual([]);
  });
});
