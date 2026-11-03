// Khai báo kiểu cho tools/check-licenses/index.mjs (để test TypeScript import được).

export interface CsvRow {
  line: number;
  cells: string[];
}

export interface InventoryEntry {
  line: number;
  record: Record<string, string>;
}

export interface LicenseReport {
  ok: boolean;
  files: string[];
  errors: string[];
  warnings: string[];
}

export const REPO_ROOT: string;
export const DEFAULT_PUBLIC_DIR: string;
export const DEFAULT_CSV: string;
export const REQUIRED_COLUMNS: readonly string[];
export const IGNORED_BASENAMES: ReadonlySet<string>;

export function parseCsv(text: string): CsvRow[];
export function normalizeAssetPath(p: string): string;
export function listPublicFiles(dir: string): string[];
export function readInventory(csvText: string): {
  entries: Map<string, InventoryEntry>;
  errors: string[];
  warnings: string[];
};
export function checkLicenses(options?: { publicDir?: string; csvFile?: string }): LicenseReport;
export function formatReport(report: LicenseReport): string;
export function main(argv?: string[]): number;
