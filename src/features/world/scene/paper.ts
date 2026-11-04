import { type WebGLRenderer } from "three";
import { createPaperPass } from "../post/paper";
import type { Quality } from "../terrain";
import type { LightingGrade } from "../sky/grade";

/** The world's paper pass: the position grade tints distance fog and mist through the pass's own API. */
export function createGradedPaperPass(renderer: WebGLRenderer, quality: Quality) {
  const paper = createPaperPass(renderer, { quality });
  let fog = { near: 15, far: 65 };
  return {
    ...paper,
    setFog(options: { near: number; far: number }) {
      paper.setFog(options);
      fog = { near: options.near, far: options.far };
    },
    setGrade(grade: LightingGrade) {
      paper.setFog({ ...fog, color: grade.fogColor });
      paper.setMist({ color: grade.fogColor });
    },
  };
}
