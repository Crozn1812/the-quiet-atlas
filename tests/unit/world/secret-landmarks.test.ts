import { Box3, Color, Group, Mesh, MeshToonMaterial, Vector3, type BufferGeometry } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { SECRETS } from "../../../src/features/story/secrets";
import { disposeRampGradients } from "../../../src/features/world/materials/ramp";
import { createPropMaterial } from "../../../src/features/world/props/materials";
import { createSecretLandmark, disposeLandmark, type SecretLandmark } from "../../../src/features/world/props/secrets";

type PaintedMesh = Mesh<BufferGeometry, MeshToonMaterial>;
const owned: Group[] = [];
const create = (landmark: SecretLandmark) => {
  const group = createSecretLandmark(landmark);
  owned.push(group);
  return group;
};
afterEach(() => {
  owned.splice(0).forEach(disposeLandmark);
  disposeRampGradients();
});

function meshes(group: Group): PaintedMesh[] {
  const result: PaintedMesh[] = [];
  group.traverse(node => { if (node instanceof Mesh) result.push(node as PaintedMesh); });
  return result;
}

const variants = [
  { landmark: "vine-arch-mirror", budget: 700, bounds: [[1.8, 2.4], [2, 2.8], [0.08, 0.35]] },
  { landmark: "wind-chime", budget: 300, bounds: [[1.3, 1.8], [2.7, 3], [0.1, 0.3]] },
  { landmark: "faint-trail", budget: 500, bounds: [[0.7, 1.3], [0.5, 0.8], [8, 10]] },
  { landmark: "bench", budget: 600, bounds: [[1.6, 2.2], [0.9, 1.2], [1.3, 2]] },
] as const;

function signature(group: Group) {
  const nodes: unknown[] = [];
  group.traverse(node => {
    const base = { type: node.type, name: node.name, parent: node.parent?.name,
      position: node.position.toArray(), quaternion: node.quaternion.toArray(), scale: node.scale.toArray() };
    if (!(node instanceof Mesh)) { nodes.push(base); return; }
    const mesh = node as PaintedMesh;
    nodes.push({ ...base,
      attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attribute]) => [name, Array.from(attribute.array)])),
      index: mesh.geometry.index ? Array.from(mesh.geometry.index.array) : null,
      groups: mesh.geometry.groups,
      bounds: mesh.geometry.boundingBox,
      sphere: mesh.geometry.boundingSphere,
      color: mesh.material.color.toArray(), emissive: mesh.material.emissive.toArray(),
      opacity: mesh.material.opacity, side: mesh.material.side,
      vertexColors: mesh.material.vertexColors,
    });
  });
  return nodes;
}

/** Actual triangle area after all node transforms, including thin accent faces. */
function surfaceAreas(group: Group) {
  group.updateMatrixWorld(true);
  const accents = [new Color(PALETTE.flower), new Color(PALETTE.vermilion)];
  let total = 0, accent = 0;
  for (const mesh of meshes(group)) {
    const geometry = mesh.geometry, positions = geometry.getAttribute("position");
    const count = geometry.index?.count ?? positions.count;
    const isAccent = accents.some(color => color.equals(mesh.material.color));
    for (let i = 0; i < count; i += 3) {
      const points = [0, 1, 2].map(offset => new Vector3()
        .fromBufferAttribute(positions, geometry.index?.getX(i + offset) ?? i + offset)
        .applyMatrix4(mesh.matrixWorld));
      const area = points[1]!.sub(points[0]!).cross(points[2]!.sub(points[0]!)).length() / 2;
      expect(area).toBeGreaterThan(1e-10);
      total += area;
      if (isAccent) accent += area;
    }
  }
  return { total, accent };
}

