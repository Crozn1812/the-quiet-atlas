import { Color, CylinderGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, PerspectiveCamera, PlaneGeometry, Scene, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { describe, expect, it, vi } from "vitest";
import { firstLightBarkGeometry } from "../../../src/features/world/foliage/first-light-bark";
import { createForestFloor, forestFloorPlantingBounds } from "../../../src/features/world/foliage/ground-litter";
import { ZONES } from "../../../src/features/world/layout/zones";

describe("HR foliage audit regressions", () => {
  it("extracts brown branch surfaces without repainting leaves or changing the source", () => {
    const stem = new CylinderGeometry(0.12, 0.3, 4, 20).toNonIndexed();
    const leaf = new PlaneGeometry(1, 1).toNonIndexed().translate(0, 3, 0);
    for (const [geometry, pigment] of [[stem, new Color("#887762")], [leaf, new Color("#5e8c6a")]] as const) {
      geometry.setAttribute("color", new Float32BufferAttribute(Array.from({ length: geometry.getAttribute("position").count }, () => pigment.toArray()).flat(), 3));
    }
    const merged = mergeGeometries([stem, leaf])!, original = merged.getAttribute("position").array.slice();
    const bark = firstLightBarkGeometry(merged, new Color(1, 1, 1));
    expect(bark.getAttribute("position").count).toBe(stem.getAttribute("position").count);
    expect(merged.getAttribute("position").array).toEqual(original);
    for (const name of ["position", "normal", "uv"]) expect(Array.from(bark.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    expect(bark.boundingBox!.getSize(new Vector3()).y).toBeCloseTo(4);
    bark.dispose(); merged.dispose(); stem.dispose(); leaf.dispose();
  });

  it("rebuilds a settled grass cell when the deferred porch arrives, including its rotated footprint", () => {
    const scene = new Scene(), camera = new PerspectiveCamera(70, 16 / 9, 0.1, 100);
    const anchor = ZONES.find(z => z.id === "horizon")!.position;
    camera.position.copy(anchor).add(new Vector3(0, 2, 0));
    camera.lookAt(anchor.x, anchor.y, anchor.z - 10); camera.updateMatrixWorld();
    const floor = createForestFloor(scene), timer = vi.spyOn(performance, "now").mockReturnValue(0);
    try {
      for (let i = 0; i < 200; i++) floor.update(camera, "High", 1 / 60);
      const grass = floor.group.getObjectByName("hr-floor-grass") as InstancedMesh;
      const matrix = new Matrix4(), point = new Vector3();
      // Place a porch at a known planted instance, then load it without moving
      // the camera. This exercises the late-zone invalidation, not only AABB math.
      expect(grass.count).toBeGreaterThan(0); grass.getMatrixAt(0, matrix); point.setFromMatrixPosition(matrix);
      const parent = new Group(), zone = new Group(), porch = new Group();
      parent.position.set(3, 0, 1); parent.rotation.y = 0.4;
      zone.name = "quiet-shore"; porch.name = "porch";
      scene.add(parent); parent.add(zone); zone.add(porch); scene.updateMatrixWorld(true);
      porch.position.copy(parent.worldToLocal(point.clone()));
      for (let i = 0; i < 200; i++) floor.update(camera, "High", 1 / 60);
      const bounds = forestFloorPlantingBounds(scene); expect(bounds).toHaveLength(1);
      for (let i = 0; i < grass.count; i++) {
        grass.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix);
        expect(point.x >= bounds[0]!.min.x - 0.3 && point.x <= bounds[0]!.max.x + 0.3
          && point.z >= bounds[0]!.min.z - 0.3 && point.z <= bounds[0]!.max.z + 0.3).toBe(false);
      }
      const version = grass.instanceMatrix.version;
      for (let i = 0; i < 60; i++) floor.update(camera, "High", 1 / 60);
      expect(grass.instanceMatrix.version).toBe(version);
    } finally { timer.mockRestore(); floor.dispose(); }
  });
});
