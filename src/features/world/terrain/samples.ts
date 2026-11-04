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
  const dx = Math.max(bounds.minX - x, 0, x - bounds.maxX);
  const dz = Math.max(bounds.minZ - z, 0, z - bounds.maxZ);
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
  return (x: number, z: number) => {
    let bestSquared = Infinity;
    let nearest: Point = points[0]!;
    const visit = (node: Node) => {
      if (distanceToBoundsSquared(x, z, node) > bestSquared) return;
      if (node.left && node.right) {
        const leftFirst = distanceToBoundsSquared(x, z, node.left) <= distanceToBoundsSquared(x, z, node.right);
        visit(leftFirst ? node.left : node.right);
        visit(leftFirst ? node.right : node.left);
        return;
      }
      for (let i = node.start; i < node.end; i++) {
        const a = points[i]!;
        const b = points[i + 1]!;
        const u = segmentFraction(x, z, a, b);
        const px = a.x + (b.x - a.x) * u;
        const pz = a.z + (b.z - a.z) * u;
        const squared = (x - px) ** 2 + (z - pz) ** 2;
        if (squared < bestSquared) {
          bestSquared = squared;
          nearest = { x: px, z: pz, t: a.t + (b.t - a.t) * u };
        }
      }
    };
    visit(root);
    return { ...nearest, distance: Math.sqrt(bestSquared) };
  };
}

// Immutable, precomputed polylines and bounding trees; queries never change them.
export const nearestRiver = lookup(riverSamples);
export const nearestPath = lookup(PATH_SAMPLES);
