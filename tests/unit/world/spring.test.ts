import { expect, it } from "vitest";
import { Box3, Mesh, Vector3 } from "three";
import { createSpring } from "../../../src/features/world/terrain/spring";
import { nearestPath } from "../../../src/features/world/terrain/samples";
import { riverTangentAt } from "../../../src/features/world/layout/river";

it("keeps the 4–8 m faceted spring and its solids off the walking route with an open outlet", () => {
  const spring = createSpring();
  try {
    const bounds = new Box3().setFromObject(spring.cliff);
    expect(bounds.getSize(new Vector3()).y).toBeCloseTo(7.5, 5);
    expect(spring.colliders).toHaveLength(7);
    for (const solid of spring.colliders) {
      expect(nearestPath(solid.center.x, solid.center.z).distance - solid.radius).toBeGreaterThan(2.6);
    }
    const forward = riverTangentAt(0);
    const right = new Vector3(-forward.z, 0, forward.x);
    for (const solid of spring.colliders.slice(0, 2)) {
      expect(Math.abs(solid.center.clone().sub(spring.origin).dot(right)) - solid.radius).toBeGreaterThan(0.6);
    }
    expect(spring.cliff.geometry.getAttribute("position").count / 3).toBeLessThan(800);
    const meshes = spring.group.children.filter((child): child is Mesh => child instanceof Mesh);
    const triangles = meshes.reduce((sum, mesh) => sum
      + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
    expect(meshes.length).toBeLessThanOrEqual(4);
    expect(triangles).toBeLessThanOrEqual(2000);
    console.info(`FL-02 source: ${triangles} triangles, ${meshes.length} draws, 0 public asset bytes`);
  } finally { spring.dispose(); spring.dispose(); }
  expect(spring.group.children).toHaveLength(0);
});
