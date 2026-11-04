import { Color, SRGBColorSpace } from "three";
import { PALETTE, type PaletteKey } from "../../src/features/world/art/palette";

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
    /** World-scale linear fog to paper (m); the 15/65 m prototype values swallow a 900 m world. */
    fog: { near: number; far: number };
    mist: { bands: [number, number, number]; strength: number };
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
    terrain: recipe("forestLight", "paper", 0.14, 0.92),
    // §5.4: four softly filtered levels keep light transitions gentle.
    ramp: { steps: 4, soft: true },
    // §5.2: distant forest layers stay visible through lighter mist.
    fog: { near: 60, far: 340 },
    mist: { bands: [70, 130, 220], strength: 0.32 },
    // Watercolour edges, without the ink contour of direction B.
    edges: { ink: false, bleed: 0.32 },
    sky: {
      // §5.3: jade dawn and restrained gold dusk, both washed with paper.
      dawn: { top: recipe("mist", "paper", 0.28), horizon: recipe("dusk", "paper", 0.84) },
      dusk: { top: recipe("indigo", "paper", 0.72, 0.8), horizon: recipe("dusk", "paper", 0.58, 0.9) },
    },
  },
  foliage: {
    // Fuller foliage wash; warm diluted ink for matte trunks (§5.4).
    crown: recipe("forestLight", "forestDeep", 0.36, 0.95),
    trunk: recipe("ink", "paper", 0.35, 0.8),
    ramp: { steps: 4, soft: true },
    // Richer canopy, using the same seeded candidates as B/C.
    density: 1,
  },
};

const B: StylePreset = {
  label: "B · Mực trên giấy",
  background: {
    // §5.2–5.3: cream negative space dominates a narrow jade/indigo wash.
    terrain: recipe("mist", "paper", 0.62, 0.65),
    // Three broad, soft washes suggest ink painting rather than hard cel shading.
    ramp: { steps: 3, soft: true },
    // Closer, stronger depth layers dissolve distance into paper (§5.4).
    fog: { near: 40, far: 260 },
    mist: { bands: [45, 90, 160], strength: 0.6 },
    // Diluted ink contour plus stronger pigment pooling; High enables ink.
    edges: { ink: true, bleed: 0.65 },
    sky: {
      // Keep sky mostly blank paper; dusk retains only a small golden wash.
      dawn: { top: recipe("mist", "paper", 0.72, 0.65), horizon: recipe("dusk", "paper", 0.94, 0.65) },
      dusk: { top: recipe("indigo", "paper", 0.86, 0.65), horizon: recipe("dusk", "paper", 0.84, 0.65) },
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

/** C literally shares B's background and A's foliage parameters; no shader forks. */
export const STYLE_PRESETS: Record<"A" | "B" | "C", StylePreset> = {
  A, B, C: { label: "C · Kết hợp", background: B.background, foliage: A.foliage },
};
export type PresetId = keyof typeof STYLE_PRESETS;
