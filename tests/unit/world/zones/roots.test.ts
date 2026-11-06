import { createHash } from "node:crypto";
import {
  Box3, BufferGeometry, Color, Mesh, MeshToonMaterial, Raycaster, Vector3,
} from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { surfaceHeight } from "../../../../src/features/world/scene/compose";
import { placeZoneScenes, ZONE_FACTORIES } from "../../../../src/features/world/zones";
import { createRootsScene } from "../../../../src/features/world/zones/roots";
import {
  PATH_CLEARANCE, ZONE_BUDGET, type ZoneScene, type ZoneSceneContext,
} from "../../../../src/features/world/zones/types";

type PaintedMesh = Mesh<BufferGeometry, MeshToonMaterial>;
const owned: ZoneScene[] = [];
const context = (overrides: Partial<ZoneSceneContext> = {}): ZoneSceneContext => ({
  seed: 102, heightAt: () => 0,
  onPath: x => Math.abs(x) <= PATH_CLEARANCE, underWater: () => false,
  ...overrides,
});
function create(ctx = context()): ZoneScene {
  const scene = createRootsScene(ctx);
  owned.push(scene);
  return scene;
}
function meshes(scene: ZoneScene): PaintedMesh[] {
  const result: PaintedMesh[] = [];
  scene.group.traverse(node => { if (node instanceof Mesh) result.push(node as PaintedMesh); });
  return result;
}

/** Recover connected pieces from the final batches, independent of material boundaries. */
function connectedParts(parts: PaintedMesh[]): Vector3[][][] {
  const parents = new Map<string, string>();
  const triangles: Vector3[][] = [];
  const key = (p: Vector3) => p.toArray().join(",");
  const find = (id: string): string => {
    const parent = parents.get(id)!;
    if (parent === id) return id;
    const root = find(parent);
    parents.set(id, root);
    return root;
  };
  for (const mesh of parts) {
    const positions = mesh.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i += 3) {
      const triangle = [0, 1, 2].map(j => new Vector3().fromBufferAttribute(positions, i + j));
      const ids = triangle.map(key);
      ids.forEach(id => { if (!parents.has(id)) parents.set(id, id); });
      parents.set(find(ids[1]!), find(ids[0]!));
      parents.set(find(ids[2]!), find(ids[0]!));
      triangles.push(triangle);
    }
  }
  const pieces = new Map<string, Vector3[][]>();
  for (const triangle of triangles) {
    const id = find(key(triangle[0]!)), piece = pieces.get(id) ?? [];
    piece.push(triangle);
    pieces.set(id, piece);
  }
  return [...pieces.values()];
}

function rootSections(scene: ZoneScene): Vector3[][][] {
  const wood = scene.group.getObjectByName("roots-wood") as PaintedMesh;
  const positions = wood.geometry.getAttribute("position");
  const triangles = Array.from({ length: positions.count / 3 }, (_, i) =>
    [0, 1, 2].map(j => new Vector3().fromBufferAttribute(positions, i * 3 + j)));
  const unique = (points: Vector3[]) => [...new Map(points.map(p => [p.toArray().join(","), p])).values()];
  // The enlarged kit stump precedes the roots. Each root has twelve
  // eight-sided spans (one ink flank) and two caps. Shared buried tips join the cross-links.
  const rootTriangles = triangles.slice(-9 * 180);
  expect(rootTriangles.length % 180).toBe(0);
  return Array.from({ length: rootTriangles.length / 180 }, (_, index) => {
    const piece = rootTriangles.slice(index * 180, (index + 1) * 180);
    const spans = Array.from({ length: 12 }, (_, i) => unique(piece.slice(i * 14, (i + 1) * 14).flat()));
    const caps = piece.slice(168, 180);
    return [unique(caps.filter((_, i) => i % 2 === 0).flat()),
      ...spans.slice(1).map((span, i) => span.filter(p => spans[i]!.some(q => p.equals(q)))),
      unique(caps.filter((_, i) => i % 2 === 1).flat())];
  });
}
const ringCenter = (ring: Vector3[]) => ring.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(ring.length);

