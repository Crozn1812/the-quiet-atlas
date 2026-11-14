import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { expect, it } from "vitest";
import { partitionCliffGeometry, partitionCliffMesh } from "../../../src/features/world/zones/first-light-cliff-cull";

it("partitions every original triangle exactly once, shares vertex attributes and bounds only each section", () => {
  const geometry = new BoxGeometry(64, 20, 8, 16, 4, 2);
  const chunks = partitionCliffGeometry(geometry), triangles = (indices: number[]) => {
    const result = []; for (let i = 0; i < indices.length; i += 3) result.push(indices.slice(i, i + 3).join(","));
    return result.sort();
  };
  try {
    expect(chunks.length).toBeGreaterThan(2);
    expect(triangles(chunks.flatMap(chunk => Array.from(chunk.index!.array)))).toEqual(triangles(Array.from(geometry.index!.array)));
    for (const chunk of chunks) {
      expect(chunk.getAttribute("normal")).toBe(geometry.getAttribute("normal"));
      expect(chunk.getAttribute("position")).toBe(geometry.getAttribute("position"));
      expect(chunk.boundingBox!.max.x - chunk.boundingBox!.min.x).toBeLessThan(40);
      for (const i of chunk.index!.array) {
        const point = new Vector3().fromBufferAttribute(chunk.getAttribute("position"), i);
        expect(chunk.boundingBox!.containsPoint(point)).toBe(true);
        expect(chunk.boundingSphere!.distanceToPoint(point)).toBeLessThan(0.00001);
      }
    }
  } finally { chunks.forEach(chunk => chunk.dispose()); geometry.dispose(); }
});

it.each([1, 40])("preserves transforms and shadows, including normalized GLBs with node scale %s", scale => {
  const group = new Group(), geometry = new BoxGeometry(64 / scale, 20 / scale, 8 / scale, 16, 4, 2), material = new MeshStandardMaterial();
  geometry.clearGroups();
  const mesh = new Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true;
  mesh.position.set(3, 4, 5); mesh.rotation.y = 0.4; mesh.scale.setScalar(scale); group.add(mesh);
  partitionCliffMesh(mesh);
  try {
    expect(group.children.length).toBeGreaterThan(2);
    for (const section of group.children as Mesh[]) {
      expect(section.material).toBe(material); expect(section.position).toEqual(mesh.position);
      expect(section.quaternion.toArray()).toEqual(mesh.quaternion.toArray());
      expect(section.castShadow && section.receiveShadow).toBe(true);
    }
  } finally { (group.children as Mesh[]).forEach(section => section.geometry.dispose()); material.dispose(); }
});
