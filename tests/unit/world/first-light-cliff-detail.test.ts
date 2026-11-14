import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture, type WebGLRenderer } from "three";
import { expect, it, vi } from "vitest";
import { createFirstLightCliffDetail, type CliffLoader } from "../../../src/features/world/zones/first-light-cliff-detail";

function fixture(loader: CliffLoader) {
  const root = new Group(), source = new Mesh(); source.name = "spring-mossy-cliff"; root.add(source);
  return { root, source, detail: createFirstLightCliffDetail(root, {} as WebGLRenderer, loader) };
}
function asset() {
  const root = new Group(), texture = new Texture();
  const material = new MeshStandardMaterial({ map: texture, aoMap: texture });
  const geometry = new BoxGeometry(); root.add(new Mesh(geometry, material));
  return { root, geometry: vi.spyOn(geometry, "dispose"), material: vi.spyOn(material, "dispose"), texture: vi.spyOn(texture, "dispose") };
}

it("never loads on Low, deduplicates requests and keeps Low active after a late High load", async () => {
  const high = asset(); let finish!: (group: Group) => void;
  const load = vi.fn<CliffLoader>(() => new Promise(resolve => { finish = resolve; }));
  const { root, source, detail } = fixture(load);
  await detail.setQuality("Low"); expect(load).not.toHaveBeenCalled();
  const first = detail.setQuality("High"), second = detail.setQuality("High");
  expect(load).toHaveBeenCalledTimes(1); expect(source.visible).toBe(true);
  await detail.setQuality("Low"); finish(high.root); await Promise.all([first, second]);
  expect(source.visible).toBe(true); expect(high.root.visible).toBe(false);
  await detail.setQuality("High"); expect(high.root.visible).toBe(true); expect(source.visible).toBe(false);
  expect(load).toHaveBeenCalledTimes(1);
  detail.dispose(); detail.dispose(); expect(root.children).toEqual([source]);
  expect(source.visible).toBe(true);
  for (const spy of [high.geometry, high.material, high.texture]) expect(spy).toHaveBeenCalledTimes(1);
});

it("releases a load completed after disposal and keeps the fallback on network failure", async () => {
  const high = asset(); let finish!: (group: Group) => void;
  const a = fixture(() => new Promise(resolve => { finish = resolve; }));
  const pending = a.detail.setQuality("Balanced"); a.detail.dispose(); finish(high.root); await pending;
  expect(a.root.children).toEqual([a.source]); expect(high.geometry).toHaveBeenCalledTimes(1);
  const load = vi.fn<CliffLoader>().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(new Group());
  const b = fixture(load); await b.detail.setQuality("High"); expect(b.source.visible).toBe(true);
  expect(b.source.userData.cliffDetailError).toContain("offline");
  await b.detail.setQuality("High"); expect(b.source.visible).toBe(false); b.detail.dispose();
});
