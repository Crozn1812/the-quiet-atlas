// B2-001 — taste brief §5.3 (docs/art-bible/taste.md), ADR 0013. Starting palette; Art Director locks it after the style-frame round.
// Rule: paper + greens dominate; orange/vermilion are tiny accents only (a flower, a stamp, a film date). No neon.
export const PALETTE = {
  paper: "#EEE8D8",
  ink: "#2B2A26",
  forestLight: "#5E8C6A",
  forestDeep: "#2F5446",
  mist: "#A9C8B8",
  water: "#2E5E73",
  indigo: "#23476B",
  dusk: "#E2B65C",
  flower: "#D9822B",
  vermilion: "#B5432F",
} as const;
export type PaletteKey = keyof typeof PALETTE;
/** Accents allowed only in small doses (taste brief §5.3). */
export const RARE_ACCENTS: readonly PaletteKey[] = ["flower", "vermilion"];
/** `#RRGGBB` → 0xRRGGBB for three.js `Color`. */
export function hex(key: PaletteKey): number {
  return Number.parseInt(PALETTE[key].slice(1), 16);
}
/** sRGB components 0–1 (for shader uniforms that expect sRGB input). */
export function rgb(key: PaletteKey): [number, number, number] {
  const n = hex(key);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
