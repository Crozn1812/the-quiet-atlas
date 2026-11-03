import type { Quality } from "./terrain";

export const QUALITY_WARMUP_MS = 5000;
export const QUALITY_WINDOW_MS = 3000;
export const QUALITY_LOCK_MS = 10000;
export const QUALITY_P95_LIMIT_MS = 1000 / 30;
export interface AdaptiveState {
  elapsed: number;
  lockedUntil: number;
  frames: readonly number[];
  windowTime: number;
  manual: boolean;
}
export const initialAdaptive = (): AdaptiveState => ({
  elapsed: 0,
  lockedUntil: QUALITY_WARMUP_MS,
  frames: [],
  windowTime: 0,
  manual: false,
});
export function selectManualQuality(state: AdaptiveState): AdaptiveState {
  return { ...state, manual: true, frames: [], windowTime: 0 };
}
export function sampleQuality(state: AdaptiveState, ms: number, quality: Quality): { state: AdaptiveState; quality: Quality } {
  if (state.manual || !Number.isFinite(ms) || ms <= 0) return { state, quality };
  const elapsed = state.elapsed + ms;
  if (state.elapsed < state.lockedUntil || quality === "Low") {
    return { state: { ...state, elapsed, frames: [], windowTime: 0 }, quality };
  }
  const frames = [...state.frames, ms];
  const windowTime = state.windowTime + ms;
  if (windowTime < QUALITY_WINDOW_MS) {
    return { state: { ...state, elapsed, frames, windowTime }, quality };
  }
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
  const lower = p95 > QUALITY_P95_LIMIT_MS;
  return {
    state: {
      ...state,
      elapsed,
      lockedUntil: lower ? elapsed + QUALITY_LOCK_MS : state.lockedUntil,
      frames: [],
      windowTime: 0,
    },
    quality: lower ? quality === "High" ? "Balanced" : "Low" : quality,
  };
}