function expectBankSetback(scene: ZoneScene, ctx: ZoneSceneContext, step = 0.3) {
  const side = Math.sign(scene.interactable.position.x);
  // Independently probe a dense disk around the full stump foot, then the E target.
  const supports = [[side * 6.4, scene.interactable.position.z, 1.65 * 1.045 * 1.6],
    [scene.interactable.position.x, scene.interactable.position.z, 0]] as const;
  for (const [x, z, radius] of supports) {
    for (let dx = -radius - 3; dx <= radius + 3; dx += step) {
      for (let dz = -radius - 3; dz <= radius + 3; dz += step) {
        if (Math.hypot(dx, dz) > radius + 3) continue;
        const px = x + dx, pz = z + dz;
        const gradeX = (ctx.heightAt(px + 0.1, pz) - ctx.heightAt(px - 0.1, pz)) / 0.2;
        const gradeZ = (ctx.heightAt(px, pz + 0.1) - ctx.heightAt(px, pz - 0.1)) / 0.2;
        expect(Math.hypot(gradeX, gradeZ)).toBeLessThanOrEqual(0.4 + 1e-6);
        expect(ctx.underWater(px, pz)).toBe(false);
      }
    }
  }
}
function signature(scene: ZoneScene) {
  return {
    zone: scene.zoneId, interactable: scene.interactable, colliders: scene.colliders,
    meshes: meshes(scene).map(mesh => ({
      name: mesh.name, position: mesh.position.toArray(), quaternion: mesh.quaternion.toArray(),
      scale: mesh.scale.toArray(), color: mesh.material.color.toArray(),
      attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes)
        .map(([name, attribute]) => [name, Array.from(attribute.array)])),
      index: mesh.geometry.index ? Array.from(mesh.geometry.index.array) : null,
      groups: mesh.geometry.groups,
    })),
  };
}
afterEach(() => {
  owned.splice(0).forEach(scene => scene.dispose());
  disposeRampGradients();
  vi.restoreAllMocks();
});

