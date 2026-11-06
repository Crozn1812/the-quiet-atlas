import { describe, expect, it, vi } from "vitest";
import { Color, Matrix4, type WebGLRenderer } from "three";
import { PALETTE } from "../../../src/features/world/art/palette";
import { createGrassField, grassFieldAllowed, grassFieldBlade, GRASS_FIELD_SPACING } from "../../../src/features/world/foliage/grass-field";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { isFoliageExcluded } from "../../../src/features/world/foliage/scatter";
import { waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";

describe("camera grass field", () => {
  it("fills the deep forest incrementally with low forest-colored tufts in the existing batch", () => {
    const field = createGrassField("High"), p = pathPointAt(0.02);
    expect(field.mesh.visible).toBe(false);
    expect(field.mesh.instanceMatrix.array.every((v, i) => v === (i % 16 === 15 ? 1 : 0))).toBe(true);
    let result = field.update(p.x, p.z, 0, true);
    expect(result.pending).toBeGreaterThan(0);
    while (result.pending) result = field.update(p.x, p.z, 0, true);
    const flags = field.mesh.geometry.getAttribute("grassForest");
    const matrix = new Matrix4();
    let forestTufts = 0;
    for (let i = 0; i < field.mesh.count; i++) {
      field.mesh.getMatrixAt(i, matrix);
      const e = matrix.elements;
      if (!e[5] || flags.getX(i) !== 1) continue;
      forestTufts++;
      expect(e[5]! * 1.15).toBeGreaterThanOrEqual(0.15 - 1e-6);
      expect(e[5]! * 1.15).toBeLessThanOrEqual(0.35 + 1e-6);
      expect(grassFieldAllowed(e[12]!, e[14]!)).toBe(true);
    }
    expect(forestTufts).toBeGreaterThan(100);
    const material = field.mesh.material;
    if (Array.isArray(material)) throw new Error("Expected single batch");
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>\n#include <color_vertex>", fragmentShader: "#include <common>\n#include <opaque_fragment>" };
    material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as WebGLRenderer);
    expect(shader.vertexShader).toContain(new Color(PALETTE.forestDeep).toArray().join(","));
    expect(shader.vertexShader).toContain(new Color(PALETTE.grass).toArray().join(","));
    expect(field.mesh.count * 12).toBe(36_300); // Same High submission budget as B2-214.
    field.dispose();
  });
  it("preserves ramp shading, root/tip pigment, distance fade and reduced-motion wind", () => {
    const field = createGrassField("Balanced");
    const material = field.mesh.material;
    if (Array.isArray(material)) throw new Error("Expected one material");
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <opaque_fragment>" };
    material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as WebGLRenderer);
    const uniforms = shader.uniforms as Record<string, { value: unknown }>;
    expect(shader.fragmentShader).toContain("rampShadowTint");
    expect(shader.vertexShader).toContain("smoothstep(grassRadius - 4.0");
    expect(shader.vertexShader).toContain("transformed *= grassFade");
    field.update(0, 0, 3, true);
    expect(uniforms.grassWind!.value).toBe(0);
    field.update(0, 0, 4, false);
    expect(uniforms.grassWind!.value).toBe(1);
    const colors = field.mesh.geometry.getAttribute("color");
    for (const [index, pigment] of [[0, PALETTE.grass], [4, PALETTE.grassDry]] as const) {
      const color = new Color(pigment);
      expect(colors.getX(index)).toBeCloseTo(color.r);
      expect(colors.getY(index)).toBeCloseTo(color.g);
      expect(colors.getZ(index)).toBeCloseTo(color.b);
    }
    field.dispose();
  });
  it("uses one draw and a 4-blade, 12-triangle tuft within every quality budget", () => {
    for (const quality of ["High", "Balanced", "Low"] as const) {
      const field = createGrassField(quality);
      expect(field.group.children).toHaveLength(1);
      // Lead 2026-11-06 render check: tufts at 0.7 m within 18/12 m (single blades read as bare ground).
      expect(field.mesh.count * 12).toBeLessThanOrEqual(60000);
      expect(field.mesh.geometry.index!.count).toBe(36);
      expect(field.radius).toBe({ High: 18, Balanced: 12, Low: 0 }[quality]);
      expect(field.mesh.count === 0).toBe(quality === "Low");
      field.dispose(); field.dispose();
    }
  });

  it("keeps road, path, water and zone pads empty across the route", () => {
    let allowed = 0;
    for (let t = 0; t <= 1; t += 0.025) {
      const p = pathPointAt(t);
      expect(grassFieldAllowed(p.x, p.z)).toBe(false);
      for (let dx = -40; dx <= 40; dx += 4) for (let dz = -40; dz <= 40; dz += 4) {
        const x = p.x + dx, z = p.z + dz;
        if (!grassFieldAllowed(x, z)) continue;
        allowed++;
        expect(isFoliageExcluded(x, z)).toBe(false);
        expect(worldHeight(x, z)).toBeGreaterThan(waterLevelAt(z) + 0.15);
      }
    }
    expect(allowed).toBeGreaterThan(100);
    for (const zone of ZONES) expect(grassFieldAllowed(zone.position.x, zone.position.z)).toBe(false);
  });

  it("seeds by world position and resamples only entering torus cells after 10 m", () => {
    const field = createGrassField("High");
    const point = pathPointAt(0.65);
    const timings: number[] = [];
    const drain = (x: number) => {
      let samples = 0, pending = 1;
      while (pending) {
        const start = performance.now();
        const result = field.update(x, point.z, 5);
        timings.push(performance.now() - start);
        samples += result.sampled; pending = result.pending;
      }
      return samples;
    };
    expect(drain(point.x)).toBe(field.mesh.count);
    const before = Array.from(field.mesh.instanceMatrix.array);
    expect(field.update(point.x, point.z, 6, true).sampled).toBe(0);
    const enteringColumns = Math.floor((point.x + 10) / GRASS_FIELD_SPACING) - Math.floor(point.x / GRASS_FIELD_SPACING);
    expect(drain(point.x + 10)).toBe(enteringColumns * Math.sqrt(field.mesh.count));
    let retained = 0;
    for (let i = 0; i < field.mesh.count; i++) {
      const offset = i * 16;
      if (before.slice(offset, offset + 16).every((v, j) => v === field.mesh.instanceMatrix.array[offset + j])) retained++;
    }
    expect(retained).toBeGreaterThan(field.mesh.count / 2);
    drain(point.x);
    expect(Array.from(field.mesh.instanceMatrix.array)).toEqual(before);
    expect(grassFieldBlade(-17, 50)).toEqual(grassFieldBlade(-17, 50));
    expect(grassFieldBlade(-17, 50).height).toBeGreaterThanOrEqual(0.15);
    const matrix = new Matrix4();
    field.mesh.getMatrixAt(0, matrix);
    expect(matrix.elements.every(Number.isFinite)).toBe(true);
    const sorted = timings.sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
    // Wall time is reported only: under parallel load (4 Codex workers) p95 drifted to 1.00–1.53 ms.
    // The ≤1 ms budget is enforced deterministically below with a controlled clock.
    process.stdout.write(`grass-field Node update (informational): p95=${p95.toFixed(3)}ms max=${sorted.at(-1)!.toFixed(3)}ms (${sorted.length} frames)\n`);
    field.dispose();
  });

  it("stops sampling once its 0.9 ms frame budget is spent (controlled clock)", () => {
    const field = createGrassField("High");
    const point = pathPointAt(0.65);
    let clock = 0;
    const now = vi.spyOn(performance, "now").mockImplementation(() => (clock += 0.05));
    try {
      field.update(point.x, point.z, 0); // First call defers dressing until after the initial scene frame.
      const result = field.update(point.x, point.z, 1);
      // Every loop check advances 0.05 ms: the loop must stop before 1 ms of (simulated) work.
      expect(result.sampled).toBeGreaterThan(0);
      expect(clock).toBeLessThan(1);
      expect(result.pending).toBeGreaterThan(0);
    } finally { now.mockRestore(); field.dispose(); }
  });
});
