import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    environment: "node",
    // World wiring tests mount the full world (terrain, forest, eight zone set-pieces); under a parallel full suite
    // they pass 5 s. Harness limit only — performance budgets live in tests/perf (ADR 0007).
    testTimeout: 15_000,
    // Node 24 EventTarget capture-removal workaround for in-memory DOMs (see the file).
    setupFiles: ["tests/unit/setup/node-event-target.ts"],
  },
});
