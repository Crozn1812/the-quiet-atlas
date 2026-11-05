import { Box3, Color, Mesh, Vector3, type BufferGeometry, type MeshToonMaterial } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { createPropMaterial } from "../../../../src/features/world/props/materials";
import { createQuietShoreScene } from "../../../../src/features/world/zones/quiet-shore";
import {
  PATH_CLEARANCE, ZONE_BUDGET,
  type ZoneScene, type ZoneSceneContext,
} from "../../../../src/features/world/zones/types";

type PaintedMesh = Mesh<BufferGeometry, MeshToonMaterial>;
const owned: ZoneScene[] = [];
const flat: ZoneSceneContext = {
  heightAt: () => 0,
  onPath: x => Math.abs(x) <= PATH_CLEARANCE,
  underWater: x => x > 11,
  seed: 107,
};
function create(overrides: Partial<ZoneSceneContext> = {}) {
  const scene = createQuietShoreScene({ ...flat, ...overrides });
  owned.push(scene);
  return scene;
}
function meshes(scene: ZoneScene): PaintedMesh[] {
  const result: PaintedMesh[] = [];
  scene.group.traverse(node => { if (node instanceof Mesh) result.push(node as PaintedMesh); });
  return result;
}
function vertices(scene: ZoneScene) {
  scene.group.updateMatrixWorld(true);
  return meshes(scene).flatMap(mesh => {
    const positions = mesh.geometry.getAttribute("position");
    return Array.from({ length: positions.count }, (_, i) => new Vector3()
      .fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld));
  });
}
function signature(scene: ZoneScene) {
  return {
    zoneId: scene.zoneId, interactable: scene.interactable, colliders: scene.colliders,
    meshes: meshes(scene).map(mesh => ({
      name: mesh.name, position: mesh.position.toArray(), rotation: mesh.quaternion.toArray(), scale: mesh.scale.toArray(),
      attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes)
        .map(([key, value]) => [key, Array.from(value.array)])),
      indices: mesh.geometry.index ? Array.from(mesh.geometry.index.array) : null,
      groups: mesh.geometry.groups, color: mesh.material.color.toArray(),
    })),
  };
}

afterEach(() => {
  owned.splice(0).forEach(scene => scene.dispose());
  disposeRampGradients();
  vi.restoreAllMocks();
});

