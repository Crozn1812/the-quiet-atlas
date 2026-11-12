// A local static build must include the files linked by its HTML.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { cvFiles } from "./cv/files.mjs";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
// Pin once so a build crossing midnight cannot produce mismatched PDF links.
const date = process.env.CV_VERSION_DATE ?? new Date().toISOString().slice(0, 10);
cvFiles(date);
const env = { ...process.env, CV_VERSION_DATE: date };
for (const args of [
  // NEXT_BUILD_WEBPACK=1: WASM SWC + webpack when Windows Application Control blocks the native SWC binary.
  [require.resolve("next/dist/bin/next"), "build", ...(process.env.NEXT_BUILD_WEBPACK ? ["--webpack"] : [])],
  ["tools/cv/index.mjs"],
  ["tools/og/index.mjs"],
]) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
