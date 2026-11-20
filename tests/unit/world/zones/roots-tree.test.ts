import { readFile } from "node:fs/promises";
import { BoxGeometry, CylinderGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { setBakedPropQuality } from "../../../../src/features/world/props/batched";
import { createRootsTree, rootsCanopyGroundBounds, rootsOakClearance, rootsSoilCollar, type RootsTreeAsset, type RootsTreeLoader } from "../../../../src/features/world/zones/roots-tree";

function setup(load: RootsTreeLoader, blocked?: (x: number, z: number) => boolean) {
  const scene = new Scene(), geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  const fallback = new Mesh(geometry, material), trigger = new Mesh(geometry, material);
  scene.add(fallback, trigger);
  const before = vi.fn(), after = vi.fn(); trigger.onBeforeRender = before; trigger.onAfterRender = after;
  const tree = createRootsTree(fallback, trigger, { side: 1, x: 6.4, y: 0, z: 0, heightAt: () => 0, blocked }, load);
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

describe("Roots live oak streaming lifecycle", () => {
  it("keeps moss on upward faces after terrain and clearance placement", async () => {
    const a = asset(), mesh = a.group.children[0] as Mesh;
    (mesh.material as MeshBasicMaterial).name = "roots-tree-moss";
    const s = setup(async () => a);
    s.play(); s.frame(); await settle();
    const p = mesh.geometry.getAttribute("position"), indices = mesh.geometry.index!;
    expect(indices.count).toBe(6);
    for (let i = 0; i < indices.count; i += 3) {
      const origin = new Vector3().fromBufferAttribute(p, indices.getX(i));
      const b = new Vector3().fromBufferAttribute(p, indices.getX(i + 1)).sub(origin);
      const c = new Vector3().fromBufferAttribute(p, indices.getX(i + 2)).sub(origin);
      expect(b.cross(c).normalize().y).toBeGreaterThan(.45);
    }
    s.dispose();
  });
  it("moves an anchored section rigidly so limbs and fern cards cannot become flat walls", async () => {
    const a = asset(), mesh = a.group.children[0] as Mesh;
    mesh.geometry.translate(-5, 3, 10);
    const centers: number[] = [];
    for (let i = 0; i < mesh.geometry.getAttribute("position").count; i++) centers.push(-5, 3, 10);
    mesh.geometry.setAttribute("_roots_center", new Float32BufferAttribute(centers, 3));
    const s = setup(async () => a, () => true);
    s.play(); s.frame(); await settle();
    expect(mesh.geometry.boundingBox!.getSize(new Vector3()).toArray()).toEqual([1, 1, 1]);
    expect(mesh.geometry.boundingBox!.getCenter(new Vector3()).y).toBeGreaterThan(6);
    expect(mesh.geometry.hasAttribute("_roots_center")).toBe(false);
    s.dispose();
  });
  it("lifts low limbs smoothly across a road while preserving bark/moss separation", () => {
    const lift = rootsOakClearance(x => Math.abs(x) <= 3.2);
    let previous = lift(-9, 0, .2, 0);
    for (let x = -8.95; x <= 9; x += .05) {
      const y = lift(x, 0, .2, 0);
      expect(Math.abs(y - previous)).toBeLessThan(.25);
      expect(lift(x, 0, .222, 0)).toBeGreaterThan(y);
      if (Math.abs(x) <= 2.6) expect(y).toBeGreaterThan(3.15);
      expect(lift(x, 0, 12, 0)).toBe(12);
      previous = y;
    }
    // A branch in front of the fixed board must pass above its top edge.
    expect(lift(4.5, -11, .2, 0)).toBeGreaterThan(5.6);
    const planted = rootsOakClearance(x => Math.abs(x) <= 3.2, { x: 7.2864, z: 0 });
    expect(planted(4.6, 0, .2, 0)).toBe(.2);
  });
  it("keeps bark and moss continuous beside a narrow wet pocket between metre samples", () => {
    const lift = rootsOakClearance((x, z) => x > .18 && x < .8 && z > .18 && z < .8);
    let previous = lift(-4, .5, .2, 0);
    for (let x = -3.95; x < 4; x += .05) {
      const y = lift(x, .5, .2, 0);
      expect(Math.abs(y - previous)).toBeLessThan(.25);
      expect(lift(x, .5, .222, 0) - y).toBeGreaterThan(0);
      previous = y;
    }
  });
  it.each([1, -1])("provides a world-space canopy exclusion before the idle mesh exists on side %s", side => {
    const group = new Group(); group.position.set(30, 5, -110); group.rotation.y = .7;
    const bounds = rootsCanopyGroundBounds(group, new Vector3(side * 4.7, 1.15, 0));
    // Include the authored asset extremes and the complete collar after zone rotation.
    for (const local of [[-19.11, 0, 0], [21, 0, 0], [.8, 0, -17.72], [.8, 0, 20.42]]) {
      const point = group.localToWorld(new Vector3(side * (6.4864 + local[0]!), local[1]!, side * local[2]!));
      expect(bounds.containsPoint(point)).toBe(true);
    }
    expect(group.children).toHaveLength(0);
  });
  it.each([1, -1])("seats the rounded collar in sloping soil with outward normals on side %s", side => {
    const heightAt = (x: number, z: number) => x * 0.12 + z * 0.07;
    const collar = rootsSoilCollar({ side, x: 6.4, y: 1, z: 2, heightAt });
    const p = collar.getAttribute("position"), n = collar.getAttribute("normal");
    expect(Array.from(n.array).every(Number.isFinite)).toBe(true);
    for (let i = 0; i < p.count; i++) expect(n.getY(i)).toBeGreaterThan(0);
    for (let i = p.count - 97; i < p.count; i++) expect(p.getY(i)).toBeCloseTo(heightAt(p.getX(i), p.getZ(i)) - 0.06);
    collar.dispose();
  });
  it("buries open root rims below soil and preserves the upper trunk while retilling bark UVs", async () => {
    const group = new Group(), geometry = new CylinderGeometry(0.6, 1, 2, 24, 8, true).translate(0, 1, 0);
    const material = new MeshBasicMaterial(); material.name = "roots-tree-bark";
    const mesh = new Mesh(geometry, material); group.add(mesh);
    const uv = geometry.getAttribute("uv"), before = Array.from(uv.array);
    const s = setup(async () => ({ group, dispose() { geometry.dispose(); material.dispose(); } }));
    s.play(); s.frame(); await settle();
    expect(geometry.boundingBox!.min.y).toBeCloseTo(-0.48);
    expect(geometry.boundingBox!.max.y).toBeCloseTo(2);
    const tiled = geometry.getAttribute("uv");
    for (let i = 0; i < tiled.count; i++) {
      expect(tiled.getX(i)).toBeCloseTo(before[i * 2]! * 2);
      expect(tiled.getY(i)).toBeCloseTo(before[i * 2 + 1]! * 2.2);
    }
    expect(Array.from(geometry.getAttribute("normal").array).every(Number.isFinite)).toBe(true);
    s.dispose();
  });
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
    setBakedPropQuality(s.scene, "High"); s.frame(10); expect(a.group.visible).toBe(true);
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
    expect(manifest.primaryLimbs).toBe(8);
    expect(manifest.aerialRoots).toBe(0);
    expect(manifest.assets[1].triangles).toBeLessThan(manifest.assets[0].triangles * .5);
    for (const entry of manifest.assets) {
      const file = `public/world/roots/${entry.file}`, bytes = await readFile(file);
      expect(bytes.length).toBe(entry.bytes);
      expect(bytes.length).toBeLessThanOrEqual(entry.level === 0 ? 6000000 : 1500000);
      expect(entry.drawCalls).toBe(3);
      const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      expect(json.extensionsRequired).toContain("EXT_meshopt_compression");
      expect(json.extensionsRequired).toContain("KHR_texture_basisu");
      expect(json.meshes[0].primitives).toHaveLength(3);
      const bark = json.materials.find((m: { name: string }) => m.name === "roots-tree-bark");
      expect(bark.normalTexture).toBeDefined();
      expect(bark.pbrMetallicRoughness.metallicRoughnessTexture).toBeDefined();
      for (const primitive of json.meshes[0].primitives) {
        expect(primitive.attributes.COLOR_0).toBeDefined();
        expect(primitive.attributes._ROOTS_CENTER).toBeDefined();
      }
      for (const image of json.images) {
        expect(image.uri).toMatch(/^\.\.\/lib\/hr-(shared|prop-atlas)-[a-f0-9]+\.ktx2$/);
        expect((await readFile(`public/world/roots/${image.uri}`)).length).toBeGreaterThan(0);
      }
      expect(licenses.split("\n").filter(line => line.startsWith(file + ","))).toHaveLength(1);
      expect(entry.ao).toMatch(/baked vertex occlusion/);
    }
  });
});
