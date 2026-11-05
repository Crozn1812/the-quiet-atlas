import { Color, type WebGLRenderer } from "three";
import { STYLE_PRESETS, WORLD_DIRECTION, type StylePreset } from "../art/direction";
import { PALETTE } from "../art/palette";
import { createPaperPass } from "../post/paper";
import type { Quality } from "../terrain";
import { coastAtmosphereWeight, type LightingGrade } from "../sky/grade";

/** The world's single post pass, set up from the active art direction.
 * The position grade tints distance fog and mist through the pass's own API. */
export function createGradedPaperPass(renderer: WebGLRenderer, quality: Quality, preset: StylePreset = WORLD_DIRECTION) {
  const paper = createPaperPass(renderer, { quality, preset });
  const { fog: directedFog, mist, edges } = preset.background;
  let fog = { ...directedFog };
  let coastMist = false;
  const mistColor = new Color();
  // The legacy coast grade is applied after directGrade and contains paper.
  // Keep R's air independent of that sunset wash, including the Low fallback.
  const clearFog = preset === STYLE_PRESETS.R ? new Color(PALETTE.skyLow).lerp(new Color(PALETTE.cloud), 0.3) : undefined;
  paper.setFog({ ...fog, ...(clearFog ? { color: clearFog } : {}) });
  paper.setMist({ bands: mist.bands, strength: mist.strength });
  paper.setEdges(edges);
  return {
    ...paper,
    setFog(options: { near: number; far: number }) {
      paper.setFog(options);
      fog = { near: options.near, far: options.far };
    },
    setGrade(grade: LightingGrade) {
      const fogColor = clearFog ?? grade.fogColor;
      paper.setFog({ ...fog, color: fogColor });
      // Warmth 0 = cool palette mist, 1 = the horizon wash carried by the fog colour.
      // Clear ground mist by the coast entrance (t=0.82), before the sky finishes blending.
      const clear = Math.min(1, (grade.coastWeight ?? 0) / coastAtmosphereWeight(0.82));
      paper.setMist({
        color: mistColor.set(PALETTE.mist).lerp(fogColor, mist.warmth),
        ...(clear > 0 || coastMist ? { strength: mist.strength * (1 - 0.9 * clear) } : {}),
      });
      coastMist = clear > 0;
    },
  };
}
