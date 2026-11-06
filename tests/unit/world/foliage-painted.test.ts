import { ShaderLib, type Material, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";
import { createFoliage } from "../../../src/features/world/foliage/instances";

function compile(material: Material, source = ShaderLib.toon!) {
  const shader = { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader, uniforms: {} } as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}

type Point = [number, number, number];
const fract = (x: number) => x - Math.floor(x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** CPU mirror of the installed GLSL value noise, including its hash constants. */
function noise(p: Point): number {
  const cell = p.map(Math.floor), f = p.map(x => smooth(fract(x)));
  function hash(x: number, y: number, z: number) {
    const a = fract(x * 0.1031), b = fract(y * 0.1031), c = fract(z * 0.1031);
    const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
    return fract((a + b + 2 * d) * (c + d));
  }
  const h = (x: number, y: number, z: number) => hash(cell[0]! + x, cell[1]! + y, cell[2]! + z);
  return mix(mix(mix(h(0, 0, 0), h(1, 0, 0), f[0]!), mix(h(0, 1, 0), h(1, 1, 0), f[0]!), f[1]!),
    mix(mix(h(0, 0, 1), h(1, 0, 1), f[0]!), mix(h(0, 1, 1), h(1, 1, 1), f[0]!), f[1]!), f[2]!);
}

function parameters(fragment: string, pine = false) {
  const speciesIndex = pine ? 2 : 1;
  return {
    edgeFrequency: Number(fragment.match(/paintEdgeFrequency = mix\(([\d.]+), ([\d.]+)/)![speciesIndex]),
    threshold: Number(fragment.match(/< ([\d.]+) \* paintRim/)![1]),
    rimWidth: Number(fragment.match(/smoothstep\(0.0, ([\d.]+), paintFacing\)/)![1]),
    washFrequency: Number(fragment.match(/paintWashFrequency = mix\(([\d.]+), ([\d.]+)/)![speciesIndex]),
    gain: Number(fragment.match(/- 0.5\) \* ([\d.]+), -1.0/)![1]),
    amplitude: Number(fragment.match(/1.0 \+ ([\d.]+) \* paintWash/)![1]),
  };
}

describe.each([false, true])("painted clusters (pine=%s, B2-213/B2-218)", (pine) => {
  it("selects needle shading with the existing style and darkens only pine undersides", () => {
    const foliage = createFoliage(1);
    try {
      foliage.setTiles([
        { kind: "pine", x: 0, y: 0, z: 0, scale: 1, lean: 0 },
        { kind: "broadleaf", x: 1, y: 0, z: 0, scale: 1, lean: 0 },
      ]);
      for (const [kind, species] of Object.entries(foliage.species)) {
        const crown = species.variants.find(v => v.crowns.count > 0)!.crowns;
        expect(crown.geometry.getAttribute("treeStyle").getY(0) < -0.5).toBe(kind === "pine");
      }
      const shader = compile(foliage.species.pine.crowns.material);
      expect(shader.vertexShader).toContain("vPaintNeedle = vec2(1.0 - step(-0.5, treeStyle.y), normal.y)");
      const match = shader.fragmentShader.match(/paintNeedleShade = mix\(([\d.]+), ([\d.]+), smoothstep\(-0.1, 0.1, vPaintNeedle.y\)\)/)!;
      const bottom = Number(match[1]), top = Number(match[2]);
      expect(bottom / top).toBeLessThanOrEqual(0.85);
      expect(bottom).toBeGreaterThanOrEqual(0.8);
      expect(shader.fragmentShader).toContain("outgoingLight *= mix(1.0, paintNeedleShade, vPaintNeedle.x)");
      expect(shader.fragmentShader.indexOf("float paintNeedleShade")).toBeGreaterThan(shader.fragmentShader.indexOf("float leafLuma"));
      // Matched unit-ramp samples isolate the directional treatment from sun/ramp.
      const p = parameters(shader.fragmentShader, true);
      for (let i = 0; i < 1024; i++) {
        const wash = 1 + p.amplitude * Math.max(-1, Math.min(1, (noise([i * 0.017 * p.washFrequency, 1.21, -0.73]) - 0.5) * p.gain));
        expect(wash * bottom).toBeLessThanOrEqual(wash * top * 0.85);
      }
      process.stdout.write(`B2-218 underside/top unit-ramp luma=${(bottom / top).toFixed(2)}\n`);
    } finally { foliage.dispose(); }
  });

  it("cuts a serrated silhouette while keeping the cluster interior solid", () => {
    const foliage = createFoliage(1);
    try {
      const p = parameters(compile(foliage.species[pine ? "pine" : "broadleaf"].crowns.material).fragmentShader, pine);
      expect(p.edgeFrequency).toBeGreaterThanOrEqual(pine ? 10 : 6);
      expect(p.edgeFrequency).toBeLessThanOrEqual(pine ? 16 : 10);
      const discard = (point: Point, facing: number) => noise(point.map(x => x * p.edgeFrequency) as Point)
        < p.threshold * (1 - smooth(Math.abs(facing) / p.rimWidth));
      const reports: string[] = [];
      // Several cluster centres, radii and view planes; closed rings include the seam.
      for (const [cx, cy, cz, radius] of [[0.3, 1.7, -0.2, 0.6], [-1.1, 2.2, 0.8, 0.68], [1.4, -0.4, -0.7, 0.74]]) {
        for (const plane of [0, 1, 2]) {
          const ring = Array.from({ length: 4096 }, (_, i) => {
            const angle = i * Math.PI * 2 / 4096, a = Math.cos(angle) * radius!, b = Math.sin(angle) * radius!;
            const point: Point = [cx! + (plane === 1 ? 0 : a), cy! + (plane === 0 ? 0 : plane === 1 ? a : b), cz! + (plane === 2 ? 0 : b)];
            expect(discard(point, 0.5)).toBe(false);
            return discard(point, 0);
          });
          const ratio = ring.filter(Boolean).length / ring.length;
          const transitions = ring.reduce((n, state, i) => n + Number(state !== ring[(i + 1) % ring.length]), 0);
          expect(ratio).toBeGreaterThanOrEqual(pine ? 0.30 : 0.25);
          expect(ratio).toBeLessThanOrEqual(pine ? 0.60 : 0.55);
          // A smooth circle crosses a scan line twice. At least 3x that baseline.
          expect(transitions).toBeGreaterThanOrEqual(3 * 2);
          reports.push(`${ratio.toFixed(3)}/${transitions}`);
        }
      }
      process.stdout.write(`B2-${pine ? 218 : 213} silhouette discard/transitions (9 rings): ${reports.join(", ")}\n`);
    } finally { foliage.dispose(); }
  });

  it("gives a continuous bounded light wash inside a cluster without grain", () => {
    const foliage = createFoliage(1);
    try {
      const p = parameters(compile(foliage.species[pine ? "pine" : "broadleaf"].crowns.material).fragmentShader, pine);
      expect(p.washFrequency).toBeGreaterThanOrEqual(pine ? 25 : 15);
      expect(p.washFrequency).toBeLessThanOrEqual(pine ? 35 : 25);
      expect(p.amplitude).toBe(0.12);
      const wash = (point: Point) => 1 + p.amplitude * Math.max(-1, Math.min(1, (noise(point.map(x => x * p.washFrequency) as Point) - 0.5) * p.gain));
      const values: number[] = [];
      let adjacentDelta = 0;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 128; x++) {
        // Fixed unit-luma ramp isolates modulation from the existing normal/light ramp.
        const point: Point = [0.37 + x * 0.008, 1.21 + y * 0.031, -0.73];
        const value = wash(point);
        values.push(value);
        expect(value).toBeGreaterThanOrEqual(0.88);
        expect(value).toBeLessThanOrEqual(1.12);
        adjacentDelta = Math.max(adjacentDelta, Math.abs(value - wash([point[0] + 0.0001, point[1], point[2]])));
      }
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const sigma = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
      expect(sigma).toBeGreaterThanOrEqual(0.04);
      expect(sigma).toBeLessThanOrEqual(0.12);
      expect(adjacentDelta).toBeLessThan(0.003);
      process.stdout.write(`B2-${pine ? 218 : 213} unit-ramp luma sigma=${sigma.toFixed(5)}; max delta/0.1mm=${adjacentDelta.toFixed(5)}\n`);
    } finally { foliage.dispose(); }
  });

  it("shares the exact cutout with both shadows, uses <=2 noise calls and no new mesh/attribute", () => {
    const foliage = createFoliage(1), crowns = foliage.species[pine ? "pine" : "broadleaf"].crowns;
    try {
      const materials = [crowns.material, crowns.customDepthMaterial!, crowns.customDistanceMaterial!];
      const shaders = [compile(materials[0]!), compile(materials[1]!, ShaderLib.depth!), compile(materials[2]!, ShaderLib.distance!)];
      const cutout = (s: string) => s.slice(s.indexOf("// Only cluster leaves:"), s.indexOf("discard;") + "discard;\n}".length);
      for (let i = 0; i < shaders.length; i++) {
        const { vertexShader, fragmentShader } = shaders[i]!;
        expect(cutout(fragmentShader)).toBe(cutout(shaders[0]!.fragmentShader));
        expect(fragmentShader.match(/paintNoise\(vPaintPosition/g)).toHaveLength(i === 0 ? 2 : 1);
        expect(fragmentShader).toContain("p = fract(p * 0.1031)");
        expect(fragmentShader).toContain("p += dot(p, p.yzx + 33.33)");
        expect(fragmentShader).toContain("f = f * f * (3.0 - 2.0 * f)");
        expect(vertexShader).toContain("vPaintNormal = paintNormalMatrix * mix(normal, trailNormal, treeStyle.z)");
        expect(vertexShader).toContain("projectionMatrix[2][3] == 0.0 ? vec3(0.0, 0.0, 1.0) : -mvPosition.xyz");
        expect(vertexShader.indexOf("vPaintPosition =")).toBeLessThan(vertexShader.indexOf("float forestSway"));
        expect(materials[i]!.alphaToCoverage).toBe(false);
      }
      const colour = shaders[0]!.fragmentShader;
      expect(colour.indexOf("float paintWash")).toBeGreaterThan(colour.indexOf("float leafLuma"));
      expect(colour.indexOf("float paintWash")).toBeLessThan(colour.indexOf("#include <tonemapping_fragment>"));
      expect(compile(foliage.species.broadleaf.trunks.material).fragmentShader).not.toContain("paintNoise");
      expect(foliage.group.children).toHaveLength(10);
      // Nine existing geometry attributes + matrix(4) + colour(1) + crown fade(1).
      expect(Object.keys(crowns.geometry.attributes)).toHaveLength(9);
      expect(Object.keys(crowns.geometry.attributes).length + 6).toBeLessThanOrEqual(16);
      const triangles = Object.values(foliage.species).flatMap(s => s.variants.map(v => v.crowns.geometry.index!.count / 3 + v.trunks.geometry.index!.count / 3));
      process.stdout.write(`B2-213 triangles/tree=${triangles.join(",")}; mesh slots=10; added passes=0; attribute slots with fade=15\n`);
    } finally { foliage.dispose(); }
  });
});
