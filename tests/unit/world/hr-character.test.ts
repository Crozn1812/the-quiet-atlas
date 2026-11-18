import { readFileSync } from "node:fs";
import { AdditiveBlending, MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";
import { HR_CHARACTER_URLS, tuneHrMaterial } from "../../../src/features/world/character/hr-appearance";

type Gltf = {
  nodes: { name: string }[];
  skins: { joints: number[]; inverseBindMatrices: number }[];
  meshes: { weights?: number[]; primitives: { attributes: Record<string, number>; material: number; targets?: Record<string, number>[] }[] }[];
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
    // HR-FACELESS (Duy, 2026-11-18): blank face, so no eye, cornea, brow, lash, frame or lens surfaces.
    expect(names).toEqual(["canvas", "cloth", "hair_cap", "hair_card", "rubber", "skin", "sock", "tote"]);
    // Every primitive must be mergeable into one grouped geometry for the in-place swap.
    for (const primitive of gltf.meshes.flatMap(mesh => mesh.primitives)) {
      expect(Object.keys(primitive.attributes).sort()).toEqual(["JOINTS_0", "NORMAL", "POSITION", "TEXCOORD_0", "WEIGHTS_0"]);
      expect(primitive.targets).toHaveLength(1);
      expect(gltf.accessors[primitive.targets![0]!.POSITION!]!.count).toBe(gltf.accessors[primitive.attributes.POSITION!]!.count);
      expect(primitive.targets![0]).toHaveProperty("NORMAL");
    }
    expect(gltf.materials.find(material => material.name === "hair_card")!.alphaMode).toBe("MASK");
    expect(gltf.materials.find(material => material.name === "hair_cap")!.alphaMode).toBe("MASK");
    expect(gltf.meshes[0]!.weights).toEqual([0]);
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
    expect(hair).toBeInstanceOf(MeshPhysicalMaterial);
    expect((hair as MeshPhysicalMaterial).defines).toHaveProperty("PHYSICAL");
    expect(hair.alphaToCoverage).toBe(false);
    expect(hair.alphaHash).toBe(false);
    expect(hair.alphaTest).toBeGreaterThan(.3);
    expect((hair as MeshPhysicalMaterial).anisotropy).toBeGreaterThan(.5);
    expect((hair as MeshPhysicalMaterial).anisotropyRotation).toBe(Math.PI / 2);
    expect((hair as MeshStandardMaterial).transparent).toBe(false);
    expect((hair as MeshStandardMaterial).depthWrite).toBe(true);
    const unaliased = tuneHrMaterial(Object.assign(new MeshStandardMaterial(), { name: "hair_card" }), false);
    expect(unaliased.alphaToCoverage).toBe(false);
    expect(unaliased.alphaHash).toBe(false);
    expect(unaliased.alphaTest).toBeGreaterThan(.3);
    expect(unaliased.depthWrite).toBe(true);
  });
});
