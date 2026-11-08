import { readFileSync, statSync } from "node:fs";
import { expect, it } from "vitest";
import { BufferGeometry, Group, Mesh, MeshToonMaterial, ShaderLib, Texture, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { field, pixels, SIZE } from "../../../tools/assets/textures/generate.mjs";
import { attachTerrainDetail, createTerrainDetail, TERRAIN_TEXTURE_BYTES, TERRAIN_TEXTURE_URLS } from "../../../src/features/world/terrain/detail";
import { createRampMaterial, RAMP_STEPS } from "../../../src/features/world/materials/ramp";

it("ships five 512-square linear KTX2 mip chains under the decimal 600 KB cap", () => {
  let bytes = 0;
  for (const [i, url] of TERRAIN_TEXTURE_URLS.entries()) {
    const path = `public${url}`, data = readFileSync(path);
    bytes += statSync(path).size;
    expect(data.subarray(0, 12).toString("hex")).toBe("ab4b5458203230bb0d0a1a0a");
    expect(data.readUInt32LE(20)).toBe(512);
    expect(data.readUInt32LE(24)).toBe(512);
    expect(data.readUInt32LE(40)).toBe(10);
    // BasisLZ for ETC1S, Zstd for the UASTC normal.
    expect(data.readUInt32LE(44)).toBe(i === 4 ? 2 : 1);
  }
  expect(bytes).toBe(TERRAIN_TEXTURE_BYTES);
  expect(bytes).toBeLessThanOrEqual(600_000);
});

it("generates deterministic neutral luminance with periodic values and continuous wrapped edges", () => {
  for (const kind of ["grass", "dirt", "rock", "sand"]) {
    const data = pixels(kind);
    let sum = 0, square = 0, neutral = true;
    for (let i = 0; i < data.length; i += 3) {
      neutral &&= data[i] === data[i + 1] && data[i] === data[i + 2];
      sum += data[i]! / 255;
      square += (data[i]! / 255 - 0.5) ** 2;
    }
    expect(neutral).toBe(true);
    expect(sum / (SIZE * SIZE)).toBeCloseTo(0.5, 4);
    expect(Math.sqrt(square / (SIZE * SIZE))).toBeGreaterThan(0.04);
    for (let t = 0; t < SIZE; t += 17) {
      expect(field(kind, 0, t)).toBeCloseTo(field(kind, SIZE, t), 12);
      expect(field(kind, t, 0)).toBeCloseTo(field(kind, t, SIZE), 12);
      expect(Math.abs(field(kind, -0.001, t) - field(kind, 0.001, t))).toBeLessThan(0.002);
    }
  }
});

it("preserves the original shader at Low and restores hooks on disposal", () => {
  const material = createRampMaterial(0xffffff, RAMP_STEPS.terrain);
  material.vertexColors = true;
  const original = material.onBeforeCompile, originalKey = material.customProgramCacheKey;
  const compile = () => {
    const shader = { ...ShaderLib.toon, uniforms: {} } as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    return shader;
  };
  const base = compile();
  const textures = Array.from({ length: 5 }, () => new Texture());
  const hook = attachTerrainDetail(material, textures);
  hook.setQuality("High");
  const detailed = compile();
  expect(detailed.fragmentShader).toContain("groundDetail(vColor.rgb)");
  expect(detailed.uniforms.groundNormalMap!.value).toBe(textures[4]);
  expect(detailed.fragmentShader.indexOf("groundDetail(vColor.rgb)")).toBeLessThan(detailed.fragmentShader.indexOf("#include <fog_fragment>"));
  expect(detailed.fragmentShader).toContain("terrainDetail(diffuseColor.rgb)");
  hook.setQuality("Low");
  expect(compile()).toEqual(base);
  hook.dispose();
  expect(material.onBeforeCompile).toBe(original);
  expect(material.customProgramCacheKey).toBe(originalKey);
  material.dispose();
  for (const texture of textures) texture.dispose();
});

it("does not touch WebGL or start texture loading for a Low-only world", async () => {
  const root = new Group(), geometry = new BufferGeometry(), material = new MeshToonMaterial();
  const mesh = new Mesh(geometry, material);
  mesh.name = "terrain-tile";
  root.add(mesh);
  const detail = createTerrainDetail(root, {} as WebGLRenderer);
  await detail.setQuality("Low");
  detail.dispose();
  detail.dispose();
  await detail.setQuality("High");
  geometry.dispose(); material.dispose();
});
