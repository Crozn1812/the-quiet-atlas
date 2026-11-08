import { pathPointAt } from "../layout/path";
import { riverPointAt } from "../layout/river";

interface Point { readonly x: number; readonly z: number; readonly t: number }
interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }
interface Node extends Bounds { start: number; end: number; left?: Node; right?: Node }

const SAMPLE_COUNT = 2048;

function sample(pointAt: typeof pathPointAt): readonly Point[] {
  return Object.freeze(Array.from({ length: SAMPLE_COUNT + 1 }, (_, i) => {
    const t = i / SAMPLE_COUNT;
    const { x, z } = pointAt(t);
    return Object.freeze({ x, z, t });
  }));
}

export const PATH_SAMPLES = sample(pathPointAt);
const riverSamples = sample(riverPointAt);

function tree(points: readonly Point[], start = 0, end = points.length - 1): Node {
  const node: Node = { start, end, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = start; i <= end; i++) {
    const p = points[i]!;
    node.minX = Math.min(node.minX, p.x);
    node.maxX = Math.max(node.maxX, p.x);
    node.minZ = Math.min(node.minZ, p.z);
    node.maxZ = Math.max(node.maxZ, p.z);
  }
  if (end - start > 8) {
    const middle = (start + end) >>> 1;
    node.left = tree(points, start, middle);
    node.right = tree(points, middle, end);
  }
  return node;
}

export function distanceToBoundsSquared(x: number, z: number, bounds: Bounds): number {
  const dx = x < bounds.minX ? bounds.minX - x : x > bounds.maxX ? x - bounds.maxX : 0;
  const dz = z < bounds.minZ ? bounds.minZ - z : z > bounds.maxZ ? z - bounds.maxZ : 0;
  return dx * dx + dz * dz;
}

export function segmentFraction(x: number, z: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  return lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared));
}

function lookup(points: readonly Point[]) {
  const root = tree(points);
  // Keep the original division/order of arithmetic: terrain remains bit-exact.
  const segments = points.slice(0, -1).map((a, i) => {
    const b = points[i + 1]!, dx = b.x - a.x, dz = b.z - a.z;
    return { dx, dz, lengthSquared: dx * dx + dz * dz };
  });
  let cachedX = NaN, cachedZ = NaN, cachedPX = 0, cachedPZ = 0, cachedT = 0, cachedDistance = 0;
  return (x: number, z: number) => {
    // Height, colour and collision samplers often ask for the same point
    // consecutively. Keep one exact query, returning an independent object.
    if (x === cachedX && z === cachedZ) return { x: cachedPX, z: cachedPZ, t: cachedT, distance: cachedDistance };
    let bestSquared = Infinity;
    let nearestX = points[0]!.x, nearestZ = points[0]!.z, nearestT = points[0]!.t;
    const visit = (node: Node, lowerBound: number) => {
      if (lowerBound > bestSquared) return;
      if (node.left && node.right) {
        const left = distanceToBoundsSquared(x, z, node.left), right = distanceToBoundsSquared(x, z, node.right);
        if (left <= right) { visit(node.left, left); visit(node.right, right); }
        else { visit(node.right, right); visit(node.left, left); }
        return;
      }
      for (let i = node.start; i < node.end; i++) {
        const a = points[i]!;
        const b = points[i + 1]!;
        const { dx, dz, lengthSquared } = segments[i]!;
        const fraction = lengthSquared === 0 ? 0 : ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared;
        const u = fraction <= 0 ? 0 : fraction >= 1 ? 1 : fraction;
        const px = a.x + (b.x - a.x) * u;
        const pz = a.z + (b.z - a.z) * u;
        const squared = (x - px) ** 2 + (z - pz) ** 2;
        if (squared < bestSquared) {
          bestSquared = squared;
          nearestX = px; nearestZ = pz; nearestT = a.t + (b.t - a.t) * u;
        }
      }
    };
    visit(root, 0);
    cachedX = x; cachedZ = z; cachedPX = nearestX; cachedPZ = nearestZ; cachedT = nearestT;
    cachedDistance = Math.sqrt(bestSquared);
    return { x: nearestX, z: nearestZ, t: nearestT, distance: cachedDistance };
  };
}

// Immutable, precomputed polylines and bounding trees; queries never change them.
export const nearestRiver = lookup(riverSamples);
export const nearestPath = lookup(PATH_SAMPLES);
