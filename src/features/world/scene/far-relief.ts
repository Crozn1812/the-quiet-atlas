import { nearestPath, nearestRiver } from "../terrain/samples";
import { waterLevelAt, worldHeight } from "../terrain/height";
import { TERRAIN_RADIUS } from "../terrain/tiles";

export function farEase(a: number, b: number, v: number) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function hash(x: number, z: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967295;
}
/** Smooth world-space noise, independent of build order, tiles and quality. */
export function farNoise(x: number, z: number, scale: number) {
  x /= scale; z /= scale;
  const ix = Math.floor(x), iz = Math.floor(z);
  const u = farEase(0, 1, x - ix), v = farEase(0, 1, z - iz);
  return (hash(ix, iz) * (1 - u) + hash(ix + 1, iz) * u) * (1 - v)
    + (hash(ix, iz + 1) * (1 - u) + hash(ix + 1, iz + 1) * u) * v;
}
/** Rotated, feedback-weighted ridged multifractal. Low octaves establish the
 * catchments; small ridges can only grow on their parents, forming branching
 * spurs instead of independent bumps. All wavelengths exceed the High grid. */
export function farRidged(x: number, z: number) {
  let sum = 0, amplitude = 0.55, weight = 1;
  for (let octave = 0; octave < 5; octave++) {
    const ridge = 1 - Math.abs(2 * farNoise(x, z, 1) - 1);
    const signal = ridge * ridge * weight;
    sum += signal * amplitude;
    weight = Math.min(1, signal * 1.8);
    const nextX = (x * 0.8 - z * 0.6) * 2.03 + 17.3;
    z = (x * 0.6 + z * 0.8) * 2.03 - 9.2;
    x = nextX;
    amplitude *= 0.49;
  }
  return sum;
}

/** Four long ranges, rather than radial summit primitives. Each has a wandering
 * crest, offset summits, unequal shoulders and V-shaped drainage down its flanks.
 * This pure field is also used to bake horizon shadows, never for collisions. */
export function farMountainHeight(x: number, z: number) {
  const wx = x + (farNoise(x + 613, z - 137, 170) - 0.5) * 88;
  const wz = z + (farNoise(x - 287, z + 713, 140) - 0.5) * 72;
  let mountain = 0;
  for (let layer = 0; layer < 4; layer++) {
    const station = wz + layer * 213;
    const center = -220 - layer * 173
      + (farNoise(station, layer * 313, 160) - 0.5) * 107
      + Math.sin(station / 149 + layer * 1.7) * 27;
    const across = wx - center;
    const width = across > 0 ? 150 + layer * 7 : 112 + layer * 5;
    const shoulder = Math.max(0, 1 - Math.abs(across) / width);
    if (!shoulder) continue;
    const spine = 0.70 + 0.44 * farNoise(station + 58, layer * 419, 104)
      + 0.24 * farNoise(station - 35, layer * 279, 43);
    const ribs = farRidged((wx + layer * 53) / 126, (wz - layer * 97) / 126);
    // Converging tributaries cut deeper on the shoulders, leaving the main
    // divide connected. Domain warp prevents equally spaced parallel gullies.
    const cut = Math.abs(Math.sin((wz + Math.abs(across) * 0.72
      + (farNoise(wx, wz, 57) - 0.5) * 91) / 24));
    const drainage = (1 - cut) ** 3 * (1 - shoulder * 0.7);
    const height = (64 + layer * 42) * spine * Math.pow(shoulder * shoulder * (3 - 2 * shoulder), 1.1)
      * (0.60 + ribs * 0.66 - drainage * 0.30);
    mountain = Math.max(mountain, height);
  }
  return mountain;
}

/** Relief belongs only to the backdrop. The resident path/river/shore never moves. */
export function farHeight(x: number, z: number) {
  const base = worldHeight(x, z);
  const replacement = farEase(90, 160, -x) * farEase(90, 165, nearestPath(x, z).distance)
    * farEase(28, 65, nearestRiver(x, z).distance);
  const remote = farEase(TERRAIN_RADIUS + 20, TERRAIN_RADIUS + 65, nearestPath(x, z).distance)
    * farEase(18, 40, nearestRiver(x, z).distance) * farEase(2, 12, base - waterLevelAt(z));
  if (remote === 0 && replacement === 0) return base;
  const warp = (farNoise(x, z, 130) - 0.5) * 48;
  // Resolve ridges over many grid cells. Sub-cell crown noise used to alias into
  // knobbly summit edges; leaf detail belongs in the material below the skyline.
  const ridge = 1 - Math.abs(farNoise(x + warp, z, 72) * 2 - 1);
  const drainage = Math.pow(1 - Math.abs(farNoise(x - warp, z + warp, 42) * 2 - 1), 3);
  const crowns = (farNoise(x, z, 22) - 0.5) * 0.45;
  const massif = farEase(12, 60, base - waterLevelAt(z));
  const shoulder = (farNoise(x + warp, z - warp, 110) - 0.5) * 28;
  const oldGround = base + remote * ((2.4 + 18 * massif) * (ridge - 0.5)
    + massif * shoulder - drainage * (1.1 + 9 * massif) + crowns);
  // Replace the authored cones completely inland, including their broad bases.
  // The coast and route retain their old height at the transition boundary.
  return oldGround + (waterLevelAt(z) + 3 + farMountainHeight(x, z) - oldGround) * replacement;
}

/** Lower remote outliers, never raise a valley or touch the resident route.
 * Cardinal edges are bounded to 1.4 m/m: triangle gradients stay <= 1.98,
 * leaving at least 26.8 degrees from vertical on both sides of a summit.
 * Sweeps propagate the lower envelope across the connected heightfield.
 */
export function* limitFarSlopes(heights: Float32Array, cells: number, step: number, originX: number) {
  const stride = cells + 1, rise = step * 1.4;
  for (let pass = 0; pass < 4; pass++) {
    const reverse = pass % 2 === 1;
    for (let row = 0; row <= cells; row++) {
      yield;
      const x = reverse ? cells - row : row;
      if (originX + x * step > -160) continue;
      for (let col = 0; col <= cells; col++) {
        const z = reverse ? cells - col : col, i = x * stride + z;
        let h = heights[i]!;
        if (x > 0) h = Math.min(h, heights[i - stride]! + rise);
        if (x < cells) h = Math.min(h, heights[i + stride]! + rise);
        if (z > 0) h = Math.min(h, heights[i - 1]! + rise);
        if (z < cells) h = Math.min(h, heights[i + 1]! + rise);
        heights[i] = h;
      }
    }
  }
}
