import { Color, Matrix3, Matrix4, ShaderLib, SRGBColorSpace, Vector2, Vector3, type Material, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";
import { createCrownFade } from "../../../src/features/world/crown-fade";
import { createFoliage, updateFoliageWind } from "../../../src/features/world/foliage/instances";
import type { FoliageTree } from "../../../src/features/world/foliage/scatter";
import { timeOfDayAt } from "../../../src/features/world/layout/lighting";
import { directGrade } from "../../../src/features/world/scene/compose";
import { applyCoastAtmosphere, lightingAt, type LightingGrade } from "../../../src/features/world/sky/grade";

const luma = (c: Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
const smooth = (x: number) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };
function compile(material: Material, source = ShaderLib.toon!) {
  const shader = { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader, uniforms: {} } as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}

// Three's ACES fit/matrices, exposure=1, then sRGB. The existing paper pass
// applies the same fit when rendering through its linear offscreen target.
function display(color: Color): Color {
  const input = new Matrix3().set(0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777);
  const output = new Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);
  const rgb = new Vector3(color.r, color.g, color.b).multiplyScalar(1 / 0.6).applyMatrix3(input);
  const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  rgb.set(fit(rgb.x), fit(rgb.y), fit(rgb.z)).applyMatrix3(output).clampScalar(0, 1);
  const srgb = new Color(rgb.x, rgb.y, rgb.z).getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace);
  return new Color(srgb.r, srgb.g, srgb.b);
}

/** CPU evaluation of the existing toon diffuse + ramp, including cast shade/AO. */
function oldLight(pigment: Color, grade: LightingGrade, shader: WebGLProgramParametersWithUniforms, nl: number, visibility: number): Color {
  const direct = grade.sunColor.clone().multiplyScalar(grade.sunIntensity * (0.25 + 0.75 * Math.max(nl, 0)) * visibility);
  const hemi = grade.hemiGround.clone().lerp(grade.hemiSky, 0.5).multiplyScalar(grade.hemiIntensity * visibility);
  const lit = direct.add(hemi).multiply(pigment).multiplyScalar(1 / Math.PI);
  const light = luma(lit);
  const shadow = pigment.clone().multiply(new Color(0.25, 0.25, 0.25).lerp(shader.uniforms.rampShadowTint!.value, 0.6));
  lit.multiply(new Color(1, 1, 1).lerp(shader.uniforms.rampHighlightTint!.value, smooth((light - 0.5) / 0.5) * 0.12));
  return shadow.lerp(lit, smooth(light / 0.5));
}

/** CPU evaluation with constants read from the installed leaf shader. */
function leafLight(old: Color, pigment: Color, grade: LightingGrade, shader: WebGLProgramParametersWithUniforms, nl: number, edge: number): Color {
  const out = old.clone();
  if (nl >= 0) return out;
  const coefficients = shader.fragmentShader.match(/mix\(([\d.]+), ([\d.]+), leafEdge\)/)!;
  const k = Number(coefficients[1]) + (Number(coefficients[2]) - Number(coefficients[1])) * edge;
  out.add(pigment.clone().multiply(grade.sunColor).multiplyScalar(grade.sunIntensity * k * (1 - nl)));
  const floor = Number(shader.fragmentShader.match(/max\(([\d.]+) - leafLuma, 0.0\)/)![1]);
  const shade = (shader.uniforms.rampShadowTint!.value as Color).clone().lerp(grade.hemiSky.clone().multiplyScalar(grade.hemiIntensity), 0.5);
  return out.add(shade.multiplyScalar(Math.max(floor - luma(out), 0) / Math.max(luma(shade), 0.00001)));
}

