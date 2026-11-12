import { Box3, Color, DoubleSide, Group, Mesh, MeshToonMaterial, Ray, Vector3, type BufferGeometry } from "three";
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
  { landmark: "vine-arch-mirror", budget: 950, bounds: [[4.2, 5.8], [5, 6.6], [1.2, 2.6]] },
  { landmark: "wind-chime", budget: 650, bounds: [[3.2, 5.0], [5.8, 7.5], [1.2, 2.6]] },
  { landmark: "faint-trail", budget: 850, bounds: [[1.8, 3.4], [0.85, 1.2], [19, 25]] },
  { landmark: "bench", budget: 950, bounds: [[3.4, 5.2], [2.5, 3.0], [1.8, 3.6]] },
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

describe("SC-01 procedural secret landmarks (2-3x scale, mist, dim glow and light motes)", () => {
  for (const { landmark, budget, bounds } of variants) {
    it(`${landmark}: returns a grounded Group within target metre bounds and triangle budget`, () => {
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

    it(`${landmark}: uses palette recipes with R1 solid surfaces plus low mist, ground glow disc and light motes`, () => {
      const wood = createPropMaterial("wood");
      const expected: Record<string, Color> = {
        wood: wood.color.clone(), vine: new Color(PALETTE.forestDeep), leaf: new Color(PALETTE.forestLight),
        flower: new Color(PALETTE.flower), mirror: new Color(PALETTE.mist).lerp(new Color(PALETTE.paper), 0.35),
        stone: new Color(PALETTE.mist).lerp(new Color(PALETTE.ink), 0.14),
        chime: new Color(PALETTE.dusk).lerp(new Color(PALETTE.paper), 0.55),
        mist: new Color(PALETTE.mist).lerp(new Color(PALETTE.paper), 0.45),
        glow: new Color(PALETTE.sunGold).lerp(new Color(PALETTE.paper), 0.5),
        mote: new Color(PALETTE.sunGold).lerp(new Color(PALETTE.paper), 0.35),
      };
      wood.dispose();
      const group = create(landmark);
      group.traverse(node => expect(node.type === "Group" || node.type === "Mesh").toBe(true));
      for (const name of ["mist", "glow", "mote"]) {
        expect(group.getObjectByName(name), `${landmark} missing ${name}`).toBeInstanceOf(Mesh);
      }
      for (const mesh of meshes(group)) {
        const material = mesh.material;
        const atmospheric = mesh.name === "mist" || mesh.name === "glow" || mesh.name === "mote";
        expect(material).toBeInstanceOf(MeshToonMaterial);
        expect(material.color.toArray()).toEqual(expected[mesh.name]!.toArray());
        expect(material.vertexColors).toBe(true);
        expect(material.map).toBeNull();
        expect(material.customProgramCacheKey()).toMatch(/\|painted-prop-readable-v2$/);
        if (atmospheric) {
          expect(material.emissive.getHex()).toBeGreaterThan(0);
          expect(material.side).toBe(DoubleSide);
          expect(mesh.castShadow).toBe(false);
          expect(mesh.receiveShadow).toBe(false);
          expect(mesh.raycast).not.toBe(Mesh.prototype.raycast);
          if (mesh.name === "glow") {
            expect(material.transparent).toBe(true);
            expect(material.depthWrite).toBe(false);
            expect(material.opacity).toBeGreaterThan(0);
            expect(material.opacity).toBeLessThanOrEqual(0.12);
          } else if (mesh.name === "mist") {
            expect(material.transparent).toBe(true);
            expect(material.depthWrite).toBe(false);
            expect(material.opacity).toBeGreaterThan(0.08);
            expect(material.opacity).toBeLessThan(0.25);
          } else {
            expect(material.transparent).toBe(false);
            expect(material.opacity).toBe(1);
          }
        } else {
          expect(material.emissive.getHex()).toBe(0);
          expect(material.transparent).toBe(false);
          expect(material.opacity).toBe(1);
        }
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

    it(`${landmark}: keeps glow flat on the ground (no vertical faces) and mist low (< 0.4 m)`, () => {
      const group = create(landmark);
      const glow = group.getObjectByName("glow") as PaintedMesh;
      const glowPos = glow.geometry.getAttribute("position");
      const glowNorm = glow.geometry.getAttribute("normal");
      const glowColor = glow.geometry.getAttribute("color");
      expect(glowColor.itemSize).toBe(4);
      let hasZeroAlphaRim = false;
      let hasCoreAlpha = false;
      for (let i = 0; i < glowPos.count; i++) {
        expect(glowPos.getY(i)).toBeLessThanOrEqual(0.04);
        expect(Math.abs(glowNorm.getY(i))).toBeGreaterThan(0.99);
        const alpha = glowColor.getW(i);
        if (alpha === 0) hasZeroAlphaRim = true;
        if (alpha >= 0.9) hasCoreAlpha = true;
      }
      expect(hasZeroAlphaRim).toBe(true);
      expect(hasCoreAlpha).toBe(true);

      const mist = group.getObjectByName("mist") as PaintedMesh;
      const mistPos = mist.geometry.getAttribute("position");
      const mistNorm = mist.geometry.getAttribute("normal");
      for (let i = 0; i < mistPos.count; i++) {
        expect(mistPos.getY(i)).toBeGreaterThan(0);
        expect(mistPos.getY(i)).toBeLessThan(0.4);
        // Flat low drift, never a vertical wall/box (which would have normal.y === 0).
        expect(Math.abs(mistNorm.getY(i))).toBeGreaterThan(0.85);
      }
    });

    it(`${landmark}: keeps motes small (<= 0.08 m) and outside 1.5 m radius from character stand points`, () => {
      const group = create(landmark);
      const mote = group.getObjectByName("mote") as PaintedMesh;
      const positions = mote.geometry.getAttribute("position");
      // Each octahedron mote has 8 triangles = 24 vertices.
      expect(positions.count % 24).toBe(0);
      const standPoints = landmark === "bench"
        ? [new Vector3(0, 0, 0), new Vector3(1.8, 0, 0)]
        : [new Vector3(0, 0, 0)];
      for (let m = 0; m < positions.count; m += 24) {
        const box = new Box3();
        for (let v = m; v < m + 24; v++) {
          const pt = new Vector3().fromBufferAttribute(positions, v);
          box.expandByPoint(pt);
          for (const stand of standPoints) {
            expect(Math.hypot(pt.x - stand.x, pt.z - stand.z)).toBeGreaterThan(1.5);
          }
        }
        const size = box.getSize(new Vector3());
        expect(size.x).toBeLessThanOrEqual(0.08);
        expect(size.y).toBeLessThanOrEqual(0.08);
        expect(size.z).toBeLessThanOrEqual(0.08);
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

  it("has a large round mirror and wooden rim inside the 2-3x leafy arch", () => {
    const group = create("vine-arch-mirror");
    const mirror = group.getObjectByName("mirror") as PaintedMesh;
    const box = new Box3().setFromObject(mirror), size = box.getSize(new Vector3());
    expect(size.x).toBeCloseTo(size.y, 6);
    expect(size.z).toBe(0);
    expect(size.x).toBeGreaterThan(2);
    expect(box.min.y).toBeGreaterThan(1.8);
    expect(group.getObjectByName("vine")).toBeDefined();
    expect(group.getObjectByName("leaf")).toBeDefined();
  });

  it("places five resonant tubes and cords under a high chimes pivot", () => {
    const group = create("wind-chime");
    const chimes = group.getObjectByName("chimes")!;
    expect(chimes).toBeInstanceOf(Group);
    expect(chimes.parent).toBe(group);
    expect(chimes.position.y).toBeGreaterThan(5);
    const pipes = chimes.getObjectByName("chime") as PaintedMesh;
    const positions = pipes.geometry.getAttribute("position");
    // Five disjoint x bands; each tube is scaled up for 15 m readability while much thinner than its length.
    for (let i = 0; i < 5; i++) {
      const center = (i - 2) * 0.42, box = new Box3();
      for (let j = 0; j < positions.count; j++) {
        const point = new Vector3().fromBufferAttribute(positions, j);
        if (Math.abs(point.x - center) < 0.08) box.expandByPoint(point);
      }
      const size = box.getSize(new Vector3());
      expect(size.y).toBeGreaterThanOrEqual(0.85);
      expect(size.x).toBeLessThan(0.12);
    }
    const cords = chimes.getObjectByName("wood") as PaintedMesh;
    expect(cords.geometry.getAttribute("position").count / 3).toBe(5 * 12);
    group.updateMatrixWorld(true);
    const before = new Box3().setFromObject(pipes).getCenter(new Vector3());
    chimes.rotation.z = 0.1;
    group.updateMatrixWorld(true);
    const after = new Box3().setFromObject(pipes).getCenter(new Vector3());
    expect(before.distanceTo(after)).toBeGreaterThan(0.05);
  });

  it("lays twelve tapering flat stones and four descending stone cairns (<= 1.2 m) along twenty metres", () => {
    const group = create("faint-trail");
    const stone = group.getObjectByName("stone") as PaintedMesh;
    const positions = stone.geometry.getAttribute("position");
    const stoneSizes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const box = new Box3();
      // Five-sided closed stones have 20 triangles = 60 vertices each.
      for (let j = i * 60; j < (i + 1) * 60; j++) box.expandByPoint(new Vector3().fromBufferAttribute(positions, j));
      const size = box.getSize(new Vector3());
      expect(size.y).toBeLessThanOrEqual(0.15);
      expect(size.z).toBeLessThan(1.65);
      expect(Math.abs(box.getCenter(new Vector3()).z - (-i * 1.65))).toBeLessThan(0.08);
      stoneSizes.push(size.x);
    }
    // Stones taper down as the trail fades into the hillside.
    expect(stoneSizes[11]!).toBeLessThan(stoneSizes[0]! * 0.7);

    // Four stacked 5-sided cairns follow (each 5-sided cylinder has 20 triangles = 60 vertices).
    const cairnCounts = [5, 4, 4, 3];
    let offset = 12 * 60;
    const cairnHeights: number[] = [];
    for (const layers of cairnCounts) {
      const box = new Box3();
      for (let j = offset; j < offset + layers * 60; j++) {
        box.expandByPoint(new Vector3().fromBufferAttribute(positions, j));
      }
      offset += layers * 60;
      cairnHeights.push(box.max.y);
      expect(box.max.y).toBeLessThanOrEqual(1.2);
      expect(box.max.y).toBeGreaterThan(0.45);
    }
    expect(offset).toBe(positions.count);
    // Cairns step down in height from start to end.
    expect(cairnHeights[0]!).toBeGreaterThan(cairnHeights[1]!);
    expect(cairnHeights[1]!).toBeGreaterThan(cairnHeights[2]!);
    expect(cairnHeights[2]!).toBeGreaterThan(cairnHeights[3]!);
  });

  it("keeps the bench human-scale (~1.8 m wide, ~0.45 m seat) with a 2.5-3 m trellis backdrop, lectern and clear ending sightline", () => {
    const group = create("bench");
    const seat = group.getObjectByName("seat")!, fence = group.getObjectByName("fence")!;
    const seatBounds = new Box3().setFromObject(seat), fenceBounds = new Box3().setFromObject(fence);
    expect(seatBounds.getSize(new Vector3()).x).toBeCloseTo(1.8, 6);
    expect(seatBounds.max.y).toBeLessThan(1.0);
    expect(seat.getObjectByName("chime")).toBeDefined();

    // Surrounding trellis + lectern scale up the landmark to 2.5-3 m height.
    expect(fenceBounds.max.y).toBeGreaterThanOrEqual(2.5);
    expect(fenceBounds.max.y).toBeLessThanOrEqual(3.0);
    expect(fence.getObjectByName("chime")).toBeDefined();
    expect(fence.getObjectByName("stone")).toBeDefined();
    expect(fence.getObjectByName("flower")).toBeDefined();
    expect(fence.getObjectByName("leaf")).toBeDefined();

    // Ending close camera (2, 1.8, 3) -> character (1.8, y, 0) and look target (0, 0.9, -1)
    // must not pass through any transparent mesh (glow, mist).
    const cameraPos = new Vector3(2, 1.8, 3);
    const checkTargets = [
      new Vector3(0, 0.9, -1),
      new Vector3(1.8, 0.1, 0),
      new Vector3(1.8, 0.9, 0),
      new Vector3(1.8, 1.65, 0),
    ];
    for (const name of ["glow", "mist"] as const) {
      const mesh = group.getObjectByName(name) as PaintedMesh;
      const pos = mesh.geometry.getAttribute("position");
      for (const target of checkTargets) {
        const dir = target.clone().sub(cameraPos);
        const dist = dir.length();
        const ray = new Ray(cameraPos, dir.normalize());
        for (let i = 0; i < pos.count; i += 3) {
          const a = new Vector3().fromBufferAttribute(pos, i);
          const b = new Vector3().fromBufferAttribute(pos, i + 1);
          const c = new Vector3().fromBufferAttribute(pos, i + 2);
          const hit = ray.intersectTriangle(a, b, c, false, new Vector3());
          if (hit) expect(hit.distanceTo(cameraPos)).toBeGreaterThan(dist);
        }
      }
    }
  });
});
