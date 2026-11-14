import { afterEach, expect, it, vi } from "vitest";
import { Box3, BoxGeometry, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Texture, Vector2, Vector3, type Material, type WebGLRenderer } from "three";
import { installHrMaterial } from "../../../src/features/world/foliage/hr-material";
import { bindHrForest, advanceHrTrees } from "../../../src/features/world/foliage/hr-runtime";
import { chooseHrTrees, hrLeafTint, hrTreeLod, HR_TREE_IDS, treeRandom } from "../../../src/features/world/foliage/hr-variation";
import { createHrVines, readHrParts, type HrAsset } from "../../../src/features/world/foliage/hr-library";
import * as variation from "../../../src/features/world/foliage/hr-variation";

const { acquire, release, assetDispose } = vi.hoisted(() => ({ acquire: vi.fn(), release: vi.fn(), assetDispose: vi.fn() }));
vi.mock("../../../src/features/world/foliage/hr-library", async importOriginal => ({ ...await importOriginal<object>(), acquireHrTree: acquire }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); acquire.mockReset(); release.mockReset(); });

it("resolves nearby architectures without repeats, independent of site input order and quality", () => {
  const sites = Array.from({ length: 36 }, (_, i) => ({ x: i % 6 * 6, z: Math.floor(i / 6) * 6, canopy: true }));
  const ids = chooseHrTrees(sites), reverse = chooseHrTrees([...sites].reverse()).reverse();
  expect(ids).toEqual(reverse);
  for (let i = 0; i < sites.length; i++) for (let j = 0; j < i; j++) if (Math.hypot(sites[i]!.x - sites[j]!.x, sites[i]!.z - sites[j]!.z) < 9) expect(ids[i]).not.toBe(ids[j]);
  expect(new Set(ids).size).toBeGreaterThanOrEqual(6);
  expect(ids.every(id => HR_TREE_IDS.includes(id))).toBe(true);
  expect(new Set(sites.map(s => hrLeafTint(s.x, s.z).toArray().join(","))).size).toBe(sites.length);
  expect(treeRandom(-13.6, 21.8, 3)).toBe(treeRandom(-13.6, 21.8, 3));
  const edge = [{ x: 63, z: 23 }], neighbour = [{ x: 67, z: 25 }];
  const first = chooseHrTrees(edge)[0]!;
  expect(chooseHrTrees(neighbour, [{ ...edge[0]!, id: first }])[0]).not.toBe(first);
  expect(chooseHrTrees(edge, [{ ...edge[0]!, id: first }])[0]).toBe(first);
});

it("keeps indexed PBR primitives, bark normals, leaf maps and original GLTF ownership", () => {
  const root = new Group(), map = new Texture(), normal = new Texture();
  const bark = new MeshStandardMaterial({ map, normalMap: normal }), leaf = new MeshStandardMaterial({ map, alphaTest: 0.45 });
  const trunk = new Mesh(new BoxGeometry(1, 12, 1), bark), crown = new Mesh(new BoxGeometry(8, 6, 8), leaf);
  crown.position.y = 11; root.add(trunk, crown);
  const parts = readHrParts(root);
  expect(parts).toHaveLength(2); expect(parts[0]!.geometry.index).not.toBeNull();
  expect((parts[0]!.material as MeshStandardMaterial).normalMap).toBe(normal);
  expect((parts[1]!.material as MeshStandardMaterial).map).toBe(map);
  expect(parts.map(p => p.leaf)).toEqual([false, true]);
  expect(parts[1]!.geometry.boundingBox!.min.y).toBe(8);
  expect(crown.geometry.boundingBox).toBeNull();
  parts.forEach(p => { p.geometry.dispose(); p.material.dispose(); });
  trunk.geometry.dispose(); crown.geometry.dispose(); bark.dispose(); leaf.dispose(); map.dispose(); normal.dispose();
});

