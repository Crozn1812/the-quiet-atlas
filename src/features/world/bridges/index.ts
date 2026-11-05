import {
  BufferAttribute, BufferGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3,
} from "three";
import { PALETTE } from "../art/palette";
import { createRampMaterial } from "../materials/ramp";
import { createBridgeColliders } from "./colliders";
import { createMossGeometry, createPlankGeometry, createRailGeometry } from "./geometry";
import { BRIDGE_DECK_WIDTH, BRIDGE_RAIL_HEIGHT, BRIDGE_RAIL_OFFSET, createBridgeProfiles, type BridgeSample } from "./profile";

export { addBridgeColliders, type BridgeCollider } from "./colliders";
export * from "./profile";

const up = new Vector3(0, 1, 0);

/** Position-keyed variation, independent of creation order, time and global random state. */
function variation(point: Vector3, salt: number): number {
  let hash = Math.imul(Math.round(point.x * 1000), 374761393)
    ^ Math.imul(Math.round(point.z * 1000), 668265263) ^ salt;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

function timberColor(point: Vector3, salt = 0): Color {
  return new Color(PALETTE.rockDark).lerp(new Color(PALETTE.dusk), 0.18 + variation(point, salt) * 0.06);
}

function railPoint(row: BridgeSample, side: number, height: number): Vector3 {
  return row.centre.clone().addScaledVector(row.right, side * BRIDGE_RAIL_OFFSET).addScaledVector(up, height);
}

/** Three render submissions for ALL crossings. Surface meshes are exported for raycasts only;
 * do not add them to the scene. Dispose physics bindings before disposing this module. */
export function createBridges() {
  const profiles = createBridgeProfiles();
  const plankCount = profiles.reduce((n, p) => n + p.rows.length - 1, 0);
  const railCount = profiles.reduce((n, p) => n + p.railings.reduce((n, r) => n + r.posts.length * 2 - 1, 0), 0);
  const mossCount = profiles.reduce((n, p) => n + Math.ceil((p.rows.length - 1) / 3) * 2, 0);
  const material = createRampMaterial(0xffffff);
  material.vertexColors = true;
  const planks = new InstancedMesh(createPlankGeometry(), material, plankCount);
  const rails = new InstancedMesh(createRailGeometry(), material, railCount);
  const moss = new InstancedMesh(createMossGeometry(), material, mossCount);
  const group = new Group();
  group.name = "path-bridges";
  planks.name = "bridge-transverse-timbers";
  rails.name = "bridge-posts-and-bowed-handrails";
  moss.name = "bridge-edge-moss";
  group.add(planks, rails, moss);
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  let plankIndex = 0, railIndex = 0, mossIndex = 0;
  function beam(start: Vector3, end: Vector3, width: number, salt: number) {
    const direction = end.clone().sub(start);
    rotation.setFromUnitVectors(up, direction.clone().normalize());
    matrix.compose(start.clone().add(end).multiplyScalar(0.5), rotation, new Vector3(width, direction.length(), width));
    rails.setMatrixAt(railIndex, matrix);
    rails.setColorAt(railIndex++, timberColor(start, salt));
  }
  const bridges = profiles.map((profile, bridgeIndex) => {
    const firstPlank = plankIndex;
    for (let i = 0; i < profile.rows.length - 1; i++) {
      const a = profile.rows[i]!.centre, b = profile.rows[i + 1]!.centre;
      const forward = b.clone().sub(a);
      const run = Math.hypot(forward.x, forward.z);
      // Local X points left so X/Y/Z form a positive-determinant basis. Three
      // cannot flip face culling separately for mirrored InstancedMesh instances.
      const left = new Vector3(forward.z / run, 0, -forward.x / run);
      const centre = a.clone().add(b).multiplyScalar(0.5);
      // Overlapping ends cover small wedges on the curved approach. The top plane
      // follows exactly the grade of the matching continuous collider segment.
      const width = BRIDGE_DECK_WIDTH + 0.1 + variation(centre, 7) * 0.02;
      const thickness = 0.11 + variation(centre, 13) * 0.02;
      matrix.makeBasis(left.multiplyScalar(width), up.clone().multiplyScalar(thickness), forward.multiplyScalar((run + 0.16) / run));
      matrix.setPosition(centre);
      planks.setMatrixAt(plankIndex, matrix);
      planks.setColorAt(plankIndex++, timberColor(centre));
      if (i % 3 === 0) for (const side of [-1, 1]) {
        const row = profile.sample((profile.rows[i]!.t + profile.rows[i + 1]!.t) / 2);
        const point = row.centre.clone().addScaledVector(row.right, side * 1.155);
        point.y += 0.004;
        matrix.makeBasis(row.right.clone().multiplyScalar(-0.075), up, forward.clone().normalize().multiplyScalar(0.32));
        matrix.setPosition(point);
        moss.setMatrixAt(mossIndex, matrix);
        moss.setColorAt(mossIndex++, new Color(PALETTE.grass).lerp(new Color(PALETTE.forestDeep), 0.55 + variation(point, 37) * 0.15));
      }
    }
    for (const { side, posts } of profile.railings) posts.forEach((post, i) => {
      beam(railPoint(post, side, -0.05), railPoint(post, side, BRIDGE_RAIL_HEIGHT + 0.04), 0.12, 11);
      const next = posts[i + 1];
      if (next) beam(railPoint(post, side, BRIDGE_RAIL_HEIGHT), railPoint(next, side, BRIDGE_RAIL_HEIGHT), 0.1, 23);
    });
    const colliders = createBridgeColliders(profile, bridgeIndex);
    const deck = colliders[0]!;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(deck.vertices, 3));
    geometry.setIndex(new BufferAttribute(deck.indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const surface = new Mesh(geometry, material);
    surface.name = `bridge-${bridgeIndex}-walkable-surface`;
    surface.updateMatrixWorld();
    return { profile, mesh: planks, firstPlank, plankCount: plankIndex - firstPlank, surface, colliders };
  });
  const meshes = [planks, rails, moss];
  for (const mesh of meshes) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = mesh !== moss;
    mesh.receiveShadow = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }
  const triangles = meshes.reduce((n, mesh) => n + mesh.geometry.getAttribute("position").count / 3 * mesh.count, 0);
  let disposed = false;
  return {
    group, bridges, meshes, colliders: bridges.flatMap(b => b.colliders),
    budget: { drawCalls: meshes.length, triangles },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const mesh of meshes) { mesh.dispose(); mesh.geometry.dispose(); }
      bridges.forEach(b => b.surface.geometry.dispose());
      material.dispose();
      // The shared ramp texture belongs to the world.
    },
  };
}
