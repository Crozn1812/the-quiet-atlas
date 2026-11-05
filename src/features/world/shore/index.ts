import { Color, Group, InstancedMesh, Mesh, Object3D, Vector3, type BufferGeometry, type MeshToonMaterial } from "three";
import { hex, PALETTE } from "../art/palette";
import { createRampMaterial } from "../materials/ramp";
import type { ZoneCollider } from "../zones/types";
import { createShoreRockGeometry, createShoreSandGeometry } from "./geometry";
import { createShoreLayout, type ShoreStone } from "./layout";

export { createShoreLayout, SHORE_BUDGET, SHORE_SEED, SHORE_ZONE_MARGIN } from "./layout";
export type { ShoreLayout, ShoreStone, Pebble, Boulder, Cairn, SandPatch } from "./layout";

export interface ShoreCollider extends ZoneCollider {
  /** World coordinates, full box size; no group transform needs to be applied. */
  readonly kind: "boulder" | "cairn";
}

function pigment(amount: number): Color {
  const middle = new Color(PALETTE.rock);
  return amount < 0.5 ? new Color(PALETTE.rockDark).lerp(middle, amount * 2)
    : middle.lerp(new Color(PALETTE.sand), (amount - 0.5) * 2);
}

function instances(name: string, stones: readonly ShoreStone[], geometry: BufferGeometry, material: MeshToonMaterial) {
  const mesh = new InstancedMesh(geometry, material, stones.length);
  mesh.name = name;
  const transform = new Object3D();
  stones.forEach((stone, i) => {
    transform.position.set(stone.x, stone.y, stone.z);
    transform.rotation.set(0, stone.yaw, 0);
    transform.scale.set(...stone.size);
    transform.updateMatrix();
    mesh.setMatrixAt(i, transform.matrix);
    mesh.setColorAt(i, pigment(stone.pigment));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  // Keep the reported budget valid for all renderer shadow configurations.
  mesh.castShadow = false;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return mesh;
}

/** Static, world-space shore dressing. Add group once, consume colliders, dispose on unmount.
 * Submerged pebbles retain their physical depth. The existing opaque water material
 * needs transmission/alpha support from the water owner to reveal fully submerged stones.
 */
export function createShore() {
  const layout = createShoreLayout();
  const group = new Group();
  group.name = "rocky-shore";
  // White is only a neutral multiplier; all visible pigment comes from PALETTE.
  const material = createRampMaterial(0xffffff, { steps: 4, soft: true });
  material.vertexColors = true;
  const sandMaterial = createRampMaterial(hex("sand"), { steps: 4, soft: true });
  const pebbleGeometry = createShoreRockGeometry(4);
  const boulderGeometry = createShoreRockGeometry(6);
  const sandGeometry = createShoreSandGeometry(layout.sand);
  const pebbles = instances("shore-pebbles", layout.pebbles, pebbleGeometry, material);
  const largeStones = [...layout.boulders, ...layout.cairns.flatMap(cairn => cairn.stones)];
  const rocks = instances("shore-boulders-and-cairns", largeStones, boulderGeometry, material);
  const sand = new Mesh(sandGeometry, sandMaterial);
  sand.name = "shore-sand-overlay";
  sand.receiveShadow = true;
  group.add(pebbles, rocks, sand);

  const colliders: ShoreCollider[] = layout.boulders.map(rock => ({
    kind: "boulder", center: new Vector3(rock.x, rock.y + rock.size[1] / 2, rock.z),
    size: new Vector3(...rock.size), yaw: rock.yaw,
  }));
  for (const cairn of layout.cairns) colliders.push({
    kind: "cairn", center: new Vector3(cairn.x, cairn.y + cairn.height / 2, cairn.z),
    size: new Vector3(1.05, cairn.height, 1.05), yaw: 0,
  });
  const budget = {
    drawCalls: 3,
    triangles: pebbleGeometry.getAttribute("position").count / 3 * pebbles.count
      + boulderGeometry.getAttribute("position").count / 3 * rocks.count
      + sandGeometry.getAttribute("position").count / 3,
  };
  let disposed = false;
  return {
    group, layout, colliders, budget,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      pebbles.dispose(); rocks.dispose();
      pebbleGeometry.dispose(); boulderGeometry.dispose(); sandGeometry.dispose();
      material.dispose(); sandMaterial.dispose();
      group.clear();
    },
  };
}
