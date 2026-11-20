import { reportBudget } from "./report-budget";
import { readFile } from "node:fs/promises";
import { Box3, BoxGeometry, Color, Group, InstancedBufferAttribute, InstancedMesh, Material, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, ShaderLib, Texture, Vector3, Vector4, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { afterEach, expect, it, vi } from "vitest";
import { bindLibraryTree, fitLibraryGeometry, flattenLibraryTree, resumeTreeLibraries, TREE_LIBRARY_IDS, treeLibraryLod } from "../../../src/features/world/foliage/library";

const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({ GLTFLoader: class {
  setKTX2Loader() { return this; }
  setMeshoptDecoder() { return this; }
  loadAsync(url: string) { return load(url); }
} }));
vi.mock("three/examples/jsm/loaders/KTX2Loader.js", () => ({ KTX2Loader: class {
  setWorkerLimit() { return this; }
  detectSupport() { return this; }
  dispose() {}
} }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); load.mockReset(); });

it("ships six CC0 tree variants with intact cutout LODs and meshopt/KTX2, within tree budgets", async () => {
  const manifest = JSON.parse(await readFile("public/world/lib/manifest.json", "utf8"));
  for (const id of TREE_LIBRARY_IDS) {
    const asset = manifest.assets.find((a: { id: string }) => a.id === id);
    expect(asset.license).toBe("CC0-1.0");
    expect(asset.lods).toHaveLength(2);
    for (const lod of asset.lods) {
      const data = await readFile(`public/world/lib/${lod.file}`);
      expect(data.byteLength).toBe(lod.bytes);
      reportBudget("tests/unit/world/foliage-library.test.ts:28 data.byteLength", data.byteLength, 60000);
      const jsonLength = data.readUInt32LE(12);
      const gltf = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
      expect(gltf.extensionsRequired).toContain("EXT_meshopt_compression");
      expect(gltf.extensionsRequired).toContain("KHR_texture_basisu");
      reportBudget("tests/unit/world/foliage-library.test.ts:33 lod.triangles", lod.triangles, id.includes("pine") ? 1200 : 1500);
      const leaf = gltf.materials.find((m: { alphaMode: string }) => m.alphaMode === "MASK");
      expect(leaf.doubleSided).toBe(true);
      expect(leaf.pbrMetallicRoughness.baseColorTexture).toBeDefined();
      expect(leaf.alphaCutoff ?? .5).toBeGreaterThanOrEqual(.4);
    }
    expect(asset.lods[1].triangles).toBeLessThan(asset.lods[0].triangles);
  }
});

it("preserves transformed vertices, UV and wood/leaf separation in one draw", () => {
  const root = new Group(), texture = new Texture();
  const bark = new MeshStandardMaterial({ color: "#735239" });
  const leaf = new MeshStandardMaterial({ color: "#668850", map: texture, alphaTest: .45 });
  const a = new Mesh(new BoxGeometry(), bark), b = new Mesh(new BoxGeometry(), leaf);
  a.position.set(2, 7, 0); b.position.set(2, 9, 0); root.add(a, b);
  const source = flattenLibraryTree(root);
  try {
    expect(source.geometry.groups).toHaveLength(0);
    expect(source.geometry.boundingBox!.min.y).toBeCloseTo(6.5);
    expect(source.geometry.boundingBox!.max.y).toBeCloseTo(9.5);
    expect(new Set(source.geometry.getAttribute("librarySurface").array)).toEqual(new Set([0, 2]));
    expect(source.geometry.getAttribute("uv").count).toBe(source.geometry.getAttribute("position").count);
    for (const [material, lib] of [[source.material, ShaderLib.standard!], [source.depth, ShaderLib.depth!], [source.distance, ShaderLib.distance!]] as const) {
      const shader = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} } as WebGLProgramParametersWithUniforms;
      material.onBeforeCompile(shader, {} as WebGLRenderer);
      expect(shader.fragmentShader).toContain("texture2D(libraryNeedles, vLibraryUv)");
      expect(shader.uniforms.libraryNeedles!.value).toBe(texture);
      expect(material.alphaTest).toBe(.45);
    }
    const envelope = new Box3(new Vector3(-8, 0, -6), new Vector3(8, 24, 6));
    const fitted = fitLibraryGeometry(source.geometry, envelope);
    expect(fitted.boundingBox!.min.distanceTo(envelope.min)).toBeLessThan(1e-5);
    expect(fitted.boundingBox!.max.distanceTo(envelope.max)).toBeLessThan(1e-5);
    expect(source.geometry.boundingBox!.min.y).toBe(6.5);
    fitted.dispose();
  } finally {
    source.geometry.dispose(); source.material.dispose(); source.depth.dispose(); source.distance.dispose();
    a.geometry.dispose(); b.geometry.dispose(); bark.dispose(); leaf.dispose(); texture.dispose();
  }
});

