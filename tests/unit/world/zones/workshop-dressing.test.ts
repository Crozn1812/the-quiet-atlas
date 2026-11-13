import { readFile } from "node:fs/promises";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Texture, type WebGLRenderer } from "three";
import { afterEach, expect, it, vi } from "vitest";
import { createWorkshopDressing } from "../../../../src/features/world/zones/workshop-dressing";
import { createWorkshopScene } from "../../../../src/features/world/zones/workshop";
import { setBakedPropQuality } from "../../../../src/features/world/props/batched";
import { bindWorkshopBatch, createWorkshopLibrary } from "../../../../src/features/world/props/workshop-library";

const { load, decoderDisposed } = vi.hoisted(() => ({ load: vi.fn(), decoderDisposed: vi.fn() }));
vi.mock("three/addons/loaders/GLTFLoader.js", () => ({ GLTFLoader: class {
  setKTX2Loader() { return this; }
  setMeshoptDecoder() { return this; }
  loadAsync(url: string) { return load(url); }
} }));
vi.mock("three/addons/loaders/KTX2Loader.js", () => ({ KTX2Loader: class {
  setWorkerLimit() { return this; }
  detectSupport() { return this; }
  dispose() { decoderDisposed(); }
} }));
afterEach(() => { vi.restoreAllMocks(); load.mockReset(); decoderDisposed.mockReset(); });
const flat = { seed: 103, heightAt: () => 0, onPath: (x: number) => Math.abs(x) <= 2.6, underWater: () => false };

it("fits approved CC0 LOD1s into the existing eight draws and 6k triangle budget, with no asset bytes added", async () => {
  const manifest = JSON.parse(await readFile("public/world/lib/manifest.json", "utf8"));
  const license = await readFile("assets/LICENSES.csv", "utf8");
  const parts = createWorkshopDressing(flat, 1, 0);
  const scene = createWorkshopScene(flat);
  try {
    const baseline = Object.entries(scene.group.userData.trianglesByCluster as Record<string, number>)
      .filter(([key]) => !key.startsWith("dressing-")).reduce((sum, [,count]) => sum + count, 0);
    let detail = baseline;
    for (const part of parts) {
      const asset = manifest.assets.find((a: { id: string }) => a.id === part.asset);
      expect(asset.license).toBe("CC0-1.0");
      const lod = asset.lods.find((l: { level: number }) => l.level === 1);
      expect(license).toContain(lod.file);
      expect((await readFile(`public/world/lib/${lod.file}`)).byteLength).toBe(lod.bytes);
      detail += lod.triangles;
    }
    expect(detail).toBeLessThanOrEqual(6000);
    const meshes: Mesh[] = [];
    scene.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
    expect(meshes).toHaveLength(8);
    expect(meshes.find(m => m.name === "workshop-wood")!.userData.photoSurface).toBe("bark");
    expect(meshes.some(m => m.name === "rock-stack-stones")).toBe(true);
    console.info(`Workshop detail: ${detail} triangles, ${meshes.length} draws; new public bytes: 0`);
  } finally { parts.forEach(p => p.geometry.dispose()); scene.dispose(); }
});

it.each([[1,0],[-1,7],[1,-14]])("grounds every dressing envelope after site reflection/relocation (%i, %i)", (side, offset) => {
  const heightAt = (x: number, z: number) => x * 0.035 + z * 0.02;
  const parts = createWorkshopDressing({ ...flat, heightAt }, side!, offset!);
  try {
    expect(parts).toHaveLength(18);
    for (const part of parts) {
      const p = part.geometry.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), y = p.getY(i) - heightAt(x,z);
        expect(Math.abs(x)).toBeGreaterThan(2.6);
        expect(Math.abs(z - offset!)).toBeLessThan(5.3);
        expect(y).toBeGreaterThanOrEqual(part.bounds.min.y - 1e-6);
        expect(y).toBeLessThanOrEqual(part.bounds.max.y + 1e-6);
      }
    }
  } finally { parts.forEach(p => p.geometry.dispose()); }
});

it("rejects a small water pocket inside a prop envelope", () => {
  const pocket = { ...flat, underWater: (x: number, z: number) => Math.hypot(x + 7.25, z + 3.85) < 0.1 };
  const parts = createWorkshopDressing(pocket, 1, 0);
  try { expect(parts.some(p => p.asset === "rock-boulder-1")).toBe(false); }
  finally { parts.forEach(p => p.geometry.dispose()); }
});

