import { CylinderGeometry, Mesh, type BufferGeometry, type MeshToonMaterial } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createPropMaterial } from "./materials";
import { createDeskGeometry, createSignpostGeometry } from "./shapes";
import { bindHrStructure } from "./hr-structures";
import { bindFasteners } from "./fasteners";
import { bindSetpieces } from "../zones/setpiece-hr";

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
    // HR-FIX-SETPIECE A17: authored weathered board and post with the same silhouette and face plane.
    // Bound last, so the timber overlay above sees the emptied solid and withdraws.
    materials[0]!.addEventListener("dispose", bindSetpieces(mesh, {
      file: "signpost", hide: [{ mesh }],
      place(asset, add) { add(asset.piece("signpost"), mesh); },
      onToggle(active) {
        // The rear lettering sits on the post's back plane; the authored board's own back is at z = .012.
        for (const child of mesh.children) if (child.userData.signLabel && child.position.z < 0.05) child.position.z = active ? 0.006 : -0.107;
      },
    }));
  }
  return mesh;
}
