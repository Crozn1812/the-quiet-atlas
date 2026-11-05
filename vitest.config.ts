import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    environment: "node",
    // Node 24 EventTarget capture-removal workaround for in-memory DOMs (see the file).
    setupFiles: ["tests/unit/setup/node-event-target.ts"],
  },
});
