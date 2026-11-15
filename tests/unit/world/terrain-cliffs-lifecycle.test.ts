import { Group, Matrix4, Mesh, MeshStandardMaterial, MeshToonMaterial, PlaneGeometry, ShaderLib, Texture,
  type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { expect, it, vi } from "vitest";
import { createTerrainCliffs } from "../../../src/features/world/terrain/cliffs";
import { createPhotoMaterial } from "../../../src/features/world/materials/cc0";

const state = vi.hoisted(() => ({ loads: 0, disposals: 0 }));
vi.mock("../../../src/features/world/props/hr-props", async () => {
  const { Mesh, BufferGeometry, MeshStandardMaterial } = await import("three");
  return { createHrPropsBatch: () => {
    return { mesh: new Mesh(new BufferGeometry(), new MeshStandardMaterial()),
      loadDetail: async () => { state.loads++; }, dispose: () => { state.disposals++; } };
  } };
});

it("blends resident coastal tile pigment/air without changing geometry, masks or Low", () => {
  const original = new MeshToonMaterial(), textures = [new Texture(), new Texture()];
  for (const size of [512, 2048]) {
    const root = new Group(), material = createPhotoMaterial("terrain", original, textures, size);
    const source = new Mesh(new PlaneGeometry(4, 4), material); source.name = "terrain-tile"; root.add(source);
    const positions = source.geometry.getAttribute("position").array.slice();
    const detail = createTerrainCliffs(root, {} as WebGLRenderer);
    detail.refresh(size === 2048, textures, size);
    const key = material.customProgramCacheKey(); detail.refresh(size === 2048, textures, size);
    expect(material.customProgramCacheKey()).toBe(key);
    const shader = { ...ShaderLib[size === 512 ? "toon" : "standard"], uniforms: {} } as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    expect(shader.fragmentShader.includes("float backdropBlend")).toBe(size === 2048);
    if (size === 2048) {
      expect(shader.fragmentShader).toContain("photoMask.z");
      expect(shader.fragmentShader).toContain("terrainUnfogged");
      expect(shader.uniforms.photoColor!.value).toBe(textures[0]);
    }
    expect(source.geometry.getAttribute("position").array).toEqual(positions);
    detail.dispose(); source.geometry.dispose(); material.dispose();
  }
  textures.forEach(texture => texture.dispose()); original.dispose();
});

it("creates no detail on cold Low and releases visual owners after streaming/unmount", () => {
  state.loads = state.disposals = 0;
  const root = new Group(), material = new MeshStandardMaterial();
  const source = new Mesh(new PlaneGeometry(8, 9, 4, 4), material);
  source.name = "first-light-sculpted-rock"; source.position.set(100, 50, -100); root.add(source);
  source.scale.set(10, 4, 7); source.rotation.y = .6;
  const geometry = source.geometry, original = geometry.getAttribute("position").array.slice();
  const detail = createTerrainCliffs(root, {} as WebGLRenderer);
  detail.refresh(false);
  expect(source.children).toHaveLength(0); expect(state.loads).toBe(0);
  detail.refresh(true);
  expect(source.getObjectByName("terrain-cliff-accents")).toBeDefined(); expect(state.loads).toBe(1);
  root.updateMatrixWorld(true);
  const matrix = source.getObjectByName("terrain-cliff-accents")!.matrixWorld.elements;
  new Matrix4().elements.forEach((value, i) => expect(matrix[i]).toBeCloseTo(value, 8));
  detail.refresh(true); expect(state.loads).toBe(1);
  detail.refresh(false); expect(source.getObjectByName("terrain-cliff-accents")!.visible).toBe(false);
  expect(source.geometry).toBe(geometry); expect(geometry.getAttribute("position").array).toEqual(original);
  source.removeFromParent(); detail.refresh(true); expect(state.disposals).toBe(1);
  expect(source.children).toHaveLength(0);
  detail.dispose(); detail.dispose(); expect(state.disposals).toBe(1);
  geometry.dispose(); material.dispose();
});
