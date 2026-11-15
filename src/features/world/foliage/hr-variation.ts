import { Color } from "three";
import { nearestPath, nearestRiver } from "../terrain/samples";
import { worldHeight } from "../terrain/height";

export const HR_TREE_IDS = [
  "hr-tree-buttress-emergent", "hr-tree-buttress-fluted", "hr-tree-spreading-crown",
  "hr-tree-umbrella-crown", "hr-tree-slender-upright", "hr-tree-slender-forked",
  "hr-tree-bamboo-clump", "hr-tree-bamboo-arching", "hr-tree-leaning-riverside",
  "hr-tree-fallen-living", "hr-tree-dead-snag", "hr-tree-dead-forked",
] as const;
export type HrTreeId = typeof HR_TREE_IDS[number];
export type HrLandscapeTreeId = HrTreeId | "hr-palm-coconut" | "hr-palm-leaning" | "hr-palm-shore" | import("./hr-coastal").CoastalTreeId | import("./hr-coastal").CasuarinaId;
export type Habitat = "river" | "slope" | "interior" | "edge";
export function treeRandom(x: number, z: number, salt = 0) {
  let h = 2166136261 ^ salt;
  for (const c of `${x}:${z}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export function treeHabitat(x: number, z: number): Habitat {
  if (nearestRiver(x, z).distance < 19) return "river";
  const slope = Math.hypot(worldHeight(x + 2, z) - worldHeight(x - 2, z), worldHeight(x, z + 2) - worldHeight(x, z - 2)) / 4;
  if (slope > 0.22 || nearestPath(x, z).t > 0.34) return "slope";
  return nearestPath(x, z).distance < 23 ? "edge" : "interior";
}
const preferences: Record<Habitat, readonly number[]> = {
  river: [8, 5, 1, 2, 0, 3, 4, 7, 6, 9, 10, 11],
  slope: [4, 5, 3, 2, 7, 6, 1, 0, 8, 10, 11, 9],
  interior: [0, 1, 2, 5, 3, 4, 8, 9, 10, 11, 6, 7],
  edge: [3, 2, 4, 5, 6, 7, 8, 1, 0, 9, 11, 10],
};
export interface HrSite { x: number; z: number; canopy?: boolean }
/** Sorted position keys make the neighbourhood solve independent of input order.
 * Full-crown trees preserve the closed roof; dead/fallen forms stay occasional. */
export function chooseHrTrees(sites: readonly HrSite[], neighbours: readonly (HrSite & { id: HrTreeId })[] = []) {
  const assigned = new Map<HrSite, HrTreeId>(neighbours.map(site => [site, site.id]));
  const ordered = [...sites].sort((a, b) => a.x - b.x || a.z - b.z);
  for (const site of ordered) {
    const known = neighbours.find(other => other.x === site.x && other.z === site.z);
    if (known) { assigned.set(site, known.id); continue; }
    const pool = preferences[treeHabitat(site.x, site.z)].filter(i => !site.canopy || i < 6 || i === 8);
    const used = new Set([...assigned].filter(([other]) => Math.hypot(other.x - site.x, other.z - site.z) < 13).map(([, id]) => id));
    // Rare deadwood is deliberate, never the default silhouette of a living stand.
    const start = Math.floor(treeRandom(site.x, site.z, 11) ** 2 * (treeRandom(site.x, site.z, 12) < 0.04 ? pool.length : Math.min(6, pool.length)));
    const index = Array.from({ length: pool.length }, (_, i) => pool[(start + i) % pool.length]!).find(i => !used.has(HR_TREE_IDS[i]!)) ?? pool[start]!;
    assigned.set(site, HR_TREE_IDS[index]!);
  }
  return sites.map(site => assigned.get(site)!);
}
/** Broad regional pigment plus independent tree variation, in linear RGB. */
export function hrLeafTint(x: number, z: number) {
  const patch = treeRandom(Math.floor(x / 23), Math.floor(z / 23), 29);
  const hue = treeRandom(x, z, 31);
  const color = new Color(hue < 0.28 ? "#cee398" : hue > 0.77 ? "#99b6aa" : "#b1cc86");
  color.lerp(new Color("#c5cf91"), patch * 0.35);
  // Texture already supplies the green pigment. Tint around unity rather than
  // multiplying it by another dark green (the original flat-dark review issue).
  return color.lerp(new Color(1, 1, 1), 0.48).multiplyScalar(1.35 + treeRandom(x, z, 33) * 0.6);
}
export function hrTreeLod(distance: number, high: boolean, previous = -1) {
  const near = high ? 22 : 12, far = high ? 66 : 42;
  if (distance > 205) return -1;
  if (previous === 0 && distance < near + 4) return 0;
  if (previous === 2 && distance > far - 7) return 2;
  return distance < near ? 0 : distance < far ? 1 : 2;
}
