import { Color, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FOREST_ATMOSPHERE_TRANSITION } from "../art/direction";
import { PALETTE } from "../art/palette";
import { pathLength, pathPointAt } from "../layout/path";
import { createRampMaterial } from "../materials/ramp";
import type { Quality } from "../terrain";

/** A continuous, faceted understory roof. Static instances bridge the intentional
 * trunk exclusions around stations; neither the walking space nor colliders change. */
export function createForestCeiling(heightAt: (x: number, z: number) => number) {
  const group = new Group();
  group.name = "forest-canopy-ceiling";
  const lobes = [[-0.4, 0, 0, 1, 1, 0.84], [0.45, 0.1, 0.3, 0.77, 0.8, 0.85], [0.1, -0.22, -0.45, 0.72, 0.8, 0.7]];
  const parts = lobes.map(([x, y, z, sx, sy, sz], i) => new IcosahedronGeometry(1, 0)
    .scale(sx!, sy!, sz!).rotateY(i * 0.73).translate(x!, y!, z!));
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  const material = createRampMaterial(0xffffff, { steps: 4, soft: false });
  const routeLength = pathLength(), end = routeLength * FOREST_ATMOSPHERE_TRANSITION.end;
  const sites: { position: Vector3; scale: Vector3; angle: number; pigment: Color }[] = [];
  const start = pathPointAt(0), tangent = pathPointAt(0.001).sub(start).normalize();
  for (let along = -35, row = 0; along < end + 26; along += 8.5, row++) {
    const t = Math.max(0, Math.min(1, along / routeLength));
    const at = along < 0 ? start.clone().addScaledVector(tangent, along) : pathPointAt(t);
    const forward = along < 0 ? tangent : pathPointAt(Math.min(1, t + 0.001)).sub(at).normalize();
    const right = new Vector3(-forward.z, 0, forward.x);
    for (const [column, offset] of [-23, -11, 1, 13, 25].entries()) {
      const seed = row * 2.37 + column * 4.19;
      const position = at.clone().addScaledVector(right, offset + Math.sin(seed) * 2.2)
        .addScaledVector(forward, Math.cos(seed * 1.7) * 2);
      // Upper crowns leave small irregular cracks above the lower hanging masses.
      position.y = heightAt(position.x, position.z) + 12.4 + 1.3 * Math.sin(seed);
      const fade = Math.max(0, Math.min(1, (end + 26 - along) / 40));
      if (fade <= 0) continue;
      sites.push({ position, angle: seed,
        scale: new Vector3((7.5 + Math.sin(seed * 0.7)) * fade, 2.2 + 0.5 * Math.cos(seed), (7.9 + Math.cos(seed * 0.8)) * fade),
        pigment: new Color(PALETTE.forestLight).lerp(new Color(PALETTE.grass), 0.18)
          .lerp(new Color(PALETTE.mist), 0.11 + 0.06 * Math.sin(seed)) });
    }
  }
  const mesh = new InstancedMesh(geometry, material, sites.length);
  mesh.name = "forest-overlapping-leaf-masses";
  mesh.receiveShadow = true;
  const matrix = new Matrix4();
  sites.forEach((site, i) => {
    matrix.makeRotationY(site.angle).scale(site.scale).setPosition(site.position);
    mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, site.pigment);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  // The lowest leaves stay far above the maximum camera arm. They never need
  // crown fades, LoS tests or a frame callback.
  mesh.raycast = () => {};
  group.add(mesh);
  let disposed = false;
  return { group, mesh, sites,
    setQuality(quality: Quality) { mesh.visible = quality !== "Low"; },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.dispose(); geometry.dispose(); material.dispose(); group.removeFromParent(); group.clear();
    },
  };
}
