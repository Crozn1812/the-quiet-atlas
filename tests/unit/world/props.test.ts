import { BufferGeometry, Color, Mesh, MeshToonMaterial, Raycaster, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { WORLD_DIRECTION } from "../../../src/features/world/art/direction";
import { createRampGradient, disposeRampGradients } from "../../../src/features/world/materials/ramp";
import { createProp } from "../../../src/features/world/props";
import { createPropMaterial } from "../../../src/features/world/props/materials";
import { createDeskGeometry, createSignpostGeometry } from "../../../src/features/world/props/shapes";

afterEach(disposeRampGradients);

const variants = [
  { kind: "signpost", create: createSignpostGeometry, budget: 220, target: [1.2, 1.6, 0.2] },
  { kind: "desk", create: createDeskGeometry, budget: 400, target: [1.4, 0.8, 0.7] },
] as const;
const triangles = (geometry: BufferGeometry) => (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
const woodColor = () => new Color(PALETTE.ink)
  .lerp(new Color(PALETTE.dusk), 0.38).lerp(new Color(PALETTE.paper), 0.12).getHex();

describe("painted procedural props", () => {
  for (const { kind, create, budget, target } of variants) {
    it(`${kind}: stays within the triangle budget and has finite, nondegenerate flat faces`, () => {
      const geometry = create();
      try {
        expect(triangles(geometry)).toBeGreaterThan(12);
        expect(triangles(geometry)).toBeLessThanOrEqual(budget);
        const positions = geometry.getAttribute("position");
        const normals = geometry.getAttribute("normal");
        expect(normals.count).toBe(positions.count);
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
        const a = new Vector3(), b = new Vector3(), c = new Vector3();
        for (let i = 0; i < positions.count; i += 3) {
          a.fromBufferAttribute(positions, i);
          b.fromBufferAttribute(positions, i + 1);
          c.fromBufferAttribute(positions, i + 2);
          const normal = b.sub(a).cross(c.sub(a));
          expect(normal.length()).toBeGreaterThan(1e-8);
          normal.normalize();
          for (let j = 0; j < 3; j++) {
            expect(new Vector3().fromBufferAttribute(normals, i + j).distanceTo(normal)).toBeLessThan(1e-6);
          }
        }
      } finally { geometry.dispose(); }
    });

    it(`${kind}: repeats every geometry attribute and material group exactly`, () => {
      const first = create(), second = create();
      try {
        expect(Object.keys(first.attributes)).toEqual(Object.keys(second.attributes));
        for (const name of Object.keys(first.attributes)) {
          expect(Array.from(first.getAttribute(name).array)).toEqual(Array.from(second.getAttribute(name).array));
        }
        expect(first.index).toEqual(second.index);
        expect(first.groups).toEqual(second.groups);
        expect(first.boundingBox).toEqual(second.boundingBox);
        expect(first.boundingSphere).toEqual(second.boundingSphere);
      } finally { first.dispose(); second.dispose(); }
    });

    it(`${kind}: has centred bounds within 20% of the target metre dimensions`, () => {
      const geometry = create();
      try {
        const bounds = geometry.boundingBox!;
        const size = bounds.getSize(new Vector3()).toArray();
        target.forEach((value, axis) => {
          expect(size[axis]).toBeGreaterThanOrEqual(value * 0.8);
          expect(size[axis]).toBeLessThanOrEqual(value * 1.2);
        });
        expect(bounds.getCenter(new Vector3()).length()).toBeLessThan(1e-6);
        expect(geometry.boundingSphere!.radius).toBeGreaterThan(0);
      } finally { geometry.dispose(); }
    });

    it(`${kind}: uses varying neutral vertex washes only within [0.85, 1]`, () => {
      const geometry = create();
      try {
        const colors = geometry.getAttribute("color");
        expect(colors.itemSize).toBe(3);
        expect(colors.count).toBe(geometry.getAttribute("position").count);
        const shades = new Set<number>();
        for (let i = 0; i < colors.count; i++) {
          const value = colors.getX(i);
          expect(value).toBeGreaterThanOrEqual(0.85);
          expect(value).toBeLessThanOrEqual(1);
          expect(colors.getY(i)).toBe(value);
          expect(colors.getZ(i)).toBe(value);
          shades.add(value);
        }
        expect(shades.size).toBeGreaterThan(8);
      } finally { geometry.dispose(); }
    });

    it(`${kind}: returns one raycastable Mesh with complete wood/paper material groups`, () => {
      const mesh = createProp(kind);
      try {
        expect(mesh).toBeInstanceOf(Mesh);
        expect(mesh.userData.kind).toBe(kind);
        expect(mesh.children).toHaveLength(0);
        expect(mesh.material).toHaveLength(kind === "desk" ? 2 : 1);
        let count = 0;
        for (const group of mesh.geometry.groups) {
          expect(group.start).toBe(count);
          expect(group.count % 3).toBe(0);
          expect(mesh.material[group.materialIndex!]).toBeInstanceOf(MeshToonMaterial);
          count += group.count;
        }
        expect(count).toBe(mesh.geometry.getAttribute("position").count);
        expect(mesh.material[0]!.color.getHex()).toBe(woodColor());
        if (kind === "desk") expect(mesh.material[1]!.color.getHex()).toBe(new Color(PALETTE.paper).getHex());
        // Front and back of the board; wood and paper on the desk surface.
        const rays = kind === "signpost" ? [
          { from: new Vector3(0.1, 0.5, 1), direction: new Vector3(0, 0, -1), slot: 0 },
          { from: new Vector3(0.1, 0.5, -1), direction: new Vector3(0, 0, 1), slot: 0 },
        ] : [
          { from: new Vector3(0.5, 1, 0), direction: new Vector3(0, -1, 0), slot: 0 },
          { from: new Vector3(-0.24, 1, 0.035), direction: new Vector3(0, -1, 0), slot: 1 },
        ];
        for (const { from, direction, slot } of rays) {
          const hit = new Raycaster(from, direction).intersectObject(mesh)[0];
          expect(hit?.object).toBe(mesh);
          expect(hit?.face?.materialIndex).toBe(slot);
        }
      } finally { mesh.geometry.dispose(); mesh.material.forEach(material => material.dispose()); }
    });

    it(`${kind}: independently disposes owned geometry/materials while preserving the shared ramp`, () => {
      const mesh = createProp(kind), sibling = createProp(kind);
      const geometryDisposed = vi.fn(), rampDisposed = vi.fn();
      const materialDisposed = mesh.material.map(() => vi.fn());
      const ramp = mesh.material[0]!.gradientMap!;
      try {
        expect(mesh.geometry).not.toBe(sibling.geometry);
        mesh.geometry.addEventListener("dispose", geometryDisposed);
        ramp.addEventListener("dispose", rampDisposed);
        mesh.material.forEach((material, index) => {
          expect(material).not.toBe(sibling.material[index]);
          expect(material.gradientMap).toBe(ramp);
          material.addEventListener("dispose", materialDisposed[index]!);
        });
        expect(sibling.material[0]!.gradientMap).toBe(ramp);
      } finally {
        mesh.geometry.dispose(); mesh.material.forEach(material => material.dispose());
        sibling.geometry.dispose(); sibling.material.forEach(material => material.dispose());
      }
      expect(geometryDisposed).toHaveBeenCalledTimes(1);
      materialDisposed.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
      expect(rampDisposed).not.toHaveBeenCalled();
      disposeRampGradients();
      disposeRampGradients();
      expect(rampDisposed).toHaveBeenCalledTimes(1);
    });
  }

  it.each(["wood", "paper"] as const)("%s material follows only its palette recipe and the shared soft toon ramp", kind => {
    const material = createPropMaterial(kind);
    try {
      expect(material).toBeInstanceOf(MeshToonMaterial);
      expect(material.vertexColors).toBe(true);
      expect(material.color.getHex()).toBe(kind === "wood" ? woodColor() : new Color(PALETTE.paper).getHex());
      const { steps, soft } = WORLD_DIRECTION.foliage.ramp;
      expect(soft).toBe(true);
      expect(material.gradientMap).toBe(createRampGradient(steps, soft));
      expect(material.customProgramCacheKey()).toBe("painted-toon-ramp-v1");
      expect(material).not.toHaveProperty("metalness");
      expect(material).not.toHaveProperty("specular");
    } finally { material.dispose(); }
  });
});