it("loads each library variant once, expands transformed geometry and releases textures and decoder", async () => {
  const library = createWorkshopLibrary();
  const texture = new Texture(), textureDisposed = vi.spyOn(texture, "dispose");
  const geometry = new BoxGeometry(), geometryDisposed = vi.spyOn(geometry, "dispose");
  const material = new MeshStandardMaterial({ color: 0x668850, map: texture });
  const materialDisposed = vi.spyOn(material, "dispose");
  const root = new Group(), mesh = new Mesh(geometry, material);
  mesh.position.set(2,3,4); root.add(mesh);
  load.mockResolvedValue({ scene: root });
  expect(load).not.toHaveBeenCalled();
  const [a,b] = await Promise.all([library.load("prop-fern", {} as WebGLRenderer),library.load("prop-fern", {} as WebGLRenderer)]);
  try {
    expect(load).toHaveBeenCalledExactlyOnceWith("/world/lib/prop-fern-lod1.glb");
    expect(a).not.toBe(b);
    a.computeBoundingBox();
    expect(a.boundingBox!.min.toArray()).toEqual([1.5,2.5,3.5]);
    expect(a.getAttribute("color").getY(0)).toBeCloseTo(material.color.g);
    expect(textureDisposed).toHaveBeenCalledOnce(); expect(geometryDisposed).toHaveBeenCalledOnce(); expect(materialDisposed).toHaveBeenCalledOnce();
  } finally { a.dispose(); b.dispose(); library.dispose(); library.dispose(); }
  await vi.waitFor(() => expect(decoderDisposed).toHaveBeenCalledOnce());
});

it("releases late GLBs after teardown before terminating their decoder", async () => {
  const library = createWorkshopLibrary();
  let resolve!: (value: { scene: Group }) => void;
  load.mockImplementation(() => new Promise(r => { resolve = r; }));
  const ready = library.load("prop-grass", {} as WebGLRenderer);
  const rejected = expect(ready).rejects.toThrow(/unavailable/);
  await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
  library.dispose();
  expect(decoderDisposed).not.toHaveBeenCalled();
  const root = new Group(), geometry = new BoxGeometry(), material = new MeshStandardMaterial();
  const geometryDisposed = vi.spyOn(geometry, "dispose"), materialDisposed = vi.spyOn(material,"dispose");
  root.add(new Mesh(geometry, material)); resolve({ scene: root });
  await rejected;
  await vi.waitFor(() => expect(decoderDisposed).toHaveBeenCalledOnce());
  expect(geometryDisposed).toHaveBeenCalledOnce(); expect(materialDisposed).toHaveBeenCalledOnce();
});

it("swaps whole batches after deferred loads and restores the exact fallback synchronously on Low", async () => {
  load.mockImplementation(async () => {
    const scene = new Group();
    scene.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0x668850 })));
    return { scene };
  });
  const workshop = createWorkshopScene(flat), scene = new Scene(), camera = new PerspectiveCamera();
  scene.add(workshop.group);
  const meshes: Mesh[] = [];
  workshop.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  const fallback = meshes.map(mesh => mesh.geometry);
  const attrs: Record<string,string> = { "data-world-build":"done", "data-world-intro":"done", "data-world-paused":"false" };
  const renderer = { domElement: { closest: () => ({ getAttribute: (key: string) => attrs[key] }) } } as unknown as WebGLRenderer;
  const render = () => meshes.forEach(mesh => mesh.onAfterRender(renderer,scene,camera,mesh.geometry,mesh.material as MeshStandardMaterial,new Group()));
  try {
    setBakedPropQuality(scene,"Low"); render(); await Promise.resolve(); expect(load).not.toHaveBeenCalled();
    setBakedPropQuality(scene,"High"); render();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(7));
    await vi.waitFor(() => expect(meshes.filter((mesh,i) => mesh.geometry !== fallback[i])).toHaveLength(3));
    setBakedPropQuality(scene,"Low");
    meshes.forEach((mesh,i) => expect(mesh.geometry).toBe(fallback[i]));
    setBakedPropQuality(scene,"Balanced");
    expect(meshes.filter((mesh,i) => mesh.geometry !== fallback[i])).toHaveLength(3);
    expect(meshes.every(mesh => mesh.geometry.getAttribute("position").array.every(Number.isFinite))).toBe(true);
  } finally { workshop.dispose(); workshop.dispose(); }
  await vi.waitFor(() => expect(decoderDisposed).toHaveBeenCalledOnce());
});

it("culls distant submissions, waits for play, and never requests detail on Low", () => {
  const root = new Group(), mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial()); root.add(mesh);
  const scene = new Scene(), camera = new PerspectiveCamera(); scene.add(root);
  const attrs: Record<string,string> = { "data-world-build":"done", "data-world-intro":"done", "data-world-paused":"true" };
  const renderer = { domElement: { closest: () => ({ getAttribute: (key: string) => attrs[key] }) } } as unknown as WebGLRenderer;
  const draw = vi.fn(), release = bindWorkshopBatch(mesh, draw);
  const frame = () => {
    camera.updateMatrixWorld(); root.updateMatrixWorld(true);
    mesh.onBeforeRender(renderer,scene,camera,mesh.geometry,mesh.material,new Group());
    mesh.onAfterRender(renderer,scene,camera,mesh.geometry,mesh.material,new Group());
  };
  try {
    frame(); expect(draw).not.toHaveBeenCalled();
    attrs["data-world-paused"] = "false"; camera.position.z = 71; frame();
    expect(mesh.geometry.drawRange.count).toBe(0); expect(draw).not.toHaveBeenCalled();
    camera.position.z = 50; setBakedPropQuality(root,"Low"); frame(); expect(draw).not.toHaveBeenCalled();
    setBakedPropQuality(root,"High"); frame(); expect(draw).toHaveBeenCalledOnce();
    expect(mesh.geometry.drawRange.count).toBe(Infinity);
  } finally { release(); mesh.geometry.dispose(); mesh.material.dispose(); }
});
