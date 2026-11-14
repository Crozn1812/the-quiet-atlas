import { readFileSync } from "node:fs";
import { Box3, Camera, Group, Matrix4, Mesh, MeshStandardMaterial, Scene, Vector3, type WebGLRenderer } from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGd110, disposeGd110, GD110_WHEEL_RADIUS, STEERING_PIVOT } from "../../../src/features/world/vehicle/mesh";
import { hrVehicleLod, installHrVehicle, type HrVehicleAsset } from "../../../src/features/world/vehicle/hr-runtime";

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); vi.useRealTimers(); });
function resource(): HrVehicleAsset {
  return { lods: [0, 1].map(() => (["chassis", "steering", "front_wheel", "rear_wheel"] as const)
    .map(target => ({ target, mesh: new Mesh() }))), dispose: vi.fn() };
}
function setup(device = "NVIDIA RTX 3060", quality = "high", load = vi.fn(async () => resource())) {
  vi.useFakeTimers();
  const bike = createGd110();
  cleanups.push(() => disposeGd110(bike));
  let transition = false;
  const controller = installHrVehicle(bike, () => transition, load);
  cleanups.push(controller.dispose);
  const attributes: Record<string, string> = { "data-world-quality": quality, "data-world-build": "done", "data-world-intro": "done" };
  const renderer = { getContext: () => ({ RENDERER: 1, getExtension: () => null, getParameter: () => device }),
    domElement: { closest: () => ({ getAttribute: (key: string) => attributes[key], hasAttribute: (key: string) => key in attributes }) },
    capabilities: { maxTextureSize: 16384 } } as unknown as WebGLRenderer;
  const camera = new Camera(); camera.position.z = 3;
  const fallback = bike.getObjectByName("chassis") as Mesh;
  const frame = () => fallback.onAfterRender(renderer, new Scene(), camera, fallback.geometry, new MeshStandardMaterial(), new Group());
  return { bike, controller, camera, fallback, frame, load, attributes, transition: (value: boolean) => { transition = value; } };
}

