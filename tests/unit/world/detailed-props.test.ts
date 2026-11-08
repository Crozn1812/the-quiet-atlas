import { readFile } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { Box3, BufferGeometry, Group, InstancedMesh, Mesh, MeshToonMaterial, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder as ThreeMeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGroundDetails, GROUND_TRIANGLE_LIMIT, loadGroundPropDetails, type GroundDetail } from "../../../src/features/world/foliage/ground";
import { createRampMaterial, disposeRampGradients } from "../../../src/features/world/materials/ramp";
import { createDeferredProp, loadPropGeometry, PROP_ASSETS, type PropAsset } from "../../../src/features/world/props/deferred";
import { deferBakedBatch, setBakedPropQuality } from "../../../src/features/world/props/batched";
import { createRockGeometry } from "../../../src/features/world/props/rocks";
import { createLogGeometry } from "../../../src/features/world/props/wood";
import { createFirstLightScene } from "../../../src/features/world/zones/first-light";
import { createHorizonScene } from "../../../src/features/world/zones/horizon";

afterEach(disposeRampGradients);
const geometry = () => createRockGeometry("stone", 7, true);
const wood = (asset: PropAsset) => Promise.resolve(asset === "prop-log" ? createLogGeometry(201) : geometry());

describe("G-03 original meshopt assets", () => {
  it("loads real GLBs through the runtime decoder and packs RGB ground variants without a browser", async () => {
    const spy = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockImplementation(async url => {
      const bytes = await readFile(`public${url}`);
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return new GLTFLoader().setMeshoptDecoder(ThreeMeshoptDecoder).parseAsync(buffer, "");
    });
    const ground = createGroundDetails(0);
    try {
      const batch = ground.group.children[2] as Mesh;
      expect(spy).not.toHaveBeenCalled();
      ground.setQuality("Low");
      Reflect.apply(batch.onAfterRender, batch, []);
      expect(spy).not.toHaveBeenCalled();
      ground.setQuality("High");
      Reflect.apply(batch.onAfterRender, batch, []);
      expect(await loadGroundPropDetails(ground.group)).toEqual([true]);
      Reflect.apply(batch.onAfterRender, batch, []);
      const geometry = (ground.group.children[2] as Mesh).geometry;
      expect(geometry.getAttribute("position").count).toBe(292 * 3);
      expect(geometry.getAttribute("color").itemSize).toBe(3);
      for (const name of ["position", "color", "groundPosition1", "groundColor1", "groundPosition2", "groundColor2"]) {
        expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
        if (name.toLowerCase().includes("color")) {
          expect(Math.max(...geometry.getAttribute(name).array)).toBeLessThanOrEqual(1);
          expect(Math.min(...geometry.getAttribute(name).array)).toBeGreaterThanOrEqual(0);
        }
      }
      expect(geometry.boundingBox!.min.y).toBeGreaterThanOrEqual(-0.001);
      expect(spy).toHaveBeenCalledTimes(3);
    } finally { ground.dispose(); spy.mockRestore(); }
  });

  it("expands quantized metres and pigments without mutating terrain material or its shared ramp", async () => {
    const terrain = createRampMaterial(0x567856, { continuous: true });
    terrain.vertexColors = true;
    const before = terrain.toJSON(), compile = terrain.onBeforeCompile;
    const disposed = vi.fn();
    terrain.gradientMap!.addEventListener("dispose", disposed);
    const spy = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockImplementation(async url => {
      const bytes = await readFile(`public${url}`);
      return new GLTFLoader().setMeshoptDecoder(ThreeMeshoptDecoder).parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    });
    try {
      for (const asset of Object.keys(PROP_ASSETS) as PropAsset[]) {
        const loaded = await loadPropGeometry(asset);
        expect(loaded.getAttribute("position").array).toBeInstanceOf(Float32Array);
        const colors = loaded.getAttribute("color");
        expect(colors.array).toBeInstanceOf(Float32Array);
        expect(Math.max(...colors.array)).toBeLessThanOrEqual(1);
        expect(Math.min(...colors.array)).toBeGreaterThanOrEqual(0);
        const size = loaded.boundingBox!.getSize(new Vector3());
        expect(Math.max(size.x, size.y, size.z)).toBeLessThan(5);
        expect(Math.min(size.x, size.y, size.z)).toBeGreaterThan(0.05);
        loaded.dispose();
      }
      expect(terrain.toJSON()).toEqual(before);
      expect(terrain.onBeforeCompile).toBe(compile);
      expect(disposed).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); terrain.dispose(); }
  });

  it("decodes every shipped payload within its stricter per-kind budget, with vertex AO and rights", async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
    const licenses = await readFile("assets/LICENSES.csv", "utf8");
    const shapes = new Set<string>();
    for (const [name, budget] of Object.entries(PROP_ASSETS)) {
      const buffer = await readFile(`public/world/props/${name}.glb`);
      const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
      expect(json.extensionsRequired).toContain("EXT_meshopt_compression");
      const document = await io.readBinary(buffer);
      const root = document.getRoot(), meshes = root.listMeshes();
      expect(meshes).toHaveLength(1);
      expect(root.listTextures()).toHaveLength(0);
      expect(root.listMaterials()).toHaveLength(1);
      expect(root.listNodes().some(node => String(node.getExtras().ao_bake).includes("48 cosine"))).toBe(true);
      let triangles = 0;
      for (const primitive of meshes[0]!.listPrimitives()) {
        const positions = primitive.getAttribute("POSITION")!, colors = primitive.getAttribute("COLOR_0")!;
        triangles += primitive.getIndices()!.getCount() / 3;
        expect(colors.getCount()).toBe(positions.getCount());
        expect(Array.from(colors.getArray()!).every(Number.isFinite)).toBe(true);
        if (name.startsWith("rock")) shapes.add(JSON.stringify(Array.from(positions.getArray()!)));
      }
      expect(triangles).toBe(budget.triangles);
      expect(triangles).toBeLessThanOrEqual(name.startsWith("rock-small") ? 200 : name.startsWith("rock") ? 400 : 600);
      expect(buffer.byteLength).toBe(budget.bytes);
      expect(buffer.byteLength).toBeLessThanOrEqual(name.startsWith("rock") ? 20_000 : 80_000);
      expect(licenses).toContain(`public/world/props/${name}.glb,`);
    }
    expect(shapes.size).toBe(4);
  });
});