describe("foliage graded lighting (B2-183)", () => {
  it("keeps backlit leaves >=0.06 at dawn/coast, cool in shade, with a stronger rim and <=10% front-light increase", () => {
    const foliage = createFoliage(32);
    const trees: FoliageTree[] = Array.from({ length: 32 }, (_, i) => ({ kind: i % 2 ? "pine" : "broadleaf", x: i * 7.3, z: -i * 4.1, y: 0, scale: 1, lean: 0 }));
    foliage.setTiles(trees);
    const shader = compile(foliage.species.broadleaf.crowns.material);
    expect(shader.fragmentShader).toContain("if (vForestWood < 0.5)");
    expect(shader.fragmentShader).toContain("leafBacklit = leafNL < 0.0");
    expect(shader.fragmentShader).toContain("* mix(0.15, 0.25, leafEdge) * (1.0 - leafNL)");
    expect(shader.fragmentShader).toContain("pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0)");
    expect(shader.fragmentShader).toContain("hemisphereLights[0].skyColor");
    expect(shader.fragmentShader.indexOf("float leafLuma")).toBeGreaterThan(shader.fragmentShader.indexOf("float rampLight"));
    expect(shader.fragmentShader.indexOf("float leafLuma")).toBeLessThan(shader.fragmentShader.indexOf("#include <tonemapping_fragment>"));
    let minimum = Infinity, frontRatio = 0;
    try {
      for (const t of [0.15, 0.93]) {
        const tod = timeOfDayAt(t);
        const grade = applyCoastAtmosphere(directGrade(lightingAt(tod), tod), t);
        for (const species of Object.values(foliage.species)) for (const { crowns } of species.variants) {
          const colors = crowns.geometry.getAttribute("color"), surface = crowns.geometry.getAttribute("surface");
          for (let instance = 0; instance < crowns.count; instance++) {
            const tint = new Color(); crowns.getColorAt(instance, tint);
            for (let i = 0; i < colors.count; i++) {
              if (surface.getX(i) === 1) continue;
              const pigment = new Color().fromBufferAttribute(colors, i).multiply(crowns.material.color).multiply(tint);
              for (const nl of [-1, -0.5, -0.001, 0, 0.5, 1]) for (const visibility of [0, 0.3, 1]) {
                const old = oldLight(pigment, grade, shader, nl, visibility);
                const center = leafLight(old, pigment, grade, shader, nl, 0);
                const rim = leafLight(old, pigment, grade, shader, nl, 1);
                if (nl < 0) {
                  minimum = Math.min(minimum, luma(display(center)), luma(display(rim)));
                  expect(luma(center)).toBeGreaterThanOrEqual(0.06 - 1e-12);
                  expect(luma(rim)).toBeGreaterThanOrEqual(luma(center) - 1e-12);
                } else {
                  frontRatio = Math.max(frontRatio, luma(display(center)) / luma(display(old)));
                }
              }
            }
          }
        }
        // Force zero illumination/pigment to exercise the ambient fallback alone.
        const shade = leafLight(new Color(0, 0, 0), new Color(0, 0, 0), grade, shader, -1, 0);
        expect(luma(shade)).toBeCloseTo(0.06, 10);
        expect(shade.b).toBeGreaterThan(shade.r);
      }
      expect(minimum).toBeGreaterThanOrEqual(0.06);
      expect(frontRatio).toBeLessThanOrEqual(1.1);
      process.stdout.write(`B2-183 CPU t=0.15/0.93: min backlit display luma=${minimum.toFixed(4)}; front-lit ratio=${frontRatio.toFixed(4)}; backlit linear floor=0.0600\n`);
    } finally { foliage.dispose(); }
  });

  it("shares bounded world-metre wind across colour/depth/distance, stops for reduced motion and leaves wood fixed", () => {
    const foliage = createFoliage(1), crowns = foliage.species.broadleaf.crowns;
    createCrownFade(crowns, 1);
    const shaders = [compile(crowns.material), compile(crowns.customDepthMaterial!, ShaderLib.depth!), compile(crowns.customDistanceMaterial!, ShaderLib.distance!)];
    const wind = shaders[0]!.uniforms.forestWind!;
    try {
      for (const shader of shaders) {
        expect(shader.uniforms.forestWind).toBe(wind);
        expect(shader.vertexShader).toContain("inverse(mat3(modelMatrix) * mat3(instanceMatrix))");
        expect(shader.vertexShader).toContain("1.0 - step(0.5, surface) * (1.0 - step(1.5, surface))");
        expect(shader.vertexShader).toContain("forestWind.y * forestTip * forestLeaf");
        expect(shader.vertexShader).toContain("smoothstep(0.0, 6.0, transformed.y)");
      }
      expect(shaders[0]!.vertexShader).toContain("vCrownAlpha = crownAlpha");
      expect(compile(foliage.species.pine.trunks.material).vertexShader).not.toContain("forestWind");
      const vertex = shaders[0]!.vertexShader;
      const amplitude = Number(vertex.match(/float forestSway = ([\d.]+)/)![1]);
      const phaseWeights = vertex.match(/instanceMatrix\[3\].xz, vec2\(([\d.]+), ([\d.]+)\)/)!;
      expect(vertex).toContain("4.0 + 3.0 * (0.5 + 0.5 * sin(forestPhase))");
      expect(vertex).toContain("forestWind.x * 6.28318530718 / forestPeriod + forestPhase");
      const cpuWind = (x: number, z: number, height: number, surface: number) => {
        const phase = x * Number(phaseWeights[1]) + z * Number(phaseWeights[2]);
        const period = 4 + 3 * (0.5 + 0.5 * Math.sin(phase));
        const state = wind.value as Vector2;
        const offset = amplitude * state.y * smooth(height / 6) * (surface === 1 ? 0 : 1) * Math.sin(state.x * 2 * Math.PI / period + phase);
        return { offset, period };
      };
      expect(cpuWind(10, 20, 6, 0).offset).toBe(0); // Safe until the owner supplies reducedMotion.
      let peak = 0;
      const translations = new Set<number>();
      for (let tick = 0; tick < 100; tick++) {
        foliage.update(0.1, false);
        for (const x of [-100, 0, 31.4]) for (const scale of [0.8, 1.3, 6]) for (const surface of [0, 1, 2]) {
          const sample = cpuWind(x, 20, 6, surface);
          expect(sample.period).toBeGreaterThanOrEqual(4);
          expect(sample.period).toBeLessThanOrEqual(7);
          const axes = new Matrix3().setFromMatrix4(new Matrix4().makeScale(scale, scale, scale));
          axes.elements[3] = 0.3 * scale; // Mature reaching-limb shear.
          const worldOffset = new Vector3(sample.offset, 0, 0).applyMatrix3(axes.clone().invert()).applyMatrix3(axes);
          expect(worldOffset.length()).toBeLessThanOrEqual(0.08 + 1e-12);
          peak = Math.max(peak, worldOffset.length());
          if (surface === 1) expect(worldOffset.length()).toBe(0);
          if (surface === 0) translations.add(sample.offset);
        }
      }
      expect(peak).toBeGreaterThan(0.075);
      expect(translations.size).toBeGreaterThan(100);
      foliage.update(0, true);
      expect(Math.abs(cpuWind(10, 20, 6, 0).offset)).toBe(0);
      foliage.update(20, true);
      expect(Math.abs(cpuWind(10, 20, 6, 2).offset)).toBe(0);
      expect(Math.abs(cpuWind(10, 20, 0, 0).offset)).toBe(0);
      process.stdout.write(`B2-183 wind: peak=${peak.toFixed(5)} m; period=4–7 s; reducedMotion=0 m; wood=0 m\n`);
    } finally { foliage.dispose(); }
  });

  it("retains the existing geometry and ten mesh slots without new attributes or materials", () => {
    const foliage = createFoliage(1);
    try {
      expect(foliage.group.children).toHaveLength(10);
      const reports: string[] = [];
      for (const [kind, species] of Object.entries(foliage.species)) for (const { seed, crowns, trunks } of species.variants) {
        const crownTriangles = crowns.geometry.index!.count / 3, trunkTriangles = trunks.geometry.index!.count / 3;
        expect(trunkTriangles).toBe(42);
        expect(crownTriangles).toBe(kind === "pine" ? (3 + seed % 3) * 44 : 349); // B2-182 broadleaf v3 crown (was 272)
        expect(Object.keys(crowns.geometry.attributes).sort()).toEqual(["color", "normal", "position", "shapeA", "shapeB", "surface", "treeStyle"]);
        expect(crowns.material).toBe(foliage.species.broadleaf.crowns.material);
        reports.push(`${kind}/${seed}=${crownTriangles + trunkTriangles}->${crownTriangles + trunkTriangles}`);
      }
      process.stdout.write(`B2-183 triangles/tree: ${reports.join(", ")}; mesh slots=10->10; extra passes=0\n`);
    } finally { foliage.dispose(); }
  });

  it("lets index update the streamed mesh list once per tile, including newly compiled shaders", () => {
    const tiles = [createFoliage(1), createFoliage(1)];
    const meshes = tiles.flatMap(tile => Object.values(tile.species).flatMap(species => species.variants.flatMap(v => [v.trunks, v.crowns])));
    try {
      updateFoliageWind(meshes, 0.25, false);
      const shaders = tiles.map(tile => compile(tile.species.pine.crowns.material));
      for (const shader of shaders) expect(shader.uniforms.forestWind!.value).toEqual(new Vector2(0.25, 1));
      updateFoliageWind([...meshes, ...meshes], 0.5, false);
      for (const shader of shaders) expect(shader.uniforms.forestWind!.value).toEqual(new Vector2(0.75, 1));
      updateFoliageWind(meshes, 10, true);
      for (const shader of shaders) expect(shader.uniforms.forestWind!.value).toEqual(new Vector2(0.75, 0));
      for (const tile of tiles) tile.dispose();
      updateFoliageWind(meshes, 1, false);
      for (const shader of shaders) expect(shader.uniforms.forestWind!.value).toEqual(new Vector2(0.75, 0));
    } finally { tiles.forEach(tile => tile.dispose()); }
  });
});
