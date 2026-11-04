import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Isolated bench configuration. The Next application and its config are untouched.
export default defineConfig({
  cacheDir: fileURLToPath(new URL(".vite/", import.meta.url)),
  server: {
    host: "127.0.0.1",
    port: 4190,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL("../../", import.meta.url))] },
  },
});
