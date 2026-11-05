import { afterEach, describe, expect, it } from "vitest";
import { Color, LinearFilter, SRGBColorSpace, type DataTexture } from "three";
import { fogAt as directedFogAt, forestAtmosphereWeight, FOREST_ATMOSPHERE_TRANSITION, paletteColor, STYLE_PRESETS, WORLD_DIRECTION } from "../../../src/features/world/art/direction";
import { ZONES } from "../../../src/features/world/layout/zones";
import { pathLength } from "../../../src/features/world/layout/path";
import { createRampMaterial, disposeRampGradients, RAMP_PRESETS, RAMP_STEPS } from "../../../src/features/world/materials/ramp";
import { surfaceHeight } from "../../../src/features/world/scene/compose";
import { placeZoneScenes } from "../../../src/features/world/zones";

afterEach(disposeRampGradients);

describe("AD r3 direction C", () => {
  it("lowers the ground's displayed value by 9% while preserving its palette hue", () => {
    const recipe = STYLE_PRESETS.C.background.terrain;
    const previous = new Color(paletteColor({ ...recipe, brightness: 1 }));
    const actual = new Color(paletteColor(recipe));
    const oldRGB = previous.getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace);
    const newRGB = actual.getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace);
    // Changed expectation: r2's paper-light ground washed out the real terrain.
    for (const channel of ["r", "g", "b"] as const) {
      expect(newRGB[channel] / oldRGB[channel]).toBeGreaterThanOrEqual(0.90);
      expect(newRGB[channel] / oldRGB[channel]).toBeLessThanOrEqual(0.92);
    }
    expect(STYLE_PRESETS.C.background).toBe(STYLE_PRESETS.B.background);
    expect(STYLE_PRESETS.C.foliage).toBe(STYLE_PRESETS.A.foliage);
  });

  it("uses four soft ground levels with smaller adjacent brightness changes", () => {
    const material = createRampMaterial(RAMP_PRESETS.terrain, RAMP_STEPS.terrain);
    try {
      const gradient = material.gradientMap as DataTexture;
      // Changed expectation: four levels replace three broad washes to soften the ground stripe.
      expect(gradient.image.width).toBe(4);
      expect(gradient.minFilter).toBe(LinearFilter);
      expect(gradient.magFilter).toBe(LinearFilter);
      const data = gradient.image.data as Uint8Array;
      for (let i = 1; i < data.length; i++) expect(data[i]! - data[i - 1]!).toBeLessThanOrEqual(64);
    } finally { material.dispose(); }
  });

  it("preserves forest and hill fog and opens both coast zones to 400 m", () => {
    const fogAt = (t: number, preset = STYLE_PRESETS.C) => directedFogAt(t, preset);
    for (const zone of ZONES) {
      expect(fogAt(zone.t)).toEqual(zone.biome === "coast-dusk" ? { near: 100, far: 400 } : { near: 40, far: 260 });
    }
    expect(fogAt(-1)).toEqual(fogAt(0));
    expect(fogAt(NaN)).toEqual(fogAt(0));
    expect(fogAt(Infinity)).toEqual(fogAt(1));
    const coast = ZONES.findIndex(zone => zone.biome === "coast-dusk");
    const start = ZONES[coast - 1]!.t;
    const end = ZONES[coast]!.t;
    expect(fogAt((start + end) / 2).far).toBeCloseTo(330);
    let previous = fogAt(start).far;
    for (let i = 1; i <= 100; i++) {
      const next = fogAt(start + (end - start) * i / 100).far;
      expect(next).toBeGreaterThanOrEqual(previous);
      expect(next - previous).toBeLessThan(2.1);
      previous = next;
    }
    expect(fogAt(1, STYLE_PRESETS.A)).toEqual({ near: 60, far: 340 });
  });

  it("places all eight zone scenes on the real rendered terrain without throwing", () => {
    const zones = placeZoneScenes(surfaceHeight);
    try {
      expect(zones.map(zone => zone.zoneId)).toEqual(ZONES.map(zone => zone.id));
      for (const zone of zones) {
        const { x, y, z } = zone.group.position;
        expect(y).toBe(surfaceHeight(x, z));
      }
    } finally { zones.forEach(zone => zone.dispose()); }
  });
});

describe("R clear-air world direction", () => {
  it("activates natural colours, four soft levels, faint bleed and almost no ground mist", () => {
    expect(WORLD_DIRECTION).toBe(STYLE_PRESETS.R);
    expect(RAMP_PRESETS.terrain).toBe(paletteColor(STYLE_PRESETS.R.background.terrain));
    expect(WORLD_DIRECTION.background.ramp).toEqual({ steps: 4, soft: true });
    expect(WORLD_DIRECTION.foliage.ramp).toEqual({ steps: 4, soft: true });
    expect(WORLD_DIRECTION.background.edges).toEqual({ ink: false, bleed: 0.04 });
    expect(WORLD_DIRECTION.background.mist.strength).toBeLessThanOrEqual(0.02);
    // B2-169: clear hills/coast retain R; only the humid forest uses closer fog.
    for (const t of [0.5, 0.76, 0.9, 1]) expect(directedFogAt(t).near).toBeGreaterThanOrEqual(120);
    expect(directedFogAt(0.3)).toEqual({ near: 25, far: 145, forestWeight: 1 });
    expect(directedFogAt(0.5)).toEqual({ near: 120, far: 700, forestWeight: 0 });
    expect(directedFogAt(0.9)).toEqual({ near: 160, far: 900, forestWeight: 0 });
    expect(directedFogAt(NaN)).toEqual(directedFogAt(0));
    expect(directedFogAt(Infinity)).toEqual(directedFogAt(1));
  });

  it("blends forest into hills over 40 m at the nearest-zone biome boundary, in either direction", () => {
    const { start, end } = FOREST_ATMOSPHERE_TRANSITION;
    const hill = ZONES.findIndex(zone => zone.biome === "hill");
    expect((end - start) * pathLength()).toBeCloseTo(40, 10);
    expect((start + end) / 2).toBeCloseTo((ZONES[hill - 1]!.t + ZONES[hill]!.t) / 2);
    expect(forestAtmosphereWeight(start)).toBe(1);
    expect(forestAtmosphereWeight(end)).toBe(0);
    expect(forestAtmosphereWeight((start + end) / 2)).toBeCloseTo(0.5);
    const samples = Array.from({ length: 101 }, (_, i) => directedFogAt(start + (end - start) * i / 100));
    samples.slice(1).forEach((fog, i) => {
      expect(fog.near).toBeGreaterThanOrEqual(samples[i]!.near);
      expect(fog.far).toBeGreaterThanOrEqual(samples[i]!.far);
      expect(fog.far - samples[i]!.far).toBeLessThan(8.4);
    });
    expect(directedFogAt(start - 0.000001).far).toBeCloseTo(directedFogAt(start + 0.000001).far, 4);
    expect(directedFogAt(end - 0.000001).far).toBeCloseTo(directedFogAt(end + 0.000001).far, 4);
    samples.reverse().forEach((fog, i) => expect(directedFogAt(end - (end - start) * i / 100).far).toBeCloseTo(fog.far));
  });
});
