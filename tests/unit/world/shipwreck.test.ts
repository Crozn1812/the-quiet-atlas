import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NormalBlending, Vector3 } from "three";
import { createShipwreckSmoke, SHIPWRECK_PARTICLES, smokeSample } from "@/features/world/scene/shipwreck-smoke";
import { SHIPWRECK } from "@/features/world/scene/shipwreck";
import { worldHeight } from "@/features/world/terrain/height";
import { farHeight } from "@/features/world/scene/far-relief";

describe("QF-07 offshore cargo steamer", () => {
  it("sits 250–400 m from the actual dry coastline, beyond player terrain", () => {
    const [sx, , sz] = SHIPWRECK.position;
    let distance = Infinity;
    for (let x = sx - 400; x <= sx + 400; x += 10) {
      for (let z = sz - 400; z <= sz + 400; z += 10) {
        if (worldHeight(x, z) >= 0) distance = Math.min(distance, Math.hypot(x - sx, z - sz));
      }
    }
    expect(distance).toBeGreaterThanOrEqual(250);
    expect(distance).toBeLessThanOrEqual(400);
    expect(worldHeight(sx, sz)).toBeLessThan(0);
    // The High backdrop replaces part of the offshore west with a distant cape.
    // Keep the complete hull and plume outside that replacement, too.
    for (const x of [sx - 40, sx, sx + 40]) expect(farHeight(x, sz)).toBeLessThan(0);
  });
  it("ships a compact meshopt + KTX2 asset with one distant LOD", () => {
    const bytes = readFileSync("public/world/props/prop-shipwreck.glb");
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(bytes.length).toBeLessThan(1_500_000);
    expect(json.extensionsRequired).toEqual(expect.arrayContaining(["EXT_meshopt_compression", "KHR_texture_basisu"]));
    expect(json.meshes).toHaveLength(1);
    expect(json.meshes[0].primitives).toHaveLength(1);
    expect(SHIPWRECK.length).toBeGreaterThanOrEqual(60);
    expect(SHIPWRECK.pitch * 180 / Math.PI).toBe(20);
  });

  it("rises, drifts consistently downwind and fades before 60 metres", () => {
    const early = smokeSample(.1, 0), late = smokeSample(.95, 0);
    expect(late.x).toBeLessThan(early.x);
    expect(late.y).toBeGreaterThan(early.y);
    expect(late.y).toBeLessThan(45);
    expect(late.opacity).toBeLessThan(early.opacity);
    expect(smokeSample(0, 0).opacity).toBe(0);
    expect(smokeSample(.2, 24).y).toBeCloseTo(smokeSample(.2, 0).y);
  });

  it("retains smoke on Low, freezes reduced motion and resumes without jumping", () => {
    const smoke = createShipwreckSmoke(new Vector3());
    smoke.update(.05, false, "High");
    const before = smoke.mesh.material.uniforms.elapsed!.value;
    smoke.update(30, true, "Low");
    expect(smoke.mesh.material.uniforms.elapsed!.value).toBe(before);
    expect(smoke.mesh.geometry.instanceCount).toBe(SHIPWRECK_PARTICLES.Low);
    smoke.update(.05, false, "High");
    expect(smoke.mesh.material.uniforms.elapsed!.value).toBeCloseTo(before + .05);
    expect(smoke.mesh.geometry.instanceCount).toBe(64);
    expect(smoke.mesh.material.fog).toBe(true);
    expect(smoke.mesh.material.transparent).toBe(true);
    expect(smoke.mesh.material.blending).toBe(NormalBlending);
    expect(smoke.mesh.material.depthWrite).toBe(false);
    expect(smoke.mesh.material.depthTest).toBe(true);
    expect(smoke.mesh.renderOrder).toBeGreaterThan(2); // Sea/surf.
    smoke.dispose();
  });

  it("keeps a wide overlapping plume on both budgets throughout the emission cycle", () => {
    const smoke = createShipwreckSmoke(new Vector3());
    const phases = smoke.mesh.geometry.getAttribute("phase");
    for (const quality of ["High", "Low"] as const) {
      smoke.update(0, true, quality);
      const count = SHIPWRECK_PARTICLES[quality];
      expect(smoke.mesh.geometry.instanceCount).toBe(count);
      expect(smoke.mesh.material.uniforms.density!.value * count).toBe(64);
      for (const time of [0, 6, 12, 18, 23.9]) {
        const samples = Array.from({ length: count }, (_, i) => smokeSample(phases.getX(i), time))
          .sort((a, b) => a.age - b.age);
        expect(samples[0]!.y).toBeLessThan(samples[0]!.size / 2);
        for (let i = 1; i < samples.length; i++) {
          const a = samples[i - 1]!, b = samples[i]!;
          // Even Low's neighbouring centres sit inside each other's soft core.
          expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeLessThan(Math.min(a.size, b.size) / 2);
        }
      }
    }
    expect(smokeSample(0, 0).size).toBeCloseTo(3.4 * 2);
    expect(smokeSample(.99, 0).size / 3.4).toBeGreaterThan(7.9);
    smoke.dispose();
  });
});
