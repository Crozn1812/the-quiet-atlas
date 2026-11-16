import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Box3, BoxGeometry, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, ShaderLib, Vector3, type WebGLRenderer } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { describe, expect, it } from "vitest";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { setBakedPropQuality } from "../../../src/features/world/props/batched";
import { bindSetpieces, retainOutside, type SetpieceAsset } from "../../../src/features/world/zones/setpiece-hr";
import { createHrFire } from "../../../src/features/world/zones/workshop-fire";
import { weatherVehicleMaterial } from "../../../src/features/world/vehicle/hr-runtime";

const playable = { getAttribute: (name: string) => ({ "data-world-build": "done", "data-world-intro": "done", "data-world-paused": "false" })[name] ?? null };
const renderer = { domElement: { closest: () => playable } } as unknown as WebGLRenderer;
const draw = (mesh: Mesh) => mesh.onBeforeRender(renderer, null!, null!, mesh.geometry, mesh.material as MeshStandardMaterial, null!);

function batch() {
  const kept = new BoxGeometry(1, 1, 1).toNonIndexed(), hero = new BoxGeometry(1, 1, 1).toNonIndexed().translate(5, 0, 0);
  const merged = mergeGeometries([kept, hero])!;
  kept.dispose(); hero.dispose();
  return merged;
}

