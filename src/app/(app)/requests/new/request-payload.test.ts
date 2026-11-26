import { describe, expect, it } from "vitest";
import { parsePayload } from "./request-payload";

// Розбір прихованого поля форми заявки (власна й від імені, D10 impl-on-behalf): підроблене значення — null, а не виняток.
describe("parsePayload", () => {
  it("accepts the form's own payload", () => {
    const raw = JSON.stringify({
      dates: ["2026-12-03"],
      leaveType: "sick",
      relationship: "",
      comment: "",
      choices: [{ date: "2026-12-03", positionId: 7, include: true, wholeDay: true }],
    });
    expect(parsePayload(raw)?.choices).toEqual([
      {
        date: "2026-12-03",
        positionId: 7,
        include: true,
        wholeDay: true,
        start: undefined,
        end: undefined,
        substituteId: undefined,
      },
    ]);
  });

  it("rejects a forged payload with a null or non-object choice instead of throwing", () => {
    for (const choices of [
      [null],
      [1],
      [["x"]],
      [{ date: { toString: null }, positionId: 7 }],
      [{ date: "2026-12-03", positionId: "7" }],
    ]) {
      expect(parsePayload(JSON.stringify({ dates: ["2026-12-03"], leaveType: "personal", choices }))).toBeNull();
    }
    expect(
      parsePayload(JSON.stringify({ dates: [], leaveType: "family", relationship: { toString: null }, choices: [] })),
    ).toBeNull();
    expect(parsePayload("null")).toBeNull();
    expect(parsePayload("{")).toBeNull();
    expect(parsePayload(null)).toBeNull();
  });
});
