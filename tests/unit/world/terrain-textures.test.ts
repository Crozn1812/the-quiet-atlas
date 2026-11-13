import { readFileSync, statSync } from "node:fs";
import { expect, it } from "vitest";
import { MeshToonMaterial, ShaderLib, Texture, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { createPhotoFallback, createPhotoMaterial, photoTextureUrls, PHOTO_TILE_SIZE } from "../../../src/features/world/materials/cc0";
import inventory from "../../../tools/assets/textures/cc0-sources.json";

it("ships eight CC0 photo sets and three KTX2 tiers within the world budget", () => {
  const licenses = readFileSync("assets/LICENSES.csv", "utf8");
  expect(inventory.sources).toHaveLength(8);
  for (const source of inventory.sources) {
    expect(source.license).toBe("CC0-1.0");
    expect(source.source).toBe(`https://polyhaven.com/a/${source.id}`);
    for (const map of Object.values(source.maps)) {
      expect(map.url).toMatch(/^https:\/\/dl.polyhaven.org\//);
      expect(map.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  }
  let bytes = 0;
  for (const quality of ["Low", "Balanced", "High"] as const) for (const url of photoTextureUrls(quality)) {
    const data = readFileSync(`public${url}`), size = PHOTO_TILE_SIZE[quality];
    expect(data.subarray(0, 12).toString("hex")).toBe("ab4b5458203230bb0d0a1a0a");
    expect(data.readUInt32LE(20)).toBe(size * 4);
    expect(data.readUInt32LE(24)).toBe(size === 2048 ? 3072 : size * 2);
    expect(data.readUInt32LE(40)).toBe(Math.log2(size * 4) + 1);
    expect(licenses.split("\n").filter(line => line.startsWith(`public${url},`))).toHaveLength(1);
    const file = inventory.files.find(file => `/world/tex/${file.file}` === url)!;
    expect(file.bytes).toBe(statSync(`public${url}`).size);
    bytes += file.bytes;
  }
  expect(bytes).toBeLessThan(15_000_000);
});

it("uses physical shading, semantic masks, instance positions and seam-safe two-scale sampling", () => {
  const original = new MeshToonMaterial({ vertexColors: true });
  const textures = [new Texture(), new Texture()];
  const material = createPhotoMaterial("terrain", original, textures, 2048);
  const shader = { ...ShaderLib.standard, uniforms: {} } as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  expect(material.type).toBe("MeshStandardMaterial");
  expect(shader.vertexShader).toContain("photoMask = cc0Surface");
  expect(shader.vertexShader).toContain("instanceMatrix * photoPosition");
  expect(shader.fragmentShader).toContain("textureGrad");
  expect(shader.fragmentShader).toContain("uv * 0.237");
  expect(shader.fragmentShader).toContain("roughnessFactor = clamp(photoRelief.b");
  expect(shader.uniforms.photoColor!.value).toBe(textures[0]);
  material.dispose(); original.dispose(); textures.forEach(texture => texture.dispose());
});

it("retains the standalone 512 photo material while runtime Low uses the flat fallback", () => {
  const original = new MeshToonMaterial({ vertexColors: true });
  const textures = [new Texture(), new Texture()];
  const material = createPhotoMaterial("terrain", original, textures, 512);
  expect(material.type).toBe("MeshToonMaterial");
  expect(material.defines).toHaveProperty("PHOTO_LOW");
  const shader = { ...ShaderLib.toon, uniforms: {} } as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  expect(shader.fragmentShader).toContain("Dominant projection");
  expect(shader.fragmentShader).toContain("return photoRead(atlas, uv / 3.0, tile)");
  material.dispose(); original.dispose(); textures.forEach(texture => texture.dispose());
});

it("preserves batched vertex selection without procedural fragment or light work in the flat fallback", () => {
  const original = new MeshToonMaterial({ color: 0x567854, vertexColors: true });
  original.onBeforeCompile = shader => {
    shader.vertexShader += "\n// selected ground silhouette and colour";
    shader.fragmentShader += "\n// expensive procedural lighting";
  };
  const fallback = createPhotoFallback("ground", original);
  const shader = { ...ShaderLib.basic, uniforms: {} } as WebGLProgramParametersWithUniforms;
  const fragment = shader.fragmentShader;
  fallback.onBeforeCompile(shader, {} as WebGLRenderer);
  expect(fallback.type).toBe("MeshBasicMaterial");
  expect(fallback.color.equals(original.color)).toBe(true);
  expect(fallback.vertexColors).toBe(true);
  expect(shader.vertexShader).toContain("selected ground silhouette and colour");
  expect(shader.fragmentShader).toBe(fragment);
  expect(shader.uniforms).not.toHaveProperty("photoColor");
  fallback.dispose(); original.dispose();
});
