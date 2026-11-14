import { describe, expect, it, vi } from "vitest";
import { Box3, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Texture, Vector3, type WebGLRenderer } from "three";
import { bindHrProps, fitHrProp, HR_PROP_FAMILIES, hrPropLod, selectHrProp, type HrPropAsset, type HrPropSite } from "../../../src/features/world/props/hr-props";
import { setBakedPropQuality } from "../../../src/features/world/props/batched";

const site: HrPropSite = { asset: "hr-rock-boulder", x: 7, z: -3, size: [2, 1, 1.5], yaw: .4, tint: .95 };
function fixture() {
  const texture = new Texture(), material = new MeshStandardMaterial({ map: texture });
  const near = new BoxGeometry(), far = new BoxGeometry();
  const asset: HrPropAsset = { lods: [[{ geometry: near, material, matrix: new Matrix4() }], [{ geometry: far, material, matrix: new Matrix4() }]],
    bounds: new Box3(new Vector3(-.5, -.5, -.5), new Vector3(.5, .5, .5)), dispose: vi.fn() };
  const mesh = new Mesh(new BoxGeometry(20, 1, 20), new MeshStandardMaterial()), scene = new Scene(); scene.add(mesh);
  return { asset, mesh, scene, texture, material };
}
const renderer = {} as WebGLRenderer;

describe("HR props streaming", () => {
  it("selects deterministic variants across every prop family", () => {
    for (const [legacy, family] of [["prop-bush", "bush"], ["prop-fern", "fern"], ["rock-boulder-1", "rock"], ["prop-fallen-log", "log"], ["prop-grass", "grass"]] as const) {
      const found = new Set(Array.from({ length: 400 }, (_, i) => selectHrProp(legacy, i * .13, i * -.29)));
      expect([...found].sort()).toEqual([...HR_PROP_FAMILIES[family]].sort());
      expect(selectHrProp(legacy, 3, 4)).toBe(selectHrProp(legacy, 3, 4));
    }
  });
  it("preserves rigid geometry and the original rotated footprint on slopes", () => {
    const bounds = new Box3(new Vector3(-1, 0, -1), new Vector3(1, 4, 1));
    const fit = fitHrProp(bounds, site, (x, z) => x * .2 + z * .1);
    const foot = new Vector3(0, 0, 0).applyMatrix4(fit), top = new Vector3(0, 4, 0).applyMatrix4(fit);
    expect(foot.toArray()).toEqual([site.x, site.x * .2 + site.z * .1 - .025, site.z]);
    expect(top.y - foot.y).toBeCloseTo(1); expect(top.x).toBe(foot.x); expect(top.z).toBe(foot.z);
  });
  it("keeps PBR maps, instances repeated assets, switches LOD, and restores Low", async () => {
    const { mesh, scene, asset, material, texture } = fixture(), original = mesh.geometry;
    const load = vi.fn(async () => asset);
    const controller = bindHrProps(mesh, [site, { ...site, x: 9 }], () => 2, undefined, load);
    expect(load).not.toHaveBeenCalled();
    setBakedPropQuality(scene, "Low"); expect(await controller.loadDetail(renderer)).toBe(false); expect(load).not.toHaveBeenCalled();
    setBakedPropQuality(scene, "High"); expect(await controller.loadDetail(renderer)).toBe(true); expect(load).toHaveBeenCalledTimes(1);
    const streamed = mesh.children[0] as Group, instances = streamed.children as InstancedMesh[];
    expect(instances).toHaveLength(2); expect(instances.every(m => m.count === 2)).toBe(true);
    expect(instances[0]!.material).toBe(material); expect(material.map).toBe(texture);
    const camera = new PerspectiveCamera(); camera.position.set(8, 3, 10); camera.updateMatrixWorld(); mesh.updateMatrixWorld(true);
    mesh.onBeforeRender(renderer, scene, camera, mesh.geometry, mesh.material, null!);
    expect(instances[0]!.visible).toBe(true); expect(instances[0]!.castShadow).toBe(true); expect(instances[1]!.visible).toBe(false);
    camera.position.z = 40; camera.updateMatrixWorld();
    mesh.onBeforeRender(renderer, scene, camera, mesh.geometry, mesh.material, null!);
    expect(instances[0]!.visible).toBe(false); expect(instances[1]!.visible).toBe(true); expect(instances[1]!.castShadow).toBe(false);
    setBakedPropQuality(scene, "Low"); expect(mesh.geometry).toBe(original); expect(streamed.visible).toBe(false);
    controller.dispose(); controller.dispose(); expect(asset.dispose).toHaveBeenCalledTimes(1); expect(mesh.children).toHaveLength(0);
  });
  it("leaves the entire fallback after a failed load", async () => {
    const { mesh, asset } = fixture(), original = mesh.geometry;
    const load = vi.fn().mockResolvedValueOnce(asset).mockRejectedValueOnce(new Error("decode failed"));
    const controller = bindHrProps(mesh, [site, { ...site, asset: "hr-rock-river" }], () => 0, undefined, load);
    expect(await controller.loadDetail(renderer)).toBe(false); expect(mesh.geometry).toBe(original);
    expect(mesh.children).toHaveLength(0); expect(asset.dispose).toHaveBeenCalledOnce();
    expect(mesh.userData.hrPropsError).toBe("decode failed"); controller.dispose();
  });
  it("releases assets that arrive after their zone is disposed", async () => {
    const { mesh, asset } = fixture(); let resolve!: (asset: HrPropAsset) => void;
    const controller = bindHrProps(mesh, [site], () => 0, undefined, () => new Promise(done => { resolve = done; }));
    const pending = controller.loadDetail(renderer); controller.dispose(); resolve(asset);
    expect(await pending).toBe(false); expect(asset.dispose).toHaveBeenCalledOnce(); expect(mesh.children).toHaveLength(0);
  });
  it("starts streaming only after an unpaused playable paint", async () => {
    const { mesh, scene, asset } = fixture(), load = vi.fn(async () => asset);
    const controller = bindHrProps(mesh, [site], () => 0, undefined, load), camera = new PerspectiveCamera();
    const attrs: Record<string, string> = { "data-world-build": "pending", "data-world-intro": "playing", "data-world-paused": "false" };
    const gpu = { domElement: { closest: () => ({ getAttribute: (key: string) => attrs[key] }) } } as unknown as WebGLRenderer;
    const paint = () => mesh.onAfterRender(gpu, scene, camera, mesh.geometry, mesh.material, null!);
    paint(); expect(load).not.toHaveBeenCalled(); attrs["data-world-build"] = "done";
    paint(); expect(load).not.toHaveBeenCalled(); attrs["data-world-intro"] = "done"; attrs["data-world-paused"] = "true";
    paint(); expect(load).not.toHaveBeenCalled(); attrs["data-world-paused"] = "false";
    paint(); expect(await controller.loadDetail(gpu)).toBe(true); expect(load).toHaveBeenCalledOnce(); controller.dispose();
  });
  it("uses hysteresis around the LOD boundary", () => {
    expect(hrPropLod(25, 0)).toBe(0); expect(hrPropLod(27, 0)).toBe(1);
    expect(hrPropLod(22, 1)).toBe(1); expect(hrPropLod(20, 1)).toBe(0);
  });
});
