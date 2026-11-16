import { reportBudget } from "./report-budget";
import { Matrix4, Vector3, type Color } from "three";
import { describe, expect, it, vi } from "vitest";
import { PATH_BRIDGES } from "../../../src/features/world/layout/path";
import { riverLength } from "../../../src/features/world/layout/river";
import { nearestRiver } from "../../../src/features/world/terrain/samples";
import { surfaceHeight, waterLevelAt } from "../../../src/features/world/terrain/height";
import { createFirstLightFish } from "../../../src/features/world/water/fish";
import { FISH_CLEARANCE } from "../../../src/features/world/water/fish-schools";

describe("FISH-01 procedural schools", () => {
  it("retains First Light, covers four other reaches and fits one draw / triangle budgets", () => {
    const fish = createFirstLightFish();
    try {
      expect(fish.schools.map(school => school.name)).toEqual(["first-light", "roots", "old-trail", "lower-river", "estuary"]);
      expect(fish.schools.every(school => school.count >= 5 && school.count <= 9)).toBe(true);
      expect(fish.schools[0]!.t).toBeGreaterThan(0.01);
      expect(fish.schools[0]!.t).toBeLessThan(0.05);
      expect(fish.mesh.count).toBe(36);
      expect(fish.group.children).toEqual([fish.mesh]);
      expect(fish.mesh.geometry.groups).toHaveLength(0);
      const triangles = fish.mesh.geometry.index!.count / 3;
      reportBudget("tests/unit/world/fish.test.ts:22 triangles", triangles, 120);
      reportBudget("tests/unit/world/fish.test.ts:23 triangles * fish.mesh.count", triangles * fish.mesh.count, 8000);
      expect(fish.mesh.material.transparent).toBe(true);
      expect(fish.mesh.material.depthWrite).toBe(true);
      expect(fish.mesh.material.forceSinglePass).toBe(true);
      expect(fish.mesh.renderOrder).toBeLessThan(0);
      expect(fish.mesh.material.uniforms.fogColor).toBeDefined();
      const back = fish.mesh.material.uniforms.uBack!.value as Color;
      const belly = fish.mesh.material.uniforms.uBelly!.value as Color;
      expect(back.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(belly.getHSL({ h: 0, s: 0, l: 0 }).l);
      expect(back.r + back.g + back.b).toBeLessThan(0.1);
      console.info(`FISH-01: ${fish.schools.length} schools, ${fish.mesh.count} fish, ${triangles} triangles/fish, ${triangles * fish.mesh.count} triangles, 1 draw, 0 asset bytes`);
    } finally { fish.dispose(); }
  });

  it("keeps the full swimming/scatter envelope under water, above the rendered bed and away from bridges", () => {
    const fish = createFirstLightFish();
    try {
      fish.mesh.geometry.computeBoundingBox();
      const shape = fish.mesh.geometry.boundingBox!;
      const verticalExtent = Math.max(Math.abs(shape.min.y), shape.max.y) * 1.08;
      for (const school of fish.schools) {
        for (const bridge of PATH_BRIDGES) {
          expect(Math.abs(nearestRiver(bridge.position.x, bridge.position.z).t - school.t) * riverLength()).toBeGreaterThan(18);
        }
        // Test between baked nodes, including the maximum nose/tail and scatter footprint.
        for (let row = 0; row <= 64; row++) {
          const sample = row / 64 * (school.route.length - 1);
          const index = Math.min(school.route.length - 2, Math.floor(sample));
          const a = school.route[index]!, b = school.route[index + 1]!;
          const point = a.clone().lerp(b, sample - index);
          const forward = b.clone().sub(a).setY(0).normalize();
          for (let side = -10; side <= 10; side++) {
            const across = side / 10 * (school.width + FISH_CLEARANCE);
            const x = point.x - forward.z * across, z = point.z + forward.x * across;
            const water = waterLevelAt(z);
            const bottom = water - school.submergence - 0.028 - verticalExtent - 0.01;
            expect(bottom - surfaceHeight(x, z), `${school.name} row=${row} side=${side}`).toBeGreaterThan(0.005);
            expect(school.submergence - 0.028 - verticalExtent - 0.01).toBeGreaterThan(0.005);
          }
          expect(fish.mesh.boundingSphere!.containsPoint(point)).toBe(true);
        }
        console.info(`FISH-01 ${school.name}: t=${school.t.toFixed(4)}, min bed depth=${school.minDepth.toFixed(3)} m, submergence=${school.submergence.toFixed(3)} m`);
      }
    } finally { fish.dispose(); }
  });

  it("uploads no matrices while swimming, turning, alarming or changing quality", () => {
    const fish = createFirstLightFish();
    try {
      const version = fish.mesh.instanceMatrix.version;
      const matrices = fish.mesh.instanceMatrix.array.slice();
      const upload = vi.spyOn(fish.mesh, "setMatrixAt");
      const player = fish.schools[0]!.center.clone();
      for (let frame = 0; frame < 120; frame++) fish.update(1 / 60, false, player, frame % 2 ? "High" : "Low");
      expect(upload).not.toHaveBeenCalled();
      expect(fish.mesh.instanceMatrix.version).toBe(version);
      expect(fish.mesh.instanceMatrix.array).toEqual(matrices);
      expect(fish.mesh.material.uniforms.uTime!.value).toBeCloseTo(2);
      const matrix = new Matrix4(); fish.mesh.getMatrixAt(0, matrix);
      expect(new Vector3().setFromMatrixPosition(matrix).distanceTo(player)).toBeGreaterThan(0.14);
    } finally { fish.dispose(); }
  });

  it("triggers at the 2.5 m bank margin, settles without repeated alarms and retriggers on approach", () => {
    const fish = createFirstLightFish();
    try {
      const school = fish.schools[0]!;
      const player = school.center.clone();
      const right = new Vector3(-school.forward.z, 0, school.forward.x);
      player.addScaledVector(right, school.bankDistance + 2.51);
      fish.update(0.1, false, player);
      expect(fish.mesh.material.uniforms.uPlayer!.value.w).toBe(-100);
      player.addScaledVector(right, -0.02);
      fish.update(0.1, false, player);
      const alarm = fish.mesh.material.uniforms.uPlayer!.value.w;
      expect(alarm).toBeCloseTo(0.2);
      for (let i = 0; i < 80; i++) fish.update(0.1, false, player);
      expect(fish.mesh.material.uniforms.uPlayer!.value.w).toBe(alarm);
      expect(fish.mesh.material.uniforms.uTime!.value - alarm).toBeGreaterThan(7);
      player.copy(school.center);
      fish.update(0.1, false, player);
      expect(fish.mesh.material.uniforms.uPlayer!.value.w).toBeGreaterThan(alarm);
    } finally { fish.dispose(); }
  });

  it("selects only the nearest school on Low, disables alarm and culls a distant player", () => {
    const fish = createFirstLightFish();
    try {
      for (const [id, school] of fish.schools.entries()) {
        fish.update(0.1, false, school.center, "Low");
        expect(fish.mesh.material.uniforms.uLowSchool!.value).toBe(id);
        expect(fish.mesh.material.uniforms.uCalm!.value).toBe(1);
        expect(fish.mesh.material.uniforms.uPlayer!.value.w).toBe(-100);
        expect(fish.mesh.visible).toBe(true);
      }
      fish.update(0.1, false, new Vector3(1000, 0, 1000), "High");
      expect(fish.mesh.visible).toBe(false);
      expect(fish.mesh.material.uniforms.uLowSchool!.value).toBe(-1);
      fish.update(0, false, fish.schools[0]!.center, "Balanced");
      expect(fish.mesh.visible).toBe(true);
    } finally { fish.dispose(); }
  });

  it("slows reduced motion continuously, removes sudden scattering and respects a paused clock", () => {
    const fish = createFirstLightFish();
    try {
      const player = fish.schools[0]!.center;
      fish.update(0.1, false, player);
      const before = fish.mesh.material.uniforms.uTime!.value;
      fish.update(0.1, true, player);
      expect(fish.mesh.material.uniforms.uTime!.value - before).toBeCloseTo(0.022);
      expect(fish.mesh.material.uniforms.uCalm!.value).toBe(1);
      expect(fish.mesh.material.uniforms.uPlayer!.value.w).toBe(-100);
      const paused = fish.mesh.material.uniforms.uTime!.value;
      for (const dt of [0, -1, NaN, Infinity]) fish.update(dt, true, player);
      expect(fish.mesh.material.uniforms.uTime!.value).toBe(paused);
      fish.dispose(); fish.update(0.1, false, player);
      expect(fish.mesh.material.uniforms.uTime!.value).toBe(paused);
    } finally { fish.dispose(); }
  });
});
