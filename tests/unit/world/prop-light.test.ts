import { Color, ShaderLib, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { expect, it } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { timeOfDayAt } from "../../../src/features/world/layout/lighting";
import { createPropMaterial } from "../../../src/features/world/props/materials";
import { directGrade } from "../../../src/features/world/scene/compose";
import { applyCoastAtmosphere, lightingAt } from "../../../src/features/world/sky/grade";

const luma = (c: Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
const smooth = (x: number) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };

it("keeps kit wood readable in forest shade and limits sky rims and sunlit changes", () => {
  const material = createPropMaterial("wood");
  const shader = { ...ShaderLib.toon!, uniforms: {} } as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  try {
    // Pin the CPU model to the installed shader and retain the upstream ramp hook.
    for (const source of ["uniform vec3 propShadeTint;", "rampShadowTint", "0.08 + 0.04 * propAlbedoLuma",
      "smoothstep(0.05, 0.2, propDirect)", "mix(diffuseColor.rgb, propShadeTint, 0.55)",
      "1.0 - propLight / propFloor", "0.1 * propSky * propFresnel", "hemisphereLights[0].direction",
      "pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0)"])
      expect(shader.fragmentShader).toContain(source);
    let minimum = Infinity, ratio = 1;
    for (const t of [0.15, 0.93]) {
      const tod = timeOfDayAt(t);
      const grade = applyCoastAtmosphere(directGrade(lightingAt(tod), tod), t);
      for (const grain of [0, 0.15, 0.46, 0.78, 1]) {
        const pigment = new Color(PALETTE.rock).lerp(new Color(PALETTE.rockDark), grain).lerp(new Color(PALETTE.dusk), 0.08);
        for (const visibility of [0, 0.03, 0.1, 1]) for (const nl of [-1, 0, 1]) {
          const direct = grade.sunColor.clone().multiplyScalar(grade.sunIntensity * (0.25 + 0.75 * Math.max(nl, 0)) * visibility / Math.PI).multiply(pigment);
          const lit = grade.hemiGround.clone().lerp(grade.hemiSky, 0.5).multiplyScalar(grade.hemiIntensity / Math.PI).multiply(pigment).add(direct);
          const light = luma(lit);
          const shadow = pigment.clone().multiply(new Color(0.25, 0.25, 0.25).lerp(shader.uniforms.rampShadowTint!.value, 0.6));
          lit.multiply(new Color(1, 1, 1).lerp(shader.uniforms.rampHighlightTint!.value, smooth((light - 0.5) / 0.5) * 0.12));
          const old = shadow.lerp(lit, smooth(light / 0.5));
          const floor = 0.08 + 0.04 * luma(pigment);
          const shade = pigment.clone().lerp(shader.uniforms.propShadeTint!.value, 0.55);
          shade.multiplyScalar(floor / luma(shade));
          const weight = 1 - smooth((luma(direct) / luma(pigment) - 0.05) / 0.15);
          const center = old.clone().add(shade.clone().multiplyScalar(Math.max(0, 1 - luma(old) / floor) * weight));
          for (const skyFacing of [0, 0.5, 1]) for (const edge of [0, 0.5, 1]) {
            const sky = grade.hemiSky.clone().multiplyScalar(grade.hemiIntensity);
            sky.setRGB(Math.min(1, sky.r), Math.min(1, sky.g), Math.min(1, sky.b));
            const rim = center.clone().multiply(sky).multiplyScalar(0.1 * skyFacing * edge ** 3).add(center);
            expect(luma(rim) / luma(center)).toBeLessThanOrEqual(1.1 + 1e-12);
            if (visibility <= 0.1) minimum = Math.min(minimum, luma(rim));
            if (visibility === 1 && nl === 1) ratio = Math.max(ratio, luma(rim) / luma(old));
          }
          if (visibility === 0) expect(shade.b).toBeGreaterThan(shade.r);
        }
      }
    }
    expect(minimum).toBeGreaterThanOrEqual(0.08);
    expect(ratio).toBeLessThanOrEqual(1.1 + 1e-12);
    process.stdout.write(`B2-216 CPU t=0.15/0.93: min shadow linear luma=${minimum.toFixed(4)}; max front-lit ratio=${ratio.toFixed(4)}; rim <=10%\n`);
  } finally { material.dispose(); }
});
