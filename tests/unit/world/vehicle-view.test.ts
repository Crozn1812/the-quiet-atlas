import { Box3, Color, Group, Mesh, MeshToonMaterial, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialVehicle, vehiclePosition, type VehicleCorridor, type VehicleState } from "../../../src/features/vehicle/model";
import { disposeRampGradients } from "../../../src/features/world/materials/ramp";
import { createGd110, disposeGd110, GD110_COLORS, GD110_WHEEL_RADIUS, GD110_WHEELBASE } from "../../../src/features/world/vehicle/mesh";
import { createVehicleView, MAX_VEHICLE_LEAN } from "../../../src/features/world/vehicle/view";

const straight: VehicleCorridor = {
  length: 100,
  halfWidthAt: () => 3,
  pointAt: s => ({ x: 0, z: s }),
  tangentAt: () => ({ x: 0, z: 2 }), // Nonunit tangents are valid.
};
function curve(radius: number, heading = 0): VehicleCorridor {
  return {
    ...straight,
    pointAt: s => ({ x: radius * (Math.cos(heading) - Math.cos(heading + s / radius)),
      z: radius * (Math.sin(heading + s / radius) - Math.sin(heading)) }),
    tangentAt: s => ({ x: Math.sin(heading + s / radius), z: Math.cos(heading + s / radius) }),
  };
}
function riding(corridor = straight, overrides: Partial<VehicleState> = {}): VehicleState {
  return { ...initialVehicle(corridor, 10), mode: "ride", speed: 5, ...overrides };
}
function meshes(group: Group): Mesh[] {
  const result: Mesh[] = [];
  group.traverse(node => { if (node instanceof Mesh) result.push(node); });
  return result;
}
const views: ReturnType<typeof createVehicleView>[] = [];
function makeView(options: Parameters<typeof createVehicleView>[0] = { surfaceHeight: () => 0 }) {
  const view = createVehicleView(options);
  views.push(view);
  return view;
}
afterEach(() => {
  views.splice(0).forEach(view => view.dispose());
  disposeRampGradients();
});

describe("GD110 procedural mesh", () => {
  it("fits the geometry/draw budgets and metre envelope, with separate grounded wheel pivots", () => {
    const bike = createGd110();
    try {
      const parts = meshes(bike);
      const triangles = parts.reduce((n, mesh) => n + (mesh.geometry.index?.count
        ?? mesh.geometry.getAttribute("position").count) / 3, 0);
      expect(triangles).toBeLessThanOrEqual(3000);
      expect(triangles).toBeGreaterThan(1000);
      const draws = parts.reduce((n, mesh) => n + (Array.isArray(mesh.material) ? mesh.geometry.groups.length : 1), 0);
      expect(draws).toBe(3);
      expect(parts.every(mesh => !mesh.castShadow)).toBe(true);
      expect(parts.every(mesh => !/logo|text/i.test(mesh.name))).toBe(true);
      const bounds = new Box3().setFromObject(bike);
      const size = bounds.getSize(new Vector3());
      for (const [actual, target] of [[size.z, 1.9], [size.y, 1.1], [size.x, .75]]) {
        expect(actual).toBeGreaterThanOrEqual(target! * .85);
        expect(actual).toBeLessThanOrEqual(target! * 1.15);
      }
      expect(bounds.min.y).toBeCloseTo(0, 6);
      const front = bike.getObjectByName("front_wheel") as Mesh;
      const rear = bike.getObjectByName("rear_wheel") as Mesh;
      expect(front.parent).toBe(bike);
      expect(rear.parent).toBe(bike);
      expect(front.position.z - rear.position.z).toBeCloseTo(GD110_WHEELBASE);
      for (const wheel of [front, rear]) {
        const wheelBounds = new Box3().setFromObject(wheel);
        expect(wheelBounds.min.y).toBeCloseTo(0, 6);
        expect(wheelBounds.max.y).toBeCloseTo(2 * GD110_WHEEL_RADIUS, 6);
        expect(wheelBounds.getSize(new Vector3()).z).toBeCloseTo(2 * GD110_WHEEL_RADIUS, 6);
      }
    } finally { disposeGd110(bike); }
  });

  it("retains all approved accessories and only approved opaque, matte ramp colours", () => {
    const bike = createGd110();
    try {
      const parts = meshes(bike);
      const chassis = bike.getObjectByName("chassis") as Mesh;
      const names = chassis.geometry.userData.parts as string[];
      for (const name of ["fuel_tank", "long_seat", "handlebar_scrambler", "handlebar_crossbrace",
        "round_mirror", "round_headlamp", "rack_rail", "helmet_shell", "helmet_lining",
        "amber_lens", "tote_bag", "tote_handle", "exhaust_muffler"]) expect(names).toContain(name);
      const approved = Object.values(GD110_COLORS).map(value => new Color(value));
      const seen = new Set<string>();
      for (const part of parts) {
        const material = part.material as MeshToonMaterial;
        expect(material).toBeInstanceOf(MeshToonMaterial);
        expect(material.vertexColors).toBe(true);
        expect(material.transparent).toBe(false);
        expect(material.map).toBeNull();
        expect(material.color.getHex()).toBe(0xffffff);
        expect(part.geometry.groups).toHaveLength(0);
        const positions = part.geometry.getAttribute("position");
        const colors = part.geometry.getAttribute("color");
        const normals = part.geometry.getAttribute("normal");
        expect(colors.count).toBe(positions.count);
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
        for (let i = 0; i < colors.count; i++) {
          const color = new Color().fromBufferAttribute(colors, i);
          const match = approved.find(candidate => Math.abs(candidate.r - color.r) < 1e-7
            && Math.abs(candidate.g - color.g) < 1e-7 && Math.abs(candidate.b - color.b) < 1e-7);
          expect(match).toBeDefined();
          seen.add(match!.getHexString());
          expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 5);
        }
      }
      expect(seen.size).toBe(approved.length);
    } finally { disposeGd110(bike); }
  });
});

