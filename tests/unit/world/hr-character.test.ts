import { readFileSync } from "node:fs";
import { AdditiveBlending, MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";
import { HR_CHARACTER_URLS, tuneHrMaterial } from "../../../src/features/world/character/hr-appearance";

type Gltf = {
  nodes: { name: string }[];
  skins: { joints: number[]; inverseBindMatrices: number }[];
  meshes: { primitives: { attributes: Record<string, number>; material: number }[] }[];
  materials: { name: string; alphaMode?: string }[];
  extensionsUsed?: string[];
  accessors: { bufferView: number; byteOffset?: number; count: number }[];
};

function json(path: string): Gltf {
  const buffer = readFileSync(path);
  return JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString()) as Gltf;
}
const jointNames = (gltf: Gltf) => gltf.skins[0]!.joints.map(index => gltf.nodes[index]!.name);
const reference = json("public/world/start/character-duy.glb");

describe("HR-CHAR photoreal close-up skin", () => {
  it.each(Object.values(HR_CHARACTER_URLS))("%s keeps the shipped 19-joint rig and runtime contract", url => {
    const gltf = json(`public${url}`);
    expect(gltf.skins).toHaveLength(1);
    expect(jointNames(gltf)).toEqual(jointNames(reference));
    expect(gltf.extensionsUsed).toEqual(expect.arrayContaining(["KHR_texture_basisu", "EXT_meshopt_compression"]));
    const names = gltf.materials.map(material => material.name).sort();
    expect(names).toEqual(["brow", "canvas", "cloth", "cornea", "eye", "frame", "hair_cap", "hair_card", "lash", "lens", "rubber", "skin", "sock", "tote"]);
    // Every primitive must be mergeable into one grouped geometry for the in-place swap.
    for (const primitive of gltf.meshes.flatMap(mesh => mesh.primitives)) {
      expect(Object.keys(primitive.attributes).sort()).toEqual(["JOINTS_0", "NORMAL", "POSITION", "TEXCOORD_0", "WEIGHTS_0"]);
    }
    expect(gltf.materials.find(material => material.name === "hair_card")!.alphaMode).toBe("MASK");
  });

  it("tunes cornea/lens to additive reflections and skin to a sheened physical material", () => {
    const cornea = tuneHrMaterial(Object.assign(new MeshStandardMaterial(), { name: "cornea" }), false) as MeshStandardMaterial;
    expect(cornea.blending).toBe(AdditiveBlending);
    expect(cornea.depthWrite).toBe(false);
    expect(cornea.color.getHex()).toBe(0);
    const skin = tuneHrMaterial(Object.assign(new MeshStandardMaterial({ roughness: .4 }), { name: "skin" }), false);
    expect(skin).toBeInstanceOf(MeshPhysicalMaterial);
    expect((skin as MeshPhysicalMaterial).sheen).toBeGreaterThan(0);
    expect((skin as MeshPhysicalMaterial).roughness).toBe(.4);
    const hair = tuneHrMaterial(Object.assign(new MeshStandardMaterial(), { name: "hair_card" }), true);
    expect(hair.alphaToCoverage).toBe(true);
  });
});
