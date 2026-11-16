import { ZONES } from "../layout/zones";

export function hillEase(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function hillRandom(x: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ 0x48494c4c;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967295;
}

export function hillNoise(x: number, z: number, scale: number): number {
  const u = x / scale, v = z / scale, ix = Math.floor(u), iz = Math.floor(v);
  const fx = hillEase(0, 1, u - ix), fz = hillEase(0, 1, v - iz);
  return (hillRandom(ix, iz) * (1 - fx) + hillRandom(ix + 1, iz) * fx) * (1 - fz)
    + (hillRandom(ix, iz + 1) * (1 - fx) + hillRandom(ix + 1, iz + 1) * fx) * fz;
}

const slopes = ZONES.filter(zone => zone.id === "first-light" || zone.id === "old-trail");

/** The cone across the stream in horizon-left-holes, separate from Old Trail. */
export function horizonHillRegion(x: number, z: number): number {
  if (z >= -386 || z <= -482 || x <= -132 || x >= 36) return 0;
  return (1 - hillEase(0.45, 1, Math.hypot((x + 48) / 84, (z + 447) / 68)))
    * (1 - hillEase(-406, -386, z)) * hillEase(-482, -466, z);
}

/** Smooth setbacks protect the river, trail and authored pads on all three hills. */
export function nearHillWeight(x: number, z: number, pathDistance: number, riverDistance: number, pathT: number): number {
  const horizon = horizonHillRegion(x, z);
  if (horizon > 0) {
    let weight = horizon * hillEase(16, 30, pathDistance) * hillEase(20, 34, riverDistance);
    for (const zone of ZONES) {
      weight *= hillEase(zone.radius + 4, zone.radius + 16, Math.hypot(x - zone.position.x, z - zone.position.z));
    }
    return weight;
  }
  // Most heightfield/backdrop samples are outside these hills; skip all noise
  // and pad distances there, including the remote range and coastal scenery.
  if (z <= -400 || !slopes.some(zone => Math.abs(x - zone.position.x) < 160
    && Math.abs(z - zone.position.z + (zone.id === "first-light" ? 0 : 45)) < (zone.id === "first-light" ? 80 : 125))) return 0;
  const clearance = hillEase(16, 30, pathDistance) * hillEase(20, 34, riverDistance)
    * (1 - hillEase(0.74, 0.79, pathT)) * hillEase(-400, -382, z);
  if (clearance === 0) return 0;
  let weight = 0;
  for (const zone of slopes) {
    const firstLight = zone.id === "first-light";
    const radiusZ = firstLight ? 80 : 125;
    const extent = firstLight ? hillEase(-65, -45, z) * hillEase(40, 58, pathDistance)
      : 1 - hillEase(-240, -210, z);
    weight = Math.max(weight, (1 - hillEase(0.45, 1,
      Math.hypot((x - zone.position.x) / 160, (z - zone.position.z + (firstLight ? 0 : 45)) / radiusZ))) * extent);
  }
  if (weight === 0) return 0;
  for (const zone of ZONES) {
    weight *= hillEase(zone.radius + 4, zone.radius + 16, Math.hypot(x - zone.position.x, z - zone.position.z));
  }
  return weight * clearance;
}

/** Wandering catchments run across the flanks, with tributaries joining downslope. */
export function hillDrainage(x: number, z: number): number {
  if (z < -386) {
    // Diverging runnels descend from the crest; noise interrupts the tributaries.
    const dx = x + 58, dz = z + 452, radius = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    const warp = (hillNoise(x, z, 17) - 0.5) * 2.2;
    const channel = Math.abs(Math.sin(angle * 8 + warp + radius * 0.025));
    const tributary = Math.abs(Math.sin(angle * 13 - warp + radius * 0.055));
    return Math.max((1 - hillEase(0.08, 0.38, channel)) * 0.9,
      (1 - hillEase(0.04, 0.20, tributary)) * hillEase(0.4, 0.75, hillNoise(x, z, 13)) * 0.6)
      * hillEase(5, 13, radius);
  }
  const warp = (hillNoise(x, z, 29) - 0.5) * 16;
  const channel = Math.abs(Math.sin((z + warp + x * 0.17) / 7.4));
  const tributary = Math.abs(Math.sin((z + warp - x * 0.36 + 17) / 4.9));
  return Math.max((1 - hillEase(0.06, 0.38, channel)) * 0.9,
    (1 - hillEase(0.04, 0.22, tributary)) * hillEase(0.35, 0.7, hillNoise(x, z, 21)) * 0.65);
}

/** Metre-scale shoulders and shallow runnels share the collision heightfield. */
export function nearHillRelief(x: number, z: number): number {
  const shoulder = (hillNoise(x, z, 18) - 0.5) * 2.4;
  const ribs = (hillNoise(x + z * 0.3, z, 7) - 0.5) * 0.48;
  return shoulder + ribs - hillDrainage(x, z) * 0.52;
}
