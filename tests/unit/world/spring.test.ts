import { expect, it } from "vitest";
import { Box3, Mesh, Vector3 } from "three";
import { createSpring, springObstacleBounds } from "../../../src/features/world/terrain/spring";
import { nearestPath } from "../../../src/features/world/terrain/samples";
import { riverTangentAt } from "../../../src/features/world/layout/river";

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
