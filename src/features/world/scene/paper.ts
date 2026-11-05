import { Color, type WebGLRenderer } from "three";
import { WORLD_DIRECTION } from "../art/direction";
import { PALETTE } from "../art/palette";
import { createPaperPass } from "../post/paper";
import type { Quality } from "../terrain";
import { coastAtmosphereWeight, type LightingGrade } from "../sky/grade";

/** The world's paper pass, set up from the art direction (B2-038, direction C).
 * The position grade tints distance fog and mist through the pass's own API. */
export function createGradedPaperPass(renderer: WebGLRenderer, quality: Quality) {
  const paper = createPaperPass(renderer, { quality });
  const { fog: directedFog, mist, edges } = WORLD_DIRECTION.background;
  let fog = { ...directedFog };
  let coastMist = false;
  const mistColor = new Color();
  paper.setFog(fog);
  paper.setMist({ bands: mist.bands, strength: mist.strength });
  paper.setEdges(edges);
  return {
    ...paper,
    setFog(options: { near: number; far: number }) {
      paper.setFog(options);
      fog = { near: options.near, far: options.far };
    },
    setGrade(grade: LightingGrade) {
      paper.setFog({ ...fog, color: grade.fogColor });
      // Warmth 0 = cool palette mist, 1 = the horizon wash carried by the fog colour.
      // Clear ground mist by the coast entrance (t=0.82), before the sky finishes blending.
      const clear = Math.min(1, (grade.coastWeight ?? 0) / coastAtmosphereWeight(0.82));
      paper.setMist({
        color: mistColor.set(PALETTE.mist).lerp(grade.fogColor, mist.warmth),
        ...(clear > 0 || coastMist ? { strength: mist.strength * (1 - 0.9 * clear) } : {}),
      });
      coastMist = clear > 0;
    },
  };
}
