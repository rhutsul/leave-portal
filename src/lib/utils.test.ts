import { describe, expect, it } from "vitest";
import { initials } from "./utils";

describe("initials", () => {
  it("takes the first letters of the first two name parts, split by spaces or hyphens", () => {
    expect(initials("Teacher One")).toBe("TO");
    expect(initials("anna-maria  kovalenko smith")).toBe("AM");
    expect(initials("  manager  ")).toBe("M");
    expect(initials("")).toBe("");
  });
});
