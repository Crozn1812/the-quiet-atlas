/** Shared surf model. Seconds come from the sea's freezeable simulation clock. */
export const SURF_PERIOD = 8;
export const SURF_TRAVEL = 2.4;
export const SURF_PHASE_PER_METRE = 0.017;

export interface SurfListener {
  readonly seconds: number;
  readonly along: number;
  readonly distance: number;
  readonly pan: number;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function surfCycle(seconds: number, along: number): number {
  const phase = seconds / SURF_PERIOD - along * SURF_PHASE_PER_METRE;
  return phase - Math.floor(phase);
}

/** Fast uprush, slower draining water; periodic with a quiet offshore interval. */
export function surfRunup(phase: number): number {
  return SURF_TRAVEL * smooth(0.18, 0.44, phase) * (1 - smooth(0.44, 0.94, phase));
}

export function surfEnvelope(phase: number) {
  return {
    approach: smooth(0.02, 0.2, phase) * (1 - smooth(0.22, 0.36, phase)),
    break: smooth(0.18, 0.26, phase) * (1 - smooth(0.3, 0.47, phase)),
    retreat: smooth(0.42, 0.56, phase) * (1 - smooth(0.72, 0.98, phase)),
  };
}

/** Used by both the sea shader and terrain-conforming swash material. */
export const SURF_GLSL = /* glsl */ `
  float surfCycle(float seconds, float along) {
    return fract(seconds / ${SURF_PERIOD.toFixed(1)} - along * ${SURF_PHASE_PER_METRE});
  }
  float surfRunup(float p) {
    return ${SURF_TRAVEL} * smoothstep(0.18, 0.44, p) * (1.0 - smoothstep(0.44, 0.94, p));
  }
`;
