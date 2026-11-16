import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3, type WebGLRenderer } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { describe, expect, it } from "vitest";
import { bindQuietShoreShelter } from "../../../src/features/world/props/hr-structures";
import { bindSetpieces, retainWithout, type SetpieceAsset } from "../../../src/features/world/zones/setpiece-hr";
import { attachHrMirrors, HR_MIRROR_SEATS } from "../../../src/features/world/vehicle/hr-runtime";
import { createHrFire } from "../../../src/features/world/zones/workshop-fire";

const playable = { getAttribute: (name: string) => ({ "data-world-build": "done", "data-world-intro": "done", "data-world-paused": "false" })[name] ?? null };
const renderer = { domElement: { closest: () => playable } } as unknown as WebGLRenderer;
const draw = (mesh: Mesh) => mesh.onBeforeRender(renderer, null!, null!, mesh.geometry, mesh.material as MeshStandardMaterial, null!);
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const pieces = (log: string[]): SetpieceAsset => ({
  piece(name) {
    const group = new Group(); group.name = name; log.push(name);
    const glass = new Mesh(new BoxGeometry(0.1, 0.1, 0.01), new MeshStandardMaterial({ name: "setpiece-mirror-glass" }));
    group.add(glass);
    return group;
  },
  dispose() { log.push("disposed"); },
});
/** Three unit boxes at x = 0, 5, 10: 36 vertices each, in that order. */
function batch() {
  const parts = [0, 5, 10].map(x => new BoxGeometry(1, 1, 1).toNonIndexed().translate(x, 0, 0));
  const merged = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  return merged;
}
const xs = (mesh: Mesh) => [...new Set(Array.from(mesh.geometry.getAttribute("position")?.array ?? []).filter((_, i) => i % 3 === 0).map(x => Math.round(x / 5) * 5))];

