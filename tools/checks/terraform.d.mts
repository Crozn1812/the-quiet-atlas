// Khai báo kiểu cho tools/checks/terraform.mjs (để test TypeScript import được).

export interface Step {
  label: string;
  dir: string;
  args: string[];
  root?: string;
}

export interface SpawnLike {
  error?: Error;
  status: number | null;
  stdout?: string;
  stderr?: string;
}

export type RunFn = (
  bin: string,
  args: string[],
  opts: { cwd: string; env: Record<string, string>; encoding: "utf8"; stdio: "pipe" | "inherit"; shell: false },
) => SpawnLike;

export const REPO_ROOT: string;
export const ROOTS: readonly string[];
export const FMT_DIRS: readonly string[];
export const LOCKFILE: string;
export const ALLOWED_SUBCOMMANDS: readonly string[];

export function sanitizeEnv(env: Record<string, string | undefined>): Record<string, string>;
export function initArgs(hasLockfile: boolean): string[];
export function buildSteps(hasLock: (root: string) => boolean): Step[];
export function assertAllowed(args: string[]): void;
export function main(env?: Record<string, string | undefined>, opts?: { run?: RunFn; repoRoot?: string }): 0 | 1 | 2;
