import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { expect, it } from "vitest";
import { CASUARINA_IDS, coastalTreeAt } from "../../../src/features/world/foliage/hr-coastal";
import { coastalWindbreakSites, isFoliageExcluded, MIN_TREE_DISTANCE, scatterTile } from "../../../src/features/world/foliage/scatter";
import { nearestPath } from "../../../src/features/world/terrain/samples";
import { TILE_SIZE } from "../../../src/features/world/terrain/tiles";

it("delivers three distinct metre-scale Casuarinas with decoded mesh LODs and four-view impostors", async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const manifest = JSON.parse(await readFile("public/world/lib/manifest.json", "utf8"));
  const licenses = (await readFile("assets/LICENSES.csv", "utf8")).split("\n");
  const entries = manifest.assets.filter((e: { architecture: string }) => e.architecture === "casuarina");
  expect(entries.map((e: { id: string }) => e.id)).toEqual(CASUARINA_IDS);
  const hashes = new Set();
  for (const entry of entries) {
    expect(entry.species).toBe("Casuarina equisetifolia");
    expect(entry.delivery).toBe("deferred-after-play"); expect(entry.license).toBe("CC0-1.0");
    expect(entry.heightMeters).toBeGreaterThanOrEqual(8); expect(entry.heightMeters).toBeLessThanOrEqual(15);
    expect(entry.bounds.min[1]).toBeGreaterThan(-0.02); expect(entry.bounds.min[1]).toBeLessThanOrEqual(0.02);
    expect(entry.bounds.max[1]).toBeCloseTo(entry.heightMeters, 1);
    expect(entry.lods[1].triangles).toBeLessThan(entry.lods[0].triangles);
    expect(entry.impostor.triangles).toBe(2); expect(entry.impostor.views).toBe(4);
    expect(entry.impostor.tileBorderOpaquePixels).toBe(0);
    for (const pixels of entry.impostor.tileOpaquePixels) {
      expect(pixels).toBeGreaterThan(1000); expect(pixels / 1024 ** 2).toBeLessThan(0.4);
    }
    for (const lod of [...entry.lods, entry.impostor]) {
      const path = `public${lod.path}`, bytes = await readFile(path);
      expect(bytes.length).toBe(lod.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(lod.sha256);
      expect(hashes.has(lod.sha256)).toBe(false); hashes.add(lod.sha256);
      expect(licenses.filter(row => row.startsWith(`${path},`))).toHaveLength(1);
      const document = await io.read(path), root = document.getRoot();
      const required = root.listExtensionsRequired().map(ext => ext.extensionName);
      expect(required).toContain("EXT_meshopt_compression"); expect(required).toContain("KHR_texture_basisu");
      const parts = root.listMeshes().flatMap(mesh => mesh.listPrimitives());
      expect(parts).toHaveLength(lod === entry.impostor ? 1 : 2);
      expect(parts.reduce((s, p) => s + p.getIndices()!.getCount() / 3, 0)).toBe(lod.triangles);
      for (const part of parts) {
        expect(Array.from(part.getAttribute("POSITION")!.getArray()!).every(Number.isFinite)).toBe(true);
        if (lod !== entry.impostor && !part.getMaterial()!.getName().includes("cutout")) {
          expect(part.getMaterial()!.getNormalTexture()).not.toBeNull();
          // Missing wood colors during Blender joins used to blacken bark.
          const colors = part.getAttribute("COLOR_0");
          if (colors) expect(Array.from(colors.getArray()!).every(c => c > 0.9)).toBe(true);
        }
      }
      for (const texture of root.listTextures()) {
        expect(texture.getMimeType()).toBe("image/ktx2");
        const data = texture.getImage()!, view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        expect(view.getUint32(20, true)).toBe(2048); expect(view.getUint32(24, true)).toBe(2048);
      }
      for (const texture of lod.sharedTextures ?? []) {
        const file = `public${texture.path}`, data = await readFile(file);
        expect(createHash("sha256").update(data).digest("hex")).toBe(texture.sha256);
        expect(licenses.filter(row => row.startsWith(`${file},`))).toHaveLength(1);
      }
    }
  }
});

it("plants irregular dry-bank windbreaks with minority acacias and stable tile ownership", () => {
  const belt = coastalWindbreakSites();
  expect(belt.length).toBeGreaterThan(15);
  const gaps = new Set(), ids = new Set(belt.map(s => coastalTreeAt(s.x, s.z)));
  expect(ids).toEqual(new Set([...CASUARINA_IDS, "hr-coast-acacia"]));
  for (const [i, site] of belt.entries()) {
    expect(isFoliageExcluded(site.x, site.z)).toBe(false);
    expect(nearestPath(site.x, site.z).t).toBeGreaterThan(0.82);
    expect(site.y).toBeGreaterThanOrEqual(0.8);
    for (const other of belt.slice(i + 1)) expect(Math.hypot(site.x - other.x, site.z - other.z)).toBeGreaterThanOrEqual(MIN_TREE_DISTANCE);
    if (i) gaps.add(Math.round(Math.hypot(site.x - belt[i-1]!.x, site.z - belt[i-1]!.z) * 10));
    const ix = Math.floor(site.x / TILE_SIZE), iz = Math.floor(site.z / TILE_SIZE);
    const tile = scatterTile({ ix, iz });
    expect(tile.filter(t => t.x === site.x && t.z === site.z)).toHaveLength(1);
    for (const other of tile) if (other.x !== site.x || other.z !== site.z) expect(Math.hypot(site.x - other.x, site.z - other.z)).toBeGreaterThanOrEqual(MIN_TREE_DISTANCE);
  }
  expect(gaps.size).toBeGreaterThan(10);
  expect(belt.filter(s => coastalTreeAt(s.x, s.z) === "hr-coast-acacia").length / belt.length).toBeLessThan(0.25);
});
