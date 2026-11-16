import { Box3, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Sphere, Vector3, Vector4 } from "three";
import type { Quality } from "../terrain";
import { createFishGeometry, createFishMaterial } from "./fish-shader";
import { createFishSchools } from "./fish-schools";

/** Mixed year classes: 0.5-1.0 x the 0.56 m template (about 28-56 cm), never two equal neighbours. */
export function fishSize(school: number, fish: number) {
  const h = Math.abs(Math.sin((school + 1) * 12.9898 + fish * 78.233) * 43758.5453) % 1;
  return 0.5 + h * h * 0.5;
}

/** Retains the existing entry point and lifecycle, including the First Light school. */
export function createFirstLightFish() {
  const schools = createFishSchools();
  const group = new Group(); group.name = "first-light-fish";
  const geometry = createFishGeometry();
  const material = createFishMaterial(schools.flatMap(school => school.route.map(point =>
    new Vector4(point.x - school.center.x, point.y - school.center.y, point.z - school.center.z, school.submergence))));
  const count = schools.reduce((sum, school) => sum + school.count, 0);
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = "first-light-stream-fish";
  // Draw translucent fins over the opaque bed, before the river/pool overlay.
  mesh.renderOrder = -1;
  mesh.raycast = () => {}; // Shader positions are visual only, never camera/player obstacles.
  const centers: number[] = [], motions: number[] = [], reaches: number[] = [];
  const matrix = new Matrix4();
  let instance = 0;
  for (const [id, school] of schools.entries()) {
    for (let fish = 0; fish < school.count; fish++) {
      centers.push(school.center.x, school.center.y, school.center.z, id);
      motions.push(fish * 2.39996, (fish / (school.count - 1) - 0.5) * 1.5,
        Math.sin(fish * 2.39996) * 0.3, fishSize(id, fish));
      reaches.push(school.span, school.width, school.phase, school.length);
      // Uploaded once; the shader owns all subsequent displacement.
      matrix.makeTranslation(school.center.x, school.center.y - school.submergence, school.center.z);
      mesh.setMatrixAt(instance++, matrix);
    }
  }
  geometry.setAttribute("fishSchool", new InstancedBufferAttribute(new Float32Array(centers), 4));
  geometry.setAttribute("fishMotion", new InstancedBufferAttribute(new Float32Array(motions), 4));
  geometry.setAttribute("fishReach", new InstancedBufferAttribute(new Float32Array(reaches), 4));
  const bounds = new Box3();
  for (const school of schools) for (const point of school.route) bounds.expandByPoint(point);
  mesh.boundingSphere = bounds.expandByScalar(2).getBoundingSphere(new Sphere());
  group.add(mesh);
  const playerUniform = material.uniforms.uPlayer!.value as Vector4;
  const lastAlarmPosition = new Vector3(Infinity, Infinity, Infinity);
  let elapsed = 0, disposed = false, wasNear = false;

  function update(dt: number, reducedMotion: boolean, player?: Readonly<Vector3>, quality: Quality = "High") {
    if (disposed) return;
    if (Number.isFinite(dt) && dt > 0) elapsed += Math.min(dt, 0.1) * (reducedMotion ? 0.22 : 1);
    material.uniforms.uTime!.value = elapsed;
    material.uniforms.uCalm!.value = reducedMotion || quality === "Low" ? 1 : 0;
    material.uniforms.uLowSchool!.value = -1;
    if (!player) return;
    let nearest = 0, nearestDistance = Infinity, near = false;
    // Five baked corridors: no terrain/spline queries, allocations or matrix uploads per frame.
    for (let id = 0; id < schools.length; id++) {
      const school = schools[id]!;
      const dx = player.x - school.center.x, dz = player.z - school.center.z;
      const distance = dx * dx + dz * dz;
      if (distance < nearestDistance) { nearestDistance = distance; nearest = id; }
      const along = dx * school.forward.x + dz * school.forward.z;
      const across = -dx * school.forward.z + dz * school.forward.x;
      if (Math.abs(along) < school.length / 2 + 2.5 && Math.abs(across) < school.bankDistance + 2.5
        && Math.abs(player.y - school.center.y) < 3.5) near = true;
    }
    mesh.visible = nearestDistance <= 68 * 68;
    if (quality === "Low") material.uniforms.uLowSchool!.value = nearest;
    playerUniform.set(player.x, player.y, player.z, playerUniform.w);
    if (reducedMotion || quality === "Low") playerUniform.w = -100;
    else if (near && (!wasNear || lastAlarmPosition.distanceToSquared(player) > 1)) {
      playerUniform.w = elapsed;
      lastAlarmPosition.copy(player);
    }
    wasNear = near;
  }
  return { group, mesh, schools, update, dispose() {
    if (disposed) return; disposed = true;
    mesh.dispose(); geometry.dispose(); material.dispose(); group.removeFromParent(); group.clear();
  } };
}
