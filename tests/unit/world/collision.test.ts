import { expect, it } from "vitest";
import { createObstacles, HEIGHT } from "../../../src/features/world/scene";
import { createController as rapier } from "../../../src/features/world/rapier";
import { createController as raycast } from "../../../src/features/world/raycast";
import { FIXED_DT } from "../../../src/features/world/timestep";
for (const variant of ["rapier", "raycast"] as const) {
  it(`${variant}: stays on floor and ascends shared ramp`, async () => {
    const meshes = createObstacles();
    const controller = await (variant === "rapier" ? rapier() : raycast(meshes));
    try {
      for (let i = 0; i < 60; i++) controller.step(0, 0, FIXED_DT);
      expect(controller.position.y).toBeCloseTo(HEIGHT + 0.01, 1);
      for (let i = 0; i < 150; i++) controller.step(0, -3, FIXED_DT);
      expect(controller.position.y).toBeGreaterThan(HEIGHT + 0.3);
    } finally {
      controller.dispose();
      for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
    }
  });
  it(`${variant}: blocks a column`, async () => {
    const meshes = createObstacles();
    const controller = await (variant === "rapier" ? rapier() : raycast(meshes));
    try {
      for (let i = 0; i < 60; i++) controller.step(3, 0, FIXED_DT);
      for (let i = 0; i < 180; i++) controller.step(0, -3, FIXED_DT);
      expect(controller.position.z).toBeGreaterThan(-1.3);
      expect(controller.position.z).toBeLessThan(-1);
    } finally {
      controller.dispose();
      for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
    }
  });
}
