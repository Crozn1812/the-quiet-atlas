import { Box3, Color, ConeGeometry, DynamicDrawUsage, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Sphere, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { riverPointAt, riverTangentAt } from "../layout/river";
import { waterLevelAt } from "../terrain/height";
import { createRampMaterial } from "../materials/ramp";

/** Six small fish, one draw and no textures. Positions stay inside the shallow opening reach. */
export function createFirstLightFish() {
  const group = new Group(); group.name = "first-light-fish";
  const body = new IcosahedronGeometry(1, 0).scale(0.12, 0.09, 0.32);
  const tail = new ConeGeometry(0.14, 0.22, 3).rotateX(Math.PI / 2).translate(0, 0, -0.32);
  const flatTail = tail.toNonIndexed();
  const geometry = mergeGeometries([body, flatTail]);
  flatTail.dispose();
  body.dispose(); tail.dispose();
  const material = createRampMaterial(new Color(PALETTE.rock).lerp(new Color(PALETTE.sunGold), 0.25).getHex());
  const mesh = new InstancedMesh(geometry, material, 6);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.name = "first-light-stream-fish"; group.add(mesh);
  // Cache the short swimming reach once, avoiding spline searches/allocations per frame.
  const start = 0.01, span = 0.04, segments = 64;
  const route = Array.from({ length: segments + 1 }, (_, i) => riverPointAt(start + span * i / segments));
  route.forEach(point => { point.y = waterLevelAt(point.z) - 0.22; });
  const directions = Array.from({ length: segments + 1 }, (_, i) => riverTangentAt(start + span * i / segments));
  mesh.boundingSphere = new Box3().setFromPoints(route).expandByScalar(1.2).getBoundingSphere(new Sphere());
  const matrix = new Matrix4(), point = new Vector3(), tangent = new Vector3();
  let elapsed = 0, disposed = false, initialized = false;
  function update(dt: number, reducedMotion: boolean) {
    if (disposed || (initialized && (dt <= 0 || reducedMotion))) return;
    if (!reducedMotion) elapsed += dt;
    for (let i = 0; i < mesh.count; i++) {
      const phase = elapsed * 0.32 + i * 1.7;
      const t = 0.012 + i * 0.007 + Math.sin(phase) * 0.002;
      const sample = (t - start) / span * segments, index = Math.min(segments - 1, Math.floor(sample));
      point.lerpVectors(route[index]!, route[index + 1]!, sample - index);
      tangent.lerpVectors(directions[index]!, directions[index + 1]!, sample - index).normalize();
      const lateral = Math.sin(phase * 0.7 + i) * 0.65;
      point.x -= tangent.z * lateral; point.z += tangent.x * lateral;
      point.y = waterLevelAt(point.z) - 0.22;
      matrix.makeRotationY(Math.atan2(tangent.x, tangent.z) + Math.cos(phase) * 0.3);
      matrix.setPosition(point); mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    initialized = true;
  }
  update(0, false);
  return { group, mesh, update, dispose() {
    if (disposed) return; disposed = true;
    mesh.dispose(); geometry.dispose(); material.dispose(); group.removeFromParent(); group.clear();
  } };
}