describe("quiet-shore procedural place", () => {
  it("merges every pigment into one draw call and stays within all zone budgets", () => {
    const scene = create();
    const batches = meshes(scene);
    const triangles = batches.reduce((sum, mesh) => sum
      + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
    const drawCalls = batches.reduce((sum, mesh) => sum + Math.max(1, mesh.geometry.groups.length), 0);
    expect(triangles).toBeGreaterThan(500);
    expect(triangles).toBeLessThanOrEqual(ZONE_BUDGET.triangles);
    expect(drawCalls).toBe(7);
    expect(drawCalls).toBeLessThanOrEqual(ZONE_BUDGET.drawCalls);
    expect(new Set(batches.map(mesh => mesh.material)).size).toBe(batches.length);
    for (const point of vertices(scene)) expect(point.length()).toBeLessThanOrEqual(ZONE_BUDGET.radius);
    for (const mesh of batches) {
      expect(mesh.geometry.groups).toEqual([]);
      expect(mesh.geometry.boundingBox).not.toBeNull();
      expect(mesh.geometry.boundingSphere).not.toBeNull();
    }
    console.info(`quiet-shore: ${triangles} triangles, ${drawCalls} draw calls`);
  });

  it("repeats geometry, pigments, transforms and placement with an isolated seed", () => {
    const first = signature(create());
    create({ seed: 23 });
    expect(signature(create())).toEqual(first);
    expect(signature(create({ seed: 108 }))).not.toEqual(first);
  });

  for (const [name, overrides] of [
    ["flat shore", {}],
    ["sloping shore", { heightAt: (x: number, z: number) => x * 0.035 + z * 0.02 }],
    ["opposite dry bank", { underWater: (x: number) => x > 3 }],
    ["curved walking path", { onPath: (x: number, z: number) => Math.abs(x) <= 2.6 || (x > 3 && Math.abs(z) < 2.4) }],
    ["wet porch interior", { underWater: (x: number, z: number) => x > 11 || (x > 5.6 && x < 6.2 && Math.abs(z) < 0.3) }],
  ] as const) {
    it(`${name}: keeps full geometry, triangle interiors and colliders off the path and water`, () => {
      const context = { ...flat, ...overrides };
      const scene = create(overrides);
      const points = vertices(scene);
      // Non-indexed batches preserve triples; a centroid check also catches spanning rails/roof faces.
      const samples = [...points];
      for (let i = 0; i < points.length; i += 3) {
        samples.push(points[i]!.clone().add(points[i + 1]!).add(points[i + 2]!).divideScalar(3));
      }
      for (const p of samples) {
        expect(Math.abs(p.x)).toBeGreaterThan(PATH_CLEARANCE);
        expect(context.onPath(p.x, p.z)).toBe(false);
        expect(context.underWater(p.x, p.z)).toBe(false);
        expect(p.y).toBeGreaterThanOrEqual(context.heightAt(p.x, p.z) - 0.025);
        expect(p.length()).toBeLessThanOrEqual(ZONE_BUDGET.radius);
      }
      expect(scene.colliders.length).toBeGreaterThan(4);
      for (const box of scene.colliders) {
        expect(box.yaw ?? 0).toBe(0);
        expect(box.size.toArray().every(size => size > 0)).toBe(true);
        for (let u = -1; u <= 1; u += 0.25) {
          for (let v = -1; v <= 1; v += 0.25) {
            const x = box.center.x + box.size.x / 2 * u, z = box.center.z + box.size.z / 2 * v;
            expect(Math.abs(x)).toBeGreaterThan(PATH_CLEARANCE);
            expect(context.onPath(x, z)).toBe(false);
            expect(context.underWater(x, z)).toBe(false);
          }
        }
      }
    });
  }

  it("grounds all four porch feet at heightAt on either bank", () => {
    for (const side of [1, -1]) {
      const heightAt = (x: number, z: number) => 0.035 * x + 0.02 * z;
      const scene = create({ heightAt, underWater: x => side * x < 3 });
      const wood = scene.group.getObjectByName("quiet-shore-wood") as PaintedMesh;
      const positions = wood.geometry.getAttribute("position");
      for (const x of [-1.24, 1.24]) {
        for (const z of [-1.42, 1.42]) {
          const px = side * (6 + x), pz = side * z;
          const foot = new Box3();
          for (let i = 0; i < positions.count; i++) {
            const p = new Vector3().fromBufferAttribute(positions, i);
            if (Math.abs(p.x - px) < 0.08 && Math.abs(p.z - pz) < 0.08) foot.expandByPoint(p);
          }
          expect(foot.isEmpty()).toBe(false);
          expect(foot.min.y).toBeCloseTo(heightAt(px, pz), 4);
          expect(foot.max.y - foot.min.y).toBeGreaterThan(2.4);
        }
      }
    }
  });

  it("keeps the guitar target two metres from the corridor and within E reach at its edge", () => {
    for (const underWater of [flat.underWater, (x: number) => x > 3]) {
      const scene = create({ underWater });
      const p = scene.interactable.position;
      const distance = Math.abs(p.x) - PATH_CLEARANCE;
      expect(distance).toBeGreaterThanOrEqual(2);
      expect(distance).toBeLessThanOrEqual(6);
      expect(p.distanceTo(new Vector3(Math.sign(p.x) * PATH_CLEARANCE, 1.6, p.z))).toBeLessThanOrEqual(2.5);
      expect(underWater(p.x, p.z)).toBe(false);
      expect(scene.zoneId).toBe("quiet-shore");
      expect(scene.interactable.label).toEqual({ vi: "Hiên gỗ có cây đàn", en: "Porch with a guitar" });
    }
    expect(create().interactable.position.toArray()).toEqual([4.75, 1.47, 0.36]);
  });

  it("has an open straight roof, hanging guitar and radio on a step, with no second bench", () => {
    const scene = create();
    const roof = new Box3().setFromObject(scene.group.getObjectByName("quiet-shore-roof")!);
    const body = scene.group.getObjectByName("quiet-shore-guitar") as PaintedMesh;
    const ink = scene.group.getObjectByName("quiet-shore-ink") as PaintedMesh;
    expect(roof.min.y).toBeGreaterThan(2.5);
    expect(roof.getSize(new Vector3()).y).toBeLessThan(0.4);
    const bodyBounds = new Box3();
    const guitarPositions = body.geometry.getAttribute("position");
    for (let i = 0; i < guitarPositions.count; i++) {
      const p = new Vector3().fromBufferAttribute(guitarPositions, i);
      if (p.x > 4.5 && p.x < 4.9) bodyBounds.expandByPoint(p);
    }
    expect(bodyBounds.min.y).toBeGreaterThan(0.9);
    expect(bodyBounds.max.y).toBeGreaterThan(2.3);
    const radio = new Box3().setFromObject(ink);
    expect(radio.min.x).toBeLessThan(4.1);
    expect(radio.min.y).toBeGreaterThan(0.25);
    expect(scene.group.getObjectByName("quiet-shore-vine")).toBeDefined();
    expect(scene.group.getObjectByName("quiet-shore-flower")).toBeDefined();
    scene.group.traverse(node => expect(node.name).not.toMatch(/bench|seat|text|logo/i));
  });

  it("uses palette-only pigments, neutral vertex multiplication and matte ramp materials", () => {
    const scene = create();
    const wood = createPropMaterial("wood");
    const colors: Record<string, Color> = {
      wood: wood.color.clone(),
      roof: new Color(PALETTE.forestDeep).lerp(new Color(PALETTE.paper), 0.22),
      leaf: new Color(PALETTE.forestLight).lerp(new Color(PALETTE.paper), 0.18),
      vine: new Color(PALETTE.forestDeep),
      guitar: new Color(PALETTE.dusk).lerp(new Color(PALETTE.paper), 0.35),
      ink: new Color(PALETTE.ink).lerp(new Color(PALETTE.paper), 0.08),
      flower: new Color(PALETTE.flower),
    };
    wood.dispose();
    for (const mesh of meshes(scene)) {
      const key = mesh.name.replace("quiet-shore-", "");
      expect(mesh.material.color.toArray()).toEqual(colors[key]!.toArray());
      expect(mesh.material.vertexColors).toBe(true);
      expect(mesh.material.emissive.getHex()).toBe(0);
      expect(mesh.material.map).toBeNull();
      expect(mesh.material.transparent).toBe(false);
      expect(mesh.material.customProgramCacheKey()).toBe("painted-toon-ramp-v1");
      const wash = mesh.geometry.getAttribute("color");
      expect(wash.count).toBe(mesh.geometry.getAttribute("position").count);
      for (let i = 0; i < wash.count; i++) {
        expect(wash.getX(i)).toBeGreaterThanOrEqual(0.914);
        expect(wash.getX(i)).toBeLessThanOrEqual(1);
        expect(wash.getY(i)).toBe(wash.getX(i));
        expect(wash.getZ(i)).toBe(wash.getX(i));
      }
      for (const attribute of ["position", "normal", "color"]) {
        expect(Array.from(mesh.geometry.getAttribute(attribute).array).every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("keeps orange flower accents below one percent of actual surface area", () => {
    let total = 0, accent = 0;
    for (const mesh of meshes(create())) {
      const positions = mesh.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i += 3) {
        const a = new Vector3().fromBufferAttribute(positions, i);
        const b = new Vector3().fromBufferAttribute(positions, i + 1);
        const c = new Vector3().fromBufferAttribute(positions, i + 2);
        const area = b.sub(a).cross(c.sub(a)).length() / 2;
        expect(area).toBeGreaterThan(1e-10);
        total += area;
        if (mesh.material.color.equals(new Color(PALETTE.flower))) accent += area;
      }
    }
    expect(accent).toBeGreaterThan(0);
    expect(accent / total).toBeLessThan(0.01);
  });

  it("leaves all transforms and geometry unchanged with reducedMotion, including after normal updates", () => {
    const scene = create();
    const before = signature(scene);
    scene.update?.(1 / 60, false);
    scene.update?.(60, true);
    scene.update?.(1 / 30, true);
    expect(signature(scene)).toEqual(before);
  });

  it("skips wet fence/grass footprints and refuses a shore with no dry porch site", () => {
    const scene = create({ underWater: x => x > 8.3 });
    expect(scene.interactable.position.x).toBeGreaterThan(0);
    for (const p of vertices(scene)) expect(p.x).toBeLessThanOrEqual(8.3);
    expect(scene.group.getObjectByName("quiet-shore-vine")).toBeUndefined();
    expect(() => create({ underWater: () => true })).toThrow(/dry porch footprint/);
    expect(() => create({ onPath: () => true })).toThrow(/dry porch footprint/);
  });

  it("disposes every owned geometry/material once while preserving siblings and shared ramps", () => {
    const scene = create(), sibling = create();
    const resources = meshes(scene).flatMap(mesh => [mesh.geometry, mesh.material]);
    const spies = resources.map(resource => vi.spyOn(resource, "dispose"));
    const siblingSpies = meshes(sibling).flatMap(mesh => [mesh.geometry, mesh.material])
      .map(resource => vi.spyOn(resource, "dispose"));
    const ramp = meshes(scene)[0]!.material.gradientMap!;
    const rampSpy = vi.spyOn(ramp, "dispose");
    scene.dispose();
    scene.dispose();
    spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    siblingSpies.forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect(rampSpy).not.toHaveBeenCalled();
    expect(signature(create())).toEqual(signature(sibling));
  });
});
