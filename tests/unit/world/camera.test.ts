import { expect, it } from "vitest";
import { Vector3, Raycaster } from "three";
import { clampZoom, wrapYaw, springArm, selectOccludingCrowns, MIN_ZOOM, MAX_ZOOM } from "../../../src/features/world/camera";
import { createTerrain, createTerrainMesh } from "../../../src/features/world/terrain";

it("wraps yaw through repeated full turns without a direction discontinuity", () => {
  let yaw = 0;
  for (let i = 0; i < 2000; i++) {
    const next = wrapYaw(yaw + 0.1);
    expect(Math.sin(next)).toBeCloseTo(Math.sin(yaw + 0.1), 10);
    expect(Math.cos(next)).toBeCloseTo(Math.cos(yaw + 0.1), 10);
    expect(next).toBeGreaterThanOrEqual(0);
    expect(next).toBeLessThan(2 * Math.PI);
    yaw = next;
  }
  expect(wrapYaw(-Math.PI / 2)).toBeCloseTo(1.5 * Math.PI);
});

it("clamps requested zoom at both named limits", () => {
  expect(clampZoom(-100)).toBe(MIN_ZOOM);
  expect(clampZoom(100)).toBe(MAX_ZOOM);
  expect(clampZoom(9)).toBe(9);
});

it("retracts before a terrain ray hit and damps extension", () => {
  const mesh = createTerrainMesh(createTerrain());
  try {
    const hit = new Raycaster(new Vector3(0.23, 4, 4.31), new Vector3(0, -1, 0)).intersectObject(mesh)[0]!;
    expect(springArm(12, 12, hit.distance, 1 / 60)).toBeCloseTo(3.75);
    const extending = springArm(3.75, 12, undefined, 1 / 60);
    expect(extending).toBeGreaterThan(3.75);
    expect(extending).toBeLessThan(12);
    expect(springArm(12, 4, undefined, 1 / 60)).toBe(4);
  } finally {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});

it("selects crowns between camera and character, excluding behind and off-axis crowns", () => {
  const trees = [5, -5, 15].map(z => ({ x: 0, y: 0, z, height: 4, radius: 0.28 }));
  trees.push({ x: 8, y: 0, z: 5, height: 4, radius: 0.28 });
  expect(selectOccludingCrowns(trees, new Vector3(0, 4, 10), new Vector3(0, 4, 0))).toEqual([0]);
});
