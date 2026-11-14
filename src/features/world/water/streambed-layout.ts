import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";
import { PATH_BRIDGES } from "../layout/path";
import { riverLength, riverPointAt, riverTangentAt } from "../layout/river";
import { createSurfaceSampler, riverWidthAt, waterLevelAt } from "../terrain/height";
import { nearestRiver } from "../terrain/samples";
import { bakeWaterDepth } from "./depth";
import { createFishSchools } from "./fish-schools";

export const STREAMBED_REACH = 24;
export const STREAMBED_END = 0.935;
export interface BedItem {
  position: Vector3;
  scale: Vector3;
  yaw: number;
  flow: number;
  water: number;
  seed: number;
}
export interface BedReach {
  center: Vector3;
  pebbles: BedItem[];
  boulders: BedItem[];
  weeds: BedItem[];
  leaves: BedItem[];
}

/** Each reach has its own seed: streaming order and quality never move a stone. */
export function createStreambedLayout() {
  const length = riverLength(), height = createSurfaceSampler();
  const schools = createFishSchools();
  const crossings = PATH_BRIDGES.map(p => nearestRiver(p.position.x, p.position.z).t * length);
  const count = Math.ceil(length * STREAMBED_END / STREAMBED_REACH);
  function reach(id: number): BedReach {
    if (!Number.isInteger(id) || id < 0 || id >= count) throw new RangeError("Invalid streambed reach");
    let state = (73021 ^ Math.imul(id + 1, 374761393)) >>> 0;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    const center = riverPointAt((id + 0.5) * STREAMBED_REACH / length);
    center.y = waterLevelAt(center.z);
    const result: BedReach = { center, pebbles: [], boulders: [], weeds: [], leaves: [] };
    const probes: { point: Vector3; t: number; across: number; kind: number; seed: number }[] = [];
    // Interleave sizes and positions; reducing instance count keeps coverage across the whole reach.
    for (let i = 0; i < 820; i++) {
      const t = (id + random()) * STREAMBED_REACH / length;
      const kind = i < 720 ? 0 : i < 728 ? 1 : i < 812 ? 2 : 3;
      const seed = random(), side = random() > 0.5 ? 1 : -1;
      const across = (kind === 1 ? 0.70 + random() * 0.24 : random() * 0.94) * riverWidthAt(t) / 2 * side;
      const point = riverPointAt(t), tangent = riverTangentAt(t);
      point.x -= tangent.z * across; point.z += tangent.x * across;
      point.y = waterLevelAt(point.z);
      if (t < 0.012 || t > STREAMBED_END || crossings.some(s => Math.abs(s - t * length) < 14)) continue;
      if (kind === 1 && (t < 0.095 || schools.some(s => Math.abs(s.t - t) * length < 10))) continue;
      if (kind === 2 && schools.some(s => Math.abs(s.t - t) * length < 8 && Math.abs(across) < s.width + 0.9)) continue;
      probes.push({ point, t, across, kind, seed });
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(probes.flatMap(p => p.point.toArray()), 3));
    bakeWaterDepth(geometry, false, height);
    const depths = geometry.getAttribute("waterBedDepth");
    for (let i = 0; i < probes.length; i++) {
      const { point, kind, seed } = probes[i]!, water = point.y, depth = depths.getX(i);
      if (depth < 0.12 || depth > 2.4) continue;
      const bed = water - depth;
      const flow = riverTangentAt(probes[i]!.t);
      const item: BedItem = { position: point.clone(), water, seed, yaw: random() * Math.PI * 2,
        flow: Math.atan2(-flow.x, -flow.z), scale: new Vector3() };
      if (kind === 0) {
        const radius = 0.028 + Math.pow(seed, 2.1) * 0.25;
        let clearance = 0.10;
        // A submerged stone can still intersect a fish's belly. Reserve the
        // swept school's actual swimming depth, including its outer body/tail.
        for (const school of schools) if (Math.abs(school.t - probes[i]!.t) * length < 8
          && Math.abs(probes[i]!.across) < school.width + 0.9) clearance = Math.max(clearance, school.submergence + 0.15);
        const rise = Math.min(radius * (0.40 + random() * 0.85), (depth - clearance) / 1.35);
        if (rise < 0.006) continue;
        item.scale.set(radius * (0.8 + random() * 0.5), rise, radius * (0.65 + random() * 0.6));
        item.position.y = bed + rise * 0.35;
        result.pebbles.push(item);
      } else if (kind === 1) {
        const radius = 0.48 + seed * 0.48;
        // Footprint support prevents perched rocks on steep, triangulated banks.
        const support = [height(point.x - radius, point.z), height(point.x + radius, point.z),
          height(point.x, point.z - radius), height(point.x, point.z + radius)];
        if (Math.max(...support) - Math.min(...support) > 0.4 || depth > 0.75) continue;
        const rise = depth + 0.15 + seed * 0.24;
        item.scale.set(radius, rise, radius * (0.8 + random() * 0.4));
        item.position.y = bed;
        result.boulders.push(item);
      } else if (kind === 2) {
        const rise = Math.min(0.16 + seed * 0.36, depth - 0.12);
        if (rise < 0.1) continue;
        item.position.y = bed + 0.005;
        item.scale.set(0.06 + random() * 0.07, rise, 1);
        const flow = riverTangentAt(probes[i]!.t);
        item.yaw = Math.atan2(-flow.z, flow.x);
        result.weeds.push(item);
      } else {
        item.position.y = water + 0.016;
        item.scale.set(0.065 + seed * 0.045, 0.13 + seed * 0.08, 1);
        const flow = riverTangentAt(probes[i]!.t);
        item.yaw = Math.atan2(-flow.x, -flow.z);
        result.leaves.push(item);
      }
    }
    geometry.dispose();
    return result;
  }
  return { count, reach, centers: Array.from({ length: count }, (_, i) => riverPointAt((i + 0.5) * STREAMBED_REACH / length)) };
}