describe("vehicle view", () => {
  it("uses vehiclePosition, injected terrain height and corridor heading instead of steering heading", () => {
    const corridor = curve(15);
    const height = vi.fn((x: number, z: number) => x * .2 + z * .1);
    const view = makeView({ surfaceHeight: height });
    const state = riding(corridor, { s: 20, lateral: 1.2, heading: -2 });
    view.update(state, corridor, 1 / 60);
    const point = vehiclePosition(state, corridor);
    expect(view.group.position.toArray()).toEqual([point.x, height(point.x, point.z), point.z]);
    expect(view.group.rotation.y).toBeCloseTo(state.s / 15);
    expect(view.group.getWorldDirection(new Vector3()).x).toBeCloseTo(Math.sin(state.s / 15));
  });

  it("rolls both wheels by realized signed distance/radius, independent of dt and stale speed", () => {
    const view = makeView();
    const state = riding(straight);
    view.update(state, straight, 1 / 60);
    const wheels = ["front_wheel", "rear_wheel"].map(name => view.group.getObjectByName(name)!);
    expect(wheels.map(wheel => wheel.rotation.x)).toEqual([0, 0]);
    view.update({ ...state, s: 12 }, straight, .01);
    wheels.forEach(wheel => expect(wheel.rotation.x).toBeCloseTo(2 / GD110_WHEEL_RADIUS));
    view.update({ ...state, s: 12, speed: 8 }, straight, 10);
    wheels.forEach(wheel => expect(wheel.rotation.x).toBeCloseTo(2 / GD110_WHEEL_RADIUS));
    view.update({ ...state, s: 11, speed: -1 }, straight, 1 / 30);
    wheels.forEach(wheel => expect(wheel.rotation.x).toBeCloseTo(1 / GD110_WHEEL_RADIUS));
    view.update({ ...state, s: 11.3, lateral: .4 }, straight, 1 / 30);
    wheels.forEach(wheel => expect(wheel.rotation.x).toBeCloseTo(1.5 / GD110_WHEEL_RADIUS));
    view.update(riding(curve(10)), curve(10), 1 / 60);
    wheels.forEach(wheel => expect(wheel.rotation.x).toBeCloseTo(1.5 / GD110_WHEEL_RADIUS));
  });

  it.each([2, -2])("banks smoothly into a radius %s bend, stays within 12 degrees and settles on straight road", radius => {
    const corridor = curve(radius);
    const state = riding(corridor, { speed: 8 });
    const view = makeView();
    const bike = view.group.getObjectByName("gd110")!;
    view.update(state, corridor, 1 / 60);
    const first = bike.rotation.z;
    expect(Math.sign(first)).toBe(-Math.sign(radius));
    expect(Math.abs(first)).toBeGreaterThan(0);
    expect(Math.abs(first)).toBeLessThan(MAX_VEHICLE_LEAN);
    for (let i = 0; i < 120; i++) {
      view.update(state, corridor, 1 / 60);
      expect(Math.abs(bike.rotation.z)).toBeLessThanOrEqual(12 * Math.PI / 180);
    }
    expect(Math.abs(bike.rotation.z)).toBeGreaterThan(Math.abs(first));
    for (let i = 0; i < 180; i++) view.update(riding(straight), straight, 1 / 60);
    expect(bike.rotation.z).toBe(0);
  });

  it("handles heading wraparound and frame-rate independent bank smoothing", () => {
    const corridor = curve(10, Math.PI - .01);
    const state = riding(corridor, { s: .1 });
    const a = makeView(), b = makeView();
    for (let i = 0; i < 60; i++) a.update(state, corridor, 1 / 60);
    for (let i = 0; i < 30; i++) b.update(state, corridor, 1 / 30);
    const roll = a.group.getObjectByName("gd110")!.rotation.z;
    expect(roll).toBeLessThan(0);
    expect(roll).toBeCloseTo(b.group.getObjectByName("gd110")!.rotation.z, 10);
    for (const dt of [NaN, Infinity, -1, 0, 10]) {
      a.update(state, corridor, dt);
      expect(Number.isFinite(a.group.getObjectByName("gd110")!.rotation.z)).toBe(true);
    }
  });

  it("keeps the bike visible while walking and settles parked lean", () => {
    const corridor = curve(2);
    const view = makeView();
    const state = riding(corridor);
    view.update(state, corridor, .25);
    for (let i = 0; i < 120; i++) view.update({ ...state, mode: "walk", speed: 0 }, corridor, 1 / 60);
    expect(view.group.getObjectByName("gd110")!.rotation.z).toBe(0);
    expect(view.group.visible).toBe(true);
  });

  it("disables lean immediately for reduced motion, including live preference changes", () => {
    const corridor = curve(2);
    const view = makeView({ surfaceHeight: () => 0, reducedMotion: true });
    const state = riding(corridor);
    view.update(state, corridor, .25);
    const bike = view.group.getObjectByName("gd110")!;
    expect(bike.rotation.z).toBe(0);
    view.setReducedMotion(false);
    view.update(state, corridor, .25);
    expect(bike.rotation.z).not.toBe(0);
    view.setReducedMotion(true);
    expect(bike.rotation.z).toBe(0);
    view.update({ ...state, s: state.s + 1 }, corridor, .25);
    expect(bike.rotation.z).toBe(0);
    expect(view.group.getObjectByName("front_wheel")!.rotation.x).toBeCloseTo(1 / GD110_WHEEL_RADIUS);
  });

  it("disposes owned GPU resources once, detaches, and leaves other vehicles and shared ramps alive", () => {
    const a = makeView(), b = makeView();
    const parent = new Group();
    parent.add(a.group);
    const parts = meshes(a.group);
    const geometries = [...new Set(parts.map(part => part.geometry))];
    const material = parts[0]!.material as MeshToonMaterial;
    const disposeGeometry = geometries.map(geometry => vi.spyOn(geometry, "dispose"));
    const disposeMaterial = vi.spyOn(material, "dispose");
    const disposeGradient = vi.spyOn(material.gradientMap!, "dispose");
    const otherMaterial = meshes(b.group)[0]!.material as MeshToonMaterial;
    const disposeOther = vi.spyOn(otherMaterial, "dispose");
    expect(otherMaterial.gradientMap).toBe(material.gradientMap);
    a.dispose();
    a.dispose();
    a.update(riding(), straight, .25);
    a.setReducedMotion(true);
    disposeGeometry.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(disposeGradient).not.toHaveBeenCalled();
    expect(disposeOther).not.toHaveBeenCalled();
    expect(parent.children).toHaveLength(0);
    expect(a.group.children).toHaveLength(0);
    expect(meshes(b.group)).toHaveLength(3);
    b.update(riding(), straight, .25);
  });
});
