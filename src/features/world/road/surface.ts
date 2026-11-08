import { Color } from "three";
import { PALETTE } from "../art/palette";
import { pathLength } from "../layout/path";
import { ROAD_START, ROAD_WIDTH, roadRandomAt, roadWidthAt } from "./layout";

export const CENTER_LINE_WIDTH = 0.12;
export const EDGE_LINE_WIDTH = 0.1;
export const SHOULDER_WIDTH = 0.8;

// Palette-only aggregate wash compensates for the soft ramp's dark coastal light.
// B2-180: the coast is now dusk-lit; a lighter, older tarmac keeps the road readable (display luma ≥ 0.22).
const asphalt = new Color(PALETTE.asphalt).lerp(new Color(PALETTE.laneWhite), 0.46);
const rock = new Color(PALETTE.rock), sand = new Color(PALETTE.sand);
const grass = new Color(PALETTE.grass), grassDry = new Color(PALETTE.grassDry);
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const u = clamp(n); return u * u * (3 - 2 * u); };

/** Continuous position-seeded noise: shared vertices agree across every cell. */
function noise(x: number, z: number, scale: number): number {
  const ix = Math.floor(x / scale), iz = Math.floor(z / scale);
  const u = smooth(x / scale - ix), v = smooth(z / scale - iz);
  const a = roadRandomAt(ix, iz) * (1 - u) + roadRandomAt(ix + 1, iz) * u;
  const b = roadRandomAt(ix, iz + 1) * (1 - u) + roadRandomAt(ix + 1, iz + 1) * u;
  return a * (1 - v) + b * v;
}

/** Full-width shoulders wander between 0.68 and 0.92 m; only the inland start tapers. */
export function roadBandOffsetAt(offset: number, t: number): number {
  const taper = roadWidthAt(t) / ROAD_WIDTH;
  const distance = Math.abs(offset);
  if (distance <= ROAD_WIDTH / 2) return offset * taper;
  const station = (t - ROAD_START) * pathLength();
  const shoulder = SHOULDER_WIDTH + 0.24 * (noise(station, Math.sign(offset) * 17, 4) - 0.5);
  return Math.sign(offset) * (ROAD_WIDTH / 2 + (distance - ROAD_WIDTH / 2) / SHOULDER_WIDTH * shoulder) * taper;
}

export function asphaltColorAt(x: number, z: number, offset: number): Color {
  // Two worn wheel paths in each lane, with larger, darker resurfacing patches.
  const wheel = Math.max(Math.exp(-(((Math.abs(offset) - 0.65) / 0.23) ** 2)),
    Math.exp(-(((Math.abs(offset) - 1.55) / 0.23) ** 2)));
  const patch = smooth((noise(x, z, 3.5) - 0.56) / 0.2);
  return asphalt.clone().multiplyScalar(0.98 + 0.04 * noise(x, z, 0.7) + 0.085 * wheel - 0.075 * patch);
}

export function roadSurfaceColorAt(x: number, z: number, offset: number, middle: number): Color {
  if (Math.abs(middle) > ROAD_WIDTH / 2) {
    const across = clamp((Math.abs(offset) - ROAD_WIDTH / 2) / SHOULDER_WIDTH);
    const grit = noise(x, z, 0.23);
    const gravel = rock.clone().lerp(sand, 0.22 + grit * 0.2).multiplyScalar(0.95 + 0.1 * grit);
    const verge = grass.clone().lerp(grassDry, 0.35 + 0.25 * noise(x, z, 5));
    // Irregular grass fingers intrude into the outer gravel; the last row is all grass.
    return gravel.lerp(verge, smooth((across - 0.3 - 0.15 * noise(x, z, 1.4)) / 0.55));
  }
  const ground = asphaltColorAt(x, z, offset);
  const pigment = Math.abs(middle) < CENTER_LINE_WIDTH / 2 ? "laneYellow"
    : Math.abs(middle) > 2.1 && Math.abs(middle) < 2.1 + EDGE_LINE_WIDTH ? "laneWhite" : undefined;
  if (!pigment) return ground;
  // Sparse, softly bounded wear keeps the paint readable without cutting holes in it.
  const wear = smooth((noise(x + (pigment === "laneWhite" ? 19 : 0), z, 2.4) - 0.57) / 0.22);
  return new Color(PALETTE[pigment]).lerp(ground, wear * 0.2);
}
