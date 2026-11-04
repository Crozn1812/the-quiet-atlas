import { describe, expect, it } from "vitest";
import { Color, SRGBColorSpace } from "three";
import { PALETTE } from "../../../src/features/world/art/palette";
import { pathRiverTAt } from "../../../src/features/world/layout/path";
import { riverPointAt } from "../../../src/features/world/layout/river";
import { ZONES } from "../../../src/features/world/layout/zones";
import { worldHeight } from "../../../src/features/world/terrain/height";
import { paletteColor, STYLE_PRESETS, type PaletteRecipe } from "../../../tools/styleframes/presets";
import { parseQuery } from "../../../tools/styleframes/query";
import { cameraAt, SHOTS, SHOT_IDS, VIDEO_SECONDS } from "../../../tools/styleframes/shots";

function recipes(): PaletteRecipe[] {
  return Object.values(STYLE_PRESETS).flatMap(({ background, foliage }) => [
    background.terrain, foliage.crown, foliage.trunk,
    ...Object.values(background.sky).flatMap(sky => [sky.top, sky.horizon]),
  ]);
}

describe("B2-030 style-frame directions", () => {
  it("derives every preset swatch only from palette mixes and reduced HSV saturation/value", () => {
    for (const recipe of recipes()) {
      expect(Object.hasOwn(PALETTE, recipe.base)).toBe(true);
      expect(Object.hasOwn(PALETTE, recipe.mix)).toBe(true);
      for (const factor of [recipe.amount, recipe.saturation, recipe.brightness]) {
        expect(factor).toBeGreaterThanOrEqual(0);
        expect(factor).toBeLessThanOrEqual(1);
      }
      const actual = paletteColor(recipe);
      const srgb = [(actual >> 16 & 255) / 255, (actual >> 8 & 255) / 255, (actual & 255) / 255];
      const max = Math.max(...srgb);
      expect(max === 0 ? 0 : (max - Math.min(...srgb)) / max).toBeLessThanOrEqual(0.85);

      // Independent reconstruction catches arbitrary output swatches, not just their saturation.
      const a = new Color(PALETTE[recipe.base]);
      const b = new Color(PALETTE[recipe.mix]);
      const mixed = new Color().setRGB(
        a.r * (1 - recipe.amount) + b.r * recipe.amount,
        a.g * (1 - recipe.amount) + b.g * recipe.amount,
        a.b * (1 - recipe.amount) + b.b * recipe.amount,
      ).getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace);
      const value = Math.max(mixed.r, mixed.g, mixed.b);
      [mixed.r, mixed.g, mixed.b].forEach((channel, index) => {
        const expected = (value * (1 - recipe.saturation) + channel * recipe.saturation) * recipe.brightness;
        expect(Math.abs(srgb[index]! - expected)).toBeLessThanOrEqual(1 / 255);
      });
    }
  });

  it("keeps ink in B and blends exactly B background with A canopy in C", () => {
    const { A, B, C } = STYLE_PRESETS;
    expect(A.background.edges.ink).toBe(false);
    expect(B.background.edges.ink).toBe(true);
    expect(C.background).toEqual(B.background);
    expect(C.foliage).toEqual(A.foliage);
    expect(B.foliage.density).toBeLessThan(A.foliage.density);
    expect(B.background.mist.strength).toBeGreaterThan(A.background.mist.strength);
    for (const { background, foliage } of Object.values(STYLE_PRESETS)) {
      for (const ramp of [background.ramp, foliage.ramp]) {
        expect([3, 4]).toContain(ramp.steps);
        expect(ramp.soft).toBe(true);
      }
      expect(background.mist.bands[0]).toBeLessThan(background.mist.bands[1]);
      expect(background.mist.bands[1]).toBeLessThan(background.mist.bands[2]);
    }
  });
});

