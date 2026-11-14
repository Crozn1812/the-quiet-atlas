import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";
import { PATH_BRIDGES, pathRiverTAt } from "../layout/path";
import { riverLength, riverPointAt, riverTangentAt } from "../layout/river";
import { createSurfaceSampler, riverWidthAt, waterLevelAt } from "../terrain/height";
import { nearestRiver } from "../terrain/samples";
import { bakeWaterDepth } from "./depth";

export const FISH_ROUTE_SAMPLES = 17;
export const FISH_ROUTE_LENGTH = 11;
/** Covers nose/tail at any heading, including maximum tail deflection. */
export const FISH_CLEARANCE = 0.65;

export interface FishSchool {
  readonly name: string;
  readonly t: number;
  readonly count: number;
  readonly center: Vector3;
  readonly forward: Vector3;
  readonly route: readonly Vector3[];
  readonly span: number;
  readonly length: number;
  readonly width: number;
  readonly bankDistance: number;
  readonly submergence: number;
  readonly minDepth: number;
  readonly phase: number;
}

/** Validate the swept corridor against the triangulated bed used by GFX-P4.
 * Sites stay in the channel, upstream of shore rocks, clear of both bridges
 * and the spring outlet. Ordinary scattered rocks only occupy dry terrain.
 */
export function createFishSchools(): readonly FishSchool[] {
  const sampleHeight = createSurfaceSampler();
  const length = riverLength();
  const bridges = PATH_BRIDGES.map(bridge => nearestRiver(bridge.position.x, bridge.position.z).t);
  const sites = [
    { name: "first-light", t: 0.03, count: 6 },
    { name: "roots", t: pathRiverTAt(0.19), count: 7 },
    { name: "old-trail", t: pathRiverTAt(0.5), count: 9 },
    { name: "lower-river", t: 0.79, count: 6 },
    { name: "estuary", t: 0.91, count: 8 },
  ];
  return sites.map((site, id) => {
    // Search inside the same reach if a dry zone terrace overlaps its centre.
    for (let attempt = 0; attempt <= 24; attempt++) {
      const t = site.t + (attempt % 2 ? 1 : -1) * Math.ceil(attempt / 2) * 0.001;
      if (bridges.some(bridge => Math.abs(bridge - t) * length < 18)) continue;
      const width = id === 0 ? 0.4 : 0.85;
      const route = Array.from({ length: FISH_ROUTE_SAMPLES }, (_, row) => {
        const station = t + (row / (FISH_ROUTE_SAMPLES - 1) - 0.5) * FISH_ROUTE_LENGTH / length;
        const point = riverPointAt(station);
        point.y = waterLevelAt(point.z);
        return point;
      });
      const probes: number[] = [];
      // 0.34 m longitudinal / <=0.25 m lateral; includes between shader knots.
      for (let row = 0; row <= 32; row++) {
        const station = t + (row / 32 - 0.5) * FISH_ROUTE_LENGTH / length;
        const point = riverPointAt(station), tangent = riverTangentAt(station);
        for (let side = 0; side <= 12; side++) {
          const across = (side / 12 * 2 - 1) * (width + FISH_CLEARANCE);
          const x = point.x - tangent.z * across, z = point.z + tangent.x * across;
          probes.push(x, waterLevelAt(z), z);
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(probes, 3));
      bakeWaterDepth(geometry, false, sampleHeight);
      const depths = geometry.getAttribute("waterBedDepth");
      let minDepth = Infinity;
      for (let i = 0; i < depths.count; i++) minDepth = Math.min(minDepth, depths.getX(i));
      geometry.dispose();
      if (minDepth < 0.3) continue;
      const center = route[(FISH_ROUTE_SAMPLES - 1) / 2]!.clone();
      return { ...site, t, center, route, forward: riverTangentAt(t), width,
        length: FISH_ROUTE_LENGTH, span: 3.1, bankDistance: riverWidthAt(t) / 2,
        submergence: Math.min(0.6, minDepth * 0.5), minDepth, phase: id * 1.71 };
    }
    throw new Error(`No submerged fish corridor in ${site.name}`);
  });
}