describe("zone batch upgrades", () => {
  it("loads bench, fence and both large rocks inside real zone batches without changing colliders or draws", async () => {
    const spy = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockImplementation(async url => {
      const bytes = await readFile(`public${url}`);
      return new GLTFLoader().setMeshoptDecoder(ThreeMeshoptDecoder).parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    });
    const context = { seed: 106, heightAt: () => 0, onPath: (x: number) => Math.abs(x) <= 2.6,
      underWater: () => false };
    const zones = [createFirstLightScene(context), createHorizonScene(context)];
    const meshes: Mesh[] = [];
    zones.forEach(zone => zone.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); }));
    const originals = meshes.map(mesh => mesh.geometry), materials = meshes.map(mesh => mesh.material);
    const colliders = JSON.stringify(zones.map(zone => zone.colliders));
    try {
      meshes.forEach(mesh => Reflect.apply(mesh.onAfterRender, mesh, []));
      await vi.waitFor(() => expect(meshes.filter((mesh, i) => mesh.geometry !== originals[i])).toHaveLength(2));
      expect(spy.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
        "/world/props/prop-bench.glb", "/world/props/prop-fence.glb",
        "/world/props/rock-large-1.glb", "/world/props/rock-large-2.glb",
      ]));
      expect(JSON.stringify(zones.map(zone => zone.colliders))).toBe(colliders);
      expect(meshes.map(mesh => mesh.material)).toEqual(materials);
      const after: Mesh[] = [];
      zones.forEach(zone => zone.group.traverse(object => { if (object instanceof Mesh) after.push(object); }));
      expect(after).toEqual(meshes);
      for (const zone of zones) {
        let triangles = 0;
        zone.group.traverse(object => {
          if (object instanceof Mesh) triangles += object.geometry.getAttribute("position").count / 3;
        });
        expect(triangles).toBeLessThanOrEqual(6000);
      }
    } finally { zones.forEach(zone => zone.dispose()); spy.mockRestore(); }
  });

  it("keeps one draw and material, fits the existing footprint, and restores Low without fetching", async () => {
    const root = new Group(), source = geometry();
    const material = new MeshToonMaterial(), mesh = new Mesh(source.clone(), material);
    root.add(mesh);
    const fallback = mesh.geometry;
    const load = vi.fn(async () => createLogGeometry(201));
    const release = deferBakedBatch(mesh, [source], [{ index: 0, asset: "prop-log",
      bounds: new Box3(new Vector3(4, 0, -1), new Vector3(6, 1, 1)) }], () => 0.5, load);
    setBakedPropQuality(root, "Low");
    Reflect.apply(mesh.onAfterRender, mesh, []);
    expect(load).not.toHaveBeenCalled();
    setBakedPropQuality(root, "High");
    Reflect.apply(mesh.onAfterRender, mesh, []);
    await vi.waitFor(() => expect(mesh.geometry).not.toBe(fallback));
    const detail = mesh.geometry;
    expect(mesh.geometry.boundingBox!.min.toArray()).toEqual([4, 0.5, -1]);
    expect(mesh.geometry.boundingBox!.max.toArray()).toEqual([6, 1.5, 1]);
    expect(root.children).toEqual([mesh]);
    expect(mesh.material).toBe(material);
    setBakedPropQuality(root, "Low");
    expect(mesh.geometry).toBe(fallback);
    setBakedPropQuality(root, "High");
    expect(mesh.geometry).toBe(detail);
    expect(load).toHaveBeenCalledTimes(1);
    release(); release();
    fallback.dispose(); source.dispose(); material.dispose();
  });

  it("disposes a late load after the zone unmounts", async () => {
    const source = geometry(), mesh = new Mesh(source.clone(), new MeshToonMaterial());
    const fallback = mesh.geometry;
    let resolve!: (value: BufferGeometry) => void;
    const release = deferBakedBatch(mesh, [source], [{ index: 0, asset: "rock-large-1",
      bounds: source.boundingBox!.clone() }], () => 0, () => new Promise(done => { resolve = done; }));
    Reflect.apply(mesh.onAfterRender, mesh, []);
    release();
    const loaded = geometry(), disposed = vi.fn();
    loaded.addEventListener("dispose", disposed);
    resolve(loaded);
    await vi.waitFor(() => expect(disposed).toHaveBeenCalledTimes(1));
    expect(mesh.geometry).toBe(fallback);
    fallback.dispose(); source.dispose(); mesh.material.dispose();
  });
});