it("uses stable distance hysteresis and restores Low independently of previous LOD", () => {
  expect(treeLibraryLod(10, "High")).toBe(0);
  expect(treeLibraryLod(44, "High")).toBe(1);
  expect(treeLibraryLod(36, "High", 1)).toBe(1);
  expect(treeLibraryLod(32, "High", 1)).toBe(0);
  expect(treeLibraryLod(120, "High", 1)).toBe(2);
  expect(treeLibraryLod(100, "High", 2)).toBe(2);
  expect(treeLibraryLod(94, "High", 2)).toBe(1);
  for (const previous of [-1, 0, 1, 2]) expect(treeLibraryLod(300, "Low", previous)).toBe(-1);
  expect(treeLibraryLod(90, "High", 1)).toBe(1);
});

function fakeRenderer() {
  return {
    getRenderTarget: () => null, getClearColor: (c: Color) => c.set(0), getClearAlpha: () => 1,
    getViewport: (v: Vector4) => v.set(0, 0, 800, 600), getScissor: (v: Vector4) => v.set(0, 0, 800, 600), getScissorTest: () => false,
    setRenderTarget: vi.fn(), setClearColor: vi.fn(), setViewport: vi.fn(), setScissor: vi.fn(), setScissorTest: vi.fn(), clear: vi.fn(), render: vi.fn(), autoClear: true,
  } as unknown as WebGLRenderer;
}
function frame(mesh: InstancedMesh, renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
  camera.updateMatrixWorld();
  mesh.onAfterRender(renderer, scene, camera, mesh.geometry, mesh.material as Material, new Group());
}

