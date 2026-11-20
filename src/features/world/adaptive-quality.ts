import type { Quality } from "./terrain";

export const QUALITY_WARMUP_MS = 5000;
export const QUALITY_WINDOW_MS = 3000;
export const QUALITY_LOCK_MS = 10000;
export const QUALITY_P95_LIMIT_MS = 1000 / 30;
/** QF (Duy 20/11): streaming hitches alone must not drop High. Lower only when the typical frame is slow too. */
export const QUALITY_MEDIAN_LIMIT_MS = 1000 / 30;
export const QUALITY_SLOW_WINDOWS = 3;
export interface AdaptiveState {
  elapsed: number;
  lockedUntil: number;
  frames: readonly number[];
  windowTime: number;
  manual: boolean;
  /** Consecutive slow windows; a streaming burst rarely lasts three. */
  slowWindows?: number;
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
  quality = quality === "Low" ? "Low" : "High";
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
  const median = sorted[Math.floor((sorted.length - 1) / 2)]!;
  const slow = p95 > QUALITY_P95_LIMIT_MS && median > QUALITY_MEDIAN_LIMIT_MS;
  const slowWindows = slow ? (state.slowWindows ?? 0) + 1 : 0;
  const lower = slowWindows >= QUALITY_SLOW_WINDOWS;
  return {
    state: {
      ...state,
      elapsed,
      lockedUntil: lower ? elapsed + QUALITY_LOCK_MS : state.lockedUntil,
      frames: [],
      windowTime: 0,
      slowWindows: lower ? 0 : slowWindows,
    },
    quality: lower ? "Low" : quality,
  };
}
