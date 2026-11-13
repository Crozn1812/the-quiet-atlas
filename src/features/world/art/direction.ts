// B2-038: art-direction presets (A/B/C), moved from tools/styleframes so the world and the bench share one source.
// Provisional choice: direction C (D-22, ADR 0013 addendum 2026-11-05).
import { Color, SRGBColorSpace } from "three";
import { PALETTE, type PaletteKey } from "./palette";
import { ZONES } from "../layout/zones";
import { pathLength } from "../layout/path";
import { WORLD_SCALE } from "../layout/scale";

/** A traceable palette recipe, never an independent colour swatch. */
export interface PaletteRecipe {
  base: PaletteKey;
  mix: PaletteKey;
  amount: number;
  saturation: number;
  brightness: number;
}

export function paletteColor(recipe: PaletteRecipe): number {
  const color = new Color(PALETTE[recipe.base]).lerp(new Color(PALETTE[recipe.mix]), recipe.amount);
  const { r, g, b } = color.getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace);
  const max = Math.max(r, g, b);
  // Reduce HSV saturation in sRGB; scale value without introducing a new hue.
  color.setRGB(
    (max - (max - r) * recipe.saturation) * recipe.brightness,
    (max - (max - g) * recipe.saturation) * recipe.brightness,
    (max - (max - b) * recipe.saturation) * recipe.brightness,
    SRGBColorSpace,
  );
  return color.getHex(SRGBColorSpace);
}

const recipe = (base: PaletteKey, mix: PaletteKey, amount: number, saturation = 1, brightness = 1): PaletteRecipe =>
  ({ base, mix, amount, saturation, brightness });

export interface StylePreset {
  label: string;
  background: {
    terrain: PaletteRecipe;
    ramp: { steps: number; soft: boolean };
    /** Linear fog in metres, with remote visibility proportional to the route. */
    fog: { near: number; far: number; coastFar?: number; coastNear?: number };
    /** warmth: 0 = palette mist (cool jade), 1 = the shot's painted horizon colour. */
    mist: { bands: [number, number, number]; strength: number; warmth: number };
    /** Humid forest air; hill/coast keep the direction's clear-air profile. */
    forest?: {
      color: PaletteRecipe;
      fog: { near: number; far: number };
      mist: { bands: [number, number, number]; strength: number };
    };
    edges: { ink: boolean; bleed: number };
    sky: Record<"dawn" | "dusk", { top: PaletteRecipe; horizon: PaletteRecipe }>;
  };
  foliage: {
    crown: PaletteRecipe;
    trunk: PaletteRecipe;
    ramp: { steps: number; soft: boolean };
    density: number;
  };
}

const A: StylePreset = {
  label: "A · Màu nước đầy",
  background: {
    // §5.3: fuller jade ground, still diluted with cream; no neon.
    terrain: recipe("forestLight", "paper", 0.35, 0.92), // AD r2: lighter ground so trees stand off it
    // §5.4: four softly filtered levels keep light transitions gentle.
    ramp: { steps: 4, soft: true },
    // §5.2: distant forest layers stay visible through lighter mist.
    fog: { near: 60, far: 340 },
    // Mist borrows the dawn/dusk horizon so shelves read as lit air, not silver haze.
    mist: { bands: [70, 130, 220], strength: 0.32, warmth: 0.4 }, // AD r2: less gold over blue water (olive band)
    // Watercolour edges, without the ink contour of direction B.
    edges: { ink: false, bleed: 0.32 },
    sky: {
      // §5.3: jade dawn and restrained gold dusk, both washed with paper.
      dawn: { top: recipe("mist", "paper", 0.28), horizon: recipe("dusk", "paper", 0.84) },
      dusk: { top: recipe("indigo", "paper", 0.72, 0.8), horizon: recipe("dusk", "paper", 0.68, 0.9) },
    },
  },
  foliage: {
    // Fuller foliage wash; warm diluted ink for matte trunks (§5.4).
    crown: recipe("forestLight", "forestDeep", 0.55, 0.9, 0.95), // AD r2: dark anchor so depth layers separate
    trunk: recipe("ink", "forestDeep", 0.3, 0.8), // AD r2: trunks read as dark anchors, not bleached posts
    ramp: { steps: 4, soft: true },
    // Richer canopy, using the same seeded candidates as B/C.
    density: 1,
  },
};

const B: StylePreset = {
  label: "B · Mực trên giấy",
  background: {
    // §5.2–5.3: cream negative space dominates a narrow jade/indigo wash.
    // AD r3: 9% lower sRGB value gives direction C's shared B ground more weight.
    terrain: recipe("forestLight", "paper", 0.55, 0.75, 0.91),
    // AD r3: four linearly filtered washes soften the pale horizontal ground band.
    ramp: { steps: 4, soft: true },
    // Closer, stronger depth layers dissolve distance into paper (§5.4).
    fog: { near: 40, far: 260, coastFar: 400, coastNear: 100 },
    // B keeps more cool jade in its mist to stay close to ink-wash monochrome.
    // AD r2: wider bands and lighter density so three distinct shelves read.
    mist: { bands: [60, 120, 210], strength: 0.5, warmth: 0.25 },
    // Diluted ink contour plus stronger pigment pooling; High enables ink.
    edges: { ink: true, bleed: 0.65 },
    sky: {
      // Keep sky mostly blank paper; dusk retains only a small golden wash.
      dawn: { top: recipe("mist", "paper", 0.72, 0.65), horizon: recipe("dusk", "paper", 0.94, 0.65) },
      dusk: { top: recipe("indigo", "paper", 0.7, 0.75), horizon: recipe("dusk", "paper", 0.84, 0.65) }, // AD r2: cool-to-gold gradient
    },
  },
  foliage: {
    // Reduced chroma/value produces quiet indigo silhouettes (§5.3).
    crown: recipe("forestDeep", "indigo", 0.3, 0.65, 0.96),
    trunk: recipe("ink", "paper", 0.43, 0.6),
    ramp: { steps: 3, soft: true },
    // More unpainted space between trees (§5.2), without changing the seed.
    density: 0.58,
  },
};