it("attaches hanging vines to actual branch vertices and keeps geometry finite", () => {
  const branch = new BoxGeometry(7, 0.3, 1).translate(0, 9, 0); branch.computeBoundingBox();
  const material = new MeshStandardMaterial();
  const vines = createHrVines([{ geometry: branch, material, leaf: false }], new Box3(new Vector3(-5, 0, -5), new Vector3(5, 16, 5)))!;
  expect(vines.vine).toBe(true); expect(vines.geometry.boundingBox!.max.y).toBeLessThan(9.5);
  expect(vines.geometry.boundingBox!.min.y).toBeLessThan(7);
  expect(Array.from(vines.geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
  const vineMaterial = vines.material as MeshStandardMaterial;
  expect(vineMaterial.vertexColors).toBe(true); expect(vineMaterial.emissive.getHex()).toBe(0);
  const colors = vines.geometry.getAttribute("color");
  expect(colors.count).toBe(vines.geometry.getAttribute("position").count);
  expect(Math.max(...Array.from(colors.array))).toBeLessThan(0.1);
  const shader = { vertexShader: "#include <begin_vertex>", fragmentShader: "#include <opaque_fragment>\n#include <color_fragment>", uniforms: {} } as Parameters<Material["onBeforeCompile"]>[0];
  // Generated strands retain normal lighting instead of the bright crown tint/scatter.
  installHrMaterial(vineMaterial, new Vector2(), true, true);
  vineMaterial.onBeforeCompile(shader, {} as WebGLRenderer);
  expect(shader.fragmentShader).not.toContain("leafBacklight");
  expect(shader.fragmentShader).not.toContain("diffuseColor.rgb *= vHrTint");
  vines.geometry.dispose(); vines.material.dispose(); branch.dispose(); material.dispose();
});

it.each(["Google SwiftShader", "llvmpipe (LLVM)"])("retains static fallback materials and skips HR uploads on %s, including pinned High", async name => {
  vi.useFakeTimers();
  const f = fixture();
  const disposeMaterial = vi.spyOn(f.original, "dispose");
  const getExtension = vi.fn(() => ({ UNMASKED_RENDERER_WEBGL: 0x9246 }));
  Object.defineProperty(f.renderer, "getContext", { value: () => ({ getExtension, getParameter: () => name }) });
  try {
    f.binding.setQuality("Low"); f.binding.setQuality("High");
    advanceHrTrees([f.mesh], 0.1, false); f.frame(); await vi.runAllTimersAsync(); f.frame();
    expect(acquire).not.toHaveBeenCalled(); expect(getExtension).toHaveBeenCalledOnce();
    expect(f.mesh.material).toBe(f.original);
    expect(f.mesh.geometry.getAttribute("hrReplaced").getX(0)).toBe(0);
    expect(f.scene.getObjectByName("hr-tree2-streamed")).toBeUndefined();
    f.binding.dispose(); expect(disposeMaterial).not.toHaveBeenCalled();
  } finally { f.dispose(); }
});

function fixture() {
  const scene = new Scene(), camera = new PerspectiveCamera(), renderer = { info: { render: { frame: 0 } } } as WebGLRenderer;
  const mesh = new InstancedMesh(new BoxGeometry(8, 14, 8).translate(0, 7, 0), new MeshStandardMaterial(), 1);
  mesh.setMatrixAt(0, new Matrix4().makeTranslation(31, 1, 25)); scene.add(mesh);
  mesh.geometry.setAttribute("crownAlpha", new InstancedBufferAttribute(new Float32Array([0.37]), 1));
  camera.position.set(32, 5, 29); camera.updateMatrixWorld(); scene.updateMatrixWorld();
  const original = mesh.material, binding = bindHrForest([mesh]);
  const frame = () => { renderer.info.render.frame++; mesh.onAfterRender(renderer, scene, camera, mesh.geometry, mesh.material, new Group()); };
  const dispose = () => { binding.dispose(); mesh.geometry.dispose(); original.dispose(); mesh.dispose(); };
  return { scene, camera, renderer, mesh, binding, original, frame, dispose };
}
function asset(): HrAsset {
  const geometry = new BoxGeometry(8, 14, 8).translate(0, 7, 0); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { parts: [{ geometry, material: new MeshStandardMaterial({ alphaTest: 0.45 }), leaf: true }], bounds: geometry.boundingBox!.clone(), center: new Vector3(0, 7, 0), dispose: assetDispose };
}

it("waits for both intro handoff and deferred dressing even when simulation is active", async () => {
  vi.useFakeTimers();
  const loaded = asset(); acquire.mockReturnValue({ ready: Promise.resolve(loaded), release });
  const f = fixture();
  const viewport = { dataset: { worldIntro: "playing", worldBuild: "pending" } };
  Object.defineProperty(f.renderer, "domElement", { value: { closest: () => viewport } });
  try {
    advanceHrTrees([f.mesh], 0.1, false); f.frame(); await vi.runAllTimersAsync(); expect(acquire).not.toHaveBeenCalled();
    viewport.dataset.worldIntro = "done"; f.frame(); await vi.runAllTimersAsync(); expect(acquire).not.toHaveBeenCalled();
    viewport.dataset.worldBuild = "done"; f.frame(); await vi.runAllTimersAsync(); expect(acquire).toHaveBeenCalledOnce();
  } finally { f.dispose(); loaded.parts.forEach(p => { p.geometry.dispose(); p.material.dispose(); }); }
});

it("defers requests until play, preserves camera fade, freezes wind, releases on Low and restores on teardown", async () => {
  vi.useFakeTimers();
  const loaded = asset(); acquire.mockReturnValue({ ready: Promise.resolve(loaded), release });
  const f = fixture();
  try {
    f.frame(); await vi.runAllTimersAsync(); expect(acquire).not.toHaveBeenCalled();
    f.binding.setQuality("Low"); advanceHrTrees([f.mesh], 0.1, false); f.frame(); await vi.runAllTimersAsync(); expect(acquire).not.toHaveBeenCalled();
    f.binding.setQuality("High"); f.frame(); await vi.runAllTimersAsync(); f.frame();
    expect(acquire).toHaveBeenCalledOnce();
    const group = f.scene.getObjectByName("hr-tree2-streamed")!;
    const batch = group.children.find(g => g.name.endsWith("-lod0"))!;
    const replacement = batch.children[0] as InstancedMesh;
    expect(replacement.count).toBe(1);
    expect(replacement.geometry.getAttribute("hrFade").getX(0)).toBeCloseTo(0.37);
    expect(f.mesh.geometry.getAttribute("hrReplaced").getX(0)).toBe(1);
    const shader = { vertexShader: "#include <begin_vertex>", fragmentShader: "", uniforms: {} } as Parameters<Material["onBeforeCompile"]>[0];
    (replacement.material as Material).onBeforeCompile(shader, f.renderer);
    const clock = shader.uniforms.hrWind!.value;
    const old = clock.x; advanceHrTrees([f.mesh], 0.5, true); expect(clock.x).toBe(old); expect(clock.y).toBe(0);
    f.binding.setQuality("Low"); expect(f.mesh.geometry.getAttribute("hrReplaced").getX(0)).toBe(0); expect(release).toHaveBeenCalledOnce();
    f.binding.dispose(); expect(f.mesh.material).toBe(f.original); expect(f.mesh.geometry.hasAttribute("hrReplaced")).toBe(false);
  } finally { f.dispose(); loaded.parts.forEach(p => { p.geometry.dispose(); p.material.dispose(); }); }
});

it("cancels queued work and ignores assets arriving after tile teardown", async () => {
  vi.useFakeTimers();
  const cancelled = fixture(); advanceHrTrees([cancelled.mesh], 0.1, false); cancelled.frame(); cancelled.dispose(); await vi.runAllTimersAsync(); expect(acquire).not.toHaveBeenCalled();
  let finish!: (a: HrAsset) => void;
  acquire.mockReturnValue({ ready: new Promise<HrAsset>(resolve => { finish = resolve; }), release });
  const f = fixture(); advanceHrTrees([f.mesh], 0.1, false); f.frame(); await vi.runAllTimersAsync(); f.dispose();
  const loaded = asset(); finish(loaded); await vi.runAllTimersAsync();
  expect(release).toHaveBeenCalledOnce(); expect(f.scene.getObjectByName("hr-tree2-streamed")).toBeUndefined();
  loaded.parts.forEach(p => { p.geometry.dispose(); p.material.dispose(); });
});

it("keeps static instance buffers resident, updates crown fades, and culls individual trees", async () => {
  vi.useFakeTimers();
  const loaded = asset(); acquire.mockReturnValue({ ready: Promise.resolve(loaded), release });
  const f = fixture();
  try {
    advanceHrTrees([f.mesh], 0.1, false); f.frame(); await vi.runAllTimersAsync(); f.frame();
    const replacement = f.scene.getObjectByName("hr-tree2-streamed")!.children.find(g => g.name.endsWith("-lod0"))!.children[0] as InstancedMesh;
    expect(replacement.castShadow).toBe(false);
    const version = replacement.instanceMatrix.version;
    const maskVersion = (f.mesh.geometry.getAttribute("hrReplaced") as InstancedBufferAttribute).version;
    f.frame(); expect(replacement.instanceMatrix.version).toBe(version);
    expect((f.mesh.geometry.getAttribute("hrReplaced") as InstancedBufferAttribute).version).toBe(maskVersion);
    f.mesh.geometry.getAttribute("crownAlpha").setX(0, 0.65); f.frame();
    expect(replacement.geometry.getAttribute("hrFade").getX(0)).toBeCloseTo(0.65);
    expect(replacement.instanceMatrix.version).toBe(version);
    f.camera.position.set(150, 5, 29); f.camera.updateMatrixWorld(); f.frame();
    expect(replacement.count).toBe(0);
    f.camera.position.set(32, 5, 29); f.camera.updateMatrixWorld(); f.frame();
    expect(replacement.count).toBe(1);
  } finally { f.dispose(); loaded.parts.forEach(p => { p.geometry.dispose(); p.material.dispose(); }); }
});

it("uses coarser geometry after sustained slow frames and recovers without changing High quality", async () => {
  vi.useFakeTimers();
  let now = 0; vi.spyOn(performance, "now").mockImplementation(() => now);
  const loaded = asset(); acquire.mockReturnValue({ ready: Promise.resolve(loaded), release });
  const f = fixture();
  try {
    advanceHrTrees([f.mesh], 0.1, false);
    for (let i = 0; i < 3; i++) { now += 150; advanceHrTrees([f.mesh], 0.1, false); }
    f.frame(); await vi.runAllTimersAsync();
    expect(acquire.mock.calls[0]![2]).toBe(1);
    for (let i = 0; i < 8; i++) { now += 16; advanceHrTrees([f.mesh], 0.016, false); }
    f.frame(); await vi.runAllTimersAsync();
    expect(acquire.mock.calls.some(call => call[2] === 0)).toBe(true);
  } finally { f.dispose(); loaded.parts.forEach(p => { p.geometry.dispose(); p.material.dispose(); }); }
});

it("keeps a complete fallback on asset failure and uses hysteresis/culling for distance LOD", async () => {
  vi.useFakeTimers(); acquire.mockImplementation(() => ({ ready: Promise.reject(new Error("offline")), release }));
  const f = fixture();
  try { advanceHrTrees([f.mesh], 0.1, false); f.frame(); await vi.runAllTimersAsync(); f.frame(); expect(f.mesh.geometry.getAttribute("hrReplaced").getX(0)).toBe(0); }
  finally { f.dispose(); }
  expect(hrTreeLod(10, true)).toBe(0); expect(hrTreeLod(24, true, 0)).toBe(0); expect(hrTreeLod(30, true, 0)).toBe(1);
  expect(hrTreeLod(72, true)).toBe(2); expect(hrTreeLod(61, true, 2)).toBe(2); expect(hrTreeLod(58, true, 2)).toBe(1); expect(hrTreeLod(210, true)).toBe(-1);
});

it("shares an architecture/LOD draw across source variants while retaining independent fades", async () => {
  vi.useFakeTimers();
  vi.spyOn(variation, "chooseHrTrees").mockImplementation(sites => sites.map(() => HR_TREE_IDS[0]));
  const loaded = asset(); acquire.mockReturnValue({ ready: Promise.resolve(loaded), release });
  const f = fixture(); f.binding.dispose();
  const other = new InstancedMesh(new BoxGeometry(12, 18, 8).translate(0, 9, 0), new MeshStandardMaterial(), 1);
  other.setMatrixAt(0, new Matrix4().makeTranslation(36, 1, 25));
  other.geometry.setAttribute("crownAlpha", new InstancedBufferAttribute(new Float32Array([0.73]), 1));
  f.scene.add(other); f.scene.updateMatrixWorld();
  const binding = bindHrForest([f.mesh, other]);
  try {
    advanceHrTrees([f.mesh], 0.1, false); f.frame(); await vi.runAllTimersAsync(); f.frame();
    expect(acquire).toHaveBeenCalledOnce();
    const batches = f.scene.getObjectByName("hr-tree2-streamed")!.children.filter(child => child.name.endsWith("lod0"));
    expect(batches).toHaveLength(1);
    const replacement = batches[0]!.children[0] as InstancedMesh;
    expect(replacement.count).toBe(2);
    expect(replacement.geometry.getAttribute("hrFade").getX(0)).toBeCloseTo(0.37);
    expect(replacement.geometry.getAttribute("hrFade").getX(1)).toBeCloseTo(0.73);
    other.geometry.getAttribute("crownAlpha").setX(0, 0.91); f.frame();
    expect(replacement.geometry.getAttribute("hrFade").getX(1)).toBeCloseTo(0.91);
    binding.setQuality("Low"); expect(release).toHaveBeenCalledOnce();
  } finally {
    binding.dispose(); f.dispose(); other.dispose(); other.geometry.dispose(); other.material.dispose();
    loaded.parts.forEach(part => { part.geometry.dispose(); part.material.dispose(); });
  }
});
