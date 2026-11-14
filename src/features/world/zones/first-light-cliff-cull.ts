import { Box3, BufferGeometry, Mesh, MeshStandardMaterial, Sphere, Vector3 } from "three";
import { erodeSpringCliffPlants, sculptSpringCliff } from "../terrain/cliff-relief";
import { weatherSpringCliff } from "../materials/cliff";

/** Partition triangle indices, sharing the original vertex data and normals.
 * Color and shadow cameras can reject individual cliff sections; no decimation,
 * texture change, quantization or new seam is introduced. */
export function partitionCliffGeometry(source: BufferGeometry, cellSize = 16): BufferGeometry[] {
  const position = source.getAttribute("position"), index = source.index;
  const cells = new Map<string, number[]>();
  const count = index?.count ?? position.count;
  for (let i = 0; i < count; i += 3) {
    const a = index?.getX(i) ?? i, b = index?.getX(i + 1) ?? i + 1, c = index?.getX(i + 2) ?? i + 2;
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
    const key = `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`;
    let triangles = cells.get(key);
    if (!triangles) { triangles = []; cells.set(key, triangles); }
    triangles.push(a, b, c);
  }
  const point = new Vector3();
  return [...cells.values()].map(indices => {
    const geometry = new BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(indices);
    const box = new Box3();
    for (const i of indices) box.expandByPoint(point.fromBufferAttribute(position, i));
    const sphere = new Sphere(box.getCenter(new Vector3()), 0);
    for (const i of indices) sphere.radius = Math.max(sphere.radius, sphere.center.distanceTo(point.fromBufferAttribute(position, i)));
    geometry.boundingBox = box; geometry.boundingSphere = sphere;
    return geometry;
  });
}

export function partitionCliffMesh(mesh: Mesh) {
  if (Array.isArray(mesh.material) || !mesh.parent || mesh.geometry.groups.length > 1) return;
  if (mesh.name === "first-light-sculpted-rock" && mesh.material instanceof MeshStandardMaterial && mesh.material.map) {
    sculptSpringCliff(mesh);
    weatherSpringCliff(mesh.material);
  }
  if (mesh.name === "first-light-crevice-ferns") erodeSpringCliffPlants(mesh);
  // Meshopt GLBs keep normalized positions and their metre scale on the node.
  const scale = mesh.getWorldScale(new Vector3());
  const cellSize = 16 / Math.max(scale.x, scale.y, scale.z, 0.00001);
  const original = mesh.geometry, chunks = partitionCliffGeometry(original, cellSize);
  if (chunks.length < 2) { chunks.forEach(chunk => chunk.dispose()); return; }
  mesh.geometry = chunks[0]!;
  chunks.slice(1).forEach((geometry, i) => {
    const section = mesh.clone(false); section.geometry = geometry;
    section.name = `${mesh.name}-section-${i + 1}`; section.raycast = mesh.raycast;
    mesh.parent!.add(section);
  });
  original.dispose();
}
