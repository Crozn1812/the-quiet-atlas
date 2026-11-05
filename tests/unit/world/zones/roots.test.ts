import {
  Box3, BufferGeometry, Color, Mesh, MeshToonMaterial, Raycaster, Vector3,
} from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { createPropMaterial } from "../../../../src/features/world/props/materials";
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
  // The stump and its three growth rings precede the roots. Each root has twelve
  // eight-sided spans (one ink flank) and two caps. Shared buried tips join the cross-links.
  const rootTriangles = triangles.slice(48 + 3 * 48);
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
  it("merges each pigment into one draw call within the triangle and radius budgets", () => {
    const scene = create(), parts = meshes(scene);
    const triangles = parts.reduce((sum, mesh) => sum
      + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
    const drawCalls = parts.reduce((sum, mesh) => sum + Math.max(1, mesh.geometry.groups.length), 0);
    expect(triangles).toBeGreaterThan(1000);
    expect(triangles).toBeLessThanOrEqual(ZONE_BUDGET.triangles);
    expect(drawCalls).toBeLessThanOrEqual(ZONE_BUDGET.drawCalls);
    expect(new Set(parts.map(mesh => mesh.material)).size).toBe(parts.length);
    for (const mesh of parts) {
      expect(mesh.geometry.groups).toHaveLength(0);
      const positions = mesh.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        expect(new Vector3().fromBufferAttribute(positions, i).length()).toBeLessThanOrEqual(ZONE_BUDGET.radius);
      }
    }
    console.info(`roots: ${triangles} triangles, ${drawCalls} draw calls`);
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
          expect(y).toBeGreaterThanOrEqual(ctx.heightAt(x, z) - 1e-5);
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
      expect(size.x).toBeGreaterThan(2.5);
      expect(size.z).toBeGreaterThan(2.5);
      expect(size.y).toBeLessThan(1e-5);
      expect(bounds.min.y).toBeCloseTo(scene.interactable.position.y, 5);
      const p = scene.interactable.position;
      const hits = new Raycaster(new Vector3(p.x + 0.2, p.y + 2, p.z), new Vector3(0, -1, 0))
        .intersectObject(scene.group);
      expect(hits[0]?.object.name).toBe("roots-cut");
      const wood = scene.group.getObjectByName("roots-wood") as PaintedMesh;
      for (const [x, z] of [[-0.65, -3.5], [-0.7, 3.6], [1.5, 5], [4.6, 3.8],
        [5.9, 0.6], [4.4, -3.7], [1, -5.1]]) {
        // Aim just inside the tapered tip, away from its terminal triangle edge.
        const from = new Vector3(p.x + side * x! * 0.99, 5, p.z + z! * 0.99);
        expect(new Raycaster(from, new Vector3(0, -1, 0)).intersectObject(wood).length,
          `visible root tip at ${side * x!}, ${z}`).toBeGreaterThan(0);
      }
    }
  });

  it("builds seven asymmetric low S roots of 2–6 metres and two transverse connections", () => {
    for (const seed of [1, 102, 9371]) {
      const scene = create(context({ seed }));
      const roots = rootSections(scene);
      expect(roots).toHaveLength(9);
      const center = (ring: Vector3[]) => ring.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(ring.length);
      const curves = roots.map(rings => {
        rings.forEach(ring => expect(ring).toHaveLength(8));
        return rings.map(center);
      });
      const stump = scene.interactable.position;
      const main = curves.filter(curve => Math.hypot(curve[0]!.x - stump.x, curve[0]!.z - stump.z) < 1);
      expect(main).toHaveLength(7);
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
        curve.forEach(p => expect(p.y).toBeLessThan(0.17));
      }
      for (const link of curves.filter(curve => !main.includes(curve))) {
        for (const end of [link[0]!, link.at(-1)!]) {
          expect(main.some(curve => Math.hypot(end.x - curve.at(-1)!.x, end.z - curve.at(-1)!.z) < 1e-5)).toBe(true);
        }
      }
    }
  });

  it("keeps both ends of every root at least a metre from straight and curved corridors", () => {
    const curved = (x: number, z: number) => Math.abs(x) <= PATH_CLEARANCE
      || (x > 3.05 && x < 3.25 && z > 3.4 && z < 3.8);
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

  it("leaves the end grain visible and reachable from the road on either verge", () => {
    for (const side of [1, -1]) {
      const scene = create(context({ underWater: x => side * x < -2.6 }));
      scene.group.updateMatrixWorld(true);
      const target = new Vector3().copy(scene.interactable.position);
      const eye = new Vector3(side * PATH_CLEARANCE, 1.65, target.z);
      const hits = new Raycaster(eye, target.clone().sub(eye).normalize()).intersectObject(scene.group);
      expect(hits[0]?.object.name).toBe("roots-cut");
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
      if (Math.abs(p.y - ctx.heightAt(p.x, p.z)) < 1e-6) contacts.push(p);
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

  it("uses only palette pigment recipes with neutral washes, matte ramps and no text or glow", () => {
    const wood = createPropMaterial("wood");
    const pigments: Record<string, Color> = {
      "roots-wood": wood.color.clone(),
      "roots-cut": new Color(PALETTE.paper).lerp(new Color(PALETTE.dusk), 0.28),
      "roots-moss": new Color(PALETTE.forestDeep).lerp(new Color(PALETTE.forestLight), 0.35),
      "roots-node": new Color(PALETTE.mist), "roots-vine": new Color(PALETTE.water),
      "roots-ink": new Color(PALETTE.ink), "roots-flower": new Color(PALETTE.flower),
    };
    wood.dispose();
    const scene = create();
    scene.group.traverse(node => expect(node.name).not.toMatch(/text|logo/i));
    for (const mesh of meshes(scene)) {
      const material = mesh.material;
      expect(material).toBeInstanceOf(MeshToonMaterial);
      expect(material.color.toArray()).toEqual(pigments[mesh.name]!.toArray());
      expect(material.emissive.getHex()).toBe(0);
      expect(material.vertexColors).toBe(true);
      expect(material.transparent).toBe(false);
      expect(material.map).toBeNull();
      expect(material.gradientMap).not.toBeNull();
      expect(material.customProgramCacheKey()).toBe("painted-toon-ramp-v1");
      const colors = mesh.geometry.getAttribute("color");
      for (let i = 0; i < colors.count; i++) {
        expect(colors.getX(i)).toBeGreaterThanOrEqual(0.929);
        expect(colors.getX(i)).toBeLessThanOrEqual(0.981);
        expect(colors.getY(i)).toBe(colors.getX(i));
        expect(colors.getZ(i)).toBe(colors.getX(i));
      }
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
});
