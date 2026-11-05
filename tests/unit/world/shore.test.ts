import { Color, InstancedMesh, Matrix4, Mesh, Vector3 } from "three";
import { afterAll, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";
import { nearestPath } from "../../../src/features/world/terrain/samples";
import { PATH_CLEARANCE } from "../../../src/features/world/zones/types";
import { createShore, createShoreLayout, SHORE_BUDGET, SHORE_ZONE_MARGIN } from "../../../src/features/world/shore";
import { sampleShoreContour, shoreGroundHeight } from "../../../src/features/world/shore/contour";

const shore = createShore();
const { layout } = shore;
afterAll(() => shore.dispose());

function expectClear(x: number, z: number, radius: number) {
  expect(nearestPath(x, z).distance).toBeGreaterThan(PATH_CLEARANCE + radius);
  for (const zone of ZONES) expect(Math.hypot(x - zone.position.x, z - zone.position.z))
    .toBeGreaterThan(zone.radius + SHORE_ZONE_MARGIN + radius);
}

describe("rocky shore layout", () => {
  it("keeps every 0.1–0.4 m pebble within 10 m of a genuine zero contour", () => {
    expect(layout.pebbles.length).toBeGreaterThan(800);
    for (const pebble of layout.pebbles) {
      expect(Math.abs(worldHeight(pebble.shore.x, pebble.shore.z))).toBeLessThan(0.0001);
      expect(Math.hypot(pebble.x - pebble.shore.x, pebble.z - pebble.shore.z)
        + Math.hypot(pebble.size[0], pebble.size[2]) / 2).toBeLessThan(10);
      expect(pebble.size[0]).toBeGreaterThanOrEqual(0.1);
      expect(Math.max(...pebble.size)).toBeLessThanOrEqual(0.4);
      expectClear(pebble.x, pebble.z, Math.hypot(pebble.size[0], pebble.size[2]) / 2);
    }
  });

  it("has a denser ±4 m core and a sparse dry shoulder, with shallow submerged stones", () => {
    const core = layout.pebbles.filter(p => Math.abs(p.offset) <= 4);
    const outer = layout.pebbles.filter(p => p.offset > 4);
    expect(core.length / 8).toBeGreaterThan(outer.length / 5 * 2);
    expect(outer.length).toBeGreaterThan(50);
    const wet = layout.pebbles.filter(p => worldHeight(p.x, p.z) < 0);
    expect(wet.length).toBeGreaterThan(100);
    expect(wet.every(p => worldHeight(p.x, p.z) >= -0.28)).toBe(true);
    expect(wet.some(p => p.y + p.size[1] < 0)).toBe(true);
    expect(wet.some(p => p.y + p.size[1] > 0)).toBe(true);
  });

  it("covers the full sea and returning bay contours rather than one selected beach", () => {
    const contour = sampleShoreContour();
    const points = contour.flatMap(segment => [segment.a, segment.b]);
    expect(Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x))).toBeGreaterThan(790);
    // The inlet reaches well inland of the open coast.
    expect(Math.max(...points.map(p => p.z)) - Math.min(...points.map(p => p.z))).toBeGreaterThan(100);
    for (let i = 0; i < contour.length; i += 17) {
      const p = contour[i]!.a;
      if (nearestPath(p.x, p.z).distance < 12 || ZONES.some(zone =>
        Math.hypot(p.x - zone.position.x, p.z - zone.position.z) < zone.radius + 14)) continue;
      expect(Math.min(...layout.pebbles.map(rock => Math.hypot(rock.x - p.x, rock.z - p.z))))
        .toBeLessThan(18);
    }
  });

  it("places complete clusters of 2–5 faceted 0.8–2.5 m boulders at shore and left mountain foot", () => {
    const clusters = new Map<number, number>();
    for (const rock of layout.boulders) {
      clusters.set(rock.cluster, (clusters.get(rock.cluster) ?? 0) + 1);
      expect(rock.size[0]).toBeGreaterThanOrEqual(0.8);
      expect(Math.max(...rock.size)).toBeLessThanOrEqual(2.5);
      expectClear(rock.x, rock.z, Math.hypot(rock.size[0], rock.size[2]) / 2);
      if (rock.site === "mountain") {
        const path = nearestPath(rock.x, rock.z);
        const f = pathPointAt(Math.min(1, path.t + 0.001)).sub(pathPointAt(path.t - 0.001)).normalize();
        expect((rock.x - path.x) * f.z - (rock.z - path.z) * f.x).toBeGreaterThan(25);
        expect(worldHeight(rock.x, rock.z)).toBeGreaterThan(waterLevelAt(rock.z));
      } else expect(Math.abs(worldHeight(rock.x, rock.z))).toBeLessThan(1.5);
    }
    expect(layout.boulders.filter(r => r.site === "shore").length).toBeGreaterThan(10);
    expect(layout.boulders.filter(r => r.site === "mountain").length).toBeGreaterThan(8);
    for (const count of clusters.values()) { expect(count).toBeGreaterThanOrEqual(2); expect(count).toBeLessThanOrEqual(5); }
  });

  it("places 1–2 cairns of 5–7 contacting stones, 1–1.4 m tall on dry grass beside t=.86–.9", () => {
    expect(layout.cairns.length).toBeGreaterThanOrEqual(1);
    expect(layout.cairns.length).toBeLessThanOrEqual(2);
    for (const cairn of layout.cairns) {
      const actualT = nearestPath(cairn.x, cairn.z).t;
      expect(cairn.t).toBe(actualT);
      expect(actualT).toBeGreaterThanOrEqual(0.86);
      expect(actualT).toBeLessThanOrEqual(0.9);
      expect(cairn.y).toBeGreaterThan(waterLevelAt(cairn.z));
      expect(worldHeight(cairn.x, cairn.z)).toBeGreaterThan(0);
      // Existing terrain pigment becomes fully grassy above the 1.6 m sand fade.
      expect(shoreGroundHeight(cairn.x, cairn.z)).toBeGreaterThan(1.6);
      expectClear(cairn.x, cairn.z, Math.SQRT2 * 1.05 / 2);
      expect(cairn.stones.length).toBeGreaterThanOrEqual(5);
      expect(cairn.stones.length).toBeLessThanOrEqual(7);
      expect(cairn.height).toBeGreaterThanOrEqual(1);
      expect(cairn.height).toBeLessThanOrEqual(1.4);
      for (let i = 1; i < cairn.stones.length; i++) expect(cairn.stones[i]!.y)
        .toBeCloseTo(cairn.stones[i - 1]!.y + cairn.stones[i - 1]!.size[1], 10);
      const top = cairn.stones.at(-1)!;
      expect(top.y + top.size[1] - cairn.y).toBeCloseTo(cairn.height, 10);
    }
  });

  it("lays several 6–15 m sand patches on the bay side and conforms to terrain triangles", () => {
    expect(layout.sand).toHaveLength(3);
    for (const patch of layout.sand) {
      expect(patch.width).toBeGreaterThanOrEqual(6);
      expect(patch.width).toBeLessThanOrEqual(15);
      const p = nearestPath(patch.x, patch.z);
      expect(p.t).toBeGreaterThan(0.82);
      const f = pathPointAt(Math.min(1, p.t + 0.001)).sub(pathPointAt(p.t - 0.001)).normalize();
      expect(-(patch.x - p.x) * f.z + (patch.z - p.z) * f.x).toBeGreaterThan(12);
    }
    for (let i = 1; i < layout.sand.length; i++) expect(Math.hypot(layout.sand[i]!.x - layout.sand[i - 1]!.x,
      layout.sand[i]!.z - layout.sand[i - 1]!.z)).toBeGreaterThan(20);
    const sand = shore.group.getObjectByName("shore-sand-overlay") as Mesh;
    const positions = sand.geometry.getAttribute("position");
    expect(positions.count).toBeGreaterThan(200);
    for (let i = 0; i < positions.count; i += 3) {
      const a = new Vector3().fromBufferAttribute(positions, i);
      const b = new Vector3().fromBufferAttribute(positions, i + 1);
      const c = new Vector3().fromBufferAttribute(positions, i + 2);
      // The whole planar triangle, not just its vertices, stays 2.5 cm above ground.
      const middle = a.clone().add(b).add(c).divideScalar(3);
      expect(middle.y - shoreGroundHeight(middle.x, middle.z)).toBeCloseTo(0.025, 3);
      expectClear(middle.x, middle.z, 0);
    }
  });

  it("is deterministic without runtime random state", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("runtime random"); });
    try { expect(createShoreLayout()).toEqual(layout); }
    finally { random.mockRestore(); }
  });
});