describe("deferred prop ownership", () => {
  it("starts after a visible render and waits while Low is selected", async () => {
    const load = vi.fn(async () => geometry());
    const prop = createDeferredProp("prop-fence", 4, load);
    const mesh = prop.group.children[0] as Mesh;
    prop.setQuality("Low");
    Reflect.apply(mesh.onAfterRender, mesh, []);
    expect(load).not.toHaveBeenCalled();
    prop.setQuality("High");
    Reflect.apply(mesh.onAfterRender, mesh, []);
    expect(await prop.loadDetail()).toBe(true);
    Reflect.apply(mesh.onAfterRender, mesh, []);
    expect(load).toHaveBeenCalledTimes(1);
    prop.dispose();
  });

  it("does no work until requested, coalesces loads, and switches back to procedural at Low", async () => {
    let resolve!: (geometry: BufferGeometry) => void;
    const load = vi.fn(() => new Promise<BufferGeometry>(done => { resolve = done; }));
    const prop = createDeferredProp("prop-bench", 201, load), mesh = prop.group.children[0] as Mesh;
    const fallback = mesh.geometry, detail = geometry(), released = vi.fn();
    detail.addEventListener("dispose", released);
    expect(load).not.toHaveBeenCalled();
    const pending = prop.loadDetail();
    expect(prop.loadDetail()).toBe(pending);
    expect(mesh.geometry).toBe(fallback);
    prop.setQuality("Low");
    resolve(detail);
    expect(await pending).toBe(true);
    expect(mesh.geometry).toBe(fallback);
    prop.setQuality("High");
    expect(mesh.geometry).toBe(detail);
    prop.dispose(); prop.dispose();
    expect(released).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed fallback and disposes a late result after unmount", async () => {
    const failed = createDeferredProp("prop-log", 201, async () => { throw new Error("offline"); });
    const original = (failed.group.children[0] as Mesh).geometry;
    expect(await failed.loadDetail()).toBe(false);
    expect((failed.group.children[0] as Mesh).geometry).toBe(original);
    failed.dispose();
    let resolve!: (geometry: BufferGeometry) => void;
    const prop = createDeferredProp("rock-large-1", 201, () => new Promise(done => { resolve = done; }));
    const pending = prop.loadDetail(), detail = geometry(), released = vi.fn();
    detail.addEventListener("dispose", released);
    prop.dispose(); resolve(detail);
    expect(await pending).toBe(false);
    expect(released).toHaveBeenCalledTimes(1);
    expect(prop.group.children).toHaveLength(0);
  });
});

