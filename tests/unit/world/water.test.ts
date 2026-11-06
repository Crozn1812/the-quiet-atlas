import { Color, Scene, ShaderMaterial, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { PATH_BRIDGES, pathLength } from "../../../src/features/world/layout/path";
import { riverLength, riverPointAt } from "../../../src/features/world/layout/river";
import { ZONES } from "../../../src/features/world/layout/zones";
import { worldHeight } from "../../../src/features/world/terrain/height";
import { lightingAt } from "../../../src/features/world/sky/grade";
import { nearestPath, nearestRiver } from "../../../src/features/world/terrain/samples";
import { createWaterMaterial, SEA_WAVE_PERIOD, WATER_FLOW_SPEED } from "../../../src/features/world/water/material";
import {
  createRibbonGeometry, createRiverRibbon, riverWidthAt, RIBBON_SEGMENTS, WATER_LEVEL,
} from "../../../src/features/world/water/ribbon";
import { createSea, SEA_INLAND_OVERLAP, SEA_SIZE } from "../../../src/features/world/water/sea";

describe("river ribbon", () => {
  it.each(["milestones", "horizon"])("keeps the triangulated %s channel open inside the ribbon", id => {
    const zone = ZONES.find(zone => zone.id === id)!;
    const station = nearestRiver(zone.position.x, zone.position.z).t;
    const geometry = createRibbonGeometry();
    const positions = geometry.getAttribute("position");
    const renderedHeight = (x: number, z: number) => {
      const gx = Math.floor(x / 2) * 2;
      const gz = Math.floor(z / 2) * 2;
      const tx = (x - gx) / 2;
      const tz = (z - gz) / 2;
      const a = Math.fround(worldHeight(gx, gz));
      const b = Math.fround(worldHeight(gx + 2, gz));
      const c = Math.fround(worldHeight(gx, gz + 2));
      const d = Math.fround(worldHeight(gx + 2, gz + 2));
      return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
    };
    try {
      for (let row = 0; row <= RIBBON_SEGMENTS; row++) {
        if (Math.abs(row / RIBBON_SEGMENTS - station) > 0.08) continue;
        const a = new Vector3().fromBufferAttribute(positions, row * 2);
        const b = new Vector3().fromBufferAttribute(positions, row * 2 + 1);
        const centre = a.clone().add(b).multiplyScalar(0.5);
        // Existing ford approaches intentionally blend the walking surface
        // through the water; this gate measures the open channel beside them.
        const path = nearestPath(centre.x, centre.z);
        if (PATH_BRIDGES.some(bridge => Math.abs(path.t - bridge.t) * pathLength() < 18)) continue;
        const normal = b.clone().sub(a).normalize();
        for (const across of [-1, -0.5, 0, 0.5, 1]) {
          // B2-195: hill banks meet the ribbon instead of flooding beyond it.
          // Retain the wider rocky forest channel; probe 0.5 m inside the
          // hill ribbon to allow the 2 m terrain triangles to meet the bank.
          const margin = row / RIBBON_SEGMENTS >= 0.37 && row / RIBBON_SEGMENTS <= 0.79 ? -0.5 : 0.5;
          const point = centre.clone().addScaledVector(normal, across * (a.distanceTo(b) / 2 + margin));
          const context = `${id}, row=${row}, across=${across}`;
          expect(worldHeight(point.x, point.z), context).toBeLessThan(point.y);
          expect(renderedHeight(point.x, point.z), context).toBeLessThan(point.y);
        }
      }
    } finally { geometry.dispose(); }
  });

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

  it("widens from a 0.6 m spring to 10 metres then flares to 60 m and sinks into the sea", () => {
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
        const t = i / RIBBON_SEGMENTS;
        const blend = Math.max(0, (t - 0.96) / 0.04);
        const sink = 0.05 * blend * blend * (3 - 2 * blend);
        if (t >= 0.03) expect(positions.getY(vertex)).toBeCloseTo(waterLevelAt(riverPointAt(t).z) - sink, 5);
        expect(normals.getY(vertex)).toBe(1);
        expect(uv.getY(vertex)).toBeCloseTo(i / RIBBON_SEGMENTS * riverLength(), 3);
      }
      expect(uv.getX(i * 2)).toBe(0);
      expect(uv.getX(i * 2 + 1)).toBe(1);
      previousWidth = width;
    }
    expect(riverWidthAt(0)).toBeCloseTo(0.6);
    expect(riverWidthAt(0.96)).toBeCloseTo(9.76);
    expect(riverWidthAt(0.98)).toBeCloseTo(34.88);
    expect(riverWidthAt(1)).toBeCloseTo(60);
    expect(riverWidthAt(-1)).toBeCloseTo(0.6);
    expect(riverWidthAt(2)).toBeCloseTo(60);
    expect(positions.getY(RIBBON_SEGMENTS * 2)).toBeCloseTo(WATER_LEVEL - 0.05);
    for (const vertex of [RIBBON_SEGMENTS * 2, RIBBON_SEGMENTS * 2 + 1]) {
      expect(worldHeight(positions.getX(vertex), positions.getZ(vertex))).toBeLessThan(positions.getY(vertex));
    }
    expect(worldHeight(0, -960)).toBeLessThan(WATER_LEVEL);
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
  it.each(["Low", "Balanced", "High"] as const)("keeps %s stream banks lighter than the centre without purple or pink pigment", quality => {
    const material = createWaterMaterial(quality);
    try {
      const uniform = material.uniforms;
      const deep = uniform.uDeepColor!.value as Color;
      const edge = uniform.uEdgeColor!.value as Color;
      const paper = uniform.uPaperColor!.value as Color;
      // Evaluate the actual cross-stream GLSL before the sea-only branch.
      const start = material.fragmentShader.indexOf("float edge =");
      const end = material.fragmentShader.indexOf("#ifdef SEA_WATER", start);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      const pigmentAt = new Function("vWaterUv", "uDeepColor", "uEdgeColor", "abs", "smoothstep", "mix", `
        ${material.fragmentShader.slice(start, end).replace(/\b(float|vec3)\s+/g, "let ")}
        return color;
      `);
      const sample = (x: number): Color => pigmentAt({ x }, deep, edge, Math.abs,
        (a: number, b: number, value: number) => {
          const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
          return t * t * (3 - 2 * t);
        }, (a: Color, b: Color, t: number) => a.clone().lerp(b, t));
      const luma = (color: Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
      expect(sample(0)).toEqual(edge);
      expect(sample(1)).toEqual(edge);
      expect(sample(0.5)).toEqual(deep);
      expect(luma(sample(0))).toBeGreaterThan(luma(sample(0.5)));
      for (let i = 0; i <= 20; i++) {
        // Looking down isolates green pigment; grazing reflection may carry
        // the peach dawn sky, so it must not be constrained to green pigment.
        for (const stroke of [0, 0.0325, 0.065]) {
          const color = sample(i / 20).lerp(paper, stroke);
          for (const rgb of [color, color.clone().convertLinearToSRGB()]) {
            expect(rgb.b).toBeLessThanOrEqual(rgb.g + 0.05);
            expect(rgb.g).toBeGreaterThan(rgb.r);
          }
        }
      }
    } finally { material.dispose(); }
  });

  it.each([
    ["Low", { SKY_REFLECTION: 0.22, WATER_REFLECTION: 1 }],
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
    const grade = lightingAt(0);
    const light = grade.sunColor.clone().multiplyScalar(grade.sunIntensity * (0.625 + 0.375 * grade.sunDirection.y))
      .add(grade.hemiSky.clone().multiplyScalar(grade.hemiIntensity)).multiplyScalar(0.2 / Math.PI);
    expect(material.uniforms.uDeepColor!.value.toArray()).toEqual(
      new Color(PALETTE.seaDeep).lerp(new Color(PALETTE.forestLight), 0.5).multiply(light).toArray().map(v => expect.closeTo(v, 12)));
    expect(material.uniforms.uEdgeColor!.value.toArray()).toEqual(
      new Color(PALETTE.seaShallow).lerp(new Color(PALETTE.forestLight), 0.25).multiply(light).toArray().map(v => expect.closeTo(v, 12)));
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
  it("takes the reflection direction from the grade and follows subsequent sun changes without aliasing", () => {
    const grade = lightingAt(0.93);
    const sea = createSea("Balanced", { sunDirection: grade.sunDirection });
    const other = createWaterMaterial("Balanced", { surface: "sea" });
    try {
      const material = sea.mesh.material;
      expect(material.defines.SEA_WATER).toBe(1);
      expect(material.uniforms.uSunDirection!.value.distanceTo(grade.sunDirection)).toBeLessThan(1e-12);
      expect(material.uniforms.uSunDirection!.value).not.toBe(grade.sunDirection);
      expect(other.uniforms.uSunDirection!.value.distanceTo(lightingAt(1).sunDirection)).toBeLessThan(1e-12);
      const original = material.uniforms.uSunDirection!.value.clone();
      grade.sunDirection.set(-4, 1, -2);
      expect(material.uniforms.uSunDirection!.value).toEqual(original);
      material.setSunDirection(grade.sunDirection);
      expect(material.uniforms.uSunDirection!.value.distanceTo(grade.sunDirection.clone().normalize())).toBeLessThan(1e-12);
      expect(other.uniforms.uSunDirection!.value.distanceTo(lightingAt(1).sunDirection)).toBeLessThan(1e-12);
      expect(material.vertexShader).toContain("modelMatrix * vec4(position, 1.0)");
      expect(material.fragmentShader).toContain("uniform vec3 uSunDirection;");
      expect(material.fragmentShader).toContain("uSunDirection.xz");
      expect(material.fragmentShader).toContain("vWaterWorld.xz - cameraPosition.xz");
      sea.dispose();
      const finalDirection = material.uniforms.uSunDirection!.value.clone();
      material.setSunDirection(new Vector3(1, 1, 0));
      expect(material.uniforms.uSunDirection!.value).toEqual(finalDirection);
    } finally { sea.dispose(); other.dispose(); }
  });

  it.each([new Vector3(), new Vector3(NaN, 1, 0), new Vector3(1, Infinity, 0)])(
    "rejects unusable sun directions (%s)", direction => {
      const material = createWaterMaterial("High", { surface: "sea" });
      try {
        const before = material.uniforms.uSunDirection!.value.clone();
        expect(() => material.setSunDirection(direction)).toThrow(RangeError);
        expect(material.uniforms.uSunDirection!.value).toEqual(before);
      } finally { material.dispose(); }
    },
  );

  it.each(["Low", "Balanced", "High"] as const)("freezes %s sea waves and foam while keeping the sun wash", quality => {
    const sea = createSea(quality);
    try {
      const material = sea.mesh.material;
      expect(SEA_WAVE_PERIOD).toBeGreaterThanOrEqual(6);
      expect(SEA_WAVE_PERIOD).toBeLessThanOrEqual(10);
      expect(material.fragmentShader).toContain(`uTime * ${(2 * Math.PI / SEA_WAVE_PERIOD).toFixed(10)}`);
      expect(material.fragmentShader).toContain("cos(phase)");
      expect(material.fragmentShader).toContain("uSunWashColor");
      sea.setTime(3);
      const frozenTime = material.uniforms.uTime!.value;
      expect(frozenTime).toBe(3);
      const sunWash = material.uniforms.uSunWashColor!.value.clone();
      sea.setReducedMotion(true);
      for (const seconds of [4, 12, 100]) sea.setTime(seconds);
      expect(material.uniforms.uTime!.value).toBe(frozenTime);
      expect(material.uniforms.uSunWashColor!.value).toEqual(sunWash);
      // Lighting still follows the grade when animation is frozen.
      const direction = lightingAt(0.86).sunDirection;
      material.setSunDirection(direction);
      expect(material.uniforms.uSunDirection!.value.distanceTo(direction)).toBeLessThan(1e-12);
      sea.setReducedMotion(false);
      sea.setTime(200);
      expect(material.uniforms.uTime!.value).toBe(frozenTime);
      sea.setTime(202);
      expect(material.uniforms.uTime!.value).toBe(frozenTime + 2);
    } finally { sea.dispose(); }
  });

  it.each(["Low", "Balanced", "High"] as const)("keeps %s sea within 110 percent of its two-triangle budget", quality => {
    const sea = createSea(quality);
    try {
      expect(sea.mesh.geometry.index!.count / 3).toBeLessThanOrEqual(2 * 1.1);
      expect(sea.mesh.geometry.getAttribute("position").count).toBe(4);
      expect(sea.mesh.children).toHaveLength(0);
      expect(Array.isArray(sea.mesh.material)).toBe(false);
    } finally { sea.dispose(); }
  });

  it("overlaps 80 m inland at sea level, covers 800 m offshore and keeps one quad", () => {
    const sea = createSea("Balanced");
    const mouth = riverPointAt(1);
    const bounds = sea.mesh.geometry.boundingBox!;
    expect(bounds.min.y).toBe(WATER_LEVEL);
    expect(bounds.max.y).toBe(WATER_LEVEL);
    expect(bounds.max.z).toBe(mouth.z + SEA_INLAND_OVERLAP);
    expect(bounds.min.z).toBe(mouth.z - SEA_SIZE);
    expect(bounds.min.x).toBe(mouth.x - SEA_SIZE / 2);
    expect(bounds.max.x).toBe(mouth.x + SEA_SIZE / 2);
    expect(sea.mesh.geometry.getAttribute("position").count).toBe(4);
    expect(sea.mesh.geometry.index!.count).toBe(6);
    expect(sea.mesh.geometry.getAttribute("uv").getY(0)).toBeCloseTo(riverLength() - SEA_INLAND_OVERLAP, 3);
    const material = sea.mesh.material;
    // B2-174: turquoise pigment follows the sampled coast; B2-160's wash stays separate.
    const grade = lightingAt(1);
    const light = grade.sunColor.clone().multiplyScalar(grade.sunIntensity * (0.625 + 0.375 * grade.sunDirection.y))
      .add(grade.hemiSky.clone().multiplyScalar(grade.hemiIntensity)).multiplyScalar(0.85 / Math.PI);
    expect(material.uniforms.uDeepColor!.value.toArray()).toEqual(new Color(PALETTE.seaDeep)
      .lerp(new Color(PALETTE.indigo), (grade.sunColor.r - grade.sunColor.b) * 0.8)
      .multiply(light).toArray().map(v => expect.closeTo(v, 12)));
    expect(material.defines.SKY_REFLECTION).toBe(0.5);
    expect(material.uniforms.uEdgeColor!.value.toArray()).toEqual(new Color(PALETTE.seaShallow)
      .multiply(light).toArray().map(v => expect.closeTo(v, 12)));
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
  it("covers the channel centre except inside the mandatory dry zone footprints", () => {
    for (let i = 0; i <= 100; i++) {
      const p = riverPointAt(i / 100);
      const level = waterLevelAt(p.z);
      // Last Postcard includes the mouth: its required dry 0.4 m terrace takes priority.
      expect(Math.max(level, 0.4), `t=${i / 100}`).toBeGreaterThan(worldHeight(p.x, p.z) - 1e-6);
    }
  });
  it("reaches sea level at the mouth", () => {
    expect(Math.abs(waterLevelAt(riverPointAt(1).z))).toBeLessThan(0.05);
  });
});
