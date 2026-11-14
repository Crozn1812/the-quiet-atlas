import { DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Vector3, type Scene, type Camera } from "three";
import { ZONES } from "../layout/zones";
import { surfaceHeight } from "../scene/compose";
import { nearestPath } from "../terrain/samples";
import { timeOfDayAt } from "../layout/lighting";
import type { Quality } from "../terrain";
import type { BirdListener } from "../../audio/birds";
import { createBirdGeometry, createBirdMaterial } from "./geometry";
import { createBirdAgent, stepBird, type BirdAgent } from "./flight";
import { createBirdPerches } from "./perches";

/** Preserve close anatomy; separate enter/leave distances avoid LOD chatter. */
export function birdGeometryLod(distance: number, quality: Quality, coarse: boolean) {
  if (quality === "Low") return true;
  const near = quality === "High" ? 40 : 32;
  return distance > near + (coarse ? 0 : 8);
}

/** Deferred, original geometry. One instanced batch per local flock, culled at 95 m. */
export function createBirds(scene: Scene) {
  const group = new Group(); group.name = "hr-birds";
  const batches: { mesh: InstancedMesh; agents: BirdAgent[]; species: number; angles: InstancedBufferAttribute; flights: InstancedBufferAttribute; high: ReturnType<typeof createBirdGeometry>; low: ReturnType<typeof createBirdGeometry> }[] = [];
  const branches: Mesh[] = [];
  const transform = new Object3D(), relative = new Vector3();
  let seconds = 0, disposed = false;
  function batch(agents: BirdAgent[], name: string, species: number, gull = false) {
    const high = createBirdGeometry(gull, false, species), low = createBirdGeometry(gull, true, species);
    const angles = new InstancedBufferAttribute(new Float32Array(agents.length), 1).setUsage(DynamicDrawUsage);
    const flights = new InstancedBufferAttribute(new Float32Array(agents.length), 1).setUsage(DynamicDrawUsage);
    high.setAttribute("wingAngle", angles); low.setAttribute("wingAngle", angles);
    high.setAttribute("flightMix", flights); low.setAttribute("flightMix", flights);
    const mesh = new InstancedMesh(high, createBirdMaterial(), agents.length);
    mesh.name = name; mesh.frustumCulled = false; mesh.raycast = () => {};
    mesh.instanceMatrix.setUsage(DynamicDrawUsage); mesh.visible = false;
    group.add(mesh); batches.push({ mesh, agents, species: gull ? 2 : species % 2, angles, flights, high, low });
  }
  function* construct() {
    if (disposed) return;
    scene.add(group);
    for (const [zoneIndex, zone] of ZONES.entries()) {
      const gull = zone.biome === "coast-dusk";
      const agents: BirdAgent[] = [];
      const x = zone.position.x + zone.lookDirection.z * 9, z = zone.position.z - zone.lookDirection.x * 9;
      const y = surfaceHeight(x, z) + (gull ? 9 : zone.biome === "hill" ? 13 : 20);
      for (let i = 0; i < (gull ? 7 : 9); i++) agents.push(createBirdAgent(new Vector3(x + Math.sin(i * 2.4) * 4, y + i * 0.32, z + Math.cos(i * 2.4) * 3), i * 2.399 + zoneIndex, false, gull));
      batch(agents, `birds-${zone.id}`, zoneIndex % 3, gull);
      if (zoneIndex === 0) {
        const { perches, branch } = createBirdPerches(scene, zone.position);
        if (branch) { group.add(branch); branches.push(branch); }
        for (const { home, yaw, species } of perches) {
          const bird = createBirdAgent(home, species * 1.79, true); bird.yaw = yaw;
          batch([bird], `birds-perch-${species}`, species);
        }
      }
      yield;
    }
  }
  const build = construct();
  function update(dt: number, reduced: boolean, player: Readonly<Vector3>, quality: Quality) {
    if (disposed) return;
    const delta = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    seconds += delta * (reduced ? 0.3 : 1);
    for (const batch of batches) {
      const { mesh, agents, angles, flights } = batch;
      const center = agents[0]!.home;
      mesh.visible = Math.hypot(player.x - center.x, player.z - center.z) < (quality === "Low" ? 65 : 95);
      // Keep perch birds on Low, while reducing the airborne flock to three.
      let index = 0;
      let nearest = Infinity;
      for (const [id, bird] of agents.entries()) {
        stepBird(bird, seconds, delta * (reduced ? 0.3 : 1), player);
        nearest = Math.min(nearest, bird.position.distanceTo(player));
        if (!mesh.visible || quality === "Low" && id >= 3 && !bird.perched) continue;
        transform.position.copy(bird.position);
        const bank = bird.flight > 0 ? Math.sin(seconds * 0.3 + bird.phase) * (reduced ? 0.08 : 0.22) : 0;
        transform.rotation.set(bird.perched ? -0.12 * bird.flight : 0, bird.yaw, bank);
        const size = bird.perched ? 1.0 : (bird.gull ? 1.3 : 0.68) * (0.92 + (id % 5) * 0.04);
        transform.scale.setScalar(size); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
        const gliding = Math.sin(seconds * 0.65 + bird.phase) > (bird.gull ? -0.15 : 0.7);
        const flap = gliding ? 0.12 : Math.sin(seconds * (bird.gull ? 8 : 21) + bird.phase) * (reduced ? 0.12 : 0.68);
        angles.setX(index, flap * bird.flight);
        flights.setX(index++, bird.flight);
      }
      mesh.count = index; mesh.instanceMatrix.needsUpdate = true; angles.needsUpdate = true; flights.needsUpdate = true;
      mesh.geometry = birdGeometryLod(nearest, quality, mesh.geometry === batch.low) ? batch.low : batch.high;
      mesh.frustumCulled = quality !== "Low";
      if (mesh.frustumCulled && mesh.visible) {
        mesh.computeBoundingSphere();
        // Shader wing rotation can move tips beyond the undeformed skin bounds.
        if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.4;
      }
    }
  }
  function listener(player: Readonly<Vector3>, camera: Camera): BirdListener {
    let distance = Infinity, pan = 0, species = 0;
    let position: [number, number, number] | undefined;
    for (const batch of batches) for (const bird of batch.agents) {
      const d = bird.position.distanceTo(player);
      if (d >= distance) continue;
      distance = d;
      const e = camera.matrixWorld.elements;
      pan = Math.max(-1, Math.min(1, ((bird.position.x - player.x) * e[0]! + (bird.position.z - player.z) * e[2]!) / Math.max(1, d)));
      species = batch.species;
      position = relative.copy(bird.position).applyMatrix4(camera.matrixWorldInverse).toArray();
    }
    return { distance, pan, species, position, evening: timeOfDayAt(nearestPath(player.x, player.z).t) };
  }
  return { group, batches, build, update, listener, dispose() {
    if (disposed) return;
    disposed = true; build.return();
    for (const { mesh, high, low } of batches) { mesh.dispose(); high.dispose(); low.dispose(); (mesh.material as MeshStandardMaterial).dispose(); }
    for (const limb of branches) { limb.geometry.dispose(); (limb.material as MeshStandardMaterial).dispose(); }
    group.removeFromParent(); group.clear(); batches.length = 0;
  } };
}
