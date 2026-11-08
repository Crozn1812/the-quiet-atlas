import { Color, type WebGLRenderer } from "three";
import { fogAt, paletteColor, STYLE_PRESETS, WORLD_DIRECTION, type DirectedFog, type StylePreset } from "../art/direction";
import { PALETTE } from "../art/palette";
import { createPaperPass } from "../post/paper";
import type { Quality } from "../terrain";
import { coastAtmosphereWeight, type LightingGrade } from "../sky/grade";

/** The world's graded post pipeline, set up from the active art direction.
 * The position grade tints distance fog and mist through the pass's own API. */
export function createGradedPaperPass(renderer: WebGLRenderer, quality: Quality, preset: StylePreset = WORLD_DIRECTION) {
  const paper = createPaperPass(renderer, { quality, preset, ambientOcclusion: preset === STYLE_PRESETS.R });
  const { mist, edges, forest } = preset.background;
  let fog = fogAt(0, preset);
  let coastMist = false;
  let fogColorOverride: Color | null = null;
  const mistColor = new Color();
  const fogColor = new Color();
  const forestColor = forest ? new Color(paletteColor(forest.color)) : undefined;
  const bands: [number, number, number] = [...mist.bands];
  const gradeColor = new Color(PALETTE.paper);
  let coastClear = 0;
  // The legacy coast grade is applied after directGrade and contains paper.
  // Keep R's air independent of that sunset wash, including the Low fallback.
  const clearFog = preset === STYLE_PRESETS.R ? new Color(PALETTE.skyLow).lerp(new Color(PALETTE.cloud), 0.3) : undefined;
  function applyAtmosphere(resetStrength = true) {
    const weight = fog.forestWeight ?? 0;
    fogColor.copy(clearFog ?? gradeColor);
    if (forestColor) fogColor.lerp(forestColor, weight);
    paper.setFog({ ...fog, color: fogColorOverride ?? fogColor });
    mistColor.set(PALETTE.mist).lerp(clearFog ?? gradeColor, mist.warmth);
    if (forestColor) mistColor.lerp(forestColor, weight);
    mist.bands.forEach((band, i) => { bands[i] = band + ((forest?.mist.bands[i] ?? band) - band) * weight; });
    paper.setMist({
      color: mistColor, bands,
      ...(resetStrength ? { strength: (mist.strength + ((forest?.mist.strength ?? mist.strength) - mist.strength) * weight)
        * (1 - 0.9 * coastClear) } : {}),
    });
  }
  applyAtmosphere();
  paper.setEdges(edges);
  return {
    ...paper,
    setFogColorOverride(color: Readonly<Color> | null) {
      fogColorOverride = color ? new Color().copy(color) : null;
      applyAtmosphere(false);
    },
    setFog(options: DirectedFog) {
      paper.setFog(options);
      fog = { ...options };
      if (forest || fogColorOverride) applyAtmosphere();
    },
    setGrade(grade: LightingGrade) {
      gradeColor.copy(grade.fogColor);
      // Clear ground mist by the coast entrance (t=0.82), before the sky finishes blending.
      const clear = Math.min(1, (grade.coastWeight ?? 0) / coastAtmosphereWeight(0.82));
      // Preserve explicit non-coast mist strength until a coast grade needs to reset it.
      coastClear = clear;
      applyAtmosphere(!!forest || clear > 0 || coastMist);
      coastMist = clear > 0;
    },
  };
}