/**
 * R · Tranh chân thật (Q-44, Duy 2026-11-05; ADR 0013 bổ sung). Clear air, natural saturated colours, real light and
 * shadow, soft painterly shading kept. No cream paper wash, no ink outlines on terrain. Starting values by Lead;
 * B2-161 tunes post/fog/mist, other A-wave tickets use these palette keys only.
 */
const R: StylePreset = {
  label: "R · Tranh chân thật",
  background: {
    terrain: recipe("grass", "grassDry", 0.25, 1, 1),
    ramp: { steps: 4, soft: true },
    fog: { near: 120, far: 700 * WORLD_SCALE, coastFar: 900 * WORLD_SCALE, coastNear: 160 },
    mist: { bands: [160 * WORLD_SCALE, 320 * WORLD_SCALE, 600 * WORLD_SCALE], strength: 0.02, warmth: 1 },
    forest: {
      color: recipe("mist", "sunGold", 0.18),
      // Keep the walking corridor clear; distant trunks still dissolve into jade air.
      fog: { near: 35, far: 190 },
      mist: { bands: [55, 100, 155], strength: 0.08 },
    },
    edges: { ink: false, bleed: 0.04 },
    sky: {
      // B2-180: pale blue-grey above a peach/gold dawn, deeper blue above orange dusk.
      dawn: { top: recipe("skyHigh", "mist", 0.45, 0.65, 0.9), horizon: recipe("sunGold", "cloud", 0.5, 0.85, 0.9) },
      dusk: { top: recipe("skyHigh", "indigo", 0.65, 0.85, 0.85), horizon: recipe("sunGold", "flower", 0.3, 0.9, 0.9) },
    },
  },
  foliage: {
    crown: recipe("forestLight", "grass", 0.25, 1, 0.95),
    trunk: recipe("rock", "rockDark", 0.6, 0.9), // Lead: rockDark+ink read as black poles in the forest
    ramp: { steps: 4, soft: true },
    density: 1,
  },
};

/** C literally shares B's background and A's foliage parameters; no shader forks. */
export const STYLE_PRESETS: Record<"A" | "B" | "C" | "R", StylePreset> = {
  A, B, C: { label: "C · Kết hợp", background: B.background, foliage: A.foliage }, R,
};
export type PresetId = keyof typeof STYLE_PRESETS;

/** The direction the world renders (provisional, D-22). */
export const WORLD_DIRECTION: StylePreset = STYLE_PRESETS.R;

// Match the nearest-zone biome boundary used by foliage; t is walking distance.
const firstHill = ZONES.findIndex(zone => zone.biome === "hill");
const forestEdge = (ZONES[firstHill - 1]!.t + ZONES[firstHill]!.t) / 2;
export const FOREST_ATMOSPHERE_TRANSITION = Object.freeze({
  start: forestEdge - 20 / pathLength(), end: forestEdge + 20 / pathLength(),
});

/** Smoothly release the forest over exactly 40 m, including reverse travel/teleports. */
export function forestAtmosphereWeight(pathT: number): number {
  const { start, end } = FOREST_ATMOSPHERE_TRANSITION;
  const u = Number.isNaN(pathT) ? 0 : Math.max(0, Math.min(1, (pathT - start) / (end - start)));
  return 1 - u * u * (3 - 2 * u);
}

export interface DirectedFog {
  near: number;
  far: number;
  /** Carried through compose's existing setFog call, keeping colour and mist in step. */
  forestWeight?: number;
}

/** Forest depth layers, clear hills, then the existing open sea horizon. */
export function fogAt(pathT: number, preset: StylePreset = WORLD_DIRECTION): DirectedFog {
  const { near, far, coastFar = far, coastNear = near } = preset.background.fog;
  const coastIndex = ZONES.findIndex(zone => zone.biome === "coast-dusk");
  const start = ZONES[coastIndex - 1]!.t;
  const end = ZONES[coastIndex]!.t;
  const u = Number.isNaN(pathT) ? 0 : Math.max(0, Math.min(1, (pathT - start) / (end - start)));
  const weight = u * u * (3 - 2 * u);
  const clear = { near: near + (coastNear - near) * weight, far: far + (coastFar - far) * weight };
  const forest = preset.background.forest;
  if (!forest) return clear;
  const forestWeight = forestAtmosphereWeight(pathT);
  return {
    near: clear.near + (forest.fog.near - clear.near) * forestWeight,
    far: clear.far + (forest.fog.far - clear.far) * forestWeight,
    forestWeight,
  };
}
