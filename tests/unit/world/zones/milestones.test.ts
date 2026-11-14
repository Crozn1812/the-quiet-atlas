import { BufferGeometry, Mesh, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { surfaceHeight } from "../../../../src/features/world/scene/compose";
import { placeZoneScenes } from "../../../../src/features/world/zones";
import { createMilestonesScene, milestoneCertificates, STATUE_YAW } from "../../../../src/features/world/zones/milestones";
import type { ZoneSceneContext } from "../../../../src/features/world/zones/types";

const context: ZoneSceneContext = { seed: 104, heightAt: () => 0, onPath: x => Math.abs(x) <= 2.6, underWater: () => false };
describe("Milestones hillside integration", () => {
  it("preserves the existing plinth, pine collider and E point on flat terrain", () => {
    const scene = createMilestonesScene(context);
    try {
      expect(scene.colliders).toHaveLength(2);
      expect(scene.colliders[0]!.center.distanceTo(new Vector3(4.7, .5, 0))).toBeLessThan(.0001);
      expect(scene.colliders[0]!.size.distanceTo(new Vector3(2.2, 1, 2.8))).toBeLessThan(.0001);
      expect(scene.colliders[0]!.yaw).toBe(STATUE_YAW);
      expect(scene.interactable.position).toEqual(new Vector3(4.7, 1.38, 0));
      expect(scene.interactable.label.en).toBe("Milestone rocks");
      expect(scene.colliders[1]!.center.distanceTo(new Vector3(15.013864, 2.1, 2.7))).toBeLessThan(.001);
    } finally { scene.dispose(); }
  });
  it("preserves the exact shipped placement and colliders on the real hillside", () => {
    const [scene] = placeZoneScenes(surfaceHeight, ["milestones"]);
    try {
      expect(scene!.interactable.position).toEqual(new Vector3(-4.7, 1.3131703662362746, 4));
      expect(scene!.colliders[0]!.center).toEqual(new Vector3(-4.7, .44695464531459406, 4));
      expect(scene!.colliders[0]!.size).toEqual(new Vector3(2.200000047683716, 1.0239800953598452, 2.799999952316284));
      expect(scene!.colliders[1]!.center).toEqual(new Vector3(-15.013864040374756, 2.5796701312065125, 6.700000047683716));
      const statue = scene!.group.getObjectByName("milestones-walking-statue")!;
      expect(statue.position.x).toBe(-4.7); expect(statue.position.z).toBe(4);
    } finally { scene!.dispose(); }
  });
  it.each([0, 1, 104, 65535])("seed %i keeps eight batches and the static hillside in budget", seed => {
    const scene = createMilestonesScene({ ...context, seed });
    try {
      const meshes: Mesh[] = [];
      scene.group.traverse(node => { if (node instanceof Mesh) meshes.push(node); });
      expect(meshes).toHaveLength(8);
      expect(meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0)).toBeLessThan(6000);
      const matrices = meshes.map(mesh => mesh.matrix.toArray());
      for (const reduced of [true, false]) for (let i = 0; i < 60; i++) scene.update?.(1 / 60, reduced);
      expect(meshes.map(mesh => mesh.matrix.toArray())).toEqual(matrices);
    } finally { scene.dispose(); }
  });
  it("releases owned meshes exactly once and leaves sibling scenes alive", () => {
    const scene = createMilestonesScene(context), sibling = createMilestonesScene(context);
    const spies: ReturnType<typeof vi.spyOn>[] = [];
    scene.group.traverse(node => { if (node instanceof Mesh) spies.push(vi.spyOn(node.geometry, "dispose")); });
    scene.dispose(); scene.dispose();
    expect(spies.every(spy => spy.mock.calls.length === 1)).toBe(true);
    expect(sibling.group.children.length).toBeGreaterThan(0); sibling.dispose(); vi.restoreAllMocks();
  });
  it("releases construction geometry when no dry hillside is available", () => {
    const spy = vi.spyOn(BufferGeometry.prototype, "dispose");
    expect(() => createMilestonesScene({ ...context, underWater: () => true })).toThrow(RangeError);
    expect(spy).toHaveBeenCalled(); vi.restoreAllMocks();
  });
  it("adapts certificate inscriptions and achievement state entirely from content", () => {
    expect(milestoneCertificates().map(piece => [piece.inscription, piece.achieved])).toEqual([
      ["CCNA", true], ["VTI DEVOPS", true], ["AWS SAA", false], ["LINUX CEH", false],
    ]);
    expect(milestoneCertificates({ profiles: [{ locale: "en", certificates: [] }] })).toEqual([]);
  });
});
