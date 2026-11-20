import { reportBudget } from "./report-budget";
import { Bone, Box3, Color, Group, Mesh, MeshToonMaterial, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialVehicle, vehiclePosition, type VehicleState } from "../../../src/features/vehicle/model";
import { disposeRampGradients } from "../../../src/features/world/materials/ramp";
import { createGd110, disposeGd110, GD110_COLORS, GD110_WHEEL_RADIUS, GD110_WHEELBASE } from "../../../src/features/world/vehicle/mesh";
import { createVehicleView, MAX_VEHICLE_LEAN, PARKED_VEHICLE_LEAN } from "../../../src/features/world/vehicle/view";

function riding(overrides: Partial<VehicleState> = {}): VehicleState {
  return { ...initialVehicle({ x: 0, z: 10 }), mode: "ride", speed: 5, ...overrides };
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
      reportBudget("tests/unit/world/vehicle-view.test.ts:48 triangles", triangles, 8000);
      expect(triangles).toBeGreaterThan(1000);
      const draws = parts.reduce((n, mesh) => n + (Array.isArray(mesh.material) ? mesh.geometry.groups.length : 1), 0);
      expect(draws).toBe(1);
      expect(parts.every(mesh => !mesh.castShadow)).toBe(true);
      expect(parts.every(mesh => !/logo|text/i.test(mesh.name))).toBe(true);
      const bounds = new Box3().setFromObject(bike, true);
      const size = bounds.getSize(new Vector3());
      // Measured B2-189 input geometry, including mirrors, tote and fenders.
      for (const [actual, target] of [[size.z, 1.6351106167], [size.y, 1.2522599853], [size.x, .7800461352]]) {
        expect(actual).toBeGreaterThanOrEqual(target! * .95);
        expect(actual).toBeLessThanOrEqual(target! * 1.05);
      }
      expect(bounds.min.y).toBeCloseTo(0, 6);
      const front = bike.getObjectByName("front_wheel")!;
      const rear = bike.getObjectByName("rear_wheel")!;
      expect(front.parent).toBe(bike.getObjectByName("steering"));
      expect(rear.parent).toBe(bike);
      expect(front.getWorldPosition(new Vector3()).z - rear.position.z).toBeCloseTo(GD110_WHEELBASE);
      for (const wheel of [front, rear]) {
        expect(wheel).toBeInstanceOf(Bone);
        expect(wheel.getWorldPosition(new Vector3()).y).toBeCloseTo(GD110_WHEEL_RADIUS);
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
  it("parks nine degrees onto the left steel foot at ground height, then stows clear of the road", () => {
    const view = makeView({ surfaceHeight: () => .4 });
    const state = riding();
    view.update({ ...state, mode: "walk", speed: 0 }, 0);
    const bike = view.riderFrame;
    const stand = bike.getObjectByName("kickstand")!;
    const foot = stand.getObjectByName("black_steel_stand_return_spring") as Mesh;
    expect(bike.rotation.z).toBeCloseTo(9 * Math.PI / 180);
    expect(stand.position.x).toBeLessThan(0);
    view.group.updateMatrixWorld(true);
    expect(Math.abs(new Box3().setFromObject(foot, true).min.y - .4)).toBeLessThan(.003);
    view.setReducedMotion(true);
    expect(bike.rotation.z).toBe(PARKED_VEHICLE_LEAN);
    view.update(state, 0);
    expect(bike.rotation.z).toBe(0);
    view.group.updateMatrixWorld(true);
    expect(new Box3().setFromObject(foot, true).min.y).toBeGreaterThan(.52);
  });
  it("folds the stand after mounting and lowers it before stepping off; reduced motion snaps", () => {
    const view = makeView();
    const state = riding();
    const parked = { ...state, mode: "walk" as const, speed: 0 };
    const stand = view.group.getObjectByName("kickstand")!;
    view.update(parked, 0);
    expect(stand.rotation.x).toBe(0);
    view.update(state, 0);
    for (let i = 0; i < 9; i++) view.update(state, .1);
    expect(stand.rotation.x).toBe(0);
    for (let i = 0; i < 4; i++) view.update(state, .1);
    expect(stand.rotation.x).toBeCloseTo(1.5);
    view.update(parked, 0);
    view.update(parked, .15);
    expect(stand.rotation.x).toBeCloseTo(.75);
    view.update(parked, .15);
    expect(stand.rotation.x).toBe(0);
    view.setReducedMotion(true);
    view.update(state, 0);
    expect(stand.rotation.x).toBe(1.5);
  });
  it("uses absolute coordinates, ground height and the vehicle heading", () => {
    const height = vi.fn((x: number, z: number) => x * .2 + z * .1);
    const view = makeView({ surfaceHeight: height });
    const state = riding({ x: 20, z: 1.2, heading: -2 });
    view.update(state, 1 / 60);
    const point = vehiclePosition(state);
    expect(view.group.position.toArray()).toEqual([point.x, height(point.x, point.z), point.z]);
    expect(view.group.rotation.y).toBeCloseTo(-2);
    expect(view.group.getWorldDirection(new Vector3()).x).toBeCloseTo(Math.sin(-2));
  });

  it("rolls wheels by realized signed travel, including reverse, and holds when blocked", () => {
    const view = makeView();
    const state = riding();
    view.update(state, 1 / 60);
    const wheels = ["front_wheel", "rear_wheel"].map(name => view.group.getObjectByName(name)!);
    view.update({ ...state, z: 12 }, .01);
    wheels.forEach(wheel => expect(wheel.rotation.x).toBeCloseTo(2 / GD110_WHEEL_RADIUS));
    view.update({ ...state, z: 12, speed: 8 }, 10);
    wheels.forEach(wheel => expect(wheel.rotation.x).toBeCloseTo(2 / GD110_WHEEL_RADIUS));
    view.update({ ...state, z: 11, speed: -1 }, 1 / 30);
    wheels.forEach(wheel => expect(wheel.rotation.x).toBeCloseTo(1 / GD110_WHEEL_RADIUS));
  });

  it.each([1, -1])("banks into actual heading changes in direction %s within twelve degrees", direction => {
    const view = makeView();
    const state = riding({ speed: 8 });
    const bike = view.riderFrame;
    view.update(state, 1 / 60);
    for (let i = 1; i <= 60; i++) {
      view.update({ ...state, heading: direction * i / 60 }, 1 / 60);
      expect(Math.sign(bike.rotation.z)).toBe(-direction);
      expect(Math.abs(bike.rotation.z)).toBeLessThanOrEqual(MAX_VEHICLE_LEAN);
    }
    for (let i = 0; i < 180; i++) view.update({ ...state, heading: direction }, 1 / 60);
    expect(bike.rotation.z).toBe(0);
  });

  it("handles heading wraparound without a full-turn bank", () => {
    const view = makeView();
    view.update(riding({ heading: Math.PI - .01 }), .1);
    view.update(riding({ heading: -Math.PI + .01 }), .1);
    expect(view.riderFrame.rotation.z).toBeLessThan(0);
    expect(Math.abs(view.riderFrame.rotation.z)).toBeLessThan(.1);
    for (const dt of [NaN, Infinity, -1, 0, 10]) {
      view.update(riding(), dt);
      expect(Number.isFinite(view.riderFrame.rotation.z)).toBe(true);
    }
  });

  it("keeps the bike visible while walking and settles parked lean", () => {
    const view = makeView();
    const state = riding();
    view.update(state, .25);
    for (let i = 0; i < 120; i++) view.update({ ...state, mode: "walk", speed: 0 }, 1 / 60);
    expect(view.group.getObjectByName("gd110")!.rotation.z).toBe(PARKED_VEHICLE_LEAN);
    expect(view.group.visible).toBe(true);
  });

  it("disables lean immediately for reduced motion, including live preference changes", () => {
    const view = makeView({ surfaceHeight: () => 0, reducedMotion: true });
    const state = riding();
    view.update(state, .25);
    const bike = view.group.getObjectByName("gd110")!;
    expect(bike.rotation.z).toBe(0);
    view.setReducedMotion(false);
    view.update({ ...state, heading: .2 }, .25);
    expect(bike.rotation.z).not.toBe(0);
    view.setReducedMotion(true);
    expect(bike.rotation.z).toBe(0);
    view.update({ ...state, z: state.z + 1 }, .25);
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
    a.update(riding(), .25);
    a.setReducedMotion(true);
    disposeGeometry.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(disposeGradient).not.toHaveBeenCalled();
    expect(disposeOther).not.toHaveBeenCalled();
    expect(parent.children).toHaveLength(0);
    expect(a.group.children).toHaveLength(0);
    // RC-02 adds the folding kickstand as a second owned mesh.
    expect(meshes(b.group)).toHaveLength(2);
    b.update(riding(), .25);
  });
});
