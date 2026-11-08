import { beforeEach, expect, it, vi } from "vitest";
import { BufferGeometry, Group, Mesh, MeshToonMaterial, PerspectiveCamera, Scene, Texture, type WebGLRenderer } from "three";
import { bindTerrainDetail, createTerrainDetail } from "../../../src/features/world/terrain/detail";

const state = vi.hoisted(() => ({ requests: [] as string[], resolve: [] as ((value: Texture) => void)[], reject: [] as ((error: Error) => void)[], dispose: vi.fn() }));
vi.mock("three/examples/jsm/loaders/KTX2Loader.js", () => ({
  KTX2Loader: class {
    manager = { setURLModifier: vi.fn() };
    detectSupport = vi.fn();
    dispose = state.dispose;
    loadAsync(url: string) {
      state.requests.push(url);
      return new Promise<Texture>((resolve, reject) => { state.resolve.push(resolve); state.reject.push(reject); });
    }
  },
}));

beforeEach(() => { state.requests.length = state.resolve.length = state.reject.length = 0; state.dispose.mockClear(); });

it("cleans up partial failures, preserves the old shader and allows a retry", async () => {
  const root = new Group(), material = new MeshToonMaterial(), geometry = new BufferGeometry();
  const mesh = new Mesh(geometry, material);
  mesh.name = "terrain-tile";
  root.add(mesh);
  const original = material.onBeforeCompile;
  const renderer = { capabilities: { getMaxAnisotropy: () => 4 } } as WebGLRenderer;
  const detail = createTerrainDetail(root, renderer);
  const failed = expect(detail.setQuality("High")).rejects.toThrow("missing terrain asset");
  await vi.waitFor(() => expect(state.requests).toHaveLength(5));
  const disposals = state.resolve.slice(0, 4).map(resolve => {
    const texture = new Texture(), dispose = vi.spyOn(texture, "dispose");
    resolve(texture);
    return dispose;
  });
  state.reject[4]!(new Error("missing terrain asset"));
  await failed;
  for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
  expect(material.onBeforeCompile).toBe(original);
  const retry = detail.setQuality("High");
  await vi.waitFor(() => expect(state.requests).toHaveLength(10));
  for (const resolve of state.resolve.slice(5)) resolve(new Texture());
  await retry;
  expect(material.customProgramCacheKey()).toContain("ground-ktx2-v1:true");
  detail.dispose();
  geometry.dispose(); material.dispose();
});

it("starts assets from the render lifecycle, shares the entry gate and restores Low", async () => {
  const root = new Scene(), material = new MeshToonMaterial(), geometry = new BufferGeometry();
  const mesh = new Mesh(geometry, material);
  mesh.name = "terrain-tile";
  root.add(mesh);
  const previous = material.onBeforeRender, compile = material.onBeforeCompile;
  const renderer = { capabilities: { getMaxAnisotropy: () => 8 } } as WebGLRenderer;
  const errors = vi.fn();
  const binding = bindTerrainDetail(root, material, "Low", errors);
  const render = () => material.onBeforeRender(renderer, root, new PerspectiveCamera(), geometry, mesh, new Group());
  render();
  await Promise.resolve();
  expect(state.requests).toHaveLength(0);
  binding.setQuality("High");
  render(); render();
  const ready = binding.ready(renderer);
  await vi.waitFor(() => expect(state.requests).toHaveLength(5));
  const textures = state.resolve.map(resolve => { const texture = new Texture(); resolve(texture); return texture; });
  await ready;
  expect(material.customProgramCacheKey()).toContain("ground-ktx2-v1:true");
  binding.setQuality("Low");
  expect(material.customProgramCacheKey()).toContain("ground-ktx2-v1:false");
  expect(errors).not.toHaveBeenCalled();
  const disposals = textures.map(texture => vi.spyOn(texture, "dispose"));
  binding.dispose(); binding.dispose();
  expect(material.onBeforeRender).toBe(previous);
  expect(material.onBeforeCompile).toBe(compile);
  for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
  geometry.dispose(); material.dispose();
});

it("shares entry loading, honours Low during a pending load, and disposes late assets", async () => {
  const root = new Group(), material = new MeshToonMaterial(), geometry = new BufferGeometry();
  const mesh = new Mesh(geometry, material);
  mesh.name = "terrain-tile";
  root.add(mesh);
  const original = material.onBeforeCompile;
  const renderer = { capabilities: { getMaxAnisotropy: () => 8 } } as WebGLRenderer;
  const detail = createTerrainDetail(root, renderer);
  const first = detail.setQuality("High"), second = detail.setQuality("Balanced");
  await vi.waitFor(() => expect(state.requests).toHaveLength(5));
  await detail.setQuality("Low");
  detail.dispose();
  const textures = state.resolve.map(resolve => {
    const texture = new Texture();
    const dispose = vi.spyOn(texture, "dispose");
    resolve(texture);
    return dispose;
  });
  await Promise.all([first, second]);
  for (const dispose of textures) expect(dispose).toHaveBeenCalledExactlyOnceWith();
  expect(state.dispose).toHaveBeenCalledExactlyOnceWith();
  expect(material.onBeforeCompile).toBe(original);
  geometry.dispose(); material.dispose();
});