describe("HR-FIX-SETPIECE runtime", () => {
  it("removes only the triangles inside the replaced volume and keeps the source bounds", () => {
    const source = batch(), before = source.getAttribute("position").array.slice();
    const retained = retainOutside(source, [new Box3().setFromCenterAndSize(new Vector3(5, 0, 0), new Vector3(1.2, 1.2, 1.2))]);
    expect(retained.getAttribute("position").count).toBe(36);
    expect(Math.max(...Array.from(retained.getAttribute("position").array).filter((_, i) => i % 3 === 0))).toBeLessThan(1);
    expect(Object.keys(retained.attributes).sort()).toEqual(Object.keys(source.attributes).sort());
    expect(retained.boundingSphere!.radius).toBeCloseTo(source.boundingSphere!.radius, 6);
    const empty = retainOutside(source);
    expect(empty.getAttribute("position")).toBeUndefined();
    expect(empty.boundingSphere!.radius).toBeGreaterThan(0);
    expect(source.getAttribute("position").array).toEqual(before);
    source.dispose(); retained.dispose(); empty.dispose();
  });

  it("shows the authored model on a playable hardware frame, returns to the solid on Low and restores on release", async () => {
    const geometry = batch(), material = new MeshStandardMaterial(), anchor = new Mesh(geometry, material), parent = new Group();
    parent.add(anchor);
    let disposed = 0;
    const toggles: boolean[] = [];
    const asset: SetpieceAsset = { piece: name => { const group = new Group(); group.name = name; return group; }, dispose: () => { disposed++; } };
    const release = bindSetpieces(anchor, {
      file: "horizon", load: async () => asset, onToggle: active => { toggles.push(active); },
      hide: [{ mesh: anchor, boxes: [new Box3().setFromCenterAndSize(new Vector3(5, 0, 0), new Vector3(1.2, 1.2, 1.2))] }],
      place(loaded, add) { add(loaded.piece("viewer")); },
    });
    setBakedPropQuality(parent, "Low");
    draw(anchor); await Promise.resolve();
    expect(anchor.geometry).toBe(geometry);
    expect(parent.children).toHaveLength(1); // Low never requests the file
    setBakedPropQuality(parent, "High");
    draw(anchor); await new Promise(resolve => setTimeout(resolve, 0)); draw(anchor);
    const model = parent.getObjectByName("viewer")!;
    expect(model.visible).toBe(true);
    expect(anchor.geometry).not.toBe(geometry);
    expect(anchor.geometry.getAttribute("position").count).toBe(36);
    setBakedPropQuality(parent, "Low"); draw(anchor);
    expect(anchor.geometry).toBe(geometry);
    expect(model.visible).toBe(false);
    setBakedPropQuality(parent, "Balanced"); draw(anchor);
    expect(model.visible).toBe(true);
    release(); release();
    expect(anchor.geometry).toBe(geometry);
    expect(parent.children).toEqual([anchor]);
    expect(toggles).toEqual([true, false, true, false]);
    expect(disposed).toBe(1);
    geometry.dispose(); material.dispose();
  });

  it("draws every workshop fire in three shader draws and releases them", () => {
    const fire = createHrFire([{ position: new Vector3(0, 1, 0), width: 0.5, height: 1.2 }, { position: new Vector3(2, 3, 0), width: 0.25, height: 0.6 }]);
    expect(fire.group.children.map(child => child.name)).toEqual(["workshop-fire-smoke", "workshop-fire-flames", "workshop-fire-sparks"]);
    fire.setTime(3.5);
    const flames = fire.group.children[1] as Mesh;
    expect((flames.material as unknown as { uniforms: { time: { value: number } } }).uniforms.time.value).toBe(3.5);
    expect((flames.geometry as unknown as { instanceCount: number }).instanceCount).toBe(10);
    const parent = new Group(); parent.add(fire.group);
    fire.dispose(); fire.dispose();
    expect(parent.children).toHaveLength(0);
  });

  it("gives vehicle metals a full reflection and enamel a dusty clearcoat using only existing shader chunks", () => {
    const enamel = new MeshPhysicalMaterial({ clearcoat: 0.6 }), shader = { vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
    weatherVehicleMaterial(enamel); weatherVehicleMaterial(enamel);
    expect(enamel.clearcoat).toBe(1);
    enamel.onBeforeCompile(shader as never, null!);
    expect(shader.vertexShader).toContain("vHrDust = vec4(position, normal.y)");
    for (const patch of ["float hrDust = 0.0;", "roughnessFactor = mix(roughnessFactor", "material.clearcoat *= 1.0 - hrDust", "reflectedLight.indirectSpecular *= 1.0 + 3.2 * metalnessFactor"]) {
      expect(shader.fragmentShader.split(patch)).toHaveLength(2);
    }
    expect(enamel.customProgramCacheKey()).toContain("hr-vehicle-weathered-v1");
    enamel.dispose();
  });
});

describe("HR-FIX-SETPIECE assets", () => {
  it("ships five licensed meshopt models with shared KTX2 maps of at most 1024 px and exact hashes", async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
    const manifest = JSON.parse(await readFile("public/world/lib/manifest.json", "utf8"));
    const licenses = (await readFile("assets/LICENSES.csv", "utf8")).split("\n");
    // HR-SETPIECE-B adds the shelter and mirror models; they have their own test.
    const entries = manifest.assets.filter((asset: { id: string }) => /^hr-setpiece-(horizon|last-postcard|quiet-shore|signpost|workshop)$/.test(asset.id));
    expect(entries.map((entry: { id: string }) => entry.id).sort()).toEqual(
      ["horizon", "last-postcard", "quiet-shore", "signpost", "workshop"].map(name => `hr-setpiece-${name}`));
    const pieces = entries.flatMap((entry: { pieces: { name: string }[] }) => entry.pieces.map(piece => piece.name)).sort();
    expect(pieces).toEqual(["bench", "brazier", "guitar", "lamp", "mailbox", "piano", "rack", "rotor", "signpost", "stool", "torch", "turbine", "viewer", "waymark"]);
    for (const entry of entries) {
      expect(entry.license).toBe("CC0-1.0"); expect(entry.delivery).toBe("deferred-after-play");
      const lod = entry.lods[0], file = `public${lod.path}`, bytes = await readFile(file);
      expect(bytes.length).toBe(lod.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(lod.sha256);
      expect(licenses.filter(row => row.startsWith(`${file},`))).toHaveLength(1);
      const document = await io.read(file);
      expect(document.getRoot().listExtensionsRequired().map(extension => extension.extensionName)).toContain("EXT_meshopt_compression");
      const names = document.getRoot().listNodes().filter(node => node.getMesh()).map(node => node.getName());
      for (const piece of entry.pieces) expect(names.some(name => name.startsWith(`${piece.name}-`))).toBe(true);
      for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
        expect(Array.from(primitive.getAttribute("POSITION")!.getArray()!).every(Number.isFinite)).toBe(true);
        expect(primitive.getAttribute("TEXCOORD_0")).toBeTruthy();
      }
      for (const texture of lod.sharedTextures) {
        const data = await readFile(`public${texture.path}`), view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        expect(Math.max(view.getUint32(20, true), view.getUint32(24, true))).toBeLessThanOrEqual(1024);
        expect(createHash("sha256").update(data).digest("hex")).toBe(texture.sha256);
        expect(licenses.filter(row => row.startsWith(`public${texture.path},`))).toHaveLength(1);
      }
    }
  }, 20000);
});
