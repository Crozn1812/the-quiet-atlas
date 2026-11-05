import { paletteColor, STYLE_PRESETS, WORLD_DIRECTION } from "../../../src/features/world/art/direction";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Color, LinearFilter, MeshToonMaterial, NearestFilter, NoColorSpace,
  RedFormat, ShaderLib, type WebGLProgramParametersWithUniforms, type WebGLRenderer,
} from "three";
import { hex } from "../../../src/features/world/art/palette";
import {
  createRampGradient, createRampMaterial, disposeRampGradients, RAMP_PRESETS,
} from "../../../src/features/world/materials/ramp";

afterEach(disposeRampGradients);

function compile(material: MeshToonMaterial) {
  const shader = {
    vertexShader: ShaderLib.toon!.vertexShader,
    fragmentShader: ShaderLib.toon!.fragmentShader,
    uniforms: {},
  } as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}

describe("painted toon ramp", () => {
  it.each([2, 3, 4, 5, 256])("has a monotonic, nonblack %i-step data row", (steps) => {
    const texture = createRampGradient(steps);
    const data = texture.image.data as Uint8Array;
    expect(texture.image.width).toBe(steps);
    expect(texture.image.height).toBe(1);
    expect(texture.format).toBe(RedFormat);
    expect(texture.colorSpace).toBe(NoColorSpace);
    expect(texture.unpackAlignment).toBe(1);
    expect(texture.generateMipmaps).toBe(false);
    expect(data[0]).toBeGreaterThan(0);
    expect(data.at(-1)).toBe(255);
    for (let i = 1; i < data.length; i++) expect(data[i]).toBeGreaterThanOrEqual(data[i - 1]!);
  });

  it.each([0, 1, -1, 2.5, 257, NaN, Infinity])("rejects invalid step count %s", (steps) => {
    expect(() => createRampGradient(steps)).toThrow(RangeError);
  });

  it("caches each steps/filter pair and sets both sampling filters", () => {
    const soft = createRampGradient();
    const hard = createRampGradient(4, false);
    expect(createRampGradient(4, true)).toBe(soft);
    expect(createRampGradient(4, false)).toBe(hard);
    expect(hard).not.toBe(soft);
    expect(createRampGradient(3)).not.toBe(soft);
    expect(soft.minFilter).toBe(LinearFilter);
    expect(soft.magFilter).toBe(LinearFilter);
    expect(hard.minFilter).toBe(NearestFilter);
    expect(hard.magFilter).toBe(NearestFilter);
  });

  it("shares textures across materials and has no specular/metalness properties", () => {
    const a = createRampMaterial(RAMP_PRESETS.terrain);
    const b = createRampMaterial(RAMP_PRESETS.crown, { shadowTint: 0xaabbcc });
    const hard = createRampMaterial(RAMP_PRESETS.water, { soft: false });
    expect(a).toBeInstanceOf(MeshToonMaterial);
    expect(a.gradientMap).toBe(b.gradientMap);
    expect(hard.gradientMap).toBe(createRampGradient(4, false));
    expect(a).not.toHaveProperty("specular");
    expect(a).not.toHaveProperty("metalness");
    for (const material of [a, b, hard]) material.dispose();
  });

  it("uses palette colours and an ink/paper blend for the trunk", () => {
    // B2-038: world colours come from art direction C (palette recipes), not raw palette entries.
    expect(RAMP_PRESETS.terrain).toBe(paletteColor(WORLD_DIRECTION.background.terrain));
    expect(RAMP_PRESETS.crown).toBe(paletteColor(WORLD_DIRECTION.foliage.crown));
    expect(RAMP_PRESETS.water).toBe(hex("water"));
    expect(RAMP_PRESETS.trunk).toBe(paletteColor(WORLD_DIRECTION.foliage.trunk));
    expect(WORLD_DIRECTION).toBe(STYLE_PRESETS.C);
    for (const color of Object.values(RAMP_PRESETS)) {
      const material = createRampMaterial(color);
      expect(material.color.getHex()).toBe(color);
      material.dispose();
    }
  });

  it("injects a linear-space shadow tint after lighting and before tone mapping/fog", () => {
    const material = createRampMaterial(RAMP_PRESETS.terrain);
    const shader = compile(material);
    expect(shader.uniforms.rampShadowTint!.value).toEqual(
      new Color(hex("mist")).lerp(new Color(hex("indigo")), 0.5),
    );
    const source = shader.fragmentShader;
    expect(source).toContain("uniform vec3 rampShadowTint;");
    expect(source).toContain("outgoingLight = mix( rampShadow, outgoingLight, smoothstep( 0.0, 0.5, rampLight ) );");
    expect(source.indexOf("vec3 rampShadow =")).toBeGreaterThan(source.indexOf("#include <aomap_fragment>"));
    expect(source.indexOf("vec3 rampShadow =")).toBeLessThan(source.indexOf("#include <opaque_fragment>"));
    expect(source).toContain("#include <tonemapping_fragment>");
    expect(source).toContain("#include <fog_fragment>");
    material.dispose();
  });

  it("keeps shader keys stable while giving each material its own tint uniform", () => {
    const a = createRampMaterial(RAMP_PRESETS.terrain, { shadowTint: 0x9988cc });
    const b = createRampMaterial(RAMP_PRESETS.terrain, { shadowTint: 0x9988cc });
    const c = createRampMaterial(RAMP_PRESETS.water, { shadowTint: 0, soft: false });
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    expect(a.customProgramCacheKey()).toBe(c.customProgramCacheKey());
    expect(compile(a).fragmentShader).toBe(compile(c).fragmentShader);
    expect(compile(a).uniforms.rampShadowTint!.value).toEqual(new Color(0x9988cc));
    expect(compile(a).uniforms.rampShadowTint!.value).not.toBe(compile(b).uniforms.rampShadowTint!.value);
    expect(compile(c).uniforms.rampShadowTint!.value).toEqual(new Color(0));
    for (const material of [a, b, c]) material.dispose();
  });

  it("disposes every cached texture once, clears the cache and recreates on demand", () => {
    const textures = [createRampGradient(), createRampGradient(4, false), createRampGradient(3)];
    const spies = textures.map((texture) => vi.fn().mockName(texture.uuid));
    textures.forEach((texture, i) => texture.addEventListener("dispose", spies[i]!));
    const material = createRampMaterial(RAMP_PRESETS.terrain);
    material.dispose();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    disposeRampGradients();
    disposeRampGradients();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    const fresh = createRampGradient();
    expect(fresh).not.toBe(textures[0]);
    expect(createRampGradient()).toBe(fresh);
  });
});
