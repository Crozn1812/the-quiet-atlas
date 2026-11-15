import { DepthTexture, InstancedMesh, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { createAerialPass, heightOpticalDepth } from "../../../src/features/world/post/aerial";
import { createForestFloor, forestFloorGeometry } from "../../../src/features/world/foliage/ground-litter";
import { lightingAt } from "../../../src/features/world/sky/grade";
import { createCanopyRays } from "../../../src/features/world/post/canopy-rays";
import { ZONES } from "../../../src/features/world/layout/zones";

describe("height-integrated aerial perspective", () => {
  it("matches a numerical ray integral for horizontal, rising and falling rays", () => {
    for (const end of [1, 10, 10.000001, 50]) {
      const n = 10000;
      let numerical = 0;
      for (let i = 0; i < n; i++) numerical += Math.exp((5 - (10 + (end - 10) * (i + 0.5) / n)) * 0.12) * 80 / n;
      expect(heightOpticalDepth(80, 10, end)).toBeCloseTo(numerical, 3);
    }
    expect(heightOpticalDepth(100, 2, 2)).toBeGreaterThan(heightOpticalDepth(100, 20, 20));
  });
  it("projects the directional sun and suppresses rays behind the camera", () => {
    const camera = new PerspectiveCamera(65, 1.5, 0.1, 500), depth = new DepthTexture(1, 1);
    const aerial = createAerialPass(depth, camera, true), grade = lightingAt(0);
    grade.sunDirection.set(0, 0, -1); aerial.update(grade);
    expect(aerial.pass.uniforms.sunVisibility!.value).toBe(1);
    expect(aerial.pass.uniforms.sunUV!.value.toArray()).toEqual([0.5, 0.5]);
    grade.sunDirection.set(0, 0, 1); aerial.update(grade);
    expect(aerial.pass.uniforms.sunVisibility!.value).toBe(0);
    expect(aerial.pass.uniforms.tDepth!.value).toBe(depth);
    aerial.pass.dispose(); depth.dispose();
  });
});

describe("deferred forest floor", () => {
  it.each(["leaf", "grass", "root", "stone"] as const)("authors finite, non-flat %s surfaces with deterministic normals", kind => {
    const a = forestFloorGeometry(kind), b = forestFloorGeometry(kind);
    expect(a.attributes.position!.array).toEqual(b.attributes.position!.array);
    expect([...a.attributes.normal!.array].every(Number.isFinite)).toBe(true);
    a.computeBoundingBox();
    const height = a.boundingBox!.getSize(new Vector3()).y;
    expect(height).toBeGreaterThan(kind === "leaf" ? 0.002 : 0.02);
    if (kind === "leaf") expect(height).toBeLessThan(0.006);
    a.dispose(); b.dispose();
  });
  it("keeps Low empty and releases resources once", () => {
    const floor = createForestFloor(), camera = new PerspectiveCamera();
    floor.update(camera, "Low", 1);
    expect(floor.group.visible).toBe(false);
    expect(floor.group.children.every(mesh => "count" in mesh && mesh.count === 0)).toBe(true);
    const geometries = floor.group.children.map(mesh => vi.spyOn((mesh as import("three").Mesh).geometry, "dispose"));
    floor.dispose(); floor.dispose();
    geometries.forEach(spy => expect(spy).toHaveBeenCalledOnce());
    expect(floor.group.children).toHaveLength(0);
  });
  it("fills sunlit hills and stops uploading buffers after the camera cell settles", () => {
    const floor = createForestFloor(), camera = new PerspectiveCamera();
    camera.position.copy(ZONES.find(z => z.id === "horizon")!.position);
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    try {
      for (let i = 0; i < 120; i++) floor.update(camera, "High", 1 / 60);
      const grass = floor.group.getObjectByName("hr-floor-grass") as InstancedMesh;
      // Only cells in the padded camera frustum are submitted; the old full
      // disk count included unseen grass behind the camera.
      expect(grass.count).toBeGreaterThan(500);
      const versions = floor.group.children.map(m => (m as InstancedMesh).instanceMatrix.version);
      for (let i = 0; i < 20; i++) floor.update(camera, "High", 1 / 60);
      expect(floor.group.children.map(m => (m as InstancedMesh).instanceMatrix.version)).toEqual(versions);
      camera.position.x += 16; floor.update(camera, "High", 1 / 60);
      expect(floor.group.children.some((m, i) => (m as InstancedMesh).instanceMatrix.version > versions[i]!)).toBe(true);
    } finally { clock.mockRestore(); floor.dispose(); }
  });
});

describe("world-space canopy light", () => {
  it("remains visible with the sun behind the camera, has no shadow/depth writes, and releases once", () => {
    const rays = createCanopyRays(), camera = new PerspectiveCamera();
    camera.position.copy(ZONES[0]!.position); camera.position.y = 4;
    const grade = lightingAt(0); grade.sunDirection.set(0, 0.3, 1).normalize();
    rays.update(camera, grade, "High", 1 / 60);
    expect(rays.group.visible).toBe(true);
    for (const mesh of rays.group.children as import("three").Mesh[]) {
      expect(mesh.castShadow).toBe(false);
      expect((mesh.material as import("three").ShaderMaterial).depthWrite).toBe(false);
    }
    const ribbon = rays.group.children[0] as InstancedMesh;
    const uniforms = (ribbon.material as import("three").ShaderMaterial).uniforms;
    const time = uniforms.rayTime!.value;
    rays.update(camera, grade, "High", 1, true);
    expect(uniforms.rayTime!.value).toBe(time);
    camera.position.set(10000, 0, 10000); rays.update(camera, grade, "High", 1 / 60);
    expect(rays.group.visible).toBe(false);
    rays.update(camera, grade, "Low", 1 / 60); expect(rays.group.visible).toBe(false);
    const release = vi.spyOn(ribbon.geometry, "dispose"); rays.dispose(); rays.dispose();
    expect(release).toHaveBeenCalledOnce(); expect(rays.group.children).toHaveLength(0);
  });
});