describe("deferred ground batches", () => {
  const items: GroundDetail[] = Array.from({ length: 1000 }, (_, i) => ({
    kind: i % 3 ? "rock" : "log", variant: i % 3 ? i % 2 : 0,
    x: 1 + i * 0.001, y: 2, z: 1, rotation: 0, scale: 1,
  }));
  it("upgrades atomically within four draws and 40k triangles, then restores Low geometry", async () => {
    const ground = createGroundDetails(items.length);
    ground.setTiles(items);
    const batch = ground.group.children[2] as InstancedMesh, fallback = batch.geometry;
    expect(await ground.loadDetail(wood)).toBe(true);
    expect(batch.geometry).not.toBe(fallback);
    expect(ground.group.children).toHaveLength(4);
    let triangles = 0;
    for (const child of ground.group.children as InstancedMesh[]) {
      triangles += child.count * child.geometry.getAttribute("position").count / 3;
    }
    expect(triangles).toBeLessThanOrEqual(GROUND_TRIANGLE_LIMIT);
    const variants = batch.geometry.getAttribute("groundVariant");
    expect(Array.from({ length: batch.count }, (_, i) => variants.getX(i))).toContain(2);
    ground.setQuality("Low");
    expect(batch.geometry).toBe(fallback);
    ground.setQuality("High");
    expect(batch.geometry).not.toBe(fallback);
    ground.dispose();
  });

  it("releases partial loads, keeps fallback, and never fetches on Low", async () => {
    const ground = createGroundDetails(1), detail = geometry(), released = vi.fn();
    detail.addEventListener("dispose", released);
    const load = vi.fn(async (asset: PropAsset) => {
      if (asset !== "rock-small-1") throw new Error("offline");
      return detail;
    });
    ground.setQuality("Low");
    expect(await ground.loadDetail(load)).toBe(false);
    expect(load).not.toHaveBeenCalled();
    ground.setQuality("High");
    const fallback = (ground.group.children[2] as Mesh).geometry;
    expect(await ground.loadDetail(load)).toBe(false);
    expect((ground.group.children[2] as Mesh).geometry).toBe(fallback);
    expect(released).toHaveBeenCalledTimes(1);
    ground.dispose();
  });
});
