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
import { createShoreRockGeometry } from "../../../src/features/world/shore/geometry";

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

  it("leaves the road verge and dry headland exposed by emitting no sand overlays", () => {
    // B2-193 uses terrain vertex pigment instead of a second sand surface.
    // With no patches there are no edges to feather, floating faces or road overlaps.
    expect(layout.sand).toEqual([]);
    // No overlay mesh at all: no edges to feather, no floating faces, no road overlap.
    expect(shore.group.getObjectByName("shore-sand-overlay")).toBeUndefined();
  });

  it("is deterministic without runtime random state", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("runtime random"); });
    try { expect(createShoreLayout()).toEqual(layout); }
    finally { random.mockRestore(); }
  });
});

describe("shore rendering and lifecycle", () => {
  it.each([4, 6] as const)("retains the legacy %i-sided rock collider bounds within 5%%", sides => {
    const geometry = createShoreRockGeometry(sides);
    try {
      const bounds = geometry.boundingBox!;
      const legacyMin = [-0.5, 0, -0.5], legacyMax = [0.5, 1, 0.5];
      bounds.min.toArray().forEach((value, axis) => expect(Math.abs(value - legacyMin[axis]!)).toBeLessThanOrEqual(0.05));
      bounds.max.toArray().forEach((value, axis) => expect(Math.abs(value - legacyMax[axis]!)).toBeLessThanOrEqual(0.05));
      bounds.getSize(new Vector3()).toArray().forEach(value => expect(value).toBeCloseTo(1, 6));
      expect(geometry.boundingSphere!.radius).toBeGreaterThan(0);
    } finally { geometry.dispose(); }
  });

  it("keeps the High world triangle increase below 25% in Node", async () => {
    const { Scene } = await import("three");
    const { createWorldScene, surfaceHeight } = await import("../../../src/features/world/scene/compose");
    const { createMeshPhysics } = await import("../../../src/features/world/scene/mesh-physics");
    const { createFarLandscape } = await import("../../../src/features/world/scene/far-landscape");
    const { placeDressing } = await import("../../../src/features/world/dressing");
    const { placeZoneScenes, zoneFoliageBounds } = await import("../../../src/features/world/zones");
    const scene = new Scene(), dressing = placeDressing(), zones = placeZoneScenes(surfaceHeight);
    const far = createFarLandscape();
    scene.add(...dressing.groups, ...zones.map(zone => zone.group), far.mesh);
    const composed = createWorldScene({ ...createMeshPhysics(), scene, quality: "High", zoneBounds: zoneFoliageBounds(zones) });
    try {
      // The only production geometry change is shore; legacy rocks cost 20/32 triangles.
      const oldShore = layout.pebbles.length * 20
        + (layout.boulders.length + layout.cairns.flatMap(cairn => cairn.stones).length) * 32;
      const newShore = shore.budget.triangles;
      for (const t of [0, 0.9]) {
        composed.update(pathPointAt(t), 0);
        let after = 0;
        scene.traverseVisible(object => {
          if (object instanceof Mesh) after += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3
            * (object instanceof InstancedMesh ? object.count : 1);
        });
        const before = after - newShore + oldShore;
        expect(after).toBeLessThanOrEqual(before * 1.25);
        console.info(`High world t=${t}: ${before} -> ${after} triangles; shore ${oldShore} -> ${newShore} (legacy rock comparison).`);
      }
    } finally { composed.dispose(); dressing.dispose(); zones.forEach(zone => zone.dispose()); far.dispose(); }
  }, 60_000);

  it("measures instance-expanded triangles and mesh slots, with only two non-empty meshes", () => {
    let triangles = 0, nonEmptyMeshes = 0, meshes = 0;
    shore.group.traverse(object => {
      if (!(object instanceof Mesh)) return;
      expect(object.castShadow).toBe(false);
      expect(Array.isArray(object.material)).toBe(false);
      expect(object.geometry.groups).toHaveLength(0);
      const vertices = object.geometry.index?.count ?? object.geometry.getAttribute("position").count;
      triangles += vertices / 3
        * (object instanceof InstancedMesh ? object.count : 1);
      if (vertices > 0) nonEmptyMeshes++;
      meshes++;
    });
    // B2-193 removed the sand overlay mesh: pebbles + boulders/cairns only.
    // Node counts drawable geometry; GPU draw calls require renderer validation.
    expect(shore.budget).toEqual({ triangles, drawCalls: meshes });
    expect(nonEmptyMeshes).toBe(2);
    expect(meshes).toBe(2);
    expect(meshes).toBeLessThanOrEqual(SHORE_BUDGET.drawCalls);
    expect(triangles).toBeLessThanOrEqual(SHORE_BUDGET.triangles);
    expect(triangles).toBeGreaterThan(15_000);
    console.info(`Shore budget: ${meshes} mesh slots, ${nonEmptyMeshes} non-empty meshes, ${triangles} triangles; ${layout.pebbles.length} pebbles, ${layout.boulders.length} boulders, ${layout.cairns.length} cairns.`);
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
