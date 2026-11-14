import { reportBudget } from "../report-budget";
import { readFileSync } from "node:fs";
import { BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, Vector3, type WebGLRenderer } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";
import { milestoneCertificates } from "../../../../src/features/world/zones/milestones";
import { certificateSlots, cutCertificateSockets } from "../../../../src/features/world/zones/milestones-statue-geometry";
import { createMilestonesStatue } from "../../../../src/features/world/zones/milestones-statue";

async function baked() {
  const buffer = readFileSync("public/world/milestones/character-milestones-walk.glb");
  const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), "");
  expect(gltf.animations).toHaveLength(0);
  let geometry: BufferGeometry | undefined;
  gltf.scene.traverse(node => { if (node instanceof Mesh) { expect(node.type).toBe("Mesh"); geometry = node.geometry; } });
  return geometry!;
}
describe("Milestones frozen walk and certificate glass", () => {
  it("ships the approved 19-bone Walk bake as a small static full-body mesh", async () => {
    const geometry = await baked();
    try {
      expect(geometry.getAttribute("skinIndex")).toBeUndefined();
      geometry.computeBoundingBox();
      expect(geometry.boundingBox!.getSize(new Vector3()).y).toBeCloseTo(5.9, 4);
      expect(geometry.index!.count / 3).toBe(10544);
      reportBudget("tests/unit/world/zones/milestones-statue.test.ts:25 readFileSync(\"public/world/milestones/character-milestones-walk.glb\").length", readFileSync("public/world/milestones/character-milestones-walk.glb").length, 1_500_000);
    } finally { geometry.dispose(); }
  });
  it("cuts real pentagonal holes for every planned certificate and keeps achieved slots solid", async () => {
    const source = await baked(), slots = certificateSlots(milestoneCertificates());
    const geometry = cutCertificateSockets(source, slots), material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(geometry, material); mesh.updateMatrixWorld(true);
    try {
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
  it("defers the asset, uses three draws, freezes transforms and uniforms for reduced motion/far/Low", async () => {
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
    expect(load).toHaveBeenCalledTimes(1); expect(statue.group.children).toHaveLength(3);
    expect(statue.group.userData.ready).toBe(true);
    reportBudget("tests/unit/world/zones/milestones-statue.test.ts:65 statue.group.userData.triangles", statue.group.userData.triangles, 25_000);
    const shader = { uniforms: {}, vertexShader: "", fragmentShader: "" };
    (glass.material as MeshBasicMaterial).onBeforeCompile(shader as never, renderer);
    const time = (shader.uniforms as Record<string, { value: number }>).msTime!;
    const before = statue.group.children.map(node => node.matrix.toArray());
    statue.update(1 / 60, false); expect(time.value).toBeGreaterThan(0);
    const active = time.value;
    statue.update(1 / 60, true); expect(time.value).toBe(active);
    camera.position.set(40, 2, 8); camera.lookAt(40, .38, 0); camera.updateMatrixWorld(true); render();
    statue.update(1 / 60, false); expect(time.value).toBe(active);
    quality = "low"; render(); statue.update(1 / 60, false); expect(time.value).toBe(active);
    expect(statue.group.getObjectByName("milestones-golden-ribbons")!.visible).toBe(false);
    expect(statue.group.children.map(node => node.matrix.toArray())).toEqual(before);
    statue.dispose(); statue.dispose();
  });
  it("disposes a late asset after its zone has already been removed", async () => {
    let resolve!: (geometry: BufferGeometry) => void;
    const statue = createMilestonesStatue(milestoneCertificates(), () => new Promise(done => { resolve = done; }));
    const pending = statue.loadDetail(); statue.dispose();
    const source = await baked(), dispose = vi.spyOn(source, "dispose"); resolve(source); await pending;
    expect(dispose).toHaveBeenCalledOnce(); expect(statue.group.children).toHaveLength(0);
  });
});
