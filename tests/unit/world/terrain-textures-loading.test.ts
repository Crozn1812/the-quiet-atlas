import { beforeEach, expect, it, vi } from "vitest";
import { BufferGeometry, Group, Mesh, MeshToonMaterial, PerspectiveCamera, Scene, Texture, type WebGLRenderer } from "three";
import { bindTerrainDetail, createTerrainDetail } from "../../../src/features/world/terrain/detail";

const state = vi.hoisted(() => ({ requests: [] as string[], resolve: [] as ((value: Texture) => void)[], reject: [] as ((error: Error) => void)[], dispose: vi.fn() }));
vi.mock("three/examples/jsm/loaders/KTX2Loader.js", () => ({
  KTX2Loader: class {
    detectSupport = vi.fn(); dispose = state.dispose;
    loadAsync(url: string) {
      state.requests.push(url);
      return new Promise<Texture>((resolve, reject) => { state.resolve.push(resolve); state.reject.push(reject); });
    }
  },
}));
beforeEach(() => { state.requests.length = state.resolve.length = state.reject.length = 0; state.dispose.mockClear(); });
const setup = () => {
  const root = new Scene(), material = new MeshToonMaterial({ vertexColors: true }), geometry = new BufferGeometry();
  const mesh = new Mesh(geometry, material); mesh.name = "terrain-tile"; root.add(mesh);
  const renderer = { capabilities: { getMaxAnisotropy: () => 4, maxTextureSize: 16384 } } as WebGLRenderer;
  return { root, material, geometry, mesh, renderer };
};
const settle = (start = 0) => state.resolve.slice(start).map(resolve => { const texture = new Texture(); resolve(texture); return vi.spyOn(texture, "dispose"); });

it("cleans partial failures, retains fallback and retries", async () => {
  const { root, material, mesh, renderer } = setup();
  const detail = createTerrainDetail(root, renderer);
  const failed = expect(detail.setQuality("High")).rejects.toThrow("missing photo");
  await vi.waitFor(() => expect(state.requests).toHaveLength(2));
  const texture = new Texture(), dispose = vi.spyOn(texture, "dispose");
  state.resolve[0]!(texture); state.reject[1]!(new Error("missing photo"));
  await failed;
  expect(dispose).toHaveBeenCalledOnce(); expect(mesh.material).toBe(material);
  const retry = detail.setQuality("High");
  await vi.waitFor(() => expect(state.requests).toHaveLength(4)); settle(2); await retry;
  expect(mesh.material.name).toBe("cc0-terrain"); detail.dispose();
  expect(mesh.material).toBe(material);
});

it("defers photos until resume and supports flat Low without photo requests", async () => {
  const { root, material, mesh, geometry, renderer } = setup();
  const previous = material.onBeforeRender, errors = vi.fn();
  const binding = bindTerrainDetail(root, material, "High", errors, true);
  await binding.ready(renderer);
  material.onBeforeRender(renderer, root, new PerspectiveCamera(), geometry, mesh, new Group());
  await Promise.resolve(); expect(state.requests).toHaveLength(0);
  binding.setQuality("Low"); binding.resume();
  await binding.ready(renderer);
  expect(state.requests).toHaveLength(0);
  expect(mesh.material.type).toBe("MeshBasicMaterial");
  binding.setQuality("High");
  const ready = binding.ready(renderer);
  await vi.waitFor(() => expect(state.requests).toHaveLength(2));
  expect(state.requests.every(url => url.includes("2048"))).toBe(true);
  const disposals = settle(); await ready;
  expect(mesh.material.name).toBe("cc0-terrain");
  binding.dispose(); binding.dispose();
  expect(material.onBeforeRender).toBe(previous);
  expect(mesh.material).toBe(material); disposals.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
  expect(errors).not.toHaveBeenCalled();
});

it("ignores stale tier completions and disposes assets arriving after teardown", async () => {
  const { root, mesh, material, renderer } = setup();
  const detail = createTerrainDetail(root, renderer);
  const high = detail.setQuality("High");
  await vi.waitFor(() => expect(state.requests).toHaveLength(2));
  await detail.setQuality("Low");
  expect(state.requests).toHaveLength(2);
  const lowMaterial = mesh.material;
  expect(lowMaterial.type).toBe("MeshBasicMaterial");
  const highDisposals = state.resolve.slice(0, 2).map(resolve => { const t = new Texture(); resolve(t); return vi.spyOn(t, "dispose"); });
  await high; expect(mesh.material).toBe(lowMaterial);
  highDisposals.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
  const balanced = detail.setQuality("High");
  await vi.waitFor(() => expect(state.requests).toHaveLength(4));
  detail.dispose(); const lateDisposals = settle(2); await balanced;
  lateDisposals.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
  expect(mesh.material).toBe(material);
});

it("shares materials with streamed tiles and leaves unrelated meshes alone", async () => {
  const { root, mesh, material, renderer } = setup();
  const detail = createTerrainDetail(root, renderer);
  const loaded = detail.setQuality("High");
  await vi.waitFor(() => expect(state.requests).toHaveLength(2)); settle(); await loaded;
  const next = new Mesh(new BufferGeometry(), material); next.name = "terrain-tile";
  const leaves = new Mesh(new BufferGeometry(), material); leaves.name = "leaves";
  root.add(next, leaves); detail.refresh();
  expect(next.material).toBe(mesh.material); expect(leaves.material).toBe(material);
  mesh.removeFromParent(); detail.refresh(); detail.dispose();
  expect(next.material).toBe(material);
});

