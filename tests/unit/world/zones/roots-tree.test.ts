import { readFile } from "node:fs/promises";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { setBakedPropQuality } from "../../../../src/features/world/props/batched";
import { createRootsTree, type RootsTreeAsset, type RootsTreeLoader } from "../../../../src/features/world/zones/roots-tree";

function setup(load: RootsTreeLoader) {
  const scene = new Scene(), geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  const fallback = new Mesh(geometry, material), trigger = new Mesh(geometry, material);
  scene.add(fallback, trigger);
  const before = vi.fn(), after = vi.fn(); trigger.onBeforeRender = before; trigger.onAfterRender = after;
  const tree = createRootsTree(fallback, trigger, { side: 1, x: 6.4, y: 0, z: 0, heightAt: () => 0 }, load);
  scene.add(tree.group);
  let playable = false;
  const renderer = { domElement: { closest: () => ({ getAttribute: () => playable ? "done" : "building" }) } } as unknown as WebGLRenderer;
  const camera = new PerspectiveCamera();
  const frame = (distance = 15) => {
    camera.position.set(6.4, 0, distance);
    trigger.onBeforeRender(renderer, scene, camera, geometry, material, sGroup);
    trigger.onAfterRender(renderer, scene, camera, geometry, material, sGroup);
  };
  const sGroup = new Group();
  return { scene, tree, fallback, trigger, before, after, frame, play: () => { playable = true; }, dispose() { tree.dispose(); geometry.dispose(); material.dispose(); } };
}
function asset(): RootsTreeAsset {
  const group = new Group(), geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  group.add(new Mesh(geometry, material));
  return { group, dispose: vi.fn(() => { geometry.dispose(); material.dispose(); }) };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

describe("Roots banyan streaming lifecycle", () => {
  it("keeps Low and pre-play frames free of tree requests and preserves render hooks", async () => {
    const load = vi.fn<RootsTreeLoader>(async () => asset()), s = setup(load);
    s.frame(); expect(load).not.toHaveBeenCalled();
    s.play(); setBakedPropQuality(s.scene, "Low"); s.frame();
    expect(load).not.toHaveBeenCalled(); expect(s.fallback.visible).toBe(true);
    setBakedPropQuality(s.scene, "High"); s.frame(); await settle();
    expect(load).toHaveBeenCalledTimes(1); expect(load.mock.calls[0]![1]).toBe(0);
    expect(s.fallback.visible).toBe(false); expect(s.before).toHaveBeenCalledTimes(3); expect(s.after).toHaveBeenCalledTimes(3);
    s.dispose(); expect(s.trigger.onBeforeRender).toBe(s.before); expect(s.trigger.onAfterRender).toBe(s.after);
  });

  it("selects LODs with hysteresis, deduplicates requests and restores Low immediately", async () => {
    const a = asset(), b = asset();
    const load = vi.fn<RootsTreeLoader>(async (_gpu, level) => level === 0 ? a : b), s = setup(load);
    s.play(); s.frame(20); s.frame(20); await settle();
    s.frame(29); await settle(); expect(load).toHaveBeenCalledTimes(1);
    s.frame(35); await settle(); expect(load.mock.calls.map(c => c[1])).toEqual([0, 1]);
    expect(a.group.visible).toBe(false); expect(b.group.visible).toBe(true);
    s.frame(28); expect(b.group.visible).toBe(true);
    s.frame(22); expect(a.group.visible).toBe(true);
    setBakedPropQuality(s.scene, "Low"); expect(s.fallback.visible).toBe(true);
    expect(a.group.visible || b.group.visible).toBe(false);
    setBakedPropQuality(s.scene, "Balanced"); s.frame(10); expect(b.group.visible).toBe(true);
    s.dispose(); s.dispose(); expect(a.dispose).toHaveBeenCalledTimes(1); expect(b.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes late assets without resurrecting an abandoned zone", async () => {
    let resolve!: (asset: RootsTreeAsset) => void;
    const load = vi.fn<RootsTreeLoader>(() => new Promise(done => { resolve = done; })), s = setup(load);
    s.play(); s.frame(); s.dispose(); const late = asset(); resolve(late); await settle();
    expect(late.dispose).toHaveBeenCalledTimes(1); expect(s.tree.group.children).toHaveLength(0);
    expect(s.fallback.visible).toBe(true);
  });

  it("keeps the complete fallback on failure without retrying on every frame", async () => {
    const load = vi.fn<RootsTreeLoader>(async () => { throw Error("offline"); }), s = setup(load);
    s.play(); s.frame(); await settle(); for (let i = 0; i < 10; i++) s.frame();
    expect(load).toHaveBeenCalledTimes(1); expect(s.fallback.visible).toBe(true); s.dispose();
  });

  it("masks legacy root vertices while preserving the sign through material replacements", async () => {
    const s = setup(async () => asset());
    s.trigger.material.onBeforeCompile = shader => { shader.vertexShader = "attribute vec3 signGrain;\n" + shader.vertexShader; };
    s.play(); s.frame(); await settle();
    const compile = () => {
      const shader = { uniforms: {}, vertexShader: "#include <begin_vertex>", fragmentShader: "#include <clipping_planes_fragment>" } as unknown as Parameters<MeshBasicMaterial["onBeforeCompile"]>[0];
      s.trigger.material.onBeforeCompile(shader, {} as WebGLRenderer);
      expect(shader.vertexShader).toContain("vRootsTreeKeep = signGrain.z;");
      expect(shader.fragmentShader).toContain("rootsTreeDetail > 0.5 && vRootsTreeKeep < 0.5");
      expect(shader.uniforms.rootsTreeDetail!.value).toBe(1);
      expect(shader.fragmentShader.match(/uniform float rootsTreeDetail;/g)).toHaveLength(1);
      expect(shader.vertexShader.match(/varying float vRootsTreeKeep;/g)).toHaveLength(1);
    };
    compile();
    const original = s.trigger.material, replacement = original.clone();
    // The photo Low adapter retains the vertex hook and resets the fragment.
    replacement.onBeforeCompile = (shader, gpu) => {
      const fragment = shader.fragmentShader; original.onBeforeCompile(shader, gpu); shader.fragmentShader = fragment;
    };
    s.trigger.material = replacement;
    s.frame(); compile(); setBakedPropQuality(s.scene, "Low");
    expect(s.fallback.visible).toBe(true); s.dispose(); replacement.dispose();
  });

  it("bakes quantized node transforms once, and keeps decorative meshes out of interaction rays", async () => {
    const a = asset(); const wrapper = new Group(); wrapper.position.set(0, 4, 0); wrapper.scale.setScalar(2);
    wrapper.add(a.group.children[0]!); a.group.add(wrapper);
    const mesh = wrapper.children[0] as Mesh, s = setup(async () => a);
    s.play(); s.frame(); await settle();
    expect(mesh.parent).toBe(a.group); expect(mesh.position.toArray()).toEqual([0, 0, 0]);
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox!.getCenter(new Vector3()).y).toBeCloseTo(4);
    expect(mesh.geometry.boundingBox!.getSize(new Vector3()).y).toBeCloseTo(2);
    const hits: never[] = []; mesh.raycast({} as never, hits); expect(hits).toEqual([]); s.dispose();
  });
});

describe("Roots delivery artifacts", () => {
  it("ships distinct meshopt LODs, shared HR KTX2 maps and licensed baked AO", async () => {
    const manifest = JSON.parse(await readFile("public/world/roots/roots-tree.json", "utf8"));
    const licenses = await readFile("assets/LICENSES.csv", "utf8");
    expect(manifest.assets[1].triangles).toBeLessThan(manifest.assets[0].triangles * .5);
    for (const entry of manifest.assets) {
      const file = `public/world/roots/${entry.file}`, bytes = await readFile(file);
      expect(bytes.length).toBe(entry.bytes);
      const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      expect(json.extensionsRequired).toContain("EXT_meshopt_compression");
      expect(json.extensionsRequired).toContain("KHR_texture_basisu");
      expect(json.meshes[0].primitives).toHaveLength(3);
      expect(json.materials.find((m: { name: string }) => m.name === "roots-tree-bark").normalTexture).toBeDefined();
      for (const primitive of json.meshes[0].primitives) expect(primitive.attributes.COLOR_0).toBeDefined();
      for (const image of json.images) {
        expect(image.uri).toMatch(/^\.\.\/lib\/hr-shared-[a-f0-9]+\.ktx2$/);
        expect((await readFile(`public/world/roots/${image.uri}`)).length).toBeGreaterThan(0);
      }
      expect(licenses.split("\n").filter(line => line.startsWith(file + ","))).toHaveLength(1);
      expect(entry.ao).toMatch(/baked vertex occlusion/);
    }
  });
});