describe("deferred GD110 view", () => {
  it.each(["SwiftShader", "llvmpipe LLVM", "softpipe", "software rasterizer"])("keeps the original mesh without requests on %s, even at High", async device => {
    const s = setup(device); s.frame(); await vi.runAllTimersAsync();
    expect(s.load).not.toHaveBeenCalled(); expect(s.fallback.visible).toBe(true);
  });
  it("does not fetch before play, during a mount, or on Low; cancels a scheduled request", async () => {
    const s = setup();
    s.attributes["data-world-build"] = "pending"; s.frame(); await vi.runAllTimersAsync();
    s.attributes["data-world-build"] = "done"; s.attributes["data-world-intro"] = "running"; s.frame(); await vi.runAllTimersAsync();
    s.attributes["data-world-intro"] = "done"; s.transition(true); s.frame(); await vi.runAllTimersAsync();
    expect(s.load).not.toHaveBeenCalled();
    s.transition(false); s.frame(); s.controller.setQuality("low"); await vi.runAllTimersAsync();
    expect(s.load).not.toHaveBeenCalled(); expect(s.fallback.visible).toBe(true);
  });
  it("reuses the existing yaw-before-roll pivots and seat frame, switches LOD, and restores Low", async () => {
    const asset = resource(), s = setup("GPU", "high", vi.fn(async () => asset));
    const front = s.bike.getObjectByName("front_wheel")!, rear = s.bike.getObjectByName("rear_wheel")!, steering = s.bike.getObjectByName("steering")!;
    const seatFrame = s.bike;
    steering.rotation.y = .3; front.rotation.x = rear.rotation.x = 1.2;
    s.frame(); await vi.runAllTimersAsync(); s.controller.update();
    expect(s.load).toHaveBeenCalledOnce(); expect(s.fallback.visible).toBe(false);
    for (const parts of asset.lods) for (const part of parts) {
      expect(part.mesh.parent).toBe(part.target === "chassis" ? seatFrame : s.bike.getObjectByName(part.target));
    }
    expect(front.parent).toBe(steering); expect(front.rotation.x).toBe(1.2); expect(steering.rotation.y).toBe(.3);
    expect(rear.position.y).toBeCloseTo(GD110_WHEEL_RADIUS); expect(steering.position.equals(STEERING_PIVOT)).toBe(true);
    s.camera.position.z = 19; s.controller.update(); expect(asset.lods[1]!.every(p => p.mesh.visible)).toBe(true);
    s.camera.position.z = 16; s.controller.update(); expect(asset.lods[1]!.every(p => p.mesh.visible)).toBe(true);
    s.camera.position.z = 14; s.controller.update(); expect(asset.lods[0]!.every(p => p.mesh.visible)).toBe(true);
    s.controller.setQuality("low"); expect(s.fallback.visible).toBe(true);
    expect(asset.lods.flat().every(p => !p.mesh.visible)).toBe(true);
    s.controller.setQuality("high"); expect(s.fallback.visible).toBe(false); expect(s.load).toHaveBeenCalledOnce();
  });
  it("holds a resolved model offscreen until mounting finishes, and releases it once", async () => {
    const asset = resource(), s = setup("GPU", "high", vi.fn(async () => asset));
    s.frame(); await vi.runAllTimersAsync(); s.transition(true); s.controller.update();
    expect(s.fallback.visible).toBe(true); expect(asset.lods.flat().every(p => p.mesh.parent === null)).toBe(true);
    s.transition(false); s.controller.update(); expect(s.fallback.visible).toBe(false);
    s.controller.dispose(); s.controller.dispose(); expect(asset.dispose).toHaveBeenCalledOnce();
    expect(asset.lods.flat().every(p => p.mesh.parent === null)).toBe(true);
  });
  it("keeps multi-material glTF groups on one animation pivot and refreshes from their mesh draws", async () => {
    const asset = resource(), group = new Group(), enamel = new Mesh(), metal = new Mesh();
    group.add(enamel, metal);
    asset.lods[0]![0]!.mesh = group;
    const s = setup("GPU", "high", vi.fn(async () => asset));
    s.frame(); await vi.runAllTimersAsync(); s.controller.update();
    expect(group.parent).toBe(s.bike);
    expect(enamel.parent).toBe(group); expect(metal.parent).toBe(group);
    expect(enamel.onAfterRender).toBe(metal.onAfterRender);
    s.attributes["data-world-quality"] = "low";
    metal.onAfterRender({} as WebGLRenderer, new Scene(), s.camera, metal.geometry, new MeshStandardMaterial(), group);
    expect(group.visible).toBe(false); expect(s.fallback.visible).toBe(true);
    s.controller.dispose(); expect(group.parent).toBeNull(); expect(asset.dispose).toHaveBeenCalledOnce();
  });
  it("releases a late arrival after teardown and never attaches it", async () => {
    const asset = resource(); let resolve!: (asset: HrVehicleAsset) => void;
    const s = setup("GPU", "high", vi.fn(() => new Promise<HrVehicleAsset>(done => { resolve = done; })));
    s.frame(); await vi.runAllTimersAsync(); s.controller.dispose(); resolve(asset); await Promise.resolve();
    expect(asset.dispose).toHaveBeenCalledOnce(); expect(asset.lods.flat().every(p => p.mesh.parent === null)).toBe(true);
  });
  it("rechecks a quality change between the rendered frame and the deferred task", async () => {
    const s = setup(); s.frame(); s.attributes["data-world-quality"] = "low";
    await vi.runAllTimersAsync(); expect(s.load).not.toHaveBeenCalled();
  });
  it("retains a working original after fetch/decode failure without retrying every frame", async () => {
    const s = setup("GPU", "high", vi.fn(async () => { throw new Error("decode failed"); }));
    s.frame(); await vi.runAllTimersAsync(); s.controller.update(); s.frame(); await vi.runAllTimersAsync();
    expect(s.fallback.visible).toBe(true); expect(s.load).toHaveBeenCalledOnce();
  });
  it("uses distance hysteresis without oscillating", () => {
    expect(hrVehicleLod(18, 0)).toBe(0); expect(hrVehicleLod(18.1, 0)).toBe(1);
    expect(hrVehicleLod(16, 1)).toBe(1); expect(hrVehicleLod(15, 1)).toBe(0);
  });
});

