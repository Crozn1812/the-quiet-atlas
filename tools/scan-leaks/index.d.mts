// Khai báo kiểu cho tools/scan-leaks/index.mjs (để test TypeScript import được).

export interface RuleInfo {
  id: string;
  name: string;
}

export interface Allowlist {
  emails: string[];
  values: string[];
}

export interface Hit {
  file: string;
  line: number;
  col: number;
  rule: string;
  ruleName: string;
  /** Giá trị đã che — giá trị gốc không bao giờ được trả về. */
  masked: string;
}

export interface ScanReport {
  ok: boolean;
  hits: Hit[];
  errors: string[];
  warnings: string[];
  filesScanned: number;
  filesSkipped: number;
}

export const REPO_ROOT: string;
export const DEFAULT_DIRS: readonly string[];
export const DEFAULT_ALLOWLIST_FILE: string;
export const DENYLIST_ENV: string;
export const AZURE_WINDOW: number;
export const RULES: Readonly<Record<
  "awsAccountId" | "awsArn" | "azureGuid" | "internalIp" | "internalDomain" | "denylist" | "email",
  RuleInfo
>>;
export const BINARY_EXTENSIONS: ReadonlySet<string>;

export function isLikelyAwsAccountId(text: string, start: number, end: number): boolean;
export function hasAzureKeywordNearby(text: string, start: number, end: number, window?: number): boolean;
export function maskValue(value: string): string;
export function parseDenylist(text: string): string[];
export function compileDenylist(terms: readonly string[]): RegExp[];
export function loadAllowlist(file?: string): Allowlist;
export function loadDenylist(env?: Record<string, string | undefined>): { terms: string[]; warning: string | undefined };
export function scanText(
  text: string,
  options?: { file?: string; allowlist?: Allowlist; denylist?: readonly string[] },
): Hit[];
export function listFiles(dir: string): string[];
export function scanDirs(
  dirs: readonly string[],
  options?: { allowlist?: Allowlist; denylist?: readonly string[]; warnings?: string[]; cwd?: string },
): ScanReport;
export function formatReport(report: ScanReport, dirs?: readonly string[]): string;
export function main(argv?: string[], env?: Record<string, string | undefined>): number;
