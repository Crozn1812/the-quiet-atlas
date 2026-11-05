import RAPIER from "@dimforge/rapier3d-compat";
import { Color, DataTexture, InstancedMesh, Matrix4, MeshToonMaterial, Raycaster, Scene, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  addBridgeColliders, BRIDGE_CLEAR_WIDTH, BRIDGE_MAX_SLOPE, BRIDGE_RAIL_HEIGHT,
  BRIDGE_RAIL_OFFSET, createBridges,
} from "../../../src/features/world/bridges";
import { PALETTE } from "../../../src/features/world/art/palette";
import { PATH_BRIDGES, pathLength, pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { createController } from "../../../src/features/world/rapier";
import { HEIGHT } from "../../../src/features/world/scene";
import { waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";

const down = new Vector3(0, -1, 0);
const routeLength = pathLength();

describe("wooden path bridges", () => {
  it("gives every authored crossing visible instanced timbers and a curved walkable mesh, including one metre at both ends", () => {
    const bridges = createBridges();
    try {
      expect(bridges.bridges).toHaveLength(PATH_BRIDGES.length);
      for (const [i, bridge] of bridges.bridges.entries()) {
        const { profile, surface } = bridge;
        expect(profile.source).toBe(PATH_BRIDGES[i]);
        expect(bridge.mesh).toBeInstanceOf(InstancedMesh);
        expect(bridge.plankCount).toBeGreaterThan(0);
        expect(bridge.firstPlank + bridge.plankCount).toBeLessThanOrEqual(bridge.mesh.count);
        expect((profile.source.tStart - profile.tStart) * routeLength).toBeGreaterThanOrEqual(1 - 1e-10);
        expect((profile.tEnd - profile.source.tEnd) * routeLength).toBeGreaterThanOrEqual(1 - 1e-10);
        expect(surface.parent).toBeNull(); // Raycast helper must not cost a render submission.
        const positions = surface.geometry.getAttribute("position");
        profile.rows.forEach(({ t, centre }, row) => {
          const point = pathPointAt(t);
          expect(Math.hypot(centre.x - point.x, centre.z - point.z)).toBeLessThan(1e-10);
          const left = new Vector3().fromBufferAttribute(positions, row * 2);
          const right = new Vector3().fromBufferAttribute(positions, row * 2 + 1);
          expect(left.add(right).multiplyScalar(0.5).distanceTo(centre)).toBeLessThan(0.0001);
          for (const zone of ZONES) expect(centre.distanceTo(zone.position)).toBeGreaterThan(zone.radius + 1);
        });
      }
    } finally { bridges.dispose(); }
  });

  it("keeps the entire water crossing above water by at least 0.4 m, including the actual rendered planks", () => {
    const bridges = createBridges();
    try {
      bridges.group.updateMatrixWorld(true);
      for (const { profile, surface } of bridges.bridges) {
        for (let i = 0; i <= 80; i++) {
          const t = profile.source.tStart + (profile.source.tEnd - profile.source.tStart) * i / 80;
          const row = profile.sample(t);
          for (const offset of [-1.05, 0, 1.05]) {
            const point = row.centre.clone().addScaledVector(row.right, offset);
            const ray = new Raycaster(point.clone().add(new Vector3(0, 2, 0)), down);
            const rendered = ray.intersectObject(bridges.meshes[0]!)[0];
            const walkable = ray.intersectObject(surface)[0];
            expect(rendered).toBeDefined();
            expect(walkable).toBeDefined();
            expect(rendered!.point.y - waterLevelAt(point.z)).toBeGreaterThanOrEqual(0.4);
            expect(walkable!.point.y - waterLevelAt(point.z)).toBeGreaterThanOrEqual(0.4);
            expect(Math.abs(rendered!.point.y - walkable!.point.y)).toBeLessThan(0.015);
          }
        }
      }
    } finally { bridges.dispose(); }
  });

  it("keeps instanced faces front-facing from above without mirrored transforms", () => {
    const bridges = createBridges();
    try {
      const matrix = new Matrix4();
      for (const mesh of bridges.meshes) {
        const points = mesh.geometry.getAttribute("position");
        for (let instance = 0; instance < mesh.count; instance++) {
          mesh.getMatrixAt(instance, matrix);
          expect(matrix.determinant()).toBeGreaterThan(0);
          if (mesh === bridges.meshes[1]) continue; // Upright posts and handrails have faces in all directions.
          const normals = mesh.geometry.getAttribute("normal");
          for (let i = 0; i < points.count; i += 3) {
            if (normals.getY(i) < 0.99) continue;
            const a = new Vector3().fromBufferAttribute(points, i).applyMatrix4(matrix);
            const b = new Vector3().fromBufferAttribute(points, i + 1).applyMatrix4(matrix);
            const c = new Vector3().fromBufferAttribute(points, i + 2).applyMatrix4(matrix);
            expect(b.sub(a).cross(c.sub(a)).normalize().y).toBeGreaterThan(Math.cos(BRIDGE_MAX_SLOPE));
          }
        }
      }
    } finally { bridges.dispose(); }
  });

  it("lands flush with terrain, matches its grade, and limits all deck triangles to twelve degrees", () => {
    const bridges = createBridges();
    try {
      for (const { profile, surface } of bridges.bridges) {
        for (const [t, sign] of [[profile.tStart, 1], [profile.tEnd, -1]]) {
          const toe = profile.sample(t!);
          expect(toe.centre.y).toBeCloseTo(worldHeight(toe.centre.x, toe.centre.z), 8);
          const inside = profile.sample(t! + sign! * 0.01 / routeLength).centre;
          const outside = pathPointAt(t! - sign! * 0.01 / routeLength);
          const groundGrade = (worldHeight(outside.x, outside.z) - toe.centre.y) / -0.01;
          expect(Math.abs((inside.y - toe.centre.y) / 0.01 - groundGrade)).toBeLessThan(0.015);
        }
        const points = surface.geometry.getAttribute("position");
        const indices = surface.geometry.index!;
        for (let i = 0; i < indices.count; i += 3) {
          const a = new Vector3().fromBufferAttribute(points, indices.getX(i));
          const b = new Vector3().fromBufferAttribute(points, indices.getX(i + 1));
          const c = new Vector3().fromBufferAttribute(points, indices.getX(i + 2));
          const normal = b.sub(a).cross(c.sub(a)).normalize();
          expect(normal.y).toBeGreaterThanOrEqual(Math.cos(BRIDGE_MAX_SLOPE));
        }
        for (let i = 0; i <= 200; i++) {
          const point = profile.sample(profile.tStart + (profile.tEnd - profile.tStart) * i / 200).centre;
          expect(point.y).toBeGreaterThanOrEqual(worldHeight(point.x, point.z) - 1e-8);
        }
      }
    } finally { bridges.dispose(); }
  });

  it("spaces posts 1.2–1.6 m apart and leaves at least 2.2 m between visible handrails and colliders", () => {
    const bridges = createBridges();
    try {
      for (const { profile, colliders } of bridges.bridges) {
        for (const { side, posts } of profile.railings) {
          for (let i = 1; i < posts.length; i++) {
            const a = posts[i - 1]!;
            const b = posts[i]!;
            const postA = a.centre.clone().addScaledVector(a.right, side * BRIDGE_RAIL_OFFSET);
            const postB = b.centre.clone().addScaledVector(b.right, side * BRIDGE_RAIL_OFFSET);
            expect(postA.distanceTo(postB)).toBeGreaterThanOrEqual(1.2);
            expect(postA.distanceTo(postB)).toBeLessThanOrEqual(1.6);
          }
        }
        // Posts: half-width .06 + .0096 bow; handrails are narrower.
        expect(2 * (BRIDGE_RAIL_OFFSET - 0.06 - 0.0096)).toBeGreaterThanOrEqual(2.2);
        for (const collider of colliders.slice(1)) {
          for (let i = 0; i < collider.vertices.length; i += 12) {
            const row = profile.rows[i / 12]!;
            const inner = new Vector3().fromArray(collider.vertices, i);
            expect(Math.hypot(inner.x - row.centre.x, inner.z - row.centre.z)).toBeCloseTo(BRIDGE_CLEAR_WIDTH / 2, 4);
            expect(collider.vertices[i + 4]! - collider.vertices[i + 1]!).toBeCloseTo(BRIDGE_RAIL_HEIGHT, 5);
          }
        }
      }
    } finally { bridges.dispose(); }
  });

  it("has palette-only timber variation, sparse green edge moss and the shared soft ramp", () => {
    const bridges = createBridges();
    try {
      const color = new Color();
      const woodA = new Color(PALETTE.rockDark).lerp(new Color(PALETTE.dusk), 0.18);
      const woodB = new Color(PALETTE.rockDark).lerp(new Color(PALETTE.dusk), 0.24);
      const mossA = new Color(PALETTE.grass).lerp(new Color(PALETTE.forestDeep), 0.55);
      const mossB = new Color(PALETTE.grass).lerp(new Color(PALETTE.forestDeep), 0.70);
      for (const [meshIndex, mesh] of bridges.meshes.entries()) {
        expect(mesh.material).toBeInstanceOf(MeshToonMaterial);
        expect(mesh.material.gradientMap).toBeInstanceOf(DataTexture);
        expect((mesh.material.gradientMap as DataTexture).image.width).toBe(4);
        expect(mesh.material.vertexColors).toBe(true);
        expect(mesh.material.map).toBeNull();
        const colors = new Set<string>();
        for (let i = 0; i < mesh.count; i++) {
          mesh.getColorAt(i, color);
          colors.add(color.getHexString());
          const [a, b] = meshIndex === 2 ? [mossA, mossB] : [woodA, woodB];
          for (const channel of ["r", "g", "b"] as const) {
            expect(color[channel]).toBeGreaterThanOrEqual(Math.min(a[channel], b[channel]) - 1e-7);
            expect(color[channel]).toBeLessThanOrEqual(Math.max(a[channel], b[channel]) + 1e-7);
          }
        }
        expect(colors.size).toBeGreaterThan(1);
      }
      const matrix = new Matrix4();
      for (let i = 0; i < bridges.meshes[2]!.count; i++) {
        bridges.meshes[2]!.getMatrixAt(i, matrix);
        const point = new Vector3().setFromMatrixPosition(matrix);
        const nearest = bridges.bridges.flatMap(b => b.profile.rows).reduce((a, b) =>
          a.centre.distanceToSquared(point) < b.centre.distanceToSquared(point) ? a : b);
        const lateral = Math.abs(point.clone().sub(nearest.centre).dot(nearest.right));
        expect(lateral).toBeGreaterThan(1.1);
        expect(lateral).toBeLessThan(1.21);
      }
    } finally { bridges.dispose(); }
  });

  it("is deterministic through interleaved builds and has at most 3 draw calls / 6000 rendered triangles", () => {
    const first = createBridges(), second = createBridges();
    try {
      for (const [i, mesh] of first.meshes.entries()) {
        const other = second.meshes[i]!;
        expect(mesh.instanceMatrix.array).toEqual(other.instanceMatrix.array);
        expect(mesh.instanceColor!.array).toEqual(other.instanceColor!.array);
        expect(mesh.geometry.getAttribute("position").array).toEqual(other.geometry.getAttribute("position").array);
      }
      first.colliders.forEach((collider, i) => {
        expect(collider.vertices).toEqual(second.colliders[i]!.vertices);
        expect(collider.indices).toEqual(second.colliders[i]!.indices);
      });
      let draws = 0, triangles = 0;
      first.group.traverse(object => {
        if (!(object instanceof InstancedMesh)) return;
        draws++;
        triangles += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3 * object.count;
      });
      expect(draws).toBeLessThanOrEqual(3);
      expect(triangles).toBeLessThanOrEqual(6000);
      expect(first.budget).toEqual({ drawCalls: draws, triangles });
      console.info(`Bridges: ${first.bridges.length} crossings, ${draws} draw calls, ${triangles} rendered triangles`);
    } finally { first.dispose(); second.dispose(); }
  });

  it("matches Rapier deck heights and stops lateral rays at each rail without blocking the centre", async () => {
    await RAPIER.init();
    const bridges = createBridges();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const cleanup = addBridgeColliders(RAPIER, world, bridges.colliders);
    try {
      world.step();
      for (const { profile, surface } of bridges.bridges) {
        for (let i = 1; i < profile.rows.length - 1; i += 3) {
          const a = profile.rows[i]!, b = profile.rows[i + 1]!;
          const centre = a.centre.clone().add(b.centre).multiplyScalar(0.5);
          const origin = centre.clone().add(new Vector3(0, 2, 0));
          const hit = world.castRay(new RAPIER.Ray(origin, down), 3, true);
          const visual = new Raycaster(origin, down).intersectObject(surface)[0]!;
          expect(hit).not.toBeNull();
          expect(origin.y - hit!.timeOfImpact).toBeCloseTo(visual.point.y, 4);
          const chest = centre.clone().add(new Vector3(0, 0.55, 0));
          for (const side of [-1, 1]) {
            const hit = world.castRay(new RAPIER.Ray(chest, a.right.clone().multiplyScalar(side)), 2, true);
            expect(hit).not.toBeNull();
            expect(hit!.timeOfImpact).toBeGreaterThan(1.05);
            expect(hit!.timeOfImpact).toBeLessThan(1.15);
          }
          const forward = b.centre.clone().sub(a.centre).setY(0).normalize();
          expect(world.castRay(new RAPIER.Ray(chest, forward), 0.5, true)).toBeNull();
        }
      }
      cleanup(); cleanup();
      expect(world.colliders.len()).toBe(0);
    } finally { cleanup(); world.free(); bridges.dispose(); }
  });

  it("lets the real character controller walk along both curved spans and prevents a lateral fall", async () => {
    const bridges = createBridges();
    const controller = await createController();
    const cleanup = addBridgeColliders(controller.RAPIER, controller.world, bridges.colliders);
    try {
      for (const { profile } of bridges.bridges) {
        const start = profile.sample(profile.tStart + 0.2 / routeLength).centre;
        controller.teleport(start.clone().add(new Vector3(0, HEIGHT + 0.05, 0)));
        for (let i = 0; i < 40; i++) controller.step(0, 0, 1 / 60);
        for (let distance = 0.3; distance < profile.length - 0.3; distance += 0.05) {
          const target = profile.sample(profile.tStart + distance / routeLength).centre;
          const direction = target.clone().sub(controller.position).setY(0);
          controller.step(direction.x * 60, direction.z * 60, 1 / 60);
          expect(controller.position.y - target.y).toBeCloseTo(HEIGHT + 0.01, 1);
        }
        const end = profile.sample(profile.tEnd - 0.3 / routeLength).centre;
        expect(Math.hypot(controller.position.x - end.x, controller.position.z - end.z)).toBeLessThan(0.15);
        const middle = profile.sample(profile.source.t);
        for (const side of [-1, 1]) {
          controller.teleport(middle.centre.clone().add(new Vector3(0, HEIGHT + 0.02, 0)));
          for (let i = 0; i < 100; i++) controller.step(middle.right.x * side * 3, middle.right.z * side * 3, 1 / 60);
          const offset = controller.position.clone().sub(middle.centre).dot(middle.right);
          expect(Math.abs(offset)).toBeGreaterThan(0.6);
          expect(Math.abs(offset)).toBeLessThan(0.8);
          expect(controller.position.y).toBeGreaterThan(middle.centre.y + HEIGHT - 0.05);
        }
      }
    } finally { cleanup(); controller.dispose(); bridges.dispose(); }
  });

  it("disposes owned GPU resources once and keeps the shared ramp alive", () => {
    const bridges = createBridges();
    const scene = new Scene();
    scene.add(bridges.group);
    const disposed = bridges.meshes.map(mesh => {
      const spy = vi.fn(); mesh.geometry.addEventListener("dispose", spy); return spy;
    });
    const surfaces = bridges.bridges.map(b => {
      const spy = vi.fn(); b.surface.geometry.addEventListener("dispose", spy); return spy;
    });
    const material = vi.fn(), ramp = vi.fn();
    bridges.meshes[0]!.material.addEventListener("dispose", material);
    bridges.meshes[0]!.material.gradientMap!.addEventListener("dispose", ramp);
    bridges.dispose(); bridges.dispose();
    expect(bridges.group.parent).toBeNull();
    expect(bridges.group.children).toHaveLength(0);
    [...disposed, ...surfaces, material].forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    expect(ramp).not.toHaveBeenCalled();
  });
});
