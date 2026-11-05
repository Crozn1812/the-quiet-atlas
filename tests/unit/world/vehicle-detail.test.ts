import { Bone, Box3, Group, Mesh, SkinnedMesh, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { disposeRampGradients } from "../../../src/features/world/materials/ramp";
import { createGd110, disposeGd110, GD110_SCALE, GD110_WHEEL_RADIUS } from "../../../src/features/world/vehicle/mesh";
import { createVehicleView } from "../../../src/features/world/vehicle/view";
import { initialVehicle, type VehicleCorridor } from "../../../src/features/vehicle/model";

type PartRange = { name: string; start: number; count: number; bone: number };
const bikes: Group[] = [];
function makeBike() {
  const bike = createGd110();
  bikes.push(bike);
  return bike;
}
function batch(bike: Group) { return bike.getObjectByName("chassis") as SkinnedMesh; }
function ranges(mesh: SkinnedMesh): PartRange[] { return mesh.geometry.userData.partRanges; }
function points(mesh: SkinnedMesh, part: PartRange) {
  return Array.from({ length: part.count }, (_, i) =>
    new Vector3().fromBufferAttribute(mesh.geometry.getAttribute("position"), part.start + i));
}

afterEach(() => {
  bikes.splice(0).forEach(disposeGd110);
  disposeRampGradients();
});

describe("GD110 detailed single batch", () => {
  it("retains every named part as real triangles in one opaque, ungrouped draw", () => {
    const mesh = batch(makeBike());
    const parts = ranges(mesh);
    const required = ["wheel", "spoke", "tank", "seat", "headlight", "mirror", "handlebar",
      "engine", "exhaust", "chain", "fork", "shock", "fender", "rack", "helmet", "tote"];
    for (const name of required) expect(mesh.geometry.userData.parts).toContain(name);
    expect(parts.map(part => part.name)).toEqual(mesh.geometry.userData.parts);
    let cursor = 0;
    for (const part of parts) {
      expect(part.start).toBe(cursor);
      expect(part.count).toBeGreaterThan(0);
      expect(part.count % 3).toBe(0);
      cursor += part.count;
    }
    expect(cursor).toBe(mesh.geometry.getAttribute("position").count);
    expect(cursor / 3).toBeLessThanOrEqual(8000);
    const rendered: Mesh[] = [];
    mesh.parent!.traverse(node => { if (node instanceof Mesh && node.visible) rendered.push(node); });
    expect(rendered).toEqual([mesh]);
    expect(mesh.geometry.groups).toEqual([]);
    expect(Array.isArray(mesh.material)).toBe(false);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(true);
  });

  it("has 18–24 thin spokes on each grounded wheel, a brake drum and raised black tread", () => {
    const bike = makeBike(), mesh = batch(bike);
    for (const name of ["rear_wheel", "front_wheel"]) {
      const pivot = bike.getObjectByName(name)!;
      const bone = mesh.skeleton.bones.indexOf(pivot as Bone);
      const wheelParts = ranges(mesh).filter(part => part.bone === bone);
      const spokes = wheelParts.filter(part => part.name === "spoke");
      expect(spokes.length).toBeGreaterThanOrEqual(18);
      expect(spokes.length).toBeLessThanOrEqual(24);
      for (const part of spokes) {
        const positions = points(mesh, part);
        expect(new Box3().setFromPoints(positions).getSize(new Vector3()).x).toBeLessThan(.03);
        const radial = positions.map(p => Math.hypot(p.y - pivot.position.y, p.z - pivot.position.z));
        expect(Math.min(...radial)).toBeLessThan(.055 * GD110_SCALE);
        expect(Math.max(...radial)).toBeGreaterThan(.20 * GD110_SCALE);
      }
      for (const part of ["rim", "hub", "brake_drum", "tire_tread"]) {
        expect(wheelParts.some(range => range.name === part)).toBe(true);
      }
      const wheelPoints = wheelParts.flatMap(part => points(mesh, part));
      const bounds = new Box3().setFromPoints(wheelPoints);
      expect(bounds.min.y).toBeCloseTo(0, 6);
      expect(bounds.max.y).toBeCloseTo(2 * GD110_WHEEL_RADIUS, 6);
      expect(bounds.getSize(new Vector3()).z).toBeCloseTo(2 * GD110_WHEEL_RADIUS, 6);
      const maxRadius = (name: string) => Math.max(...wheelParts.filter(part => part.name === name)
        .flatMap(part => points(mesh, part)).map(p => Math.hypot(p.y - pivot.position.y, p.z - pivot.position.z)));
      expect(maxRadius("tire_tread")).toBeGreaterThan(maxRadius("wheel"));
      expect(maxRadius("tire_tread")).toBeLessThanOrEqual(GD110_WHEEL_RADIUS + 1e-7);
    }
  });

  it("models spaced engine fins, two coiled shocks, a rising exhaust with a guard, and sheet fenders", () => {
    const mesh = batch(makeBike());
    const bounds = (part: PartRange) => new Box3().setFromPoints(points(mesh, part));
    const fins = ranges(mesh).filter(part => part.name === "engine").map(bounds).sort((a, b) => a.min.y - b.min.y);
    expect(fins.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < fins.length; i++) expect(fins[i]!.min.y - fins[i - 1]!.max.y).toBeGreaterThan(.005);
    const springs = ranges(mesh).filter(part => part.name === "shock");
    expect(springs).toHaveLength(2);
    for (const spring of springs) {
      const p = points(mesh, spring);
      const centerX = (Math.max(...p.map(v => v.x)) + Math.min(...p.map(v => v.x))) / 2;
      // Repeated turns cross each side of the damper; reject a straight cylinder.
      const signs = p.filter((_, i) => i % 3 === 0).map(v => Math.sign(v.x - centerX));
      expect(signs.filter((s, i) => i > 0 && s !== signs[i - 1]).length).toBeGreaterThan(12);
    }
    const header = points(mesh, ranges(mesh).find(part => part.name === "exhaust_header")!);
    const belly = Math.min(...header.map(p => p.y));
    const rear = header.filter(p => p.z < -.30 * GD110_SCALE);
    expect(Math.min(...rear.map(p => p.y)) - belly).toBeGreaterThan(.10 * GD110_SCALE);
    for (const name of ["exhaust_heat_slot", "fork_dust_boot", "chain_link"]) {
      expect(ranges(mesh).some(part => part.name === name)).toBe(true);
    }
    const fenders = ranges(mesh).filter(part => part.name === "fender");
    expect(fenders).toHaveLength(2);
    for (const fender of fenders) expect(bounds(fender).getSize(new Vector3()).x).toBeGreaterThan(.10 * GD110_SCALE);
  });

  it("rolls the actual batched vertices through the unchanged vehicle view under a transformed parent", () => {
    const corridor: VehicleCorridor = { length: 100, halfWidthAt: () => 3,
      pointAt: s => ({ x: 0, z: s }), tangentAt: () => ({ x: 0, z: 1 }) };
    const view = createVehicleView({ surfaceHeight: () => 2 });
    const parent = new Group();
    parent.position.set(4, 1, -5);
    parent.rotation.y = .4;
    parent.scale.setScalar(1.5);
    parent.add(view.group);
    try {
      const mesh = view.group.getObjectByName("chassis") as SkinnedMesh;
      const attributes = mesh.geometry.getAttribute("position");
      const fixed = ranges(mesh).find(part => part.name === "fuel_tank")!;
      const state = { ...initialVehicle(corridor, 10), mode: "ride" as const };
      view.update(state, corridor, 0);
      view.update({ ...state, s: state.s + GD110_WHEEL_RADIUS * .75 }, corridor, 1 / 60);
      parent.updateMatrixWorld(true);
      mesh.skeleton.update();
      for (const wheel of mesh.skeleton.bones.slice(1)) {
        const boneIndex = mesh.skeleton.bones.indexOf(wheel);
        const part = ranges(mesh).find(part => part.bone === boneIndex && part.name === "spoke")!;
        const initial = new Vector3().fromBufferAttribute(attributes, part.start);
        const expected = initial.clone().sub(wheel.position).applyAxisAngle(new Vector3(1, 0, 0), .75).add(wheel.position);
        const actual = mesh.getVertexPosition(part.start, new Vector3());
        expect(actual.distanceTo(expected)).toBeLessThan(1e-6);
        expect(actual.distanceTo(initial)).toBeGreaterThan(.01);
      }
      expect(mesh.getVertexPosition(fixed.start, new Vector3())
        .distanceTo(new Vector3().fromBufferAttribute(attributes, fixed.start))).toBeLessThan(1e-6);
      const weights = mesh.geometry.getAttribute("skinWeight"), indices = mesh.geometry.getAttribute("skinIndex");
      for (const part of ranges(mesh)) {
        for (let i = part.start; i < part.start + part.count; i++) {
          expect(indices.getX(i)).toBe(part.bone);
          expect([weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)]).toEqual([1, 0, 0, 0]);
        }
      }
      // Culling bounds must enclose rolling vertices, not just the rest pose.
      const envelope = mesh.boundingBox!.clone().expandByScalar(1e-6);
      for (const angle of [0, .2, 1, 2, 4, -1]) {
        mesh.skeleton.bones.slice(1).forEach(wheel => { wheel.rotation.x = angle; });
        parent.updateMatrixWorld(true);
        for (let i = 0; i < attributes.count; i++) {
          const p = mesh.getVertexPosition(i, new Vector3());
          expect(envelope.containsPoint(p)).toBe(true);
          expect(mesh.boundingSphere!.containsPoint(p)).toBe(true);
        }
      }
    } finally { view.dispose(); }
  });

  it("is deterministic and releases skeleton texture, geometry and material exactly once", () => {
    const a = makeBike(), b = makeBike();
    const first = batch(a), second = batch(b);
    expect(ranges(first)).toEqual(ranges(second));
    for (const name of ["position", "normal", "color", "skinIndex", "skinWeight"]) {
      expect(first.geometry.getAttribute(name).array).toEqual(second.geometry.getAttribute(name).array);
    }
    first.skeleton.computeBoneTexture();
    const texture = vi.spyOn(first.skeleton.boneTexture!, "dispose");
    const skeleton = vi.spyOn(first.skeleton, "dispose");
    const geometry = vi.spyOn(first.geometry, "dispose");
    const material = vi.spyOn(first.material as import("three").Material, "dispose");
    disposeGd110(a);
    disposeGd110(a);
    for (const spy of [texture, skeleton, geometry, material]) expect(spy).toHaveBeenCalledTimes(1);
    expect(batch(b).skeleton.bones).toHaveLength(3);
  });
});
