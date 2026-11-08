// Поле частинок (ADR 0007) — декор landing і входу, не поведінка за AC PM: тому без AC ID.
import { describe, expect, it } from "vitest";
import {
  approach,
  buildField,
  fieldTier,
  FORM_COUNT,
  LIGHT_POINTS,
  MIN_MORPH,
  MORPH_SPAN,
  NARROW_FIT,
  PALETTE_TOKENS,
  POINTS,
  RING_LEFT,
  rng,
  stageAt,
  tierBudget,
  type FieldEnvironment,
} from "./particle-field";

describe("buildField", () => {
  it("keeps within the particle budget of ADR 0007", () => {
    expect(POINTS.welcome).toBeLessThanOrEqual(24_000);
    expect(POINTS.login).toBeLessThanOrEqual(24_000);
  });

  it("gives every point a position and a tone in each of the five forms", () => {
    const field = buildField("welcome", 2000);
    expect(field.positions).toHaveLength(FORM_COUNT);
    expect(field.tones).toHaveLength(FORM_COUNT);
    for (const p of field.positions) expect(p).toHaveLength(2000 * 3);
    for (const t of field.tones) expect(t).toHaveLength(2000 * 2);
    expect(field.random).toHaveLength(2000 * 4);
    expect(field.group).toHaveLength(2000);
  });

  it("uses only palette indices and weights between 0 and 1", () => {
    const field = buildField("welcome", 3000);
    for (const tones of field.tones) {
      for (let i = 0; i < tones.length; i += 2) {
        expect(Number.isInteger(tones[i])).toBe(true);
        expect(tones[i]).toBeGreaterThanOrEqual(0);
        expect(tones[i]).toBeLessThan(PALETTE_TOKENS.length);
        expect(tones[i + 1]).toBeGreaterThan(0);
        expect(tones[i + 1]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is the same picture on every load", () => {
    const a = buildField("login", 500);
    const b = buildField("login", 500);
    expect(Array.from(a.positions[1])).toEqual(Array.from(b.positions[1]));
  });

  it("puts the landing month sheet to the right of the hero text", () => {
    const sheet = buildField("welcome", 4000).positions[0];
    const xs = Array.from({ length: 4000 }, (_, i) => sheet[i * 3]);
    const median = [...xs].sort((x, y) => x - y)[2000];
    expect(median).toBeGreaterThan(0.8);
  });

  it("keeps the login sheet the same in every form", () => {
    const field = buildField("login", 300);
    for (let s = 1; s < FORM_COUNT; s++) expect(Array.from(field.positions[s])).toEqual(Array.from(field.positions[0]));
    expect(Array.from(field.group).every((g) => g === -1)).toBe(true);
  });

  it("assigns the role spheres to three groups on the landing", () => {
    const groups = new Set(buildField("welcome", 3000).group);
    expect([...groups].sort()).toEqual([-1, 0, 1, 2]);
  });

  it("shows the balance left on the ring as the primary share", () => {
    expect(RING_LEFT).toBeCloseTo(0.924, 3);
  });
});

describe("narrow layout", () => {
  const xsOf = (positions: Float32Array) => Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3]);
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

  it("puts the landing month sheet centred above the hero text", () => {
    const sheet = buildField("welcome", 4000, "narrow").positions[0];
    expect(Math.abs(median(xsOf(sheet)))).toBeLessThan(0.1);
    const ys = Array.from({ length: 4000 }, (_, i) => sheet[i * 3 + 1]);
    expect(median(ys)).toBeGreaterThan(0.8);
  });

  it("shrinks the landing forms so they fit a narrow window", () => {
    const wide = buildField("welcome", 3000);
    const narrow = buildField("welcome", 3000, "narrow");
    for (let s = 0; s < FORM_COUNT - 1; s++) {
      const span = (p: Float32Array) => Math.max(...xsOf(p).map(Math.abs));
      expect(span(narrow.positions[s])).toBeLessThan(span(wide.positions[s]) + 1e-6);
    }
    expect(NARROW_FIT).toHaveLength(FORM_COUNT);
  });

  it("keeps the same tones and groups as the wide layout", () => {
    const wide = buildField("welcome", 1000);
    const narrow = buildField("welcome", 1000, "narrow");
    expect(Array.from(narrow.tones[2])).toEqual(Array.from(wide.tones[2]));
    expect(Array.from(narrow.group)).toEqual(Array.from(wide.group));
  });

  it("leaves the login sheet as it is: only its canvas is smaller", () => {
    expect(Array.from(buildField("login", 400, "narrow").positions[0])).toEqual(Array.from(buildField("login", 400).positions[0]));
  });
});

describe("fieldTier", () => {
  const desktop: FieldEnvironment = { wide: true, finePointer: true, reducedMotion: false, webgl2: true, cores: 8, memory: 8 };
  const phone: FieldEnvironment = { wide: false, finePointer: false, reducedMotion: false, webgl2: true, cores: 8, memory: 8 };

  it("gives the full field from lg with a mouse", () => {
    expect(fieldTier(desktop)).toBe("full");
  });

  it("gives the light field below lg or on touch", () => {
    expect(fieldTier(phone)).toBe("light");
    expect(fieldTier({ ...desktop, wide: false })).toBe("light");
    expect(fieldTier({ ...desktop, finePointer: false })).toBe("light");
  });

  it("loads no field with reduced motion or without WebGL2, on any screen", () => {
    for (const env of [desktop, phone]) {
      expect(fieldTier({ ...env, reducedMotion: true })).toBe("none");
      expect(fieldTier({ ...env, webgl2: false })).toBe("none");
    }
  });

  it("drops the light field with Save-Data or on a weak device", () => {
    expect(fieldTier({ ...phone, saveData: true })).toBe("none");
    expect(fieldTier({ ...phone, cores: 4 })).toBe("none");
    expect(fieldTier({ ...phone, memory: 4 })).toBe("none");
    expect(fieldTier({ ...phone, cores: 5, memory: 6 })).toBe("light");
  });

  it("does not count a device as weak when the browser does not say (Safari, Firefox)", () => {
    expect(fieldTier({ ...phone, cores: undefined, memory: undefined, saveData: undefined })).toBe("light");
  });

  it("keeps the full field on a desktop with Save-Data or few cores", () => {
    expect(fieldTier({ ...desktop, saveData: true, cores: 2, memory: 2 })).toBe("full");
  });
});

describe("tierBudget", () => {
  it("keeps the ADR 0007 budget for the full field and 6 000 points at pixel ratio 1 for the light one", () => {
    expect(tierBudget("full", "welcome")).toEqual({ points: POINTS.welcome, pixelRatio: 1.5 });
    expect(tierBudget("full", "login")).toEqual({ points: POINTS.login, pixelRatio: 1.5 });
    expect(tierBudget("light", "welcome")).toEqual({ points: LIGHT_POINTS, pixelRatio: 1 });
    expect(tierBudget("light", "login")).toEqual({ points: LIGHT_POINTS, pixelRatio: 1 });
    expect(LIGHT_POINTS).toBeLessThanOrEqual(6_000);
  });
});

describe("rng", () => {
  it("returns numbers in [0, 1)", () => {
    const R = rng(1);
    for (let i = 0; i < 1000; i++) {
      const x = R();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("stageAt", () => {
  // Hero from 60, then sections at 780, 1700, 2600, 3500 (as on /welcome at 1440 px).
  const tops = [60, 780, 1700, 2600, 3500];

  it("keeps the first form sharp at the top of the page on any window height", () => {
    for (const height of [700, 830, 900, 1200, 1300, 1500, 2000]) {
      expect(stageAt(tops, 0, height * 0.55)).toBe(0);
    }
  });

  it("finishes a morph when the next section reaches the probe line", () => {
    const hold = 495; // 900 px window
    expect(stageAt(tops, 780 - hold, hold)).toBe(1);
    expect(stageAt(tops, 1700 - hold, hold)).toBe(2);
  });

  it("morphs over at most the span of scroll before that", () => {
    const hold = 495;
    expect(stageAt(tops, 1700 - hold - MORPH_SPAN, hold)).toBe(1);
    expect(stageAt(tops, 1700 - hold - MORPH_SPAN / 2, hold)).toBeCloseTo(1.5);
  });

  it("never squeezes a morph below the minimum on a very tall window", () => {
    const hold = 1500 * 0.55; // the hero is shorter than the hold: 825 > 780 - 0
    expect(stageAt(tops, 0, hold)).toBe(0);
    expect(stageAt(tops, MIN_MORPH / 2, hold)).toBeCloseTo(0.5);
    expect(stageAt(tops, MIN_MORPH, hold)).toBe(1);
  });

  it("stops at the last form", () => {
    expect(stageAt(tops, 9000, 495)).toBe(4);
    expect(stageAt([0, 100, 200, 300, 400, 500, 600], 9000)).toBe(4);
  });

  it("starts at the first form without sections", () => {
    expect(stageAt([], 500)).toBe(0);
    expect(stageAt([0], 500)).toBe(0);
  });
});

describe("approach", () => {
  it("moves part of the way per frame and never overshoots", () => {
    expect(approach(0, 1, 0.1, 2)).toBeCloseTo(0.2);
    expect(approach(0, 1, 1, 5)).toBe(1);
  });
});
