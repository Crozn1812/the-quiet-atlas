import { Color, Scene, ShaderMaterial, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { riverLength, riverPointAt } from "../../../src/features/world/layout/river";
import { worldHeight } from "../../../src/features/world/terrain/height";
import { createWaterMaterial, WATER_FLOW_SPEED } from "../../../src/features/world/water/material";
import {
  createRibbonGeometry, createRiverRibbon, riverWidthAt, RIBBON_SEGMENTS, WATER_LEVEL,
} from "../../../src/features/world/water/ribbon";
import { createSea, SEA_SIZE } from "../../../src/features/world/water/sea";

describe("river ribbon", () => {
  it("follows the arc-length spline within 5 cm at 50 samples, including between rows", () => {
    const geometry = createRibbonGeometry();
    const positions = geometry.getAttribute("position");
    const centreAtRow = (row: number) => new Vector3()
      .fromBufferAttribute(positions, row * 2)
      .add(new Vector3().fromBufferAttribute(positions, row * 2 + 1)).multiplyScalar(0.5);
    let maxError = 0;
    for (let i = 0; i < 50; i++) {
      const t = i / 49;
      const row = t * RIBBON_SEGMENTS;
      const lower = Math.floor(row);
      const centre = centreAtRow(lower).lerp(centreAtRow(Math.min(lower + 1, RIBBON_SEGMENTS)), row - lower);
      centre.y = 0; // Plan-view check; height follows waterLevelAt (Lead fix).
      maxError = Math.max(maxError, centre.distanceTo(riverPointAt(t)));
    }
    expect(maxError).toBeLessThan(0.05);
    expect(positions.count).toBe((RIBBON_SEGMENTS + 1) * 2);
    expect(geometry.index!.count).toBe(RIBBON_SEGMENTS * 6);
    geometry.dispose();
  });

  it("widens monotonically from 4 to 10 metres, follows the river water level and maps length in metres", () => {
    const geometry = createRibbonGeometry();
    const positions = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    const normals = geometry.getAttribute("normal");
    let previousWidth = 0;
    for (let i = 0; i <= RIBBON_SEGMENTS; i++) {
      const a = new Vector3().fromBufferAttribute(positions, i * 2);
      const b = new Vector3().fromBufferAttribute(positions, i * 2 + 1);
      const width = a.distanceTo(b);
      expect(width).toBeGreaterThanOrEqual(previousWidth);
      expect(width).toBeCloseTo(riverWidthAt(i / RIBBON_SEGMENTS), 3);
      for (const vertex of [i * 2, i * 2 + 1]) {
        expect(positions.getY(vertex)).toBeCloseTo(waterLevelAt(riverPointAt(i / RIBBON_SEGMENTS).z), 5);
        expect(normals.getY(vertex)).toBe(1);
        expect(uv.getY(vertex)).toBeCloseTo(i / RIBBON_SEGMENTS * riverLength(), 3);
      }
      expect(uv.getX(i * 2)).toBe(0);
      expect(uv.getX(i * 2 + 1)).toBe(1);
      previousWidth = width;
    }
    expect(riverWidthAt(0)).toBe(4);
    expect(riverWidthAt(1)).toBe(10);
    expect(riverWidthAt(-1)).toBe(4);
    expect(riverWidthAt(2)).toBe(10);
    expect(WATER_LEVEL).toBe(worldHeight(0, -920));
    geometry.dispose();
  });

  it("faces upward throughout every triangle, with finite bounds", () => {
    const geometry = createRibbonGeometry();
    const positions = geometry.getAttribute("position");
    const index = geometry.index!;
    for (let i = 0; i < index.count; i += 3) {
      const a = new Vector3().fromBufferAttribute(positions, index.getX(i));
      const b = new Vector3().fromBufferAttribute(positions, index.getX(i + 1));
      const c = new Vector3().fromBufferAttribute(positions, index.getX(i + 2));
      expect(b.sub(a).cross(c.sub(a)).y).toBeGreaterThan(0);
    }
    expect(Number.isFinite(geometry.boundingSphere!.radius)).toBe(true);
    geometry.dispose();
  });

  it.each([0, -1, 1.5, 16385, NaN, Infinity])("rejects invalid tessellation %s", segments => {
    expect(() => createRibbonGeometry(segments)).toThrow(RangeError);
  });

  it.each([NaN, Infinity, -Infinity])("rejects invalid width progress %s", t => {
    expect(() => riverWidthAt(t)).toThrow(RangeError);
  });
});

describe("painted water material", () => {
  it.each([
    ["Low", { SKY_REFLECTION: 0.22 }],
    ["Balanced", { SKY_REFLECTION: 0.22, WATER_FLOW: 1, WATER_REFLECTION: 1 }],
    ["High", { SKY_REFLECTION: 0.22, WATER_FLOW: 1, WATER_REFLECTION: 1, WATER_RIPPLES: 1 }],
  ] as const)("uses the %s shader features and Three fog/colour pipeline", (quality, defines) => {
    const material = createWaterMaterial(quality);
    expect(material).toBeInstanceOf(ShaderMaterial);
    expect(material.defines).toEqual(defines);
    expect(material.fog).toBe(true);
    expect(material.vertexShader).toContain("#include <fog_pars_vertex>");
    expect(material.vertexShader).toContain("#include <fog_vertex>");
    expect(material.fragmentShader).toContain("#include <fog_pars_fragment>");
    expect(material.fragmentShader).toContain("#include <fog_fragment>");
    expect(material.fragmentShader).toContain("#include <tonemapping_fragment>");
    expect(material.fragmentShader).toContain("#include <colorspace_fragment>");
    for (const key of ["fogColor", "fogNear", "fogFar", "fogDensity"]) expect(material.uniforms[key]).toBeDefined();
    expect(material.uniforms.uDeepColor!.value).toEqual(new Color(PALETTE.indigo));
    expect(material.uniforms.uEdgeColor!.value).toEqual(new Color(PALETTE.water));
    expect(material.transparent).toBe(false);
    material.dispose();
  });

  it.each(["Balanced", "High"] as const)("moves %s strokes at 0.05 m/s and freezes all animation with reduced motion", quality => {
    const material = createWaterMaterial(quality);
    material.setTime(10);
    material.setTime(10);
    material.setTime(12);
    expect(material.uniforms.uTime!.value * WATER_FLOW_SPEED).toBeCloseTo(0.6);
    material.setReducedMotion(true);
    material.setTime(20);
    material.setTime(200);
    expect(material.uniforms.uTime!.value).toBe(12);
    material.setReducedMotion(false);
    material.setTime(210); // Resume anchors the clock instead of catching up.
    expect(material.uniforms.uTime!.value).toBe(12);
    material.setTime(212);
    expect(material.uniforms.uTime!.value).toBe(14);
    // Even when no clock samples arrive during the frozen interval, no jump.
    material.setReducedMotion(true);
    material.setReducedMotion(false);
    material.setTime(1000);
    expect(material.uniforms.uTime!.value).toBe(14);
    material.dispose();
  });

  it("keeps Low static and uniforms independent between instances", () => {
    const low = createWaterMaterial("Low");
    const a = createWaterMaterial("Balanced");
    const b = createWaterMaterial("Balanced");
    low.setTime(100);
    low.setReducedMotion(true);
    low.setTime(200);
    low.setReducedMotion(false);
    low.setTime(300);
    a.setTime(8);
    a.setSkyMix(0.7);
    a.uniforms.fogColor!.value.set(PALETTE.dusk);
    expect(low.uniforms.uTime!.value).toBe(0);
    expect(b.uniforms.uTime!.value).toBe(0);
    expect(b.uniforms.uSkyMix!.value).toBe(0);
    expect(a.uniforms.fogColor!.value).not.toEqual(b.uniforms.fogColor!.value);
    a.setSkyMix(2);
    expect(a.uniforms.uSkyMix!.value).toBe(1);
    a.setSkyMix(-1);
    expect(a.uniforms.uSkyMix!.value).toBe(0);
    for (const material of [low, a, b]) material.dispose();
  });

  it.each([-1, NaN, Infinity, -Infinity])("rejects invalid elapsed seconds %s", seconds => {
    const material = createWaterMaterial("High");
    expect(() => material.setTime(seconds)).toThrow(RangeError);
    material.dispose();
  });

  it("rejects invalid sky colours and disposes standalone materials once", () => {
    const material = createWaterMaterial("High");
    expect(() => material.setSkyMix(NaN)).toThrow(RangeError);
    const dispose = vi.fn();
    material.addEventListener("dispose", dispose);
    material.dispose();
    material.dispose();
    material.setTime(20);
    material.setSkyMix(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(material.uniforms.uTime!.value).toBe(0);
    expect(material.uniforms.uSkyMix!.value).toBe(0);
  });
});

describe("sea and water lifecycle", () => {
  it("joins the mouth at the sea datum, covers 800 m offshore and uses jade-teal water with a dusk edge", () => {
    const sea = createSea("Balanced");
    const mouth = riverPointAt(1);
    const bounds = sea.mesh.geometry.boundingBox!;
    expect(bounds.min.y).toBe(WATER_LEVEL);
    expect(bounds.max.y).toBe(WATER_LEVEL);
    expect(bounds.max.z).toBe(mouth.z);
    expect(bounds.min.z).toBe(mouth.z - SEA_SIZE);
    expect(bounds.min.x).toBe(mouth.x - SEA_SIZE / 2);
    expect(bounds.max.x).toBe(mouth.x + SEA_SIZE / 2);
    expect(sea.mesh.geometry.getAttribute("uv").getY(0)).toBeCloseTo(riverLength(), 3);
    const material = sea.mesh.material;
    expect(material.uniforms.uDeepColor!.value).toEqual(new Color(PALETTE.water).lerp(new Color(PALETTE.mist), 0.18));
    expect(material.defines.SKY_REFLECTION).toBe(0.5);
    expect(material.uniforms.uEdgeColor!.value).toEqual(new Color(PALETTE.water).lerp(new Color(PALETTE.dusk), 0.14));
    expect(material.uniforms.uSkyMix!.value).toBe(1);
    sea.dispose();
  });

  it.each([createRiverRibbon, createSea])("forwards controls and releases owned resources exactly once (%#)", create => {
    const surface = create("High");
    const scene = new Scene();
    scene.add(surface.mesh);
    const disposeGeometry = vi.fn();
    const disposeMaterial = vi.fn();
    surface.mesh.geometry.addEventListener("dispose", disposeGeometry);
    surface.mesh.material.addEventListener("dispose", disposeMaterial);
    surface.setTime(10);
    surface.setSkyMix(0.5);
    surface.setReducedMotion(true);
    surface.setTime(20);
    expect(surface.mesh.material.uniforms.uTime!.value).toBe(10);
    expect(surface.mesh.material.uniforms.uSkyMix!.value).toBe(0.5);
    surface.dispose();
    surface.dispose();
    surface.setReducedMotion(false);
    surface.setTime(50);
    expect(surface.mesh.material.uniforms.uTime!.value).toBe(10);
    expect(surface.mesh.parent).toBeNull();
    expect(scene.children).toHaveLength(0);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
  });
});

import { waterLevelAt } from "../../../src/features/world/terrain/height";

describe("water level follows the river bed (Lead fix)", () => {
  it("sits above the channel centre and below the banks along the whole river", () => {
    for (let i = 0; i <= 100; i++) {
      const p = riverPointAt(i / 100);
      const level = waterLevelAt(p.z);
      expect(level, `t=${i / 100}`).toBeGreaterThan(worldHeight(p.x, p.z) - 1e-6);
    }
  });
  it("reaches sea level at the mouth", () => {
    expect(Math.abs(waterLevelAt(riverPointAt(1).z))).toBeLessThan(0.05);
  });
});
