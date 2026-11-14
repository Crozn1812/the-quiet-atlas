import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { HR_PROP_FAMILIES } from "../../../src/features/world/props/hr-props";
import { hrLandscapeSites } from "../../../src/features/world/zones/hr-props-dressing";

it("ships all nineteen CC0 prop architectures with decodable distinct LODs and shared 2K PBR textures", async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const manifest = JSON.parse(await readFile("public/world/lib/manifest.json", "utf8"));
  const entries = manifest.assets.filter((a: { id: string }) => /^hr-(prop|rock|palm)-/.test(a.id));
  const licenses = (await readFile("assets/LICENSES.csv", "utf8")).split("\n");
  expect(entries).toHaveLength(19);
  for (const family of Object.values(HR_PROP_FAMILIES)) for (const id of family) expect(manifest.assets.some((a: { id: string }) => a.id === id)).toBe(true);
  const hashes = new Set<string>(), textures = new Set<string>();
  for (const entry of entries) {
    expect(entry.license).toBe("CC0-1.0"); expect(entry.delivery).toBe("deferred-after-play");
    expect(entry.lods.map((l: { level: number }) => l.level)).toEqual([0, 1]);
    expect(entry.lods[0].triangles).toBeGreaterThan(entry.lods[1].triangles * 2);
    for (const lod of entry.lods) {
      const file = `public${lod.path}`, bytes = await readFile(file), hash = createHash("sha256").update(bytes).digest("hex");
      expect(bytes.byteLength).toBe(lod.bytes); expect(hash).toBe(lod.sha256); expect(hashes.has(hash)).toBe(false); hashes.add(hash);
      expect(licenses.filter(row => row.startsWith(`${file},`))).toHaveLength(1);
      const document = await io.read(file), root = document.getRoot();
      expect(root.listExtensionsRequired().map(e => e.extensionName)).toEqual(expect.arrayContaining(["EXT_meshopt_compression", "KHR_texture_basisu"]));
      let triangles = 0;
      for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
        triangles += primitive.getIndices()!.getCount() / 3;
        expect(Array.from(primitive.getAttribute("POSITION")!.getArray()!).every(Number.isFinite)).toBe(true);
        expect(primitive.getAttribute("NORMAL")).not.toBeNull(); expect(primitive.getAttribute("TEXCOORD_0")).not.toBeNull();
        const material = primitive.getMaterial()!;
        expect(material.getBaseColorTexture()).not.toBeNull(); expect(material.getNormalTexture()).not.toBeNull(); expect(material.getMetallicRoughnessTexture()).not.toBeNull();
      }
      expect(triangles).toBe(lod.triangles);
      for (const texture of root.listTextures()) {
        expect(texture.getMimeType()).toBe("image/ktx2");
        const bytes = texture.getImage()!, view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        expect([view.getUint32(20, true), view.getUint32(24, true)]).toEqual([2048, 2048]);
      }
      for (const texture of lod.sharedTextures) {
        textures.add(texture.path);
        const bytes = await readFile(`public${texture.path}`);
        expect(bytes.byteLength).toBe(texture.bytes); expect(createHash("sha256").update(bytes).digest("hex")).toBe(texture.sha256);
        expect(licenses.filter(row => row.startsWith(`public${texture.path},`))).toHaveLength(1);
      }
    }
  }
  expect(textures.size).toBe(3);
}, 15000);

it("keeps High landscape crowns outside paths, water, signs and solid envelopes", () => {
  const context = { seed: 1, heightAt: () => 0, onPath: (x: number) => Math.abs(x) < 2.6, underWater: () => false };
  expect(hrLandscapeSites(context, "hill", [])).toHaveLength(4);
  expect(hrLandscapeSites(context, "palm", [])).toHaveLength(3);
  expect(hrLandscapeSites({ ...context, onPath: () => true }, "palm", [])).toEqual([]);
  expect(hrLandscapeSites({ ...context, underWater: () => true }, "hill", [])).toEqual([]);
  expect(hrLandscapeSites({ ...context, heightAt: () => NaN }, "hill", [])).toEqual([]);
});
