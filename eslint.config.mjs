import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Ranh giới 3D (spec §5, §15): world chỉ được nạp bằng import() động sau Enter World.
const worldBoundary = {
  files: ["src/app/**", "src/components/**", "src/content/**", "src/i18n/**"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@/features/world", "@/features/world/*", "**/features/world", "**/features/world/*"],
            message: "Không import tĩnh features/world từ layout/portfolio/content. Dùng import() động sau Enter World.",
            allowTypeImports: true,
          },
        ],
      },
    ],
  },
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  worldBoundary,
  globalIgnores([".next/**", "out/**", "node_modules/**", "next-env.d.ts", "coverage/**"]),
]);
