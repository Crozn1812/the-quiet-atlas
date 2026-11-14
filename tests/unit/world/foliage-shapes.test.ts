import { reportBudget } from "./report-budget";
import { createHash } from "node:crypto";
import { Box3, type BufferGeometry, Color, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Triangle, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { TRUNK_HEIGHT, TRUNK_RADIUS } from "../../../src/features/world/foliage/colliders";
import { RAMP_PRESETS } from "../../../src/features/world/materials/ramp";
import { createBroadleafCrown as legacyBroadleaf, createPineCrown as legacyPine, createFoliage, foliageVariantAt } from "../../../src/features/world/foliage/instances";
import { nearestPath } from "../../../src/features/world/terrain/samples";
import { BROADLEAF_VARIANT_SEEDS, createBroadleafCrown, createPineCrown, createTreeTrunk, mossColor, pineHeight, PINE_VARIANT_SEEDS } from "../../../src/features/world/foliage/shapes";

const variants = [
  ...PINE_VARIANT_SEEDS.map(seed => ({ kind: "pine", seed, create: createPineCrown })),
  ...BROADLEAF_VARIANT_SEEDS.map(seed => ({ kind: "broadleaf", seed, create: createBroadleafCrown })),
];
const triangles = (geometry: BufferGeometry) => (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;

// Recover closed masses from triangle connectivity, welding the duplicated
// flat-shaded vertices rather than relying on generator offsets/cluster counts.
function leafMasses(geometry: BufferGeometry): number[][] {
  const positions = geometry.getAttribute("position"), surface = geometry.getAttribute("surface");
  const neighbours = new Map<string, Set<string>>(), ids = new Map<string, number>();
  const key = (i: number) => new Vector3().fromBufferAttribute(positions, i).toArray().join(":");
  for (let i = 0; i < geometry.index!.count; i += 3) {
    const face = [0, 1, 2].map(j => geometry.index!.getX(i + j));
    if (surface.getX(face[0]!) !== 0) continue;
    for (const vertex of face) {
      const k = key(vertex);
      ids.set(k, vertex);
      neighbours.set(k, new Set([...(neighbours.get(k) ?? []), ...face.map(key)]));
    }
  }
  const components: number[][] = [], visited = new Set<string>();
  for (const start of neighbours.keys()) {
    if (visited.has(start)) continue;
    const pending = [start], component: number[] = [];
    while (pending.length) {
      const k = pending.pop()!;
      if (visited.has(k)) continue;
      visited.add(k); component.push(ids.get(k)!);
      pending.push(...neighbours.get(k)!);
    }
    components.push(component);
  }
  return components;
}

// Separating-axis test on the actual closed convex bunches, not overlapping
// bounding spheres (which can still leave visible gaps between pointed meshes).
function leafHull(geometry: BufferGeometry, ids: number[]) {
  const positions = geometry.getAttribute("position"), selected = new Set(ids);
  const points = ids.map(i => new Vector3().fromBufferAttribute(positions, i));
  const normals: Vector3[] = [], edges: Vector3[] = [];
  for (let i = 0; i < geometry.index!.count; i += 3) {
    const face = [0, 1, 2].map(j => geometry.index!.getX(i + j));
    if (!face.every(id => selected.has(id))) continue;
    const vertices = face.map(id => new Vector3().fromBufferAttribute(positions, id));
    normals.push(new Triangle(...vertices as [Vector3, Vector3, Vector3]).getNormal(new Vector3()));
    for (let j = 0; j < 3; j++) edges.push(vertices[(j + 1) % 3]!.clone().sub(vertices[j]!));
  }
  return { points, normals, edges, bounds: new Box3().setFromPoints(points) };
}

function hullsOverlap(a: ReturnType<typeof leafHull>, b: ReturnType<typeof leafHull>): boolean {
  if (!a.bounds.intersectsBox(b.bounds)) return false;
  const axes = [...a.normals, ...b.normals, ...a.edges.flatMap(x => b.edges.map(y => x.clone().cross(y)))];
  for (const axis of axes) {
    if (axis.lengthSq() < 1e-10) continue;
    axis.normalize();
    const x = a.points.map(p => p.dot(axis)), y = b.points.map(p => p.dot(axis));
    if (Math.max(...x) < Math.min(...y) - 1e-6 || Math.max(...y) < Math.min(...x) - 1e-6) return false;
  }
  return true;
}

describe("painted procedural tree shapes", () => {
  it("provides at least three distinct pines and three broadleaf shapes through the original exports", () => {
    expect(PINE_VARIANT_SEEDS.length).toBeGreaterThanOrEqual(3);
    expect(BROADLEAF_VARIANT_SEEDS.length).toBeGreaterThanOrEqual(3);
    expect(legacyPine).toBe(createPineCrown);
    expect(legacyBroadleaf).toBe(createBroadleafCrown);
    const shapes = variants.map(variant => variant.create(variant.seed));
    try {
      expect(new Set(shapes.map(shape => JSON.stringify(Array.from(shape.getAttribute("position").array)))).size).toBe(variants.length);
      expect(triangles(shapes[0]!)).toBe(3 * 44);
      expect(triangles(shapes[1]!)).toBe(4 * 44);
      expect(triangles(shapes[2]!)).toBe(5 * 44);
    } finally { shapes.forEach(shape => shape.dispose()); }
  });

  for (const { kind, seed, create } of variants) {
    it(`${kind} ${seed}: stays within triangle/clearance budgets and repeats exactly`, () => {
      const crown = create(seed), repeated = create(seed), trunk = createTreeTrunk();
      try {
        reportBudget("tests/unit/world/foliage-shapes.test.ts:93 triangles(crown) + triangles(trunk)", triangles(crown) + triangles(trunk), kind === "pine" ? 600 : 1500);
        for (const name of Object.keys(crown.attributes)) {
          expect(Array.from(crown.getAttribute(name).array)).toEqual(Array.from(repeated.getAttribute(name).array));
        }
        expect(Array.from(crown.index!.array)).toEqual(Array.from(repeated.index!.array));
        crown.computeBoundingBox();
        const bounds = crown.boundingBox!;
        const size = bounds.getSize(new Vector3());
        expect(size.y).toBeGreaterThanOrEqual(3);
        expect(size.y).toBeLessThanOrEqual(kind === "pine" ? 6 : 14); // Broadleaf includes the rooted sleeve.
        expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(5);
        if (kind === "pine") {
          // B2-129: Da Lat pines replace the 7–8 m fir silhouette with a high,
          // narrow crown; its bottom exposes exactly the lower two thirds.
          const totalHeight = TRUNK_HEIGHT + bounds.max.y;
          expect(totalHeight).toBeCloseTo(pineHeight(seed), 5);
          expect(totalHeight).toBeGreaterThanOrEqual(14);
          expect(totalHeight).toBeLessThanOrEqual(18);
          expect((TRUNK_HEIGHT + bounds.min.y) / totalHeight).toBeCloseTo(2 / 3, 6);
          expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(2.7 + 1e-6);
          expect(size.y / Math.max(size.x, size.z)).toBeGreaterThanOrEqual(1.8);
        } else {
          const positions = crown.getAttribute("position"), surfaces = crown.getAttribute("surface");
          const leafHeights = Array.from({ length: positions.count }, (_, i) => i)
            .filter(i => surfaces.getX(i) === 0).map(i => positions.getY(i) + TRUNK_HEIGHT);
          // B2-182 replaces the old 7.7 m tree with a 9-14 m tree.
          expect(Math.min(...leafHeights)).toBeGreaterThanOrEqual(3);
          expect(Math.min(...leafHeights)).toBeLessThanOrEqual(6);
          expect(Math.max(...leafHeights)).toBeGreaterThanOrEqual(9);
          expect(Math.max(...leafHeights)).toBeLessThanOrEqual(14);
          const height = Math.max(...leafHeights), canopy = height - Math.min(...leafHeights);
          expect(canopy / height).toBeGreaterThanOrEqual(0.45);
          expect(canopy / height).toBeLessThanOrEqual(0.65);
          expect(Math.min(...leafHeights) / height).toBeGreaterThanOrEqual(0.35);
          expect(Math.min(...leafHeights) / height).toBeLessThanOrEqual(0.45);
          expect(canopy / Math.max(size.x, size.z)).toBeGreaterThanOrEqual(0.8);
          expect(canopy / Math.max(size.x, size.z)).toBeLessThanOrEqual(1.6);
        }
        const normals = crown.getAttribute("normal");
        expect(Array.from(normals.array).every(Number.isFinite)).toBe(true);
      } finally { crown.dispose(); repeated.dispose(); trunk.dispose(); }
    });

    it(`${kind} ${seed}: uses neutral [0.82, 1] watercolor washes that brighten upwards`, () => {
      const crown = create(seed);
      try {
        const positions = crown.getAttribute("position"), colors = crown.getAttribute("color");
        expect(colors.count).toBe(positions.count);
        const middle = (crown.boundingBox!.min.y + crown.boundingBox!.max.y) / 2;
        const halves = [{ sum: 0, count: 0 }, { sum: 0, count: 0 }];
        const samples: { height: number; value: number }[] = [];
        for (let i = 0; i < positions.count; i++) {
          if (kind === "broadleaf" && crown.getAttribute("surface").getX(i) !== 0) continue;
          const value = colors.getX(i);
          expect(value).toBeGreaterThanOrEqual(0.82);
          expect(value).toBeLessThanOrEqual(1);
          expect(colors.getY(i)).toBe(value);
          expect(colors.getZ(i)).toBe(value);
          const height = positions.getY(i);
          const half = halves[height > middle ? 1 : 0]!;
          half.sum += value; half.count++;
          samples.push({ height, value });
        }
        expect(halves[1]!.sum / halves[1]!.count).toBeGreaterThan(halves[0]!.sum / halves[0]!.count);
        samples.sort((a, b) => a.height - b.height);
        // Broadleaves also brighten towards the edge and on each bunch's top;
        // only the unchanged pine wash is globally monotone in Y.
        if (kind === "pine") for (let i = 1; i < samples.length; i++) expect(samples[i]!.value).toBeGreaterThanOrEqual(samples[i - 1]!.value - 1e-7);
      } finally { crown.dispose(); }
    });
  }

  it("tapers the unit visual trunk without changing collider constants", () => {
    const trunk = createTreeTrunk();
    try {
      const positions = trunk.getAttribute("position");
      const radiusAt = (height: number, centerX: number) => {
        let radius = 0;
        for (let i = 0; i < positions.count; i++) {
          if (positions.getY(i) === height) radius = Math.max(radius, Math.hypot(positions.getX(i) - centerX, positions.getZ(i)));
        }
        return radius;
      };
      expect(radiusAt(0.5, 0.05)).toBeCloseTo(radiusAt(-0.5, 0) * 0.5, 6);
      trunk.computeBoundingBox();
      expect(trunk.boundingBox!.max.y - trunk.boundingBox!.min.y).toBe(1);
      expect(triangles(trunk)).toBe(42);
      for (let i = 0; i < positions.count; i++) {
        expect(Math.hypot(positions.getX(i), positions.getZ(i))).toBeLessThanOrEqual(TRUNK_RADIUS + 1e-7);
      }
    } finally { trunk.dispose(); }
  });

  for (const seed of BROADLEAF_VARIANT_SEEDS) it(`broadleaf ${seed}: has 14-30 small closed leaf bunches`, () => {
    const geometry = createBroadleafCrown(seed);
    try {
      const positions = geometry.getAttribute("position");
      const masses = leafMasses(geometry);
      // Lead 2026-11-06: 14 dome bunches (was 18–30) keep the crown under the world +25% triangle cap.
      expect(masses.length).toBeGreaterThanOrEqual(14);
      expect(masses.length).toBeLessThanOrEqual(30);
      const widths: number[] = [];
      const colors = geometry.getAttribute("color"), surfaces = geometry.getAttribute("surface");
      const wood: Triangle[] = [];
      for (let i = 0; i < geometry.index!.count; i += 3) {
        const ids = [0, 1, 2].map(j => geometry.index!.getX(i + j));
        if (surfaces.getX(ids[0]!) === 1) wood.push(new Triangle(...ids.map(id => new Vector3().fromBufferAttribute(positions, id)) as [Vector3, Vector3, Vector3]));
      }
      let edgePairs = 0;
      for (const mass of masses) {
        const bounds = new Box3().setFromPoints(mass.map(i => new Vector3().fromBufferAttribute(positions, i)));
        const size = bounds.getSize(new Vector3());
        const width = Math.max(size.x, size.z);
        // Stronger than the requested >=0.5: no more than 30% flattening.
        expect(size.y / width).toBeGreaterThanOrEqual(0.7);
        expect(size.y / width).toBeLessThanOrEqual(1.6);
        const center = bounds.getCenter(new Vector3());
        const radius = Math.max(...mass.map(i => new Vector3().fromBufferAttribute(positions, i).distanceTo(center)));
        expect(radius).toBeGreaterThanOrEqual(0.35);
        expect(radius).toBeLessThanOrEqual(0.8);
        const distanceToWood = Math.min(...wood.map(face => face.closestPointToPoint(center, new Vector3()).distanceTo(center)));
        expect(distanceToWood).toBeLessThanOrEqual(radius + 0.05);
        const lowest = mass.reduce((a, b) => positions.getY(a) < positions.getY(b) ? a : b);
        const highest = mass.reduce((a, b) => positions.getY(a) > positions.getY(b) ? a : b);
        expect(colors.getX(highest)).toBeGreaterThan(colors.getX(lowest));
        // Compare vertices at the same Y: only the radial edge wash should differ.
        for (const a of mass) for (const b of mass) {
          const near = Math.hypot(positions.getX(a), positions.getZ(a));
          const far = Math.hypot(positions.getX(b), positions.getZ(b));
          if (Math.abs(positions.getY(a) - positions.getY(b)) < 1e-6 && far - near > 0.25) {
            expect(colors.getX(b)).toBeGreaterThan(colors.getX(a)); edgePairs++;
          }
        }
        widths.push(width);
      }
      expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(0.15);
      expect(edgePairs).toBeGreaterThan(10);
      // Every welded leaf edge belongs to exactly two faces: closed volumes,
      // with no open umbrella caps or doubled coplanar cards underneath.
      const edgeUses = new Map<string, number>();
      const surface = geometry.getAttribute("surface");
      for (let i = 0; i < geometry.index!.count; i += 3) {
        const face = [0, 1, 2].map(j => geometry.index!.getX(i + j));
        if (surface.getX(face[0]!) !== 0) continue;
        const keys = face.map(id => new Vector3().fromBufferAttribute(positions, id).toArray().join(":"));
        for (let j = 0; j < 3; j++) {
          const edge = [keys[j]!, keys[(j + 1) % 3]!].sort().join("/");
          edgeUses.set(edge, (edgeUses.get(edge) ?? 0) + 1);
        }
      }
      expect([...edgeUses.values()].every(uses => uses === 2)).toBe(true);
    } finally { geometry.dispose(); }
  });

  for (const seed of BROADLEAF_VARIANT_SEEDS) it(`broadleaf ${seed}: rounds each bunch's normals and joins every bunch into one canopy`, () => {
    const geometry = createBroadleafCrown(seed);
    try {
      const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
      const masses = leafMasses(geometry), hulls = masses.map(ids => leafHull(geometry, ids));
      let minimumRound = 1;
      for (const [index, mass] of masses.entries()) {
        const center = hulls[index]!.bounds.getCenter(new Vector3());
        const round = mass.filter(id => {
          const radial = new Vector3().fromBufferAttribute(positions, id).sub(center).normalize();
          return radial.dot(new Vector3().fromBufferAttribute(normals, id)) > Math.cos(35 * Math.PI / 180);
        }).length / mass.length;
        expect(round).toBeGreaterThanOrEqual(0.4);
        minimumRound = Math.min(minimumRound, round);
      }
      const neighbours = hulls.map((a, i) => hulls.flatMap((b, j) => i !== j && hullsOverlap(a, b) ? [j] : []));
      for (const [i, links] of neighbours.entries()) expect(links.length, `isolated bunch ${i}`).toBeGreaterThanOrEqual(1);
      const seen = new Set<number>(), pending = [0];
      while (pending.length) {
        const i = pending.pop()!;
        if (seen.has(i)) continue;
        seen.add(i); pending.push(...neighbours[i]!);
      }
      expect(seen.size).toBe(masses.length);
      process.stdout.write(`B2-182b crown ${seed}: round normals >=${(minimumRound * 100).toFixed(1)}%; joined=${seen.size}/${masses.length}\n`);
    } finally { geometry.dispose(); }
  });

  for (const seed of PINE_VARIANT_SEEDS) it(`pine ${seed}: stacks thick closed cones with a pointed final tip`, () => {
    const geometry = createPineCrown(seed);
    try {
      const positions = geometry.getAttribute("position");
      // Each skirt has two eleven-vertex rings, a tip and an underside point.
      for (let start = 0; start < positions.count; start += 24) {
        const points = Array.from({ length: 24 }, (_, i) => new Vector3().fromBufferAttribute(positions, start + i));
        const size = new Box3().setFromPoints(points).getSize(new Vector3());
        expect(size.y / Math.max(size.x, size.z)).toBeGreaterThanOrEqual(0.5);
        expect(points[22]!.y).toBeGreaterThan(Math.max(...points.slice(0, 22).map(point => point.y)));
        expect(points[23]!.y).toBeLessThan(Math.min(...points.slice(0, 11).map(point => point.y)));
      }
    } finally { geometry.dispose(); }
  });

  it("preserves crown proportions and solid masses on real instances, including mature trail trees and lean", () => {
    const foliage = createFoliage(1), matrix = new Matrix4();
    const shapes = BROADLEAF_VARIANT_SEEDS.map(seed => createBroadleafCrown(seed));
    try {
      for (const trailCanopy of [false, true]) for (const scale of [0.12, 0.8, 1.3, 2]) for (const lean of [-0.06, 0, 0.06]) {
        for (let variant = 0; variant < shapes.length; variant++) {
          let x = variant;
          while (foliageVariantAt(x, 7, shapes.length) !== variant) x++;
          foliage.setTiles([{ x, y: 3, z: 7, kind: "broadleaf", scale, lean, ...(trailCanopy ? { trailCanopy: true as const } : {}) }]);
          const batch = foliage.species.broadleaf.variants[foliageVariantAt(x, 7, 2)]!;
          batch.crowns.getMatrixAt(0, matrix);
          // Remove the rooted lean to measure height along the tree's own axis.
          matrix.premultiply(new Matrix4().makeTranslation(-x, -3, -7));
          matrix.premultiply(new Matrix4().makeRotationZ(-lean));
          if (trailCanopy) {
            const path = nearestPath(x, 7);
            // Measure in the path-facing crown frame, not a rotated AABB.
            matrix.premultiply(new Matrix4().makeRotationY(-Math.atan2(7 - path.z, path.x - x)));
          }
          const geometry = trailCanopy ? createBroadleafCrown(BROADLEAF_VARIANT_SEEDS[0], true) : shapes[variant]!, positions = geometry.getAttribute("position");
          const masses = leafMasses(geometry), canopy = new Box3();
          for (const mass of masses) {
            const bounds = new Box3().setFromPoints(mass.map(i => {
              const point = new Vector3().fromBufferAttribute(positions, i);

              return point.applyMatrix4(matrix);
            }));
            canopy.union(bounds);
            const size = bounds.getSize(new Vector3());
            expect(size.y / Math.max(size.x, size.z)).toBeGreaterThanOrEqual(trailCanopy ? 0.3 : 0.7);
          }
          if (trailCanopy) { geometry.dispose(); continue; }
          const height = canopy.max.y, size = canopy.getSize(new Vector3());
          expect(size.y / height).toBeGreaterThanOrEqual(0.45);
          expect(size.y / height).toBeLessThanOrEqual(0.65);
          expect(canopy.min.y / height).toBeGreaterThanOrEqual(0.35);
          expect(canopy.min.y / height).toBeLessThanOrEqual(0.45);
          expect(size.y / Math.max(size.x, size.z)).toBeGreaterThanOrEqual(0.7);
          // Lead 2026-11-06: same 1.6 aspect limit as the unit crown above (dome canopy on tall trail trees).
          expect(size.y / Math.max(size.x, size.z)).toBeLessThanOrEqual(1.6);
        }
      }
    } finally { foliage.dispose(); shapes.forEach(shape => shape.dispose()); }
  });

  it("paints darker moss at the root and favours upward/damp faces using palette recipes", () => {
    const trunk = createTreeTrunk(true), base = new Color(RAMP_PRESETS.trunk);
    const luma = (color: Color) => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    try {
      const positions = trunk.getAttribute("position"), colors = trunk.getAttribute("color");
      const halves = [{ sum: 0, count: 0 }, { sum: 0, count: 0 }];
      for (let i = 0; i < positions.count; i++) {
        const color = new Color(colors.getX(i), colors.getY(i), colors.getZ(i)).multiply(base);
        expect([color.r, color.g, color.b].every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
        const half = halves[positions.getY(i) < 0 ? 0 : 1]!;
        half.sum += luma(color); half.count++;
      }
      expect(halves[0]!.sum / halves[0]!.count).toBeLessThan(halves[1]!.sum / halves[1]!.count);
      // Moss shifts the hue towards green on damp/upward surfaces.
      const greenRatio = (color: Color) => color.g * base.g / (color.r * base.r);
      expect(greenRatio(mossColor(0.4, 1, 1))).toBeGreaterThan(greenRatio(mossColor(0.4, 0, 0)));
    } finally { trunk.dispose(); }
  });

  for (const seed of BROADLEAF_VARIANT_SEEDS) it(`broadleaf ${seed}: has real sun gaps between leaf clusters`, () => {
    const geometry = createBroadleafCrown(seed), material = new MeshBasicMaterial({ side: DoubleSide });
    try {
      const surface = geometry.getAttribute("surface");
      geometry.setIndex(Array.from(geometry.index!.array).filter(index => surface.getX(index) === 0));
      const mesh = new Mesh(geometry, material);
      mesh.updateMatrixWorld();
      const ray = new Raycaster(), down = new Vector3(0, -1, 0);
      let gaps = 0, hits = 0;
      // Sample the irregular crown edge, where smaller protrusions leave sun
      // flecks, as well as its overlapping central dome.
      for (let x = -2; x <= 2; x += 0.2) for (let z = -2; z <= 2; z += 0.2) {
        ray.set(new Vector3(x, 6, z), down);
        if (ray.intersectObject(mesh).length) hits++; else gaps++;
      }
      expect(gaps / (gaps + hits)).toBeGreaterThan(0.1);
      expect(hits / (gaps + hits)).toBeGreaterThan(0.3);
    } finally { geometry.dispose(); material.dispose(); }
  });

  for (const seed of BROADLEAF_VARIANT_SEEDS) it(`broadleaf ${seed}: hangs short thin vines from wood inside the canopy`, () => {
    const geometry = createBroadleafCrown(seed);
    try {
      const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
      const surface = geometry.getAttribute("surface");
      const ids = Array.from({ length: positions.count }, (_, i) => i);
      const ribbons = ids.filter(i => surface.getX(i) === 2);
      const leaves = ids.filter(i => surface.getX(i) === 0);
      const wood = ids.filter(i => surface.getX(i) === 1);
      const canopy = new Box3().setFromPoints(leaves.map(i => new Vector3().fromBufferAttribute(positions, i)));
      const expanded = canopy.clone().expandByScalar(0.5);
      const count = ribbons.length / 8; // B2-182b: two end rows instead of three.
      expect(count).toBeGreaterThanOrEqual(2); expect(count).toBeLessThanOrEqual(4);
      for (const i of ribbons) {
        expect(new Vector3().fromBufferAttribute(normals, i).length()).toBeCloseTo(1, 6);
        expect(positions.getY(i)).toBeGreaterThanOrEqual(canopy.min.y - 2.5);
        expect(positions.getY(i) + TRUNK_HEIGHT).toBeGreaterThan(0);
        expect(positions.getY(i)).toBeLessThanOrEqual(expanded.max.y);
        expect(positions.getX(i)).toBeGreaterThanOrEqual(expanded.min.x);
        expect(positions.getX(i)).toBeLessThanOrEqual(expanded.max.x);
        expect(positions.getZ(i)).toBeGreaterThanOrEqual(expanded.min.z);
        expect(positions.getZ(i)).toBeLessThanOrEqual(expanded.max.z);
      }
      const point = (i: number) => new Vector3().fromBufferAttribute(positions, i);
      for (let ribbon = 0; ribbon < count; ribbon++) {
        const start = ribbon * 8;
        const anchor = point(ribbons[start]!).add(point(ribbons[start + 1]!)).multiplyScalar(0.5);
        const tip = point(ribbons[start + 2]!).add(point(ribbons[start + 3]!)).multiplyScalar(0.5);
        expect(anchor.y - tip.y).toBeGreaterThanOrEqual(1);
        expect(anchor.distanceTo(tip)).toBeLessThanOrEqual(2.5);
        expect(point(ribbons[start]!).distanceTo(point(ribbons[start + 1]!))).toBeLessThan(0.06);
        // The anchor must lie in a wooden limb, not merely near a leaf vertex.
        const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
        const ray = new Raycaster(anchor.clone().add(new Vector3(0, 0.3, 0)), new Vector3(0, -1, 0), 0, 0.6);
        mesh.updateMatrixWorld();
        expect(ray.intersectObject(mesh).some(hit => hit.face && wood.includes(hit.face.a))).toBe(true);
        (mesh.material as MeshBasicMaterial).dispose();
        for (let vertex = 0; vertex < 4; vertex++) {
          const front = ribbons[start + vertex]!, back = ribbons[start + vertex + 4]!;
          expect(point(front)).toEqual(point(back));
          expect(new Vector3().fromBufferAttribute(normals, front).dot(new Vector3().fromBufferAttribute(normals, back))).toBeCloseTo(-1, 6);
        }
      }
    } finally { geometry.dispose(); }
  });

  it("keeps three batch-compatible topologies and deterministic geometry hashes", () => {
    const hash = (geometry: BufferGeometry) => {
      const result = createHash("sha256");
      for (const name of [...Object.keys(geometry.attributes).sort(), "index"]) {
        const array = (name === "index" ? geometry.index! : geometry.getAttribute(name)).array;
        result.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
      }
      return result.digest("hex");
    };
    const shapes = BROADLEAF_VARIANT_SEEDS.map(seed => createBroadleafCrown(seed));
    try {
      const hashes: string[] = [];
      for (const [i, shape] of shapes.entries()) {
        const repeated = createBroadleafCrown(BROADLEAF_VARIANT_SEEDS[i]);
        try { expect(hash(shape)).toBe(hash(repeated)); } finally { repeated.dispose(); }
        hashes.push(hash(shape));
        expect(shape.index!.array).toEqual(shapes[0]!.index!.array);
        expect(shape.getAttribute("surface").array).toEqual(shapes[0]!.getAttribute("surface").array);
        expect(shape.getAttribute("position").count).toBe(shapes[0]!.getAttribute("position").count);
      }
      expect(new Set(hashes).size).toBe(3);
      // Fingerprints change for round, overlapping leaf spheres, smooth normals,
      // darker bark and simpler small limbs/ribbons; topology stays batch-compatible.
      process.stdout.write(`B2-182b geometry SHA256 (rounded crowns/bark/limb budget): ${hashes.join(", ")}\n`);
    } finally { shapes.forEach(shape => shape.dispose()); }
  });

  for (const seed of BROADLEAF_VARIANT_SEEDS) it(`broadleaf ${seed}: roots, taper and wood pigment stay within contract`, () => {
    const geometry = createBroadleafCrown(seed);
    try {
      const positions = geometry.getAttribute("position"), surfaces = geometry.getAttribute("surface"), colors = geometry.getAttribute("color");
      const wood = Array.from({ length: positions.count }, (_, i) => i).filter(i => surfaces.getX(i) === 1);
      const material = new Color(RAMP_PRESETS.crown);
      for (const i of wood) {
        const color = new Color().fromBufferAttribute(colors, i).multiply(material);
        const luma = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
        expect(luma).toBeGreaterThanOrEqual(0.12); expect(luma).toBeLessThanOrEqual(0.22);
      }
      // Recover horizontal sleeve rings by Y, excluding the protruding roots.
      const rings = new Map<number, Vector3[]>();
      for (const i of wood) {
        const point = new Vector3().fromBufferAttribute(positions, i);
        rings.set(point.y, [...(rings.get(point.y) ?? []), point]);
      }
      const topRing = [...rings.entries()].find(([y, points]) => y === 2.5 && points.length === 6)![1];
      const topCenter = new Box3().setFromPoints(topRing).getCenter(new Vector3());
      const topRadius = Math.max(...topRing.map(p => p.distanceTo(topCenter)));
      const bottom = wood.map(i => new Vector3().fromBufferAttribute(positions, i)).filter(p => p.y === -TRUNK_HEIGHT);
      const sleeve = bottom.filter(p => Math.hypot(p.x, p.z) < 0.4);
      const bottomRadius = Math.max(...sleeve.map(p => Math.hypot(p.x, p.z)));
      expect(bottomRadius / topRadius).toBeGreaterThanOrEqual(1.5);
      expect(bottom.filter(p => Math.hypot(p.x, p.z) > 0.8)).toHaveLength(3);
      expect(topCenter.x).toBeGreaterThan(0.1); // visible bend, rooted at X=0
    } finally { geometry.dispose(); }
  });
});
