import { paletteColor, STYLE_PRESETS, WORLD_DIRECTION } from "../../../src/features/world/art/direction";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Color, LinearFilter, MeshToonMaterial, NearestFilter, NoColorSpace,
  RedFormat, ShaderChunk, ShaderLib, Vector3, type WebGLProgramParametersWithUniforms, type WebGLRenderer,
} from "three";
import { hex } from "../../../src/features/world/art/palette";
import {
  createRampGradient, createRampMaterial, disposeRampGradients, RAMP_PRESETS, RAMP_STEPS,
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
  it("uses analytic terrain irradiance while objects retain their four soft levels", () => {
    const terrain = createRampMaterial(RAMP_PRESETS.terrain, RAMP_STEPS.terrain);
    const foliage = createRampMaterial(RAMP_PRESETS.crown, RAMP_STEPS.foliage);
    const prop = createRampMaterial(RAMP_PRESETS.trunk);
    try {
      const shader = compile(terrain).fragmentShader;
      expect(terrain.gradientMap).toBe(createRampGradient(4, true));
      expect(shader).not.toContain("#include <gradientmap_pars_fragment>");
      expect(shader).toContain("float halfLambert = clamp( dot( normal, lightDirection ) * 0.5 + 0.5, 0.0, 1.0 );");
      expect(shader).toContain("return vec3( mix( 0.25, 1.0, halfLambert ) );");
      expect(shader).not.toContain("texture2D( gradientMap");
      expect(shader).toContain("#include <lights_fragment_begin>");
      expect(shader).toContain("#include <shadowmap_pars_fragment>");
      // The unchanged Three light path multiplies angular irradiance by shadowed light colour.
      expect(ShaderChunk.lights_toon_pars_fragment).toContain("* directLight.color");
      expect(ShaderChunk.lights_fragment_begin).toContain("getShadow(");
      for (const material of [foliage, prop]) {
        expect(material.gradientMap).toBe(createRampGradient(4, true));
        expect(compile(material).fragmentShader).toContain("#include <gradientmap_pars_fragment>");
        expect(material.customProgramCacheKey()).not.toBe(terrain.customProgramCacheKey());
      }
    } finally { for (const material of [terrain, foliage, prop]) material.dispose(); }
  });

  it("keeps adjacent luma within 0.03 over a densely sampled curved slope, with distinct cast shade", () => {
    const material = createRampMaterial(hex("grass"), RAMP_STEPS.terrain);
    try {
      const shader = compile(material);
      const shadowTint = shader.uniforms.rampShadowTint!.value as Color;
      const highlight = shader.uniforms.rampHighlightTint!.value as Color;
      const light = new Vector3(0.8, 0.6, 0).normalize();
      const luma = (c: Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
      const smooth = (a: number, b: number, v: number) => {
        const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
        return t * t * (3 - 2 * t);
      };
      // CPU reference for the asserted GLSL half-Lambert and existing post-light tint.
      const shade = (normal: Vector3, visibility = 1) => {
        const halfLambert = Math.max(0, Math.min(1, normal.dot(light) * 0.5 + 0.5));
        const outgoing = material.color.clone().multiplyScalar((0.25 + 0.75 * halfLambert) * visibility);
        const intensity = luma(outgoing);
        outgoing.multiply(new Color().setRGB(1, 1, 1).lerp(highlight, smooth(0.5, 1, intensity) * 0.12));
        const shadow = material.color.clone().multiply(new Color().setRGB(0.25, 0.25, 0.25).lerp(shadowTint, 0.6));
        return luma(shadow.lerp(outgoing, smooth(0, 0.5, intensity)));
      };
      const samples = Array.from({ length: 2049 }, (_, i) => {
        const angle = -Math.PI / 2 + Math.PI * i / 2048;
        return shade(new Vector3(Math.sin(angle), Math.cos(angle), 0));
      });
      expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.1);
      for (let i = 1; i < samples.length; i++) expect(Math.abs(samples[i]! - samples[i - 1]!)).toBeLessThanOrEqual(0.03);
      expect(shade(light) - shade(light, 0)).toBeGreaterThan(0.1);
    } finally { material.dispose(); }
  });

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

  it("uses palette recipes from the active R direction", () => {
    expect(RAMP_PRESETS.terrain).toBe(paletteColor(WORLD_DIRECTION.background.terrain));
    expect(RAMP_PRESETS.crown).toBe(paletteColor(WORLD_DIRECTION.foliage.crown));
    expect(RAMP_PRESETS.water).toBe(hex("water"));
    expect(RAMP_PRESETS.trunk).toBe(paletteColor(WORLD_DIRECTION.foliage.trunk));
    expect(WORLD_DIRECTION).toBe(STYLE_PRESETS.R);
    for (const color of Object.values(RAMP_PRESETS)) {
      const material = createRampMaterial(color);
      expect(material.color.getHex()).toBe(color);
      material.dispose();
    }
  });

  it("injects a linear-space shadow tint after lighting and before tone mapping/fog", () => {
    const material = createRampMaterial(RAMP_PRESETS.terrain, { preset: STYLE_PRESETS.C });
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

  it("keeps R shadows cool and chromatic, highlights slightly warm and shade readable", () => {
    const material = createRampMaterial(hex("grass"));
    try {
      const shader = compile(material);
      expect(shader.uniforms.rampClearLight!.value).toBe(true);
      const tint = shader.uniforms.rampShadowTint!.value as Color;
      expect(tint).toEqual(new Color(hex("indigo")).lerp(new Color(hex("skyHigh")), 0.25));
      const highlight = shader.uniforms.rampHighlightTint!.value as Color;
      expect(highlight).toEqual(new Color(hex("cloud")).lerp(new Color(hex("sunGold")), 0.12));
      expect(highlight.r).toBeGreaterThan(highlight.g);
      expect(highlight.g).toBeGreaterThan(highlight.b);
      expect(shader.fragmentShader).toContain("rampShadow = diffuseColor.rgb * mix( vec3( 0.25 ), rampShadowTint, 0.6 );");
      expect(shader.fragmentShader).toContain("smoothstep( 0.5, 1.0, rampLight ) * 0.12");
      const base = material.color;
      const shadow = base.clone().multiply(new Color().setRGB(0.25, 0.25, 0.25).lerp(tint, 0.6));
      const light = base.clone().multiply(new Color().setRGB(1, 1, 1).lerp(highlight, 0.12));
      const luma = (color: Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
      expect(luma(light) / luma(shadow)).toBeGreaterThan(4);
      expect(shadow.b / shadow.g).toBeGreaterThan(base.b / base.g);
      expect(shadow.g).toBeGreaterThan(shadow.r);
      expect(shadow.g).toBeGreaterThan(shadow.b);
      expect(light.r / light.b).toBeGreaterThan(base.r / base.b);
    } finally { material.dispose(); }
  });

  it.each(["A", "B", "C"] as const)("preserves the legacy %s ramp/tint profile", id => {
    const material = createRampMaterial(hex("forestLight"), { preset: STYLE_PRESETS[id] });
    try {
      const shader = compile(material);
      expect(shader.uniforms.rampClearLight!.value).toBe(false);
      expect(shader.uniforms.rampShadowTint!.value).toEqual(new Color(hex("mist")).lerp(new Color(hex("indigo")), 0.5));
      expect(Array.from((material.gradientMap as import("three").DataTexture).image.data as Uint8Array)).toEqual([64, 128, 191, 255]);
    } finally { material.dispose(); }
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