it("keeps Low when pending High finishes later", async () => {
  const { root, mesh, renderer } = setup();
  const detail = createTerrainDetail(root, renderer);
  const high = detail.setQuality("High");
  await vi.waitFor(() => expect(state.requests).toHaveLength(2));
  await detail.setQuality("Low");
  const current = mesh.material;
  const stale = settle(); await high;
  expect(mesh.material).toBe(current);
  stale.forEach(dispose => expect(dispose).toHaveBeenCalledOnce()); detail.dispose();
});

it("uses High photos on hardware that met the previous middle-tier threshold", async () => {
  const { root, renderer } = setup();
  renderer.capabilities.maxTextureSize = 4096;
  const detail = createTerrainDetail(root, renderer);
  const ready = detail.setQuality("High");
  await vi.waitFor(() => expect(state.requests).toHaveLength(2));
  expect(state.requests.every(url => url.includes("2048"))).toBe(true);
  settle(); await ready; detail.dispose();
});

it("keeps software rasterizers on flat shaders even when overall High is pinned", async () => {
  const { root, mesh, material, renderer } = setup();
  renderer.getContext = () => ({
    RENDERER: 0x1f01,
    getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 0x9246 }),
    getParameter: (parameter: number) => parameter === 0x9246 ? "ANGLE (Google, Vulkan SwiftShader Device (Subzero))" : "WebKit WebGL",
  }) as unknown as WebGL2RenderingContext;
  const detail = createTerrainDetail(root, renderer);
  for (const quality of ["Low", "High", "High"] as const) await detail.setQuality(quality);
  expect(state.requests).toHaveLength(0);
  expect(mesh.material.type).toBe("MeshBasicMaterial");
  const fallback = mesh.material;
  await detail.setQuality("High");
  expect(mesh.material).toBe(fallback);
  detail.dispose();
  expect(mesh.material).toBe(material);
});

it("keeps photo decoding and shader swaps behind the existing dressing completion marker", async () => {
  const { root, material, mesh, geometry, renderer } = setup();
  let phase = "pending";
  renderer.domElement = { closest: () => ({ getAttribute: () => phase }) } as unknown as HTMLCanvasElement;
  const binding = bindTerrainDetail(root, material, "High", vi.fn(), true);
  await binding.ready(renderer); binding.resume();
  const render = () => material.onBeforeRender(renderer, root, new PerspectiveCamera(), geometry, mesh, new Group());
  render(); await Promise.resolve(); expect(state.requests).toHaveLength(0);
  expect(mesh.material).toBe(material);
  binding.setQuality("High");
  await Promise.resolve(); expect(state.requests).toHaveLength(0);
  phase = "done"; render();
  await vi.waitFor(() => expect(state.requests).toHaveLength(2));
  settle(); await binding.ready(renderer);
  expect(mesh.material.type).toBe("MeshStandardMaterial"); binding.dispose();
});

it("installs software flat shading before dressing finishes without loading photos", async () => {
  const { root, material, mesh, geometry, renderer } = setup();
  renderer.getContext = () => ({
    RENDERER: 0x1f01, getExtension: () => null, getParameter: () => "SwiftShader",
  }) as unknown as WebGL2RenderingContext;
  renderer.domElement = { closest: () => ({ getAttribute: () => "pending" }) } as unknown as HTMLCanvasElement;
  const binding = bindTerrainDetail(root, material, "High", vi.fn(), true);
  material.onBeforeRender(renderer, root, new PerspectiveCamera(), geometry, mesh, new Group());
  expect(mesh.material.type).toBe("MeshBasicMaterial");
  expect(state.requests).toHaveLength(0);
  binding.setQuality("Low"); binding.setQuality("High");
  expect(state.requests).toHaveLength(0);
  binding.dispose(); expect(mesh.material).toBe(material);
});

it("switches resident and streamed meshes immediately on adaptive Low, then reloads High", async () => {
  const { root, material, mesh, renderer } = setup();
  const binding = bindTerrainDetail(root, material, "High", vi.fn());
  const ready = binding.ready(renderer);
  await vi.waitFor(() => expect(state.requests).toHaveLength(2));
  const textureDisposals = settle(); await ready;
  const photo = mesh.material, photoDispose = vi.spyOn(photo, "dispose");
  const next = new Mesh(new BufferGeometry(), material); next.name = "terrain-tile"; root.add(next);
  binding.setQuality("Low");
  expect(mesh.material.type).toBe("MeshBasicMaterial");
  expect(next.material).toBe(mesh.material);
  expect(photoDispose).toHaveBeenCalledOnce();
  textureDisposals.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
  binding.setQuality("High");
  const reloaded = binding.ready(renderer);
  await vi.waitFor(() => expect(state.requests).toHaveLength(4));
  settle(2); await reloaded;
  expect(mesh.material.type).toBe("MeshStandardMaterial");
  expect(next.material).toBe(mesh.material);
  binding.dispose();
});
