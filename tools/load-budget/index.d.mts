// Type declarations for tools/load-budget/index.mjs (so TypeScript tests/specs can import it).

export interface Budgets {
  initialTotalBytes: number;
  initialJsBytes: number;
  forbidden3dBeforeEnter: number;
  worldToPlayableBytes: number;
  timeToPlayableMs: number;
}

export interface RecordedRequest {
  url: string;
  resourceType?: string;
  mimeType?: string;
  status?: number;
  encodedBytes: number;
  startMs: number;
  failed?: boolean;
  signatures?: string[];
}

export type Category = "html" | "css" | "js" | "font" | "image" | "other";

export interface Summary {
  count: number;
  total: number;
  byCategory: Record<Category, number>;
  cvBytes: number;
  failed: number;
}

export interface Gate {
  id: string;
  label: string;
  measured: number | null;
  limit: number;
  unit: "bytes" | "ms" | "requests";
  status: "PASS" | "FAIL";
}

export interface WorstGate extends Gate {
  runs: (number | null)[];
}

export interface RunResult {
  label: string;
  gates: Gate[];
}

export const BUDGETS: Readonly<Budgets>;
export const NETWORK: Readonly<{ downloadMbps: number; uploadMbps: number; rttMs: number }>;
export const WORLD_MARKER: string;
export const WORLD_SIGNATURES: readonly string[];

export function categorize(request: RecordedRequest): Category;
export function threeDReason(request: RecordedRequest): string | null;
export function isCv(request: RecordedRequest): boolean;
export function summarize(requests: readonly RecordedRequest[]): Summary;
export function before(requests: readonly RecordedRequest[], t: number): RecordedRequest[];
export function between(requests: readonly RecordedRequest[], from: number, to: number): RecordedRequest[];
export function evaluateInitialPage(
  page: string,
  requests: readonly RecordedRequest[],
  budgets?: Budgets,
): { page: string; summary: Summary; forbidden: { url: string; reason: string | null }[]; gates: Gate[] };
export function evaluateWorld(
  requests: readonly RecordedRequest[],
  timing: { clickMs: number; playableMs: number | null },
  budgets?: Budgets,
): { summary: Summary; timeMs: number | null; gates: Gate[] };
export function worstOf(runs: readonly { gates: readonly Gate[] }[]): { gates: WorstGate[]; ok: boolean };
export function fmtBytes(bytes: number | null | undefined): string;
export function fmtValue(value: number | null | undefined, unit: Gate["unit"]): string;
export function formatMarkdown(result: { runs: readonly RunResult[] }): string;
export function main(argv?: string[]): number;