describe("shipped HR-GD110 asset", () => {
  it("decodes both LODs in the existing metre envelope with identical axle/stem contacts", async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
    const document = await io.read("public/world/vehicle/vehicle-gd110.glb");
    const nodes = document.getRoot().listNodes();
    const bounds = new Box3();
    for (const node of nodes) {
      const role = node.getExtras().runtimeTarget;
      if (!role) continue;
      const parent = node.getParentNode()!;
      const pivot = new Vector3().setFromMatrixPosition(new Matrix4().fromArray(parent.getWorldMatrix()));
      if (role === "front_wheel" || role === "rear_wheel") {
        expect(pivot.y).toBeCloseTo(GD110_WHEEL_RADIUS);
        expect(pivot.z).toBeCloseTo((role === "front_wheel" ? .64 : -.64) * .81);
      } else if (role === "steering") expect(pivot.distanceTo(STEERING_PIVOT)).toBeLessThan(.00001);
      const matrix = new Matrix4().fromArray(node.getWorldMatrix());
      for (const primitive of node.getMesh()!.listPrimitives()) {
        const position = primitive.getAttribute("POSITION")!;
        for (let i = 0; i < position.getCount(); i++) bounds.expandByPoint(new Vector3().fromArray(position.getElement(i, [])).applyMatrix4(matrix));
      }
    }
    const size = bounds.getSize(new Vector3());
    expect(Math.abs(bounds.min.y)).toBeLessThan(.003);
    expect(size.x).toBeGreaterThan(.74); expect(size.x).toBeLessThan(.82);
    expect(size.y).toBeGreaterThan(1.20); expect(size.y).toBeLessThan(1.30);
    expect(size.z).toBeGreaterThan(1.57); expect(size.z).toBeLessThan(1.72);
  });
  it("ships actual meshopt and KTX2 with both LODs, provenance and pivot metadata", () => {
    const bytes = readFileSync("public/world/vehicle/vehicle-gd110.glb");
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.extensionsRequired).toEqual(expect.arrayContaining(["EXT_meshopt_compression", "KHR_texture_basisu"]));
    expect(json.nodes.filter((node: { extras?: { lod?: number } }) => node.extras?.lod !== undefined)).toHaveLength(2);
    expect(json.nodes.filter((node: { extras?: { runtimeTarget?: string } }) => node.extras?.runtimeTarget)).toHaveLength(8);
    expect(json.meshes).toHaveLength(8); expect(json.materials).toHaveLength(3); expect(json.images).toHaveLength(3);
    const coat = json.materials.find((m: { extensions?: Record<string, unknown> }) => m.extensions?.KHR_materials_clearcoat);
    expect(coat.extensions.KHR_materials_clearcoat.clearcoatFactor).toBe(1);
    expect(coat.extensions.KHR_materials_clearcoat.clearcoatRoughnessFactor).toBeLessThan(.1);
    expect(json.materials.some((m: { extensions?: Record<string, unknown> }) => m.extensions?.KHR_materials_transmission)).toBe(true);
    const manifest = JSON.parse(readFileSync("public/world/vehicle/manifest.json", "utf8"));
    expect(manifest.bytes).toBe(bytes.length); expect(manifest.lods[0].triangles).toBeGreaterThan(manifest.lods[1].triangles);
    expect(manifest.textureDimensions).toEqual([1024, 1024]);
    expect(manifest.wheelRadius).toBeCloseTo(GD110_WHEEL_RADIUS);
    manifest.steeringPivot.forEach((value: number, i: number) => expect(value).toBeCloseTo(STEERING_PIVOT.toArray()[i]!));
    const licenses = readFileSync("assets/LICENSES.csv", "utf8");
    for (const file of ["vehicle-gd110.glb", "manifest.json"]) expect(licenses).toContain(`public/world/vehicle/${file},`);
    expect(manifest.sources).toContain("https://polyhaven.com/a/sand_01");
    expect(json.nodes.some((n: { name: string }) => /suzuki|logo|badge/i.test(n.name))).toBe(false);
  });
});