it("waits for active play, shares loads/bakes, retains fade, restores Low and disposes once", async () => {
  vi.useFakeTimers(); vi.stubGlobal("window", {});
  const texture = new Texture(), disposed = vi.spyOn(texture, "dispose");
  load.mockImplementation(async () => {
    const scene = new Group();
    scene.add(new Mesh(new BoxGeometry(4, 8, 4), new MeshStandardMaterial({ map: texture, alphaTest: .45 })));
    return { scene };
  });
  const renderer = fakeRenderer(), scene = new Scene(), camera = new PerspectiveCamera();
  const meshes = [0, 1].map(() => new InstancedMesh(new BoxGeometry(6, 12, 6), new MeshStandardMaterial(), 1));
  const fallbacks = meshes.map(m => m.geometry);
  const alpha = new InstancedBufferAttribute(new Float32Array([.3]), 1);
  meshes[0]!.geometry.setAttribute("crownAlpha", alpha);
  scene.add(...meshes);
  const bindings = meshes.map(m => bindLibraryTree(m, "tree-pine-a"));
  try {
    frame(meshes[0]!, renderer, scene, camera); await vi.runAllTimersAsync();
    expect(load).not.toHaveBeenCalled(); // intro/paused rendering
    resumeTreeLibraries(meshes);
    bindings.forEach(b => b.setQuality("Low"));
    meshes.forEach(m => frame(m, renderer, scene, camera)); await vi.runAllTimersAsync();
    expect(load).not.toHaveBeenCalled();
    bindings.forEach(b => b.setQuality("High"));
    meshes.forEach(m => frame(m, renderer, scene, camera)); await vi.runAllTimersAsync();
    expect(load).toHaveBeenCalledTimes(2); // one LOD0/1 pair across both tile consumers
    expect(renderer.render).toHaveBeenCalledTimes(4); // one four-view atlas
    expect(meshes[0]!.geometry.getAttribute("crownAlpha")).toBe(alpha);
    expect(meshes[0]!.geometry).not.toBe(fallbacks[0]);
    camera.position.set(0, 0, 300);
    meshes.forEach(m => { m.computeBoundingBox(); frame(m, renderer, scene, camera); });
    expect(meshes[0]!.geometry.index!.count / 3).toBe(2);
    bindings.forEach(b => b.setQuality("Low"));
    meshes.forEach((m, i) => expect(m.geometry).toBe(fallbacks[i]));
    bindings[0]!.dispose(); await vi.runAllTimersAsync(); expect(disposed).not.toHaveBeenCalled();
    bindings[1]!.dispose(); await vi.runAllTimersAsync(); expect(disposed).toHaveBeenCalledOnce();
    expect(renderer.autoClear).toBe(true);
  } finally {
    bindings.forEach(b => b.dispose());
    meshes.forEach(m => { m.geometry.dispose(); (m.material as Material).dispose(); m.dispose(); });
  }
});

it("cancels a queued load on teardown and leaves failed decoders on the complete fallback", async () => {
  vi.useFakeTimers(); vi.stubGlobal("window", {});
  const renderer = fakeRenderer(), scene = new Scene(), camera = new PerspectiveCamera();
  const mesh = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), 1); scene.add(mesh);
  const original = mesh.geometry, material = mesh.material;
  resumeTreeLibraries([mesh]);
  const cancelled = bindLibraryTree(mesh, "tree-pine-a");
  frame(mesh, renderer, scene, camera); cancelled.dispose(); await vi.runAllTimersAsync();
  expect(load).not.toHaveBeenCalled();
  load.mockRejectedValue(new Error("decoder unavailable"));
  const failed = bindLibraryTree(mesh, "tree-pine-a");
  frame(mesh, renderer, scene, camera); await vi.runAllTimersAsync();
  expect(mesh.geometry).toBe(original); expect(mesh.material).toBe(material);
  expect(mesh.userData.treeLibraryError).toBe(true);
  failed.dispose(); original.dispose(); material.dispose(); mesh.dispose();
});

it("releases an in-flight tile without fetching LOD1 or baking into a disposed renderer", async () => {
  vi.useFakeTimers(); vi.stubGlobal("window", {});
  let finish!: (value: { scene: Group }) => void;
  load.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const renderer = fakeRenderer(), scene = new Scene(), camera = new PerspectiveCamera();
  const mesh = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), 1); scene.add(mesh);
  resumeTreeLibraries([mesh]);
  const binding = bindLibraryTree(mesh, "tree-broadleaf-1");
  frame(mesh, renderer, scene, camera); await vi.runAllTimersAsync();
  expect(load).toHaveBeenCalledTimes(1);
  binding.dispose();
  const model = new Group(), texture = new Texture(), dispose = vi.spyOn(texture, "dispose");
  model.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: texture, alphaTest: .45 })));
  finish({ scene: model }); await vi.runAllTimersAsync();
  expect(load).toHaveBeenCalledTimes(1);
  expect(renderer.render).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
  expect(mesh.userData.treeLibraryError).toBeUndefined();
  mesh.geometry.dispose(); (mesh.material as Material).dispose(); mesh.dispose();
});
