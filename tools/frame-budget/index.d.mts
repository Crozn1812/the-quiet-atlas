// Type declarations for tools/frame-budget/index.mjs (so TypeScript tests/specs can import it).

export interface FrameStats {
  frames: number;
  durationMs: number;
  fpsAvg: number | null;
  meanMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
  over100: number;
  over100Pct: number | null;
  over250: number;
}

export interface FrameGate {
  id: "fps-avg" | "p95" | "over-100" | "over-250";
  label: string;
  measured: number | null;
  limit: number;
  status: "PASS" | "FAIL";
}

export interface T08Run {
  run: number;
  scenario: string;
  quality: "low" | "balanced" | "high";
  gate: boolean;
  stats: FrameStats;
  status: "PASS" | "FAIL";
  valid: boolean;
  invalidReason?: string;
}

export interface TrendSample {
  tMs: number;
  value: number;
}

export type Trend =
  | { trend: "không đủ mẫu"; points: number }
  | {
      trend: "ổn định" | "tăng liên tục";
      points: number;
      first: number;
      last: number;
      min: number;
      max: number;
      growth: number;
      slopePerMin: number;
      r2: number;
      nonDecreasing: number;
    };

export const T08_LIMITS: Readonly<{ fpsAvgMin: number; p95MaxMs: number; over100PctMax: number; over250Max: number }>;
export const T08_METHOD: Readonly<{ warmupMs: number; measureMs: number; runs: number }>;

export function percentile(values: readonly number[], p: number): number | null;
export function deltasFromTimestamps(timestamps: readonly number[], from?: number, to?: number): number[];
export function frameStats(deltas: readonly number[]): FrameStats;
export function evaluateT08(stats: FrameStats, limits?: typeof T08_LIMITS): { gates: FrameGate[]; status: "PASS" | "FAIL" };
export function toCsv(deltas: readonly number[]): string;
export function linearFit(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number; r2: number };
export function classifyTrend(samples: readonly TrendSample[], options?: { warmupMs: number; tolerance?: number }): Trend;
export function formatT08Markdown(runs: readonly T08Run[]): string;
export function formatT09Markdown(trends: Readonly<Record<string, Trend>>): string;
export function main(argv?: string[]): number;