describe("shore rendering and lifecycle", () => {
  it("measures actual instance-expanded triangles and draw calls within budget", () => {
    let triangles = 0, draws = 0;
    shore.group.traverse(object => {
      if (!(object instanceof Mesh)) return;
      expect(object.castShadow).toBe(false);
      expect(Array.isArray(object.material)).toBe(false);
      expect(object.geometry.groups).toHaveLength(0);
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3
        * (object instanceof InstancedMesh ? object.count : 1);
      draws++;
    });
    expect(shore.budget).toEqual({ triangles, drawCalls: draws });
    expect(draws).toBeLessThanOrEqual(SHORE_BUDGET.drawCalls);
    expect(triangles).toBeLessThanOrEqual(SHORE_BUDGET.triangles);
    expect(triangles).toBeGreaterThan(15_000);
    console.info(`Shore budget: ${draws} draw calls, ${triangles} triangles; ${layout.pebbles.length} pebbles, ${layout.boulders.length} boulders, ${layout.cairns.length} cairns.`);
  });

  it("uses a soft 4-step ramp, neutral facet colors and only rock/rockDark/sand pigment", () => {
    const allowed = [new Color(PALETTE.rockDark), new Color(PALETTE.rock), new Color(PALETTE.sand)];
    for (const object of shore.group.children) {
      const mesh = object as Mesh;
      const material = mesh.material as import("three").MeshToonMaterial;
      expect(material.gradientMap).toMatchObject({ image: { width: 4 } });
      if (!(mesh instanceof InstancedMesh)) { expect(material.color.getHexString()).toBe(PALETTE.sand.slice(1).toLowerCase()); continue; }
      const color = new Color();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getColorAt(i, color);
        const p = new Vector3(color.r, color.g, color.b);
        const distances = [0, 1].map(j => {
          const a = new Vector3(allowed[j]!.r, allowed[j]!.g, allowed[j]!.b);
          const b = new Vector3(allowed[j + 1]!.r, allowed[j + 1]!.g, allowed[j + 1]!.b);
          const delta = b.sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(delta) / delta.lengthSq()));
          return p.distanceTo(a.addScaledVector(delta, t));
        });
        expect(Math.min(...distances)).toBeLessThan(0.000001);
      }
      const colors = mesh.geometry.getAttribute("color");
      for (let i = 0; i < colors.count; i++) { expect(colors.getX(i)).toBe(colors.getY(i)); expect(colors.getY(i)).toBe(colors.getZ(i)); }
    }
  });

  it("exports only boulder/cairn world-space colliders that enclose their geometry", () => {
    expect(shore.colliders).toHaveLength(layout.boulders.length + layout.cairns.length);
    const rocks = shore.group.getObjectByName("shore-boulders-and-cairns") as InstancedMesh;
    const vertices = rocks.geometry.getAttribute("position");
    const matrix = new Matrix4();
    for (let i = 0; i < rocks.count; i++) {
      rocks.getMatrixAt(i, matrix);
      const stone = i < layout.boulders.length ? layout.boulders[i]!
        : layout.cairns.flatMap(cairn => cairn.stones)[i - layout.boulders.length]!;
      const collider = i < layout.boulders.length ? shore.colliders[i]!
        : shore.colliders.find(box => box.kind === "cairn" && box.center.x === stone.x && box.center.z === stone.z)!;
      const rotation = new Matrix4().makeRotationY(-(collider.yaw ?? 0));
      for (let j = 0; j < vertices.count; j++) {
        const local = new Vector3().fromBufferAttribute(vertices, j).applyMatrix4(matrix).sub(collider.center).applyMatrix4(rotation);
        expect(Math.abs(local.x)).toBeLessThanOrEqual(collider.size.x / 2 + 0.0001);
        expect(Math.abs(local.y)).toBeLessThanOrEqual(collider.size.y / 2 + 0.0001);
        expect(Math.abs(local.z)).toBeLessThanOrEqual(collider.size.z / 2 + 0.0001);
      }
    }
  });

  it("releases owned instance buffers, geometries and materials once, without disposing shared ramps", () => {
    const own = createShore();
    const resources = new Set<{ dispose(): void }>();
    own.group.traverse(object => {
      if (!(object instanceof Mesh)) return;
      resources.add(object.geometry);
      resources.add(object.material as import("three").Material);
      if (object instanceof InstancedMesh) resources.add(object);
    });
    const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
    const material = (own.group.children[0] as Mesh).material as import("three").MeshToonMaterial;
    const sharedRamp = vi.spyOn(material.gradientMap!, "dispose");
    const parent = new Mesh(); parent.add(own.group);
    own.dispose(); own.dispose();
    expect(own.group.parent).toBeNull();
    expect(own.group.children).toHaveLength(0);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(sharedRamp).not.toHaveBeenCalled();
    sharedRamp.mockRestore();
  });
});
