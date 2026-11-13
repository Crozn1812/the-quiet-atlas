import { expect, it } from "vitest";
import { Box3, Mesh, Raycaster, Vector3 } from "three";
import { createSpring, springObstacleBounds } from "../../../src/features/world/terrain/spring";
import { nearestPath } from "../../../src/features/world/terrain/samples";
import { riverTangentAt } from "../../../src/features/world/layout/river";

it("matches merged cliff picking exactly across the outlet, ridge and transformed scene", () => {
  const spring = createSpring();
  const reference = new Mesh(spring.cliff.geometry, spring.cliff.material);
  const ray = new Raycaster();
  let hits = 0, visits = 0, oldVisits = 0, newVisits = 0;
  const getVertexPosition = Mesh.prototype.getVertexPosition;
  Mesh.prototype.getVertexPosition = function (index, target) {
    visits++;
    return getVertexPosition.call(this, index, target);
  };
  try {
    for (const transformed of [false, true]) {
      if (transformed) {
        spring.group.position.set(7, -2, 11);
        spring.group.rotation.y = 0.4;
        spring.group.scale.set(1.2, 0.9, 1.1);
      }
      spring.group.updateMatrixWorld(true);
      reference.matrixWorld.copy(spring.cliff.matrixWorld);
      for (let x = -55; x <= 55; x += 5) for (let y = -5; y <= 45; y += 5) {
        const origin = spring.origin.clone().add(new Vector3(0, 2, 12)).applyMatrix4(spring.cliff.matrixWorld);
        const target = spring.origin.clone().add(new Vector3(x, y, -40)).applyMatrix4(spring.cliff.matrixWorld);
        ray.set(origin, target.sub(origin).normalize());
        // Exercise near/far rejection as well as a ray starting inside the overall bound.
        ray.near = y < 0 ? 4 : 0; ray.far = x < 0 ? 80 : 150;
        visits = 0;
        const expected = ray.intersectObject(reference, false);
        oldVisits += visits;
        visits = 0;
        const actual = ray.intersectObject(spring.cliff, false);
        newVisits += visits;
        expect(actual.length).toBe(expected.length);
        hits += actual.length;
        actual.forEach((hit, i) => {
          const old = expected[i]!;
          expect(hit.object).toBe(spring.cliff);
          expect(hit.distance).toBeCloseTo(old.distance, 9);
          expect(hit.point.distanceTo(old.point)).toBeLessThan(1e-9);
          expect(hit.faceIndex).toBe(old.faceIndex);
          expect(hit.face).toEqual(old.face);
          expect(hit.normal).toEqual(old.normal);
          expect(hit.uv).toEqual(old.uv);
        });
      }
    }
    expect(hits).toBeGreaterThan(100);
    expect(newVisits).toBeLessThan(oldVisits * 0.5);
    console.info(`FL-03 raycast vertex visits: ${oldVisits} -> ${newVisits}`);
  } finally { Mesh.prototype.getVertexPosition = getVertexPosition; spring.dispose(); }
});

it("keeps the 20-40 m mountain and its solids off the walking route with an open outlet", () => {
  const spring = createSpring();
  try {
    const bounds = new Box3().setFromObject(spring.cliff);
    expect(bounds.getSize(new Vector3()).y).toBeCloseTo(39, 5);
    expect(spring.colliders).toHaveLength(10);
    const p = spring.cliff.geometry.getAttribute("position"), ridgeAxis = new Vector3(9, 0, -7).normalize();
    const across = Array.from({ length: p.count }, (_, i) => p.getX(i) * ridgeAxis.x + p.getZ(i) * ridgeAxis.z);
    expect(Math.max(...across) - Math.min(...across)).toBeGreaterThan(80);
    const sweep = springObstacleBounds(spring.cliff, 0.35, 0.9)!;
    expect(sweep).toHaveLength(10);
    expect(springObstacleBounds(spring.cliff, 0.35, 0.9)).toBe(sweep);
    const tallerSweep = springObstacleBounds(spring.cliff, 0.35, 1.2)!;
    expect(tallerSweep[0]!.min.y).toBeCloseTo(sweep[0]!.min.y - 0.6);
    expect(tallerSweep[0]!.max.y).toBe(sweep[0]!.max.y);
    expect(sweep.every(box => !box.isEmpty())).toBe(true);
    for (const solid of spring.colliders) {
      expect(nearestPath(solid.center.x, solid.center.z).distance - solid.radius).toBeGreaterThan(2.6);
    }
    const forward = riverTangentAt(0);
    const right = new Vector3(-forward.z, 0, forward.x);
    for (const solid of spring.colliders.slice(0, 2)) {
      expect(Math.abs(solid.center.clone().sub(spring.origin).dot(right)) - solid.radius).toBeGreaterThan(0.6);
    }
    expect(spring.cliff.geometry.getAttribute("position").count / 3).toBeLessThan(4000);
    const meshes = spring.group.children.filter((child): child is Mesh => child instanceof Mesh);
    const triangles = meshes.reduce((sum, mesh) => sum
      + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
    expect(meshes.length).toBeLessThanOrEqual(4);
    expect(triangles).toBeLessThanOrEqual(4500);
    console.info(`FL-03 source: ${triangles} triangles, ${meshes.length} draws, 0 public asset bytes`);
  } finally { spring.dispose(); spring.dispose(); }
  expect(spring.group.children).toHaveLength(0);
});
