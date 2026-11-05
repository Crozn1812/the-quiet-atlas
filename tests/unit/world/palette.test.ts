import { describe, expect, it } from "vitest";
import { PALETTE, RARE_ACCENTS, hex, rgb } from "../../../src/features/world/art/palette";

describe("B2-001 palette (taste brief §5.3)", () => {
  // Q-44: direction A "Tranh chân thật" adds 14 natural colours; the ten taste-brief colours stay unchanged.
  it("keeps the ten taste-brief colours and the direction-A natural colours", () => {
    expect(Object.keys(PALETTE)).toHaveLength(24);
    expect(Object.keys(PALETTE).slice(0, 10)).toEqual(["paper", "ink", "forestLight", "forestDeep", "mist", "water", "indigo", "dusk", "flower", "vermilion"]);
    for (const value of Object.values(PALETTE)) expect(value).toMatch(/^#[0-9A-F]{6}$/);
    expect(PALETTE.paper).toBe("#EEE8D8");
    expect(PALETTE.ink).toBe("#2B2A26");
  });
  it("converts to three.js hex and 0-1 rgb", () => {
    expect(hex("paper")).toBe(0xeee8d8);
    expect(rgb("ink").map(v => Math.round(v * 255))).toEqual([0x2b, 0x2a, 0x26]);
  });
  it("marks orange and vermilion as rare accents", () => {
    expect(RARE_ACCENTS).toEqual(["flower", "vermilion"]);
  });
  it("has no neon: HSV saturation of every colour stays below 0.85 (flower is the most saturated, ~0.80)", () => {
    for (const key of Object.keys(PALETTE) as (keyof typeof PALETTE)[]) {
      const [r, g, b] = rgb(key);
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      expect(max === 0 ? 0 : (max - min) / max, key).toBeLessThan(0.85);
    }
  });
});
