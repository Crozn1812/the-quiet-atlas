// Khai báo kiểu cho tools/check-bundle/index.mjs (để test TypeScript import được).

export interface Budgets {
  jsGzipBytes: number;
  totalBytes: number;
}

export interface PageSpec {
  file: string;
  required: boolean;
}

export interface ExtractedResource {
  url: string;
  kind: string;
  nomodule: boolean;
}

export interface MeasuredResource extends ExtractedResource {
  file: string;
  bytes: number;
  js: boolean;
}

export interface PageResult {
  page: string;
  htmlBytes: number;
  jsGzip: number;
  jsCount: number;
  total: number;
  resources: MeasuredResource[];
  errors: string[];
  warnings: string[];
}

export interface BundleReport {
  ok: boolean;
  results: PageResult[];
  errors: string[];
}

export const WORLD_MARKER: string;
export const BUDGETS: Readonly<Budgets>;
export const FORBIDDEN_EXTENSIONS: readonly string[];
export const DEFAULT_PAGES: readonly PageSpec[];

export function extractResources(html: string): ExtractedResource[];
export function findForbiddenRefs(html: string): string[];
export function transferSize(buf: Uint8Array, file: string): number;
export function checkPage(outDir: string, pageFile: string, budgets?: Budgets): PageResult;
export function checkBundle(
  outDir: string,
  options?: { pages?: readonly PageSpec[]; budgets?: Budgets },
): BundleReport;
export function fmtKB(bytes: number): string;
export function formatReport(report: BundleReport, budgets?: Budgets): string;
export function main(argv?: string[]): number;
