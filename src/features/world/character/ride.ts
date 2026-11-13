import { Bone, Object3D, Quaternion, SkinnedMesh, Vector3 } from "three";
import { VEHICLE_TRANSITION_SECONDS, type VehicleState } from "../../vehicle/model";
import { GD110_SCALE, STEERING_PIVOT } from "../vehicle/mesh";
import type { Character } from "./runtime";
import { setBakedAppearanceTransitionGuard } from "./baked-appearance";

const point = (x: number, y: number, z: number) => new Vector3(x, y, z).multiplyScalar(GD110_SCALE);
/** Bike-local contact points, in metres; ankles sit above the soles on the pegs. */
export const RIDE_CONTACTS = {
  hips: point(0, .99, -.25),
  leftHand: point(.395, 1.25, .44), rightHand: point(-.395, 1.25, .44),
  leftFoot: point(.23, .49, -.12), rightFoot: point(-.23, .49, -.12),
  plantedFoot: point(.43, .13, -.25),
};

/** Reuses the authored skin. Call after the walking animator and bike.update.
 * The frame is the bike's leaning body, not the physics capsule or camera target.
 * No reparenting, new geometry, clip allocation, or simulation changes.
 */
export function createRiderPose(character: Character) {
  const root = character.root;
  const bones = new Map<string, Bone>();
  const skins: { mesh: SkinnedMesh; culled: boolean }[] = [];
  root.traverse(object => {
    if (object instanceof Bone) {
      // GLTFLoader removes periods from track names.
      const name = object.name.replace(/^(upper_arm|forearm|hand|thigh|shin|foot)([LR])$/, "$1.$2");
      bones.set(name, object);
    }
    if (object instanceof SkinnedMesh) skins.push({ mesh: object, culled: object.frustumCulled });
  });
  const rest = [...bones.values()].map(bone => ({ bone, position: bone.position.clone(), rotation: bone.quaternion.clone(), scale: bone.scale.clone() }));
  root.updateWorldMatrix(true, true);
  const rootInverse = root.getWorldQuaternion(new Quaternion()).invert();
  const orientations = new Map([...bones].map(([name, bone]) => [name, rootInverse.clone().multiply(bone.getWorldQuaternion(new Quaternion()))]));
  const walkingRotation = root.quaternion.clone();
  let riding = false;
  let transition: "mount" | "dismount" | undefined;
  const transitioning = () => transition !== undefined;
  for (const { mesh } of skins) setBakedAppearanceTransitionGuard(mesh, transitioning);
  let appearanceFrame: Object3D | undefined;
  let elapsed = 0;
  const duration = VEHICLE_TRANSITION_SECONDS;
  const up = new Vector3(0, 1, 0);
  const handTarget = new Vector3();
  const swingFoot = new Vector3();
  let exitSide = 1;
  const fromPosition = new Vector3(), fromRotation = new Quaternion();
  const seatPosition = new Vector3(), seatRotation = new Quaternion();
  const standingPosition = new Vector3();
  const fromBones = rest.map(() => ({ position: new Vector3(), rotation: new Quaternion() }));
  const seatBones = rest.map(() => ({ position: new Vector3(), rotation: new Quaternion() }));
  const standingBones = rest.map(() => ({ position: new Vector3(), rotation: new Quaternion() }));
  function remember(bones: typeof fromBones) {
    rest.forEach(({ bone }, i) => {
      bones[i]!.position.copy(bone.position);
      bones[i]!.rotation.copy(bone.quaternion);
    });
  }
  function blendFrom(position: Vector3, rotation: Quaternion, bones: typeof fromBones, progress: number) {
    const blend = progress * progress * (3 - 2 * progress);
    root.position.lerp(position, 1 - blend);
    root.quaternion.slerp(rotation, 1 - blend);
    rest.forEach(({ bone }, i) => {
      bone.position.lerp(bones[i]!.position, 1 - blend);
      bone.quaternion.slerp(bones[i]!.rotation, 1 - blend);
    });
    root.updateWorldMatrix(true, true);
  }
  const required = ["hips", "spine", "chest", "head", ...["L", "R"].flatMap(side =>
    ["upper_arm", "forearm", "hand", "thigh", "shin", "foot"].map(name => `${name}.${side}`))];
  const supported = required.every(name => bones.has(name));
  const world = (p: Vector3) => root.localToWorld(p.clone());
  const position = (bone: Object3D) => bone.getWorldPosition(new Vector3());
  function orient(bone: Bone, rotation: Quaternion) {
    const parentRotation = bone.parent!.getWorldQuaternion(new Quaternion()).invert();
    bone.quaternion.copy(parentRotation.multiply(rotation));
    bone.updateWorldMatrix(false, true);
  }
  function aim(bone: Bone, child: Bone, target: Vector3) {
    const origin = position(bone);
    const delta = new Quaternion().setFromUnitVectors(position(child).sub(origin).normalize(), target.clone().sub(origin).normalize());
    orient(bone, delta.multiply(bone.getWorldQuaternion(new Quaternion())));
  }
  function limb(a: string, b: string, c: string, target: Vector3, pole: Vector3) {
    const upper = bones.get(a)!, lower = bones.get(b)!, end = bones.get(c)!;
    const origin = position(upper), goal = world(target);
    const l1 = origin.distanceTo(position(lower)), l2 = position(lower).distanceTo(position(end));
    const direction = goal.clone().sub(origin);
    const distance = Math.max(1e-6, Math.min(direction.length(), l1 + l2 - 1e-6));
    direction.normalize();
    const bend = world(pole).sub(origin);
    bend.addScaledVector(direction, -bend.dot(direction)).normalize();
    const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
    const joint = origin.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
    aim(upper, lower, joint);
    aim(lower, end, goal);
    // Keep shoes level and hands in their authored palm orientation.
    orient(end, root.getWorldQuaternion(new Quaternion()).multiply(orientations.get(c)!));
  }
  function restore() {
    for (const { bone, position, rotation, scale } of rest) {
      bone.position.copy(position); bone.quaternion.copy(rotation); bone.scale.copy(scale);
    }
  }
  return {
    supported,
    get transitioning() { return transition !== undefined; },
    /** Read-only, on-demand QA measurements; no work in the animation loop. */
    snapshot(frame: Object3D) {
      root.updateWorldMatrix(true, true);
      const hips = bones.get("hips"), head = bones.get("head");
      const torso = hips && head ? position(head).sub(position(hips)).normalize() : up;
      const here = root.getWorldPosition(new Vector3()), bike = frame.getWorldPosition(new Vector3());
      return {
        transitioning: transition !== undefined,
        rootUp: up.clone().applyQuaternion(root.getWorldQuaternion(new Quaternion())).y,
        torsoUp: torso.y,
        distanceToBike: Math.hypot(here.x - bike.x, here.z - bike.z),
      };
    },
    update(state: Pick<VehicleState, "mode" | "speed">, frame: Object3D, dt = 0, reducedMotion = true) {
      if (character.disposed) return;
      if (appearanceFrame !== frame) {
        frame.traverse(object => {
          if (object instanceof SkinnedMesh) setBakedAppearanceTransitionGuard(object, transitioning);
        });
        appearanceFrame = frame;
      }
      if (state.mode !== "ride") {
        if (riding) {
          transition = supported && !reducedMotion ? "dismount" : undefined;
          elapsed = 0;
          restore(); character.mixer.update(0);
          root.quaternion.copy(walkingRotation);
          if (transition === "dismount") {
            standingPosition.copy(root.position);
            exitSide = frame.worldToLocal(root.getWorldPosition(new Vector3())).x >= 0 ? 1 : -1;
            remember(standingBones);
          }
          for (const { mesh, culled } of skins) mesh.frustumCulled = culled;
        }
        riding = false;
        if (transition === "dismount") {
          // The previous frame still contains the interpolated rig. Start at the
          // same upright endpoint every time, including the final frame.
          root.position.copy(standingPosition);
          root.quaternion.copy(walkingRotation);
          rest.forEach(({ bone }, i) => {
            bone.position.copy(standingBones[i]!.position);
            bone.quaternion.copy(standingBones[i]!.rotation);
          });
          elapsed += dt;
          if (reducedMotion || elapsed >= duration) {
            transition = undefined;
            root.updateWorldMatrix(true, true);
          } else {
            const progress = elapsed / duration;
            // Hold the saddle while the stand lowers, then swing the outside
            // leg over the seat before transferring weight onto the ground.
            blendFrom(seatPosition, seatRotation, seatBones, Math.max(0, (progress - .25) / .75));
            if (progress > .25 && progress < .8) {
              const side = exitSide > 0 ? "R" : "L";
              const lift = Math.sin(Math.PI * (progress - .25) / .55);
              swingFoot.set(exitSide * .05, .50 + lift * .58, -.48).multiplyScalar(GD110_SCALE);
              const goal = root.worldToLocal(frame.localToWorld(swingFoot.clone()));
              limb(`thigh.${side}`, `shin.${side}`, `foot.${side}`, goal, new Vector3(-exitSide * .3, .7, -.6));
            }
          }
        }
        return;
      }
      if (!riding) {
        walkingRotation.copy(root.quaternion);
        exitSide = frame.worldToLocal(root.getWorldPosition(new Vector3())).x >= 0 ? 1 : -1;
        transition = supported && !reducedMotion ? "mount" : undefined;
        elapsed = 0;
        fromPosition.copy(root.position);
        fromRotation.copy(root.quaternion);
        remember(fromBones);
      }
      riding = true;
      root.visible = true;
      if (!supported) return;
      // The cached walking bounds do not include a seated head above this new origin.
      for (const { mesh } of skins) mesh.frustumCulled = false;
      restore();
      // Undo the loader's feet-to-capsule offset by positioning the actual hips.
      root.position.copy(frame.getWorldPosition(new Vector3()));
      if (root.parent) root.parent.worldToLocal(root.position);
      const rotation = frame.getWorldQuaternion(new Quaternion());
      root.quaternion.copy(root.parent ? root.parent.getWorldQuaternion(new Quaternion()).invert().multiply(rotation) : rotation);
      root.updateWorldMatrix(true, true);
      const hips = bones.get("hips")!;
      hips.position.copy(hips.parent!.worldToLocal(world(RIDE_CONTACTS.hips)));
      const steering = frame.getObjectByName("steering")?.rotation.y ?? 0;
      orient(hips, root.getWorldQuaternion(new Quaternion())
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), .30 + Math.abs(steering) * .4)).multiply(orientations.get("hips")!));
      const chest = bones.get("chest")!;
      orient(chest, new Quaternion().setFromAxisAngle(up.clone().applyQuaternion(root.getWorldQuaternion(new Quaternion())), steering * .7)
        .multiply(chest.getWorldQuaternion(new Quaternion())));
      for (const side of ["L", "R"] as const) {
        const sign = side === "L" ? 1 : -1;
        handTarget.copy(side === "L" ? RIDE_CONTACTS.leftHand : RIDE_CONTACTS.rightHand);
        handTarget.sub(STEERING_PIVOT).applyAxisAngle(up, steering).add(STEERING_PIVOT);
        limb(`upper_arm.${side}`, `forearm.${side}`, `hand.${side}`,
          handTarget, new Vector3(sign * .5, .9, .05));
        orient(bones.get(`hand.${side}`)!, root.getWorldQuaternion(new Quaternion())
          .multiply(new Quaternion().setFromAxisAngle(up, steering)).multiply(orientations.get(`hand.${side}`)!));
        limb(`thigh.${side}`, `shin.${side}`, `foot.${side}`,
          side === "L" ? Math.abs(state.speed) < .1 ? RIDE_CONTACTS.plantedFoot : RIDE_CONTACTS.leftFoot : RIDE_CONTACTS.rightFoot,
          new Vector3(sign * .35, .5, .5));
      }
      root.updateWorldMatrix(true, true);
      seatPosition.copy(root.position);
      seatRotation.copy(root.quaternion);
      remember(seatBones);
      if (transition === "mount") {
        elapsed += dt;
        if (reducedMotion || elapsed >= duration) transition = undefined;
        else {
          const progress = elapsed / duration;
          // First approach the saddle; then lift the far leg over it. The
          // final fifth settles onto the seat while the kickstand folds up.
          blendFrom(fromPosition, fromRotation, fromBones, Math.min(1, progress / .8));
          if (progress > .2 && progress < .8) {
            const swing = (progress - .2) / .6;
            swingFoot.set(exitSide * .45 * Math.cos(Math.PI * swing), .2 + .95 * Math.sin(Math.PI * swing), -.48)
              .multiplyScalar(GD110_SCALE);
            const goal = root.worldToLocal(frame.localToWorld(swingFoot.clone()));
            const side = exitSide > 0 ? "R" : "L";
            limb(`thigh.${side}`, `shin.${side}`, `foot.${side}`, goal, new Vector3(exitSide * .3, .8, -.6));
          }
        }
      }
    },
  };
}
