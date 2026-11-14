import { reportBudget } from "../report-budget";
import { readFileSync } from "node:fs";
import { BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, Texture, Vector3, type WebGLRenderer } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";
import { milestoneCertificates } from "../../../../src/features/world/zones/milestones";
import { certificateSlots, cutCertificateSockets } from "../../../../src/features/world/zones/milestones-statue-geometry";
import { createMilestonesStatue } from "../../../../src/features/world/zones/milestones-statue";

async function baked() {
  const buffer = readFileSync("public/world/milestones/character-milestones-walk.glb");
  const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), "");
  expect(gltf.animations).toHaveLength(0);
  expect(gltf.userData.characterSource).toBe("public/world/character/character-duy-c.glb");
  expect(gltf.userData.walkSeconds).toBe(.18);
  let geometry: BufferGeometry | undefined;
  gltf.scene.traverse(node => { if (node instanceof Mesh) { expect(node.type).toBe("Mesh"); geometry = node.geometry; } });
  return geometry!;
}
describe("Milestones frozen walk and certificate glass", () => {
  it("ships the character-derived Blender walk bake with cloth-normal UVs as a small static full-body mesh", async () => {
    const geometry = await baked();
    try {
      expect(geometry.getAttribute("skinIndex")).toBeUndefined();
      geometry.computeBoundingBox();
      expect(geometry.boundingBox!.getSize(new Vector3()).y).toBeCloseTo(5.9, 4);
      reportBudget("milestones-statue triangles (legacy 12000)", geometry.index!.count / 3, 12_000);
      expect(geometry.getAttribute("color").count).toBe(geometry.getAttribute("position").count);
      expect(geometry.getAttribute("uv").count).toBe(geometry.getAttribute("position").count);
      reportBudget("milestones assets bytes (legacy 1500000)", readFileSync("public/world/milestones/character-milestones-walk.glb").length
        + readFileSync("public/world/milestones/cloth-normal.png").length
        + readFileSync("public/world/milestones/kintsugi-mask.png").length, 1_500_000);
    } finally { geometry.dispose(); }
  });
  it("cuts real pentagonal holes for every planned certificate and keeps achieved slots solid", async () => {
    const source = await baked(), slots = certificateSlots(milestoneCertificates());
    const geometry = cutCertificateSockets(source, slots), material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(geometry, material); mesh.updateMatrixWorld(true);
    try {
      expect(geometry.getAttribute("uv").count).toBe(geometry.getAttribute("position").count);
      for (const slot of slots) for (const sign of [-1, 1]) {
        const ray = new Raycaster(new Vector3(slot.center.x, slot.center.y, sign * 4), new Vector3(0, 0, -sign));
        expect(ray.intersectObject(mesh).length > 0).toBe(slot.certificate.achieved);
      }
      reportBudget("tests/unit/world/zones/milestones-statue.test.ts:37 geometry.getAttribute(\"position\").count / 3", geometry.getAttribute("position").count / 3, 25_000);
      const completed = cutCertificateSockets(source, certificateSlots(milestoneCertificates().map(piece => ({ ...piece, achieved: true }))));
      expect(completed.getAttribute("position").count).toBe(source.index!.count); completed.dispose();
    } finally { source.dispose(); geometry.dispose(); material.dispose(); }
  });
  it("automatically adds and removes sockets and fragments with JSON entries", () => {
    const certificates = milestoneCertificates();
    for (const count of [0, 1, 3, 4, 7, 12]) {
      const entries = Array.from({ length: count }, (_, slot) => ({ ...certificates[slot % 4]!, slot }));
      const slots = certificateSlots(entries);
      expect(slots).toHaveLength(count);
      expect(new Set(slots.map(slot => `${slot.center.x}/${slot.center.y}`)).size).toBe(count);
      expect(slots.filter(slot => !slot.certificate.achieved)).toHaveLength(entries.filter(piece => !piece.achieved).length);
    }
  });
  it("defers the asset, uses four draws, freezes transforms and uniforms for reduced motion/far/Low", async () => {
    const load = vi.fn(baked), statue = createMilestonesStatue(milestoneCertificates(), load);
    const scene = new Scene(), camera = new PerspectiveCamera(); scene.add(statue.group);
    const body = statue.group.getObjectByName("milestones-static-walk-white") as Mesh;
    const glass = statue.group.getObjectByName("milestones-certificate-shards-cream") as Mesh;
    let quality = "high";
    const renderer = { domElement: { closest: () => ({ getAttribute: () => quality }) } } as unknown as WebGLRenderer;
    const render = () => body.onBeforeRender(renderer, scene, camera, body.geometry, body.material as never, null as never);
    expect(load).not.toHaveBeenCalled();
    camera.position.set(0, 2, 8); camera.lookAt(0, .38, 0); camera.updateMatrixWorld(true);
    render(); await statue.loadDetail();
    expect(load).toHaveBeenCalledTimes(1); expect(statue.group.children).toHaveLength(4);
    expect(statue.group.userData.ready).toBe(true);
    reportBudget("tests/unit/world/zones/milestones-statue.test.ts:65 statue.group.userData.triangles", statue.group.userData.triangles, 25_000);
    const shader = { uniforms: {}, vertexShader: "", fragmentShader: "" };
    (glass.material as MeshBasicMaterial).onBeforeCompile(shader as never, renderer);
    const time = (shader.uniforms as Record<string, { value: number }>).msTime!;
    const before = statue.group.children.map(node => node.matrix.toArray());
    statue.update(1 / 60, false); expect(time.value).toBeGreaterThan(0);
    const active = time.value;
    statue.update(1 / 60, true); expect(time.value).toBe(active);
    camera.position.set(20, 2, 8); camera.lookAt(20, .38, 0); camera.updateMatrixWorld(true); render();
    statue.update(1 / 60, false); expect(time.value).toBe(active);
    expect(statue.group.getObjectByName("milestones-golden-ribbons")!.visible).toBe(true);
    camera.position.set(0, 2, 8); camera.lookAt(0, .38, 0); camera.updateMatrixWorld(true); render();
    vi.stubGlobal("document", { hidden: true });
    try { statue.update(1 / 60, false); expect(time.value).toBe(active); }
    finally { vi.unstubAllGlobals(); }
    camera.position.set(40, 2, 8); camera.lookAt(40, .38, 0); camera.updateMatrixWorld(true); render();
    statue.update(1 / 60, false); expect(time.value).toBe(active);
    expect(statue.group.getObjectByName("milestones-golden-ribbons")!.visible).toBe(false);
    expect(statue.group.getObjectByName("milestones-ribbon-sparkles")!.visible).toBe(false);
    quality = "low"; render(); statue.update(1 / 60, false); expect(time.value).toBe(active);
    expect(statue.group.getObjectByName("milestones-golden-ribbons")!.visible).toBe(false);
    expect(statue.group.getObjectByName("milestones-ribbon-sparkles")!.visible).toBe(false);
    expect(statue.group.children.map(node => node.matrix.toArray())).toEqual(before);
    const decorationHits: unknown[] = [];
    for (const name of ["milestones-golden-ribbons", "milestones-ribbon-sparkles"])
      statue.group.getObjectByName(name)!.raycast(new Raycaster(), decorationHits as never[]);
    expect(decorationHits).toHaveLength(0);
    statue.dispose(); statue.dispose();
  });
  it("owns and releases the deferred baked cloth texture exactly once", async () => {
    const texture = new Texture(), dispose = vi.spyOn(texture, "dispose");
    const cracks = new Texture(), disposeCracks = vi.spyOn(cracks, "dispose");
    const statue = createMilestonesStatue(milestoneCertificates(), async () => {
      const source = await baked(); source.userData.normalMap = texture; source.userData.crackMap = cracks; return source;
    });
    await statue.loadDetail();
    const body = statue.group.getObjectByName("milestones-static-walk-white") as Mesh;
    expect((body.material as import("three").MeshStandardMaterial).normalMap).toBe(texture);
    statue.dispose(); statue.dispose(); expect(dispose).toHaveBeenCalledOnce();
    expect(disposeCracks).toHaveBeenCalledOnce();
  });
  it("disposes a late asset after its zone has already been removed", async () => {
    let resolve!: (geometry: BufferGeometry) => void;
    const statue = createMilestonesStatue(milestoneCertificates(), () => new Promise(done => { resolve = done; }));
    const pending = statue.loadDetail(); statue.dispose();
    const source = await baked(), dispose = vi.spyOn(source, "dispose");
    const normal = new Texture(), disposeNormal = vi.spyOn(normal, "dispose"); source.userData.normalMap = normal;
    const cracks = new Texture(), disposeCracks = vi.spyOn(cracks, "dispose"); source.userData.crackMap = cracks;
    resolve(source); await pending;
    expect(dispose).toHaveBeenCalledOnce(); expect(statue.group.children).toHaveLength(0);
    expect(disposeNormal).toHaveBeenCalledOnce();
    expect(disposeCracks).toHaveBeenCalledOnce();
  });
});
