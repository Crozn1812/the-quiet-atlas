export const FIXED_DT = 1 / 60;
export const MAX_STEPS = 5;
/** Drop excess elapsed time, never carry a suspended tab's backlog forward. */
export function limitSteps(accumulator: number, elapsed: number) {
  const total = Math.min(Math.max(0, accumulator) + Math.max(0, Number.isFinite(elapsed) ? elapsed : 0), FIXED_DT * MAX_STEPS);
  const steps = Math.min(MAX_STEPS, Math.floor((total + 1e-10) / FIXED_DT));
  return { steps, remainder: Math.max(0, total - steps * FIXED_DT) };
}
