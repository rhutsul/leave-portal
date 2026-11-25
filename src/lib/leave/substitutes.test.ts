import { describe, expect, it } from "vitest";
import { draftReducer, EMPTY_DRAFT, toPayload } from "./draft";
import { recordForChoice, toRpcRecords, type DraftRecord, type RecordCheck } from "./request";
import {
  checkSubstitutes,
  NO_SUBSTITUTE,
  substituteCount,
  substituteField,
  substituteIdOf,
  substituteLabel,
  SUBSTITUTE_MESSAGES,
  toSubstituteOption,
  upgradeApplies,
  upgradeLabel,
  upgradeMinutes,
  type SubstituteField,
  type SubstituteOption,
} from "./substitutes";

const ASSISTANT1 = "a0000000-0000-0000-0000-000000000006";
const TEACHER2 = "a0000000-0000-0000-0000-000000000005";
const TEACHER3 = "a0000000-0000-0000-0000-000000000007";

const LIST: SubstituteOption[] = [
  { id: ASSISTANT1, email: "assistant1@example.test", position: "Elementary school / Assistant", mainTitle: "Assistant" },
  { id: TEACHER2, email: "teacher2@example.test", position: "High school / Math teacher", mainTitle: "Math teacher" },
];

/** Запис із перевіреного вибору (тест спершу звіряє, що він ok). */
const recordOf = (result: RecordCheck): DraftRecord => (result as Extract<RecordCheck, { ok: true }>).record;

const TEACHER_DAY = { id: 1, label: "Elementary school / Teacher", kind: "main" as const, blocks: [{ start: 510, end: 930 }] };

describe("substitute of a record", () => {
  it("AC-SUBST-02: the chosen substitute goes into the record and the RPC payload", () => {
    const result = recordForChoice("2026-12-02", TEACHER_DAY, {
      positionId: 1,
      include: true,
      wholeDay: true,
      substituteId: ASSISTANT1,
    });
    expect(result).toEqual({
      ok: true,
      record: { positionId: 1, date: "2026-12-02", start: 510, end: 930, minutes: 420, substituteId: ASSISTANT1 },
    });
    expect(toRpcRecords([recordOf(result)])).toEqual([
      { position_id: 1, date: "2026-12-02", start_min: 510, end_min: 930, substitute_id: ASSISTANT1 },
    ]);
  });

  it("AC-SUBST-03: without a choice the record and the payload have no substitute, and it reads No substitute", () => {
    const record = recordOf(recordForChoice("2026-12-02", TEACHER_DAY, { positionId: 1, include: true, wholeDay: true }));
    expect(record).not.toHaveProperty("substituteId");
    expect(toRpcRecords([record])[0]).not.toHaveProperty("substitute_id");
    expect(substituteLabel(null)).toBe("No substitute");
    expect(substituteLabel("assistant1@example.test")).toBe("assistant1@example.test");
  });

  it("AC-SUBST-02: the draft keeps the substitute per record and sends it in the payload", () => {
    let draft = draftReducer({ ...EMPTY_DRAFT, dates: ["2026-12-02"] }, {
      type: "setChoice",
      date: "2026-12-02",
      positionId: 1,
      patch: { substituteId: ASSISTANT1 },
    });
    expect(toPayload(draft, () => [1]).choices[0]).toMatchObject({ positionId: 1, substituteId: ASSISTANT1 });
    draft = draftReducer(draft, { type: "setChoice", date: "2026-12-02", positionId: 1, patch: { substituteId: undefined } });
    expect(toPayload(draft, () => [1]).choices[0].substituteId).toBeUndefined();
  });
});

describe("substitute field in the request form", () => {
  it("AC-SUBST-04: the choice offers No substitute and exactly the people on the list", () => {
    const field = substituteField(LIST) as Extract<SubstituteField, { kind: "choice" }>;
    expect(field.kind).toBe("choice");
    expect(field.items.map((i) => i.label)).toEqual(["No substitute", "assistant1@example.test", "teacher2@example.test"]);
    expect(field.items[0].value).toBe(NO_SUBSTITUTE);
    expect(field.items.map((i) => i.label)).not.toContain("teacher3@example.test");
  });

  it("AC-SUBST-04: a substitute off the list is refused before submitting", () => {
    expect(checkSubstitutes([ASSISTANT1, undefined, TEACHER2], LIST)).toBeNull();
    expect(checkSubstitutes([TEACHER3], LIST)).toBe("This substitute is no longer on your substitute list");
  });

  it("AC-SUBST-11: an empty list shows the message instead of a choice", () => {
    expect(substituteField([])).toEqual({ kind: "empty", message: "Your manager has not added substitutes for you yet" });
    expect(SUBSTITUTE_MESSAGES.emptyList).toBe("Your manager has not added substitutes for you yet");
  });

  it("a list that did not load hides the field, so nothing is sent", () => {
    expect(substituteField(null)).toEqual({ kind: "hidden" });
  });

  it("form values become an id only when they are a uuid", () => {
    expect(substituteIdOf(ASSISTANT1.toUpperCase())).toBe(ASSISTANT1);
    expect(substituteIdOf(NO_SUBSTITUTE)).toBeUndefined();
    expect(substituteIdOf("")).toBeUndefined();
    expect(substituteIdOf(42)).toBeUndefined();
  });
});

describe("upgrade mark", () => {
  it("AC-SUBST-08: an Assistant replacing a Teacher gives With upgrade: 210 min", () => {
    expect(upgradeApplies("Teacher", "Assistant")).toBe(true);
    expect(upgradeMinutes("Teacher", "Assistant", 210)).toBe(210);
    expect(upgradeLabel(210)).toBe("With upgrade: 210 min");
  });

  it("AC-SUBST-08: any title containing teacher, any case; Assistant without extra spaces or case", () => {
    expect(upgradeApplies("Math teacher", "assistant")).toBe(true);
    expect(upgradeApplies("TEACHER", "  Assistant ")).toBe(true);
  });

  it("AC-SUBST-09: a Math teacher replacing a teacher gives no mark", () => {
    expect(upgradeApplies("Teacher", "Math teacher")).toBe(false);
    expect(upgradeMinutes("Teacher", "Math teacher", 210)).toBeNull();
  });

  it("AC-SUBST-09: no mark for other combinations or without a main position", () => {
    expect(upgradeApplies("Head of elementary school", "Assistant")).toBe(false);
    expect(upgradeApplies("Teacher", "Senior assistant")).toBe(false);
    expect(upgradeApplies("Teacher", null)).toBe(false);
  });
});

describe("substitute list pages", () => {
  it("AC-SUBST-12: the refusal text is the AC text", () => {
    expect(SUBSTITUTE_MESSAGES.notManager).toBe(
      "Only the manager of this employee's position can change the substitute list",
    );
  });

  it("AC-SUBST-15: the empty My substitutions text is the AC text", () => {
    expect(SUBSTITUTE_MESSAGES.notCovering).toBe("You are not covering for anyone");
  });

  it("counts and rows read as words", () => {
    expect(substituteCount(0)).toBe("No substitutes");
    expect(substituteCount(1)).toBe("1 substitute");
    expect(substituteCount(2)).toBe("2 substitutes");
    expect(
      toSubstituteOption({ substitute_id: ASSISTANT1, email: "assistant1@example.test", main_title: "Assistant", division_name: "Elementary school" }),
    ).toEqual(LIST[0]);
    expect(toSubstituteOption({ substitute_id: TEACHER3, email: null, main_title: null, division_name: null })).toEqual({
      id: TEACHER3,
      email: "",
      position: "",
      mainTitle: "",
    });
  });
});
