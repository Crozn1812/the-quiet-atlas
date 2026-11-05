import { Mesh, type BufferGeometry, type MeshToonMaterial } from "three";
import { createPropMaterial } from "./materials";
import { createDeskGeometry, createSignpostGeometry } from "./shapes";

export type PropKind = "signpost" | "desk";

/** Each mesh owns its geometry/materials; the ramp texture belongs to the world cache. */
export function createProp(kind: PropKind): Mesh<BufferGeometry, MeshToonMaterial[]> {
  const geometry = kind === "signpost" ? createSignpostGeometry() : createDeskGeometry();
  const materials = [createPropMaterial("wood")];
  if (kind === "desk") materials.push(createPropMaterial("paper"));
  const mesh = new Mesh(geometry, materials);
  mesh.userData.kind = kind;
  return mesh;
}
