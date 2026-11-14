import { afterEach, describe, expect, it, vi } from "vitest";
import { Box3, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from "three";
import { acquireHrTree, type HrAsset } from "../../../src/features/world/foliage/hr-library";
import { createFarForest, type FarForestSite } from "../../../src/features/world/scene/far-forest";
import { createFarLandscape } from "../../../src/features/world/scene/far-landscape";
vi.mock("../../../src/features/world/foliage/hr-library", () => ({ acquireHrTree: vi.fn() }));
const site: FarForestSite = { x: 80, z: -400, y: 15, height: 8, id: "hr-tree-spreading-crown", yaw: 0.4 };
const parent = () => new Mesh();
afterEach(() => vi.clearAllMocks());
describe("deferred HR far crown leases", () => {
  it("waits for a playable High render and never starts the crowns from a Low render", () => {
    const release = vi.fn();
    vi.mocked(acquireHrTree).mockReturnValue({ ready: new Promise(() => {}), release });
    const far = createFarLandscape();
    const dataset = { worldQuality: "low", worldBuild: "done", worldIntro: "done", worldPaused: "false" };
    const renderer = { domElement: { closest: () => ({ dataset }) },
      getContext: vi.fn(() => ({ getExtension: () => null })) };
    const render = () => far.mesh.onAfterRender(renderer as never, {} as never, {} as never,
      far.mesh.geometry, far.mesh.material, null as never);
    try {
      render();
      dataset.worldQuality = "high"; dataset.worldBuild = "pending"; render();
      dataset.worldBuild = "done"; dataset.worldIntro = "playing"; render();
      dataset.worldIntro = "done"; dataset.worldPaused = "true"; render();
      expect(acquireHrTree).not.toHaveBeenCalled();
      expect(renderer.getContext).not.toHaveBeenCalled();
      dataset.worldPaused = "false"; render(); render();
      expect(renderer.getContext).toHaveBeenCalledOnce();
      expect(acquireHrTree).toHaveBeenCalledTimes(3);
    } finally { far.dispose(); }
    expect(release).toHaveBeenCalledTimes(3);
  });
  it("does not acquire before a rendered playable frame, starts once and releases pending work", async () => {
    let resolve!: (asset: HrAsset) => void;
    const release = vi.fn();
    vi.mocked(acquireHrTree).mockReturnValue({ ready: new Promise(r => { resolve = r; }), release });
    const mesh = parent(), forest = createFarForest(mesh, [site], -1024, -1300, { value: 0 });
    expect(acquireHrTree).not.toHaveBeenCalled();
    forest.start({} as never); forest.start({} as never);
    expect(acquireHrTree).toHaveBeenCalledExactlyOnceWith(expect.anything(), site.id, 1);
    forest.dispose(); forest.dispose(); expect(release).toHaveBeenCalledOnce();
    resolve({ parts: [], bounds: new Box3(), center: new Vector3(), dispose() {} });
    await Promise.resolve(); expect(mesh.children).toHaveLength(0); expect(forest.group.children).toHaveLength(0);
  });
  it("instances owned real leaf buffers without shadow draws and disposes them exactly once", async () => {
    const geometry = new PlaneGeometry(6, 12), material = new MeshBasicMaterial(), release = vi.fn();
    vi.mocked(acquireHrTree).mockReturnValue({ ready: Promise.resolve({ parts: [{ geometry, material, leaf: true }],
      bounds: new Box3(new Vector3(-3, 0, -3), new Vector3(3, 12, 3)), center: new Vector3(0, 6, 0), dispose() {} }), release });
    const forest = createFarForest(parent(), [site, { ...site, x: 100 }], -1024, -1300, { value: 0 });
    forest.start({} as never); await Promise.resolve();
    const mesh = forest.group.children[0] as Mesh;
    expect(mesh.castShadow || mesh.receiveShadow).toBe(false);
    expect(mesh.geometry.getAttribute("hrFade").count).toBe(2);
    expect(mesh.geometry.getAttribute("position")).not.toBe(geometry.getAttribute("position"));
    const own = vi.spyOn(mesh.geometry, "dispose"), shared = vi.spyOn(geometry, "dispose");
    forest.dispose(); forest.dispose();
    expect(own).toHaveBeenCalledOnce(); expect(shared).not.toHaveBeenCalled(); expect(release).toHaveBeenCalledOnce();
    geometry.dispose(); material.dispose();
  });
  it("retains the continuous landscape when the crown request fails", async () => {
    const release = vi.fn();
    vi.mocked(acquireHrTree).mockReturnValue({ ready: Promise.reject(new Error("offline")), release });
    const mesh = parent(), forest = createFarForest(mesh, [site], 0, 0, { value: 0 });
    forest.start({} as never); await Promise.resolve(); await Promise.resolve();
    expect(mesh.children).toContain(forest.group); expect(forest.group.children).toHaveLength(0);
    forest.dispose(); expect(release).toHaveBeenCalledOnce();
  });
});