describe("The Roots procedural zone", () => {
  it("locks the pre-r4 interaction and collider contract", () => {
    const fixtures = [context(), context({ seed: 1 }), context({ seed: 9371 }),
      context({ heightAt: (x, z) => x * 0.035 + z * 0.02 }),
      context({ underWater: x => x > 2.6 })];
    const contracts = fixtures.map(ctx => {
      const scene = create(ctx);
      return { colliders: scene.colliders, interactable: scene.interactable };
    });
    expect(createHash("sha256").update(JSON.stringify(contracts)).digest("hex"))
      .toBe("35041ee383501b77982fa52eb28c001982c71da6cdab3c10f6f65b01ca78f165");
  });
  it("places the complete world on the rendered terrain without throwing", () => {
    let terrain: ZoneSceneContext | undefined;
    vi.spyOn(ZONE_FACTORIES, "roots").mockImplementation(ctx => {
      terrain = ctx;
      return createRootsScene(ctx);
    });
    const zones = placeZoneScenes(surfaceHeight);
    try {
      expect(zones).toHaveLength(8);
      const roots = zones.find(zone => zone.zoneId === "roots")!;
      expect(roots.target.position.toArray().every(Number.isFinite)).toBe(true);
      // Analytic bank fixtures below cover the dense disk. Keep this full-world
      // smoke test light enough to run alongside all the other mounted worlds.
      expectBankSetback(roots, terrain!, 1);
      for (const mesh of meshes(roots)) {
        const positions = mesh.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
          expect(Number.isFinite(y)).toBe(true);
          expect(Math.hypot(x, y, z)).toBeLessThanOrEqual(ZONE_BUDGET.radius);
        }
      }
      console.info("roots real terrain:", roots.interactable.position.toArray(), roots.target.position.toArray());
      const total = zones.flatMap(meshes).reduce((sum, mesh) => sum
        + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
      console.info(`B2-220 eight zones: ${total - 1484} -> ${total} triangles (+1484; First Light +1052, Roots +432 on rendered terrain)`);
    } finally { zones.forEach(zone => zone.dispose()); }
  });

  it("moves the stump and interaction three metres away from a dry bank in every direction", () => {
    const banks = [
      (x: number) => Math.max(0, x - 10),
      (x: number) => Math.max(0, -x - 10),
      (_x: number, z: number) => Math.max(0, z - 4),
      (_x: number, z: number) => Math.max(0, -z - 4),
      (x: number, z: number) => Math.max(0, (x + z) / Math.SQRT2 - 8),
    ];
    for (const bank of banks) {
      const ctx = context({ heightAt: (x, z) => -bank(x, z) });
      const scene = create(ctx);
      expectBankSetback(scene, ctx);
      const p = scene.interactable.position;
      expect(p.y).toBeCloseTo(ctx.heightAt(p.x, p.z) + 1.15);
    }
  });

  it("rejects a steep support even when it is dry and has no water predicate", () => {
    expect(() => createRootsScene(context({ heightAt: x => x * 0.6 }))).toThrow(RangeError);
    expect(() => createRootsScene(context({ heightAt: () => Number.NaN }))).toThrow(RangeError);
  });
  it("merges each pigment into one draw call within the triangle and radius budgets", () => {
    const buildTimes = Array.from({ length: 7 }, () => {
      const started = performance.now();
      create();
      return performance.now() - started;
    }).sort((a, b) => a - b);
    const scene = owned.at(-1)!, parts = meshes(scene);
    const triangles = parts.reduce((sum, mesh) => sum
      + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
    const drawCalls = parts.reduce((sum, mesh) => sum + Math.max(1, mesh.geometry.groups.length), 0);
    expect(triangles).toBeGreaterThan(1000);
    // Pre-r4: 2744 triangles / 7 calls. No new call, and growth stays below 1.5x.
    expect(triangles).toBeLessThanOrEqual(Math.min(ZONE_BUDGET.triangles, 2744 * 1.5));
    expect(drawCalls).toBeLessThanOrEqual(7);
    const wood = parts.filter(mesh => /roots-(wood|ink)$/.test(mesh.name));
    const rootTriangles = 9 * (12 * 16 + 12);
    const woodTriangles = wood.reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3, 0);
    expect(rootTriangles).toBeLessThanOrEqual(2000);
    expect(woodTriangles - rootTriangles).toBeLessThanOrEqual(2000);
    expect(new Set(parts.map(mesh => mesh.material)).size).toBe(parts.length);
    for (const mesh of parts) {
      expect(mesh.geometry.groups).toHaveLength(0);
      const positions = mesh.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        expect(new Vector3().fromBufferAttribute(positions, i).length()).toBeLessThanOrEqual(ZONE_BUDGET.radius);
      }
    }
    expect(buildTimes[3]).toBeLessThanOrEqual(200);
    console.info(`roots: ${triangles} triangles, ${drawCalls} draw calls`);
    console.info(`roots median build: ${buildTimes[3]!.toFixed(2)} ms`,
      Object.fromEntries(parts.map(mesh => [mesh.name, mesh.geometry.getAttribute("position").count / 3])));
  });

  it("repeats geometry, pigments, colliders and interaction across interleaved builds", () => {
    const first = create();
    const alternate = create(context({ seed: 9371 }));
    expect(signature(first)).toEqual(signature(create()));
    expect(signature(first).meshes).not.toEqual(signature(alternate).meshes);
  });

  const environments = [
    { name: "flat ground", ctx: context() },
    { name: "a gentle hill", ctx: context({ heightAt: (x, z) => x * 0.035 + z * 0.02 }) },
    { name: "water on the right verge", ctx: context({ underWater: x => x > 2.6 }) },
    { name: "a water pocket inside a root footprint", ctx: context({
      underWater: (x, z) => x > 8 && x < 8.6 && z > 0.4 && z < 1.1,
    }) },
    { name: "a curved path occupying the right verge", ctx: context({
      onPath: (x, z) => Math.abs(x) <= PATH_CLEARANCE || (x > 3 && Math.abs(z) < 2),
    }) },
    { name: "a wet band requiring an offset along the path", ctx: context({
      underWater: (_x, z) => Math.abs(z) < 5,
    }) },
  ];
  for (const { name, ctx } of environments) {
    it(`keeps geometry and complete collider footprints clear on ${name}`, () => {
      const scene = create(ctx);
      for (const mesh of meshes(scene)) {
        const positions = mesh.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
          expect(Math.abs(x)).toBeGreaterThan(PATH_CLEARANCE);
          expect(ctx.onPath(x, z)).toBe(false);
          expect(ctx.underWater(x, z)).toBe(false);
          expect(y).toBeGreaterThanOrEqual(ctx.heightAt(x, z) - 0.1);
          expect(Math.hypot(x, y, z)).toBeLessThanOrEqual(ZONE_BUDGET.radius);
        }
      }
      expect(scene.colliders.length).toBeGreaterThan(8);
      for (const { center, size, yaw } of scene.colliders) {
        expect(yaw ?? 0).toBe(0);
        expect(Math.abs(center.x) - size.x / 2).toBeGreaterThan(PATH_CLEARANCE);
        expect(size.toArray().every(value => value > 0)).toBe(true);
        // Sample box interiors as well as their corners, independently of mesh vertices.
        for (let ix = 0; ix <= 20; ix++) {
          for (let iz = 0; iz <= 20; iz++) {
            const x = center.x + (ix / 20 - 0.5) * size.x;
            const z = center.z + (iz / 20 - 0.5) * size.z;
            expect(ctx.onPath(x, z)).toBe(false);
            expect(ctx.underWater(x, z)).toBe(false);
          }
        }
      }
      const p = scene.interactable.position;
      expect(Math.abs(p.x) - PATH_CLEARANCE).toBeGreaterThanOrEqual(2);
      expect(Math.abs(p.x) - PATH_CLEARANCE).toBeLessThanOrEqual(6);
      expect(ctx.onPath(p.x, p.z)).toBe(false);
      expect(ctx.underWater(p.x, p.z)).toBe(false);
    });
  }

  it("mirrors or shifts the complete composition instead of dropping blocked roots", () => {
    const normal = create();
    const mirrored = create(context({ underWater: x => x > 2.6 }));
    const shifted = create(context({ underWater: (_x, z) => Math.abs(z) < 5 }));
    expect(mirrored.interactable.position.x).toBeLessThan(-PATH_CLEARANCE);
    expect(Math.abs(shifted.interactable.position.z)).toBeGreaterThan(5);
    expect(meshes(mirrored).map(mesh => mesh.geometry.getAttribute("position").count))
      .toEqual(meshes(normal).map(mesh => mesh.geometry.getAttribute("position").count));
  });

  it("has a broad, flat end-grain table and seven visible root tips on either verge", () => {
    for (const side of [1, -1]) {
      const ctx = context({ heightAt: (x, z) => x * 0.03 - z * 0.01,
        underWater: x => side * x < -2.6 });
      const scene = create(ctx);
      const cut = scene.group.getObjectByName("roots-cut") as PaintedMesh;
      const bounds = new Box3().setFromObject(cut), size = bounds.getSize(new Vector3());
      expect(size.x).toBeGreaterThan(2.5 * 1.6);
      expect(size.z).toBeGreaterThan(2.5 * 1.6);
      expect(size.y).toBeLessThan(1e-5);
      const p = new Vector3(side * 6.4, ctx.heightAt(side * 6.4, scene.interactable.position.z) + 1.28 * 1.6,
        scene.interactable.position.z);
      expect(bounds.min.y).toBeCloseTo(p.y, 5);
      const hits = new Raycaster(new Vector3(p.x + 0.2, p.y + 2, p.z), new Vector3(0, -1, 0))
        .intersectObject(scene.group);
      expect(hits[0]?.object.name).toBe("roots-cut");
      const wood = scene.group.getObjectByName("roots-wood") as PaintedMesh;
      for (const rings of rootSections(scene).slice(0, 7)) {
        // Follow the actual S tangent into the narrow tip, away from the cap edge.
        const from = ringCenter(rings.at(-2)!).lerp(ringCenter(rings.at(-1)!), 0.5).setY(5);
        expect(new Raycaster(from, new Vector3(0, -1, 0)).intersectObject(wood).length,
          `visible root tip at ${from.x}, ${from.z}`).toBeGreaterThan(0);
      }
    }
  });

  it("builds seven thick, tapered S roots of 2–6 metres and two transverse connections", () => {
    for (const seed of [1, 102, 9371]) {
      const scene = create(context({ seed }));
      const roots = rootSections(scene);
      expect(roots).toHaveLength(9);
      const curves = roots.map(rings => {
        rings.forEach(ring => expect(ring).toHaveLength(8));
        return rings.map(ringCenter);
      });
      const stump = new Box3().setFromObject(scene.group.getObjectByName("roots-cut")!).getCenter(new Vector3());
      const main = curves.filter(curve => Math.hypot(curve[0]!.x - stump.x, curve[0]!.z - stump.z) < 2.4);
      expect(main).toHaveLength(7);
      for (const rings of roots.slice(0, 7)) {
        const ring = rings[0]!;
        const width = Math.max(...ring.flatMap(a => ring.map(b => Math.hypot(a.x - b.x, a.z - b.z))));
        expect(width).toBeGreaterThanOrEqual(0.97);
        expect(width).toBeLessThanOrEqual(1.17);
        const tip = rings.at(-1)!;
        const tipWidth = Math.max(...tip.flatMap(a => tip.map(b => Math.hypot(a.x - b.x, a.z - b.z))));
        expect(tipWidth / width).toBeCloseTo(0.13, 4);
        expect(Math.max(...ring.map(p => p.y)) - Math.min(...ring.map(p => p.y))).toBeGreaterThan(0.55);
      }
      for (const curve of main) {
        const length = curve.slice(1).reduce((sum, p, i) => sum + p.distanceTo(curve[i]!), 0);
        expect(length).toBeGreaterThanOrEqual(2);
        expect(length).toBeLessThanOrEqual(6);
        const first = curve[0]!, last = curve.at(-1)!;
        const normal = new Vector3(-(last.z - first.z), 0, last.x - first.x).normalize();
        const offsets = curve.map(p => p.clone().sub(first).dot(normal));
        expect(Math.min(...offsets)).toBeLessThan(-0.3);
        expect(Math.max(...offsets)).toBeGreaterThan(0.3);
        expect(Math.abs(Math.min(...offsets) + Math.max(...offsets))).toBeGreaterThan(0.08);
        curve.forEach(p => expect(p.y).toBeLessThan(0.4));
      }
      for (const link of curves.filter(curve => !main.includes(curve))) {
        for (const end of [link[0]!, link.at(-1)!]) {
          expect(main.some(curve => Math.hypot(end.x - curve.at(-1)!.x, end.z - curve.at(-1)!.z) < 1e-5)).toBe(true);
        }
      }
    }
  });

  it("weaves raised roots across each other outside the stump", () => {
    const scene = create();
    const roots = rootSections(scene).slice(0, 7);
    let crossings = 0;
    for (let a = 0; a < roots.length; a++) {
      for (let b = a + 1; b < roots.length; b++) {
        const first = roots[a]!.map(ringCenter), second = roots[b]!.map(ringCenter);
        for (let i = 0; i < 12; i++) {
          for (let j = 0; j < 12; j++) {
            const p = first[i]!, q = second[j]!;
            const d = first[i + 1]!.clone().sub(p), e = second[j + 1]!.clone().sub(q);
            const cross = d.x * e.z - d.z * e.x;
            if (Math.abs(cross) < 1e-6) continue;
            const offset = q.clone().sub(p);
            const t = (offset.x * e.z - offset.z * e.x) / cross;
            const u = (offset.x * d.z - offset.z * d.x) / cross;
            if (t <= 0 || t >= 1 || u <= 0 || u >= 1) continue;
            const point = p.clone().addScaledVector(d, t);
            if (Math.hypot(point.x - 6.4, point.z) < 2.4) continue;
            const crest = (rings: Vector3[][], span: number, fraction: number) =>
              Math.max(...rings[span]!.map(v => v.y)) * (1 - fraction)
              + Math.max(...rings[span + 1]!.map(v => v.y)) * fraction;
            expect(Math.abs(crest(roots[a]!, i, t) - crest(roots[b]!, j, u))).toBeGreaterThan(0.03);
            crossings++;
          }
        }
      }
    }
    expect(crossings).toBeGreaterThan(0);
  });

  it("exposes six recessed bark fissures and two contrasting age rings", () => {
    const scene = create();
    const bark = meshes(scene).filter(mesh => /roots-(wood|ink)$/.test(mesh.name));
    const center = new Vector3(6.44, 1.35, 0);
    const depth = (angle: number) => {
      const direction = new Vector3(Math.cos(angle), 0, Math.sin(angle));
      const hits = new Raycaster(center.clone().addScaledVector(direction, 4), direction.negate())
        .intersectObjects(bark);
      expect(hits.length).toBeGreaterThan(0);
      return hits[0]!.distance;
    };
    for (let i = 0; i < 6; i++) {
      const angle = (15 + i * 60) * Math.PI / 180;
      expect(depth(angle) - (depth(angle - 0.15) + depth(angle + 0.15)) / 2).toBeGreaterThan(0.03);
    }
    const cut = scene.group.getObjectByName("roots-cut") as PaintedMesh;
    const pigment = (radius: number) => {
      const hit = new Raycaster(new Vector3(6.4864 + radius, 3, 0), new Vector3(0, -1, 0)).intersectObject(cut)[0]!;
      const color = new Color().fromBufferAttribute(cut.geometry.getAttribute("color"), hit.face!.a);
      return color.r + color.g + color.b;
    };
    expect(pigment(0.68)).toBeLessThan(pigment(0.45) * 0.9);
    expect(pigment(1.4)).toBeLessThan(pigment(1.1) * 0.9);
  });

  it("buries every root section and three small mist pebble nodes on sloping terrain", () => {
    const ctx = context({ heightAt: (x, z) => x * 0.035 + z * 0.02 });
    const scene = create(ctx);
    for (const rings of rootSections(scene)) {
      for (const ring of rings) {
        const foot = Math.min(...ring.map(p => p.y - ctx.heightAt(p.x, p.z)));
        expect(foot).toBeCloseTo(-0.05, 5);
      }
    }
    const nodes = connectedParts([scene.group.getObjectByName("roots-node") as PaintedMesh]);
    expect(nodes).toHaveLength(3);
    for (const node of nodes) {
      expect(node.length).toBeLessThanOrEqual(200);
      const bounds = new Box3().setFromPoints(node.flat());
      const center = bounds.getCenter(new Vector3());
      expect(bounds.max.y - bounds.min.y).toBeLessThan(0.21);
      expect(bounds.min.y - ctx.heightAt(center.x, center.z)).toBeGreaterThan(-0.1);
      expect(bounds.min.y - ctx.heightAt(center.x, center.z)).toBeLessThan(-0.03);
    }
  });

  it("keeps both ends of every root at least a metre from straight and curved corridors", () => {
    const curved = (x: number, z: number) => Math.abs(x) <= PATH_CLEARANCE
      || (x > 4.75 && x < 4.95 && z > 3.4 && z < 3.8);
    for (const ctx of [context(), context({ underWater: x => x > 2.6 }), context({ onPath: curved })]) {
      const scene = create(ctx);
      for (const rings of rootSections(scene)) {
        for (const ring of [rings[0]!, rings.at(-1)!]) {
          for (const p of ring) {
            expect(Math.abs(p.x) - PATH_CLEARANCE).toBeGreaterThanOrEqual(1);
            for (let i = 0; i < 32; i++) {
              const angle = i / 32 * Math.PI * 2;
              expect(ctx.onPath(p.x + Math.cos(angle), p.z + Math.sin(angle))).toBe(false);
            }
          }
        }
      }
      if (ctx.onPath === curved) expect(scene.interactable.position.x).toBeLessThan(0);
    }
  });

  it("keeps the enlarged stump's road-facing interaction reachable on either verge", () => {
    for (const side of [1, -1]) {
      const scene = create(context({ underWater: x => side * x < -2.6 }));
      scene.group.updateMatrixWorld(true);
      const target = new Vector3().copy(scene.interactable.position);
      const eye = new Vector3(side * PATH_CLEARANCE, 1.65, target.z);
      const hits = new Raycaster(eye, target.clone().sub(eye).normalize()).intersectObject(scene.group);
      // The 1.6x stump is above eye level; E now targets its visible near side.
      expect(hits[0]?.object.name).toBe("roots-wood");
      expect(eye.distanceTo(target)).toBeLessThan(2.5);
    }
  });

  it("reserves about a tenth of the surface for ink and two tiny flower accents", () => {
    const scene = create();
    const areas = meshes(scene).map(mesh => {
      const p = mesh.geometry.getAttribute("position");
      let area = 0;
      for (let i = 0; i < p.count; i += 3) {
        const a = new Vector3().fromBufferAttribute(p, i);
        const b = new Vector3().fromBufferAttribute(p, i + 1);
        const c = new Vector3().fromBufferAttribute(p, i + 2);
        area += b.sub(a).cross(c.sub(a)).length() / 2;
      }
      return { name: mesh.name, area };
    });
    const ink = areas.find(part => part.name === "roots-ink")!.area;
    const total = areas.reduce((sum, part) => sum + part.area, 0);
    expect(ink / total).toBeGreaterThanOrEqual(0.07);
    expect(ink / total).toBeLessThanOrEqual(0.15);
    const flower = scene.group.getObjectByName("roots-flower") as PaintedMesh;
    const flowers = connectedParts([flower]);
    expect(flowers).toHaveLength(2);
    for (const piece of flowers) {
      const size = new Box3().setFromPoints(piece.flat()).getSize(new Vector3());
      expect(Math.max(size.x, size.z)).toBeGreaterThanOrEqual(0.1);
      expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(0.15);
    }
  });

  it("grounds the stump foot and root undersides on the sampled hill", () => {
    const ctx = context({ heightAt: (x, z) => x * 0.04 + z * 0.015 });
    const scene = create(ctx), wood = scene.group.getObjectByName("roots-wood") as PaintedMesh;
    const positions = wood.geometry.getAttribute("position");
    const contacts: Vector3[] = [];
    for (let i = 0; i < positions.count; i++) {
      const p = new Vector3().fromBufferAttribute(positions, i);
      if (Math.abs(p.y - ctx.heightAt(p.x, p.z) + 0.05) < 1e-5) contacts.push(p);
    }
    expect(contacts.length).toBeGreaterThan(100);
    const bounds = new Box3().setFromPoints(contacts).getSize(new Vector3());
    expect(bounds.x).toBeGreaterThan(6);
    expect(bounds.z).toBeGreaterThan(9);
  });

  it("uses the requested labels and keeps the table within E range of the road edge", () => {
    const scene = create(), p = scene.interactable.position;
    expect(scene.zoneId).toBe("roots");
    expect(scene.interactable.label).toEqual({ en: "The root stump", vi: "Gốc rễ" });
    expect(p.distanceTo(new Vector3(PATH_CLEARANCE, 0, p.z))).toBeLessThanOrEqual(2.5);
  });

  it("preserves palette kit pigments with matte ramps and no text or glow", () => {
    const pigment = (key: keyof typeof PALETTE) => new Color(PALETTE[key]);
    const wood = [0.15, 0.78].map(t => pigment("rock").lerp(pigment("rockDark"), t).lerp(pigment("dusk"), 0.08));
    const bark: [Color, Color][] = [[wood[0]!, wood[1]!],
      [wood[0]!.clone().lerp(pigment("rockDark"), 0.6), wood[1]!.clone().lerp(pigment("rockDark"), 0.6)]];
    const ink = pigment("rockDark").lerp(pigment("forestDeep"), 0.35);
    const recipes: Record<string, [Color, Color][]> = {
      "roots-wood": bark, "roots-ink": [...bark, [ink, ink]],
      "roots-cut": [[pigment("sand").lerp(pigment("dusk"), 0.025), pigment("sand").lerp(pigment("rockDark"), 0.24)]],
      "roots-node": [[pigment("mist").lerp(pigment("rockDark"), 0.04), pigment("mist").lerp(pigment("rockDark"), 0.14)]],
    };
    const pigments: Record<string, Color> = {
      "roots-wood": new Color(1, 1, 1), "roots-cut": new Color(1, 1, 1),
      "roots-moss": new Color(PALETTE.grass).lerp(new Color(PALETTE.forestDeep), 0.6),
      "roots-node": new Color(1, 1, 1), "roots-vine": new Color(PALETTE.forestDeep),
      "roots-ink": new Color(1, 1, 1),
      "roots-flower": new Color(PALETTE.flower),
    };
    const scene = create();
    scene.group.traverse(node => expect(node.name).not.toMatch(/text|logo/i));
    for (const mesh of meshes(scene)) {
      const material = mesh.material;
      expect(material).toBeInstanceOf(MeshToonMaterial);
      expect(material.color.toArray()).toEqual(pigments[mesh.name]!.toArray());
      const paper = new Vector3(...new Color(PALETTE.paper).toArray());
      expect(material.emissive.getHex()).toBe(0);
      expect(material.vertexColors).toBe(true);
      expect(material.transparent).toBe(false);
      expect(material.map).toBeNull();
      expect(material.gradientMap).not.toBeNull();
      expect(material.customProgramCacheKey()).toMatch(/\|painted-prop-readable-v2$/);
      const colors = mesh.geometry.getAttribute("color");
      for (let i = 0; i < colors.count; i++) {
        const vertex = new Color().fromBufferAttribute(colors, i);
        expect(vertex.toArray().every(channel => channel > 0 && channel <= 1)).toBe(true);
        const pigment = material.color.clone().multiply(vertex);
        expect(new Vector3(...pigment.toArray()).distanceTo(paper)).toBeGreaterThan(0.08);
        // Natural wood, cut grain and stone are palette blends with R >= G >= B.
        if (["roots-wood", "roots-cut"].includes(mesh.name)) {
          expect(pigment.r).toBeGreaterThanOrEqual(pigment.g);
          expect(pigment.g).toBeGreaterThanOrEqual(pigment.b);
        }
        if (recipes[mesh.name]) {
          const p = mesh.geometry.getAttribute("position");
          const wash = 0.955 + Math.sin(p.getX(i) * 13 + p.getZ(i) * 9 + p.getY(i) * 5) * 0.025;
          const point = new Vector3(...pigment.toArray()).divideScalar(wash);
          const distance = Math.min(...recipes[mesh.name]!.map(([a, b]) => {
            const start = new Vector3(...a.toArray()), delta = new Vector3(...b.toArray()).sub(start);
            const t = delta.lengthSq() === 0 ? 0 : Math.max(0, Math.min(1, point.clone().sub(start).dot(delta) / delta.lengthSq()));
            return point.distanceTo(start.addScaledVector(delta, t));
          }));
          expect(distance).toBeLessThan(1e-5);
        }
      }
    }
  });

  it("keeps two soft clusters buried at the foot without fixing the fern kit triangle count", () => {
    const scene = create();
    const moss = scene.group.getObjectByName("roots-moss") as PaintedMesh;
    const positions = moss.geometry.getAttribute("position");
    // Nine root crests precede the original cut-top patches and the two foot clusters.
    const extra = positions.count / 3 - 40 - 9 * 48;
    expect(extra).toBeGreaterThan(40);
    expect(extra).toBeLessThanOrEqual(300);
    for (let i = (40 + 9 * 48) * 3; i < positions.count; i++) {
      const p = new Vector3().fromBufferAttribute(positions, i);
      expect(Math.hypot(p.x - 6.4, p.z)).toBeLessThan(3.4);
      expect(p.y).toBeGreaterThanOrEqual(-0.051);
      expect(p.y).toBeLessThanOrEqual(0.5);
    }
  });

  it("has finite, nondegenerate triangles with matching flat normals", () => {
    for (const mesh of meshes(create())) {
      const positions = mesh.geometry.getAttribute("position"), normals = mesh.geometry.getAttribute("normal");
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      for (let i = 0; i < positions.count; i += 3) {
        const a = new Vector3().fromBufferAttribute(positions, i);
        const b = new Vector3().fromBufferAttribute(positions, i + 1);
        const c = new Vector3().fromBufferAttribute(positions, i + 2);
        const face = b.sub(a).cross(c.sub(a));
        expect(face.length()).toBeGreaterThan(1e-8);
        face.normalize();
        expect(face.distanceTo(new Vector3().fromBufferAttribute(normals, i))).toBeLessThan(1e-5);
      }
    }
  });

  it("keeps every transform and geometry still with reduced motion", () => {
    const scene = create(), before = signature(scene);
    for (const dt of [0.016, 1, 10, 100]) scene.update?.(dt, true);
    expect(signature(scene)).toEqual(before);
    scene.update?.(10, false);
    expect(signature(scene)).toEqual(before);
  });

  it("disposes each owned geometry and material once while preserving siblings and the shared ramp", () => {
    const scene = create(), sibling = create();
    const resources = meshes(scene).flatMap(mesh => [mesh.geometry, mesh.material]);
    const spies = resources.map(resource => vi.spyOn(resource, "dispose"));
    const siblingSpies = meshes(sibling).flatMap(mesh => [mesh.geometry, mesh.material])
      .map(resource => vi.spyOn(resource, "dispose"));
    const rampSpy = vi.spyOn(meshes(scene)[0]!.material.gradientMap!, "dispose");
    scene.dispose();
    scene.dispose();
    spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    siblingSpies.forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect(rampSpy).not.toHaveBeenCalled();
    expect(scene.group.children).toHaveLength(0);
    expect(signature(sibling)).toEqual(signature(create()));
  });

  it("releases temporary geometry and reports an entirely blocked verge", () => {
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    expect(() => createRootsScene(context({ underWater: () => true }))).toThrow(RangeError);
    expect(dispose.mock.instances.length).toBeGreaterThan(20);
    expect(new Set(dispose.mock.instances).size).toBe(dispose.mock.instances.length);
    dispose.mockClear();
    expect(() => createRootsScene(context({ onPath: () => true }))).toThrow(RangeError);
    expect(dispose).toHaveBeenCalled();
  });

  it("buries each thick root at multiple terrain stations and coats its upper surface", () => {
    for (const heightAt of [() => 0, (x: number, z: number) => x * 0.03 - z * 0.01]) {
      const scene = create(context({ heightAt }));
      const roots = rootSections(scene);
      expect(roots).toHaveLength(9);
      for (const rings of roots) {
        const ring = rings[0]!;
        const diameter = Math.max(...ring.flatMap(a => ring.map(b => Math.hypot(a.x - b.x, a.z - b.z))));
        expect(diameter / 2).toBeGreaterThanOrEqual(0.24999);
        expect(rings.filter(points => points.some(p => p.y < heightAt(p.x, p.z) - 0.02)).length)
          .toBeGreaterThanOrEqual(2);
      }
      const moss = scene.group.getObjectByName("roots-moss") as PaintedMesh;
      const positions = moss.geometry.getAttribute("position");
      expect(positions.count / 3).toBeGreaterThan(9 * 48);
      // The first 48 triangles per root are the upper two flanks of its actual bark.
      for (let i = 0; i < 9 * 48 * 3; i++) {
        const x = positions.getX(i), z = positions.getZ(i);
        expect(positions.getY(i) - heightAt(x, z)).toBeGreaterThan(-0.051);
      }
    }
  });

  it("locks the r4 stump, roots and pebble geometry fingerprint", () => {
    const scene = create();
    scene.group.updateMatrixWorld(true);
    const triangles: string[] = [];
    for (const mesh of meshes(scene)) {
      const positions = mesh.geometry.getAttribute("position");
      // Fern topology belongs to its kit; keep it outside the authored hard-surface fingerprint.
      if (mesh.name === "roots-moss") continue;
      for (let i = 0; i < positions.count; i += 3) {
        triangles.push([0, 1, 2].flatMap(offset => new Vector3().fromBufferAttribute(positions, i + offset)
          .applyMatrix4(mesh.matrixWorld).toArray().map(value => value.toFixed(5))).join(","));
      }
    }
    const fingerprint = createHash("sha256").update(JSON.stringify({
      triangles: triangles.sort(), colliders: scene.colliders, interactable: scene.interactable,
    })).digest("hex");
    // R4 replaces the barrel/flat roots with cracked kit bark, raised roots and kit pebbles.
    expect(fingerprint).toBe("b7cca1038be4a0f36605406192aecc41a87738a3c4f197ed99cc191a3019abc8");
  });

});