describe("quiet procedural secret landmarks", () => {
  for (const { landmark, budget, bounds } of variants) {
    it(`${landmark}: returns a grounded Group within triangle and metre bounds`, () => {
      const group = create(landmark);
      expect(group).toBeInstanceOf(Group);
      expect(group.userData.landmark).toBe(landmark);
      expect(group.position.toArray()).toEqual([0, 0, 0]);
      expect(group.userData.dispose).toBeTypeOf("function");
      const triangles = meshes(group).reduce((sum, mesh) => sum
        + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
      expect(triangles).toBeGreaterThan(0);
      expect(triangles).toBeLessThanOrEqual(budget);
      const box = new Box3().setFromObject(group);
      expect(box.min.y).toBeCloseTo(0, 6);
      box.getSize(new Vector3()).toArray().forEach((size, axis) => {
        expect(size).toBeGreaterThanOrEqual(bounds[axis]![0]);
        expect(size).toBeLessThanOrEqual(bounds[axis]![1]);
      });
    });

    it(`${landmark}: uses only palette recipes and neutral washes with no glow`, () => {
      const wood = createPropMaterial("wood");
      const expected: Record<string, Color> = {
        wood: wood.color.clone(), vine: new Color(PALETTE.forestDeep), leaf: new Color(PALETTE.forestLight),
        flower: new Color(PALETTE.flower), mirror: new Color(PALETTE.mist).lerp(new Color(PALETTE.paper), 0.35),
        stone: new Color(PALETTE.mist).lerp(new Color(PALETTE.ink), 0.14),
        chime: new Color(PALETTE.dusk).lerp(new Color(PALETTE.paper), 0.55),
      };
      wood.dispose();
      const group = create(landmark);
      group.traverse(node => expect(node.type === "Group" || node.type === "Mesh").toBe(true));
      for (const mesh of meshes(group)) {
        const material = mesh.material;
        expect(material).toBeInstanceOf(MeshToonMaterial);
        expect(material.color.toArray()).toEqual(expected[mesh.name]!.toArray());
        expect(material.vertexColors).toBe(true);
        expect(material.emissive.getHex()).toBe(0);
        expect(material.transparent).toBe(false);
        expect(material.opacity).toBe(1);
        expect(material.map).toBeNull();
        expect(material.customProgramCacheKey()).toBe("painted-toon-ramp-v1");
        const colors = mesh.geometry.getAttribute("color");
        expect(colors.count).toBe(mesh.geometry.getAttribute("position").count);
        for (let i = 0; i < colors.count; i++) {
          expect(colors.getX(i)).toBeGreaterThanOrEqual(0.919);
          expect(colors.getX(i)).toBeLessThanOrEqual(1);
          expect(colors.getY(i)).toBe(colors.getX(i));
          expect(colors.getZ(i)).toBe(colors.getX(i));
        }
        for (const name of ["position", "normal"]) {
          expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
        }
      }
    });

    it(`${landmark}: keeps orange/vermilion within 8% of actual surface area`, () => {
      const { total, accent } = surfaceAreas(create(landmark));
      expect(total).toBeGreaterThan(0);
      expect(accent / total).toBeLessThanOrEqual(0.08);
      if (landmark === "bench" || landmark === "vine-arch-mirror") expect(accent).toBeGreaterThan(0);
      else expect(accent).toBe(0);
    });

    it(`${landmark}: repeats geometry, hierarchy, transforms and pigments exactly`, () => {
      const first = create(landmark);
      // Interleave another variant to catch accidental shared PRNG/build state.
      create(landmark === "bench" ? "wind-chime" : "bench");
      const second = create(landmark);
      expect(signature(first)).toEqual(signature(second));
    });

    it(`${landmark}: disposes all owned resources once, preserving siblings and shared ramps`, () => {
      const group = create(landmark), sibling = create(landmark);
      const ownMeshes = meshes(group), siblingMeshes = meshes(sibling);
      const resources = new Set(ownMeshes.flatMap(mesh => [mesh.geometry, mesh.material]));
      const spies = Array.from(resources, resource => vi.spyOn(resource, "dispose"));
      const siblingSpies = Array.from(new Set(siblingMeshes.flatMap(mesh => [mesh.geometry, mesh.material])),
        resource => vi.spyOn(resource, "dispose"));
      const ramp = ownMeshes[0]!.material.gradientMap!;
      const rampSpy = vi.spyOn(ramp, "dispose");
      for (const mesh of [...ownMeshes, ...siblingMeshes]) expect(mesh.material.gradientMap).toBe(ramp);
      disposeLandmark(group);
      disposeLandmark(group);
      group.userData.dispose();
      spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
      siblingSpies.forEach(spy => expect(spy).not.toHaveBeenCalled());
      expect(rampSpy).not.toHaveBeenCalled();
      expect(signature(create(landmark))).toEqual(signature(sibling));
      disposeLandmark(sibling);
      disposeRampGradients();
      expect(rampSpy).toHaveBeenCalledTimes(1);
    });
  }

  it("accepts every story landmark without importing story state at runtime", () => {
    for (const secret of SECRETS) expect(create(secret.landmark).userData.landmark).toBe(secret.landmark);
  });

  it("has a round mirror and a thin wooden rim inside the leafy arch", () => {
    const group = create("vine-arch-mirror");
    const mirror = group.getObjectByName("mirror") as PaintedMesh;
    const box = new Box3().setFromObject(mirror), size = box.getSize(new Vector3());
    expect(size.x).toBeCloseTo(size.y, 6);
    expect(size.z).toBe(0);
    expect(size.x).toBeGreaterThan(0.8);
    expect(box.min.y).toBeGreaterThan(0.8);
    expect(group.getObjectByName("vine")).toBeDefined();
    expect(group.getObjectByName("leaf")).toBeDefined();
  });

  it("places five thin tubes and cords under an elevated chimes pivot", () => {
    const group = create("wind-chime");
    const chimes = group.getObjectByName("chimes")!;
    expect(chimes).toBeInstanceOf(Group);
    expect(chimes.parent).toBe(group);
    expect(chimes.position.y).toBeGreaterThan(2);
    const pipes = chimes.getObjectByName("chime") as PaintedMesh;
    const positions = pipes.geometry.getAttribute("position");
    // Five disjoint x bands; each tube is much thinner than its hanging length.
    for (let i = 0; i < 5; i++) {
      const center = (i - 2) * 0.18, box = new Box3();
      for (let j = 0; j < positions.count; j++) {
        const point = new Vector3().fromBufferAttribute(positions, j);
        if (Math.abs(point.x - center) < 0.03) box.expandByPoint(point);
      }
      const size = box.getSize(new Vector3());
      expect(size.y).toBeGreaterThanOrEqual(0.33);
      expect(size.x).toBeLessThan(0.04);
    }
    const cords = chimes.getObjectByName("wood") as PaintedMesh;
    expect(cords.geometry.getAttribute("position").count / 3).toBe(5 * 12);
    group.updateMatrixWorld(true);
    const before = new Box3().setFromObject(pipes).getCenter(new Vector3());
    chimes.rotation.z = 0.1;
    group.updateMatrixWorld(true);
    const after = new Box3().setFromObject(pipes).getCenter(new Vector3());
    expect(before.distanceTo(after)).toBeGreaterThan(0.02);
  });

  it("lays twelve separated flat stones along nine metres, ending in a blank column", () => {
    const group = create("faint-trail");
    const stone = group.getObjectByName("stone") as PaintedMesh;
    const positions = stone.geometry.getAttribute("position");
    for (let i = 0; i < 12; i++) {
      const box = new Box3();
      // Five-sided closed stones have 20 triangles; the column follows them.
      for (let j = i * 60; j < (i + 1) * 60; j++) box.expandByPoint(new Vector3().fromBufferAttribute(positions, j));
      const size = box.getSize(new Vector3());
      expect(size.y).toBeCloseTo(0.065, 6);
      expect(size.z).toBeLessThan(0.78);
      expect(box.getCenter(new Vector3()).z).toBeCloseTo(-i * 0.78, 1);
    }
    const marker = new Box3();
    for (let i = 12 * 60; i < positions.count; i++) marker.expandByPoint(new Vector3().fromBufferAttribute(positions, i));
    expect(marker.max.y).toBeGreaterThan(0.5);
    expect(marker.max.z).toBeLessThan(-8.8);
  });

  it("has a 1.9 metre bench facing +Z beside a low flowering fence", () => {
    const group = create("bench");
    const seat = group.getObjectByName("seat")!, fence = group.getObjectByName("fence")!;
    const seatBounds = new Box3().setFromObject(seat), fenceBounds = new Box3().setFromObject(fence);
    expect(seatBounds.getSize(new Vector3()).x).toBeCloseTo(1.9, 6);
    expect(fenceBounds.min.x).toBeGreaterThan(seatBounds.max.x);
    expect(fenceBounds.max.y).toBeLessThan(1);
    expect(fence.getObjectByName("flower")).toBeDefined();
    expect(fence.getObjectByName("leaf")).toBeDefined();
  });
});
