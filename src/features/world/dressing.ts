// Lead (batch 25): world-space set dressing that is not a zone: rocky shore (B2-164), later the coast road (B2-163)
// and path bridges (B2-168). Each module reports oriented box colliders; they join the zone boxes so Rapier and the
// raycast fallback treat them the same way.
import { BoxGeometry, Mesh, MeshBasicMaterial, Vector3, type Group } from "three";
import { createShore } from "./shore";

export interface DressingCollider {
  readonly center: Readonly<Vector3>;
  readonly size: Readonly<Vector3>;
  readonly yaw?: number;
}

interface DressingModule {
  readonly group: Group;
  readonly colliders: readonly DressingCollider[];
  update?(dt: number, reducedMotion: boolean): void;
  dispose(): void;
}

export function placeDressing() {
  const modules: DressingModule[] = [];
  const boxes: Mesh<BoxGeometry, MeshBasicMaterial>[] = [];
  try {
    modules.push(createShore());
    for (const piece of modules) for (const collider of piece.colliders) {
      const box = new Mesh(new BoxGeometry(collider.size.x, collider.size.y, collider.size.z), new MeshBasicMaterial());
      box.position.copy(collider.center);
      box.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), collider.yaw ?? 0);
      box.updateMatrixWorld(true);
      boxes.push(box);
    }
  } catch (error) {
    modules.forEach(piece => piece.dispose());
    boxes.forEach(box => { box.geometry.dispose(); box.material.dispose(); });
    throw error;
  }
  let disposed = false;
  return {
    groups: modules.map(piece => piece.group),
    boxes,
    update(dt: number, reducedMotion: boolean) {
      for (const piece of modules) piece.update?.(dt, reducedMotion);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const piece of modules) { piece.dispose(); piece.group.removeFromParent(); }
      for (const box of boxes) { box.geometry.dispose(); box.material.dispose(); }
    },
  };
}