describe("layout-derived, deterministic shots", () => {
  it("anchors the two views to First Light/Workshop and the river mouth (Last Postcard)", () => {
    const first = ZONES.find(zone => zone.id === "first-light")!;
    const workshop = ZONES.find(zone => zone.id === "workshop")!;
    const shore = ZONES.find(zone => zone.id === "last-postcard")!;
    expect(SHOTS["forest-dawn"].pathT).toBe((first.t + workshop.t) / 2);
    expect(SHOTS["coast-dusk"].pathT).toBe(shore.t);
    expect(VIDEO_SECONDS).toBeGreaterThanOrEqual(15);
    expect(VIDEO_SECONDS).toBeLessThanOrEqual(20);
    for (const shot of SHOT_IDS) {
      const river = riverPointAt(pathRiverTAt(SHOTS[shot].pathT));
      const { position, target } = cameraAt(shot);
      expect(Math.hypot(position.x - river.x, position.z - river.z)).toBeLessThan(20);
      expect(target.z).toBeLessThan(position.z);
    }
  });

  it.each(SHOT_IDS)("keeps %s above terrain along the entire slow camera path", shot => {
    let previous = cameraAt(shot).position;
    // Sample every 0.1 s including endpoints, independently of preset/quality.
    for (let i = 0; i <= VIDEO_SECONDS * 10; i++) {
      const frame = cameraAt(shot, i / 10);
      expect(frame.position.y).toBeGreaterThan(worldHeight(frame.position.x, frame.position.z) + 1.5);
      expect(frame.position.distanceTo(previous)).toBeLessThan(0.15);
      expect([...frame.position, ...frame.target, frame.mistHeight].every(Number.isFinite)).toBe(true);
      previous = frame.position;
    }
    expect(cameraAt(shot, VIDEO_SECONDS).position.distanceTo(cameraAt(shot).position)).toBeGreaterThan(5);
    const snapshot = cameraAt(shot, 9);
    cameraAt(shot, 9).position.set(0, 0, 0);
    expect(cameraAt(shot, 9)).toEqual(snapshot);
    expect(cameraAt(shot, -1)).toEqual(cameraAt(shot, 0));
    expect(cameraAt(shot, Infinity)).toEqual(cameraAt(shot, 0));
    expect(cameraAt(shot, 999)).toEqual(cameraAt(shot, VIDEO_SECONDS));
  });
});

describe("safe, read-only query input", () => {
  const defaults = { preset: "A", shot: "forest-dawn", quality: "High", t: 0, clean: false };
  it("supports the specified capture URL and clean mode", () => {
    expect(parseQuery("?preset=A&shot=forest-dawn&quality=High&t=0")).toEqual(defaults);
    expect(parseQuery("?preset=C&shot=coast-dusk&quality=Balanced&t=9.25&clean=1")).toEqual({
      preset: "C", shot: "coast-dusk", quality: "Balanced", t: 9.25, clean: true,
    });
    expect(parseQuery("?preset=B&quality=Low")).toMatchObject({ preset: "B", quality: "Low" });
  });
  it.each(["", "?preset=__proto__&shot=constructor&quality=Ultra&t=NaN&clean=true", "?preset=a&shot=sea&quality=high&t=Infinity", "?t=-2", "?t=0x10", "?t=1e5", "?t=%3Cscript%3E", "?t=", "?t=%20", `?t=${"9".repeat(400)}`])("falls back for unknown or invalid input: %s", search => {
    expect(parseQuery(search)).toEqual(defaults);
  });
  it("clamps finite time to the clip and handles repeated fields predictably", () => {
    expect(parseQuery("?t=999").t).toBe(VIDEO_SECONDS);
    expect(parseQuery("?t=.5").t).toBe(0.5);
    expect(parseQuery("?preset=B&preset=C&t=3&t=9")).toMatchObject({ preset: "B", t: 3 });
    expect(parseQuery("?preset=unknown&preset=B").preset).toBe("A");
  });
});