describe("HR-SETPIECE-B", () => {
  it("removes recorded vertex ranges as well as volumes, and an unbounded removal empties the draw", () => {
    const source = batch();
    const ranged = retainWithout(source, [{ ranges: [{ start: 36, count: 36 }] }]);
    expect(ranged.getAttribute("position").count).toBe(72);
    const both = retainWithout(source, [{ ranges: [{ start: 36, count: 36 }] }, { boxes: [new Box3().setFromCenterAndSize(new Vector3(10, 0, 0), new Vector3(2, 2, 2))] }]);
    expect(both.getAttribute("position").count).toBe(36);
    expect(retainWithout(source, [{ ranges: [{ start: 0, count: 36 }] }, {}]).getAttribute("position")).toBeUndefined();
    source.dispose(); ranged.dispose(); both.dispose();
  });

  it("lets two bindings replace parts of one batch and restores the original in any release order", async () => {
    const geometry = batch(), material = new MeshStandardMaterial(), mesh = new Mesh(geometry, material), other = new Mesh(new BoxGeometry(), material);
    const zone = new Group(); zone.add(mesh, other);
    const log: string[] = [];
    const furniture = bindSetpieces(mesh, { file: "quiet-shore", load: async () => pieces(log), place: (asset, add) => add(asset.piece("bench")),
      hide: [{ mesh, boxes: [new Box3().setFromCenterAndSize(new Vector3(5, 0, 0), new Vector3(2, 2, 2))] }] });
    const shelter = bindSetpieces(other, { file: "porch", load: async () => pieces(log), place: (asset, add) => add(asset.piece("porch")),
      hide: [{ mesh, ranges: [{ start: 72, count: 36 }] }] });
    draw(mesh); draw(other); await settle(); draw(mesh);
    expect(xs(mesh)).toEqual([0, 10]);
    draw(other);
    expect(xs(mesh)).toEqual([0]);
    furniture(); // the first binding leaves while the second is still showing
    expect(xs(mesh)).toEqual([0, 5]);
    shelter();
    expect(mesh.geometry).toBe(geometry);
    expect(zone.children).toEqual([mesh, other]);
    geometry.dispose(); other.geometry.dispose(); material.dispose();
  });

  it("replaces exactly the shelter's recorded ranges and seats the landing at the old step height on either bank", async () => {
    for (const side of [1, -1]) {
      const zone = new Group(); zone.name = "quiet-shore";
      const material = new MeshStandardMaterial();
      // Wood batch: [kept radio][shelter post][shelter landing 0.3 m below the deck][kept fence].
      const parts = [new BoxGeometry(1, 1, 1).toNonIndexed().translate(side * -9, 0, 0), new BoxGeometry(0.2, 2, 0.2).toNonIndexed().translate(6 * side + side * -1.24, 1, 0),
        new BoxGeometry(0.68, 0.4, 2).toNonIndexed().translate(6 * side + side * -1.76, 0.5, 0), new BoxGeometry(1, 1, 1).toNonIndexed().translate(side * 12, 0, 0)];
      const wood = new Mesh(mergeGeometries(parts)!, material); wood.name = "quiet-shore-wood";
      parts.forEach(part => part.dispose());
      const anchor = new Mesh(new BoxGeometry(), material);
      const porch = new Group(); porch.name = "porch"; porch.position.set(6 * side, 0.75, 2);
      porch.userData.batches = [{ mesh: "quiet-shore-wood", start: 36, count: 72 }, { mesh: "quiet-shore-leaf", start: 0, count: 9 }];
      const piano = new Group(); piano.name = "piano"; piano.position.set(6 * side + side * -0.85, 1, 2.35 * side);
      zone.add(wood, anchor, porch, piano);
      const log: string[] = [], full = wood.geometry;
      const release = bindQuietShoreShelter(anchor, async () => pieces(log))!;
      draw(anchor); await settle(); draw(anchor);
      expect(log).toEqual(["porch", "stepdeck"]);
      expect(wood.geometry.getAttribute("position").count).toBe(72);
      const shelter = zone.getObjectByName("porch", )!, placed = zone.children.filter(child => child !== porch && child.name === "porch")[0]!;
      expect(shelter).toBe(porch);
      expect(placed.position.toArray()).toEqual([6 * side, 1, 2]);
      expect(placed.rotation.y).toBe(side < 0 ? Math.PI : 0);
      const step = zone.getObjectByName("stepdeck")!;
      expect(step.position.x).toBeCloseTo(6 * side - side * 1.76, 6);
      expect(step.position.y).toBeCloseTo(0.7, 6);
      release();
      expect(wood.geometry).toBe(full);
      expect(zone.getObjectByName("stepdeck")).toBeUndefined();
      expect(log).toContain("disposed");
      full.dispose(); anchor.geometry.dispose(); material.dispose();
    }
    expect(bindQuietShoreShelter(new Mesh())).toBeUndefined();
  });

  it("seats a mirror head on both discs of every steering LOD at true size, with the glass on the scene probe", () => {
    const lods = [new Group(), new Group()];
    lods.forEach(lod => lod.scale.setScalar(0.5345));
    const heads = attachHrMirrors(pieces([]), lods);
    expect(heads).toHaveLength(4);
    expect(lods[0]!.children.map(head => head.position.toArray())).toEqual(HR_MIRROR_SEATS.map(seat => [...seat]));
    for (const head of heads) {
      expect(head.scale.x * 0.5345).toBeCloseTo(1, 6);
      expect(Math.abs(head.rotation.y)).toBeLessThan(0.08); // must keep enclosing the old disc
      const glass = head.children[0] as Mesh, material = glass.material as MeshStandardMaterial, environment = {};
      glass.onBeforeRender(null!, { environment } as never, null!, glass.geometry, material, null!);
      expect(material.envMap).toBe(environment);
      expect(material.envMapIntensity).toBeGreaterThan(1);
    }
  });

  it("burns as occluding premultiplied tongues, not additive sheets", () => {
    const fire = createHrFire([{ position: new Vector3(0, 1, 0), width: 0.5, height: 1.2 }]);
    const flames = fire.group.getObjectByName("workshop-fire-flames") as Mesh;
    const material = flames.material as unknown as { blending: number; blendSrc: number; blendDst: number; fragmentShader: string };
    expect([material.blending, material.blendSrc, material.blendDst]).toEqual([5, 201, 205]); // Custom, One, OneMinusSrcAlpha
    expect((flames.geometry as unknown as { instanceCount: number }).instanceCount).toBe(5);
    const origins = Array.from(flames.geometry.getAttribute("origin").array);
    expect(new Set(origins.filter((_, i) => i % 3 === 0).map(x => x.toFixed(3))).size).toBeGreaterThan(3);
    // The ramp tops out at amber-yellow: no component set brighter than (1, 0.8, 0.36).
    expect(material.fragmentShader).not.toMatch(/vec3\(1\.0, 0\.9\d*, 0\.[5-9]/);
    fire.dispose();
  });

  it("ships the shelter and mirror models with licence rows and exact hashes, reusing the shipped maps", async () => {
    const manifest = JSON.parse(await readFile("public/world/lib/manifest.json", "utf8"));
    const licenses = (await readFile("assets/LICENSES.csv", "utf8")).split("\n");
    for (const [id, names] of [["hr-setpiece-porch", ["porch", "stepdeck"]], ["hr-setpiece-mirror", ["mirror"]]] as const) {
      const entry = manifest.assets.find((asset: { id: string }) => asset.id === id);
      expect(entry.license).toBe("CC0-1.0");
      expect(entry.pieces.map((piece: { name: string }) => piece.name)).toEqual(names);
      const lod = entry.lods[0], bytes = await readFile(`public${lod.path}`);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(lod.sha256);
      expect(licenses.filter(row => row.startsWith(`public${lod.path},`))).toHaveLength(1);
      for (const texture of lod.sharedTextures) {
        expect(createHash("sha256").update(await readFile(`public${texture.path}`)).digest("hex")).toBe(texture.sha256);
        expect(licenses.filter(row => row.startsWith(`public${texture.path},`))).toHaveLength(1);
      }
    }
  });
});
