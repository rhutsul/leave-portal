// Поле частинок (ADR 0007) — декор landing і входу, не поведінка за AC PM: тому без AC ID.
import { describe, expect, it } from "vitest";
import { approach, buildField, FORM_COUNT, MIN_MORPH, MORPH_SPAN, PALETTE_TOKENS, POINTS, RING_LEFT, rng, stageAt } from "./particle-field";

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
