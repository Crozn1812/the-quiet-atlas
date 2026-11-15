import { CylinderGeometry, Mesh, type BufferGeometry, type MeshToonMaterial } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createPropMaterial } from "./materials";
import { createDeskGeometry, createSignpostGeometry } from "./shapes";
import { bindHrStructure } from "./hr-structures";
import { bindFasteners } from "./fasteners";

export type PropKind = "signpost" | "desk";

/** Each mesh owns its geometry/materials; the ramp texture belongs to the world cache. */
export function createProp(kind: PropKind): Mesh<BufferGeometry, MeshToonMaterial[]> {
  const geometry = kind === "signpost" ? createSignpostGeometry() : createDeskGeometry();
  const materials = [createPropMaterial("wood")];
  if (kind === "desk") materials.push(createPropMaterial("paper"));
  const mesh = new Mesh(geometry, materials);
  mesh.userData.kind = kind;
  const release = bindHrStructure(mesh, true);
  // Existing owners dispose prop materials. Tie deferred resources to that same lifecycle.
  materials[0]!.addEventListener("dispose", release);
  if (kind === "signpost") {
    const nails=[.43,.64].map(y=>new CylinderGeometry(.012,.013,.007,12).rotateX(Math.PI/2).translate(-.54,y,.105));
    const geometry=mergeGeometries(nails)!;nails.forEach(g=>g.dispose());
    materials[0]!.addEventListener("dispose",bindFasteners(mesh,geometry));
  }
  return mesh;
}
