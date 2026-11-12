import { Bone, Object3D, Quaternion, SkinnedMesh, Vector3 } from "three";
import { HEIGHT } from "../scene";
import type { Character } from "./runtime";

/** Root-local contact points (m) while seated on a 0.45 m bench; root is at ground + HEIGHT. */
export const SIT_CONTACTS = {
  hips: new Vector3(0, 0.48 - HEIGHT, -0.04),
  leftHand: new Vector3(0.16, 0.53 - HEIGHT, 0.18),
  rightHand: new Vector3(-0.16, 0.53 - HEIGHT, 0.18),
  leftFoot: new Vector3(0.13, 0.106 - HEIGHT, 0.36),
  rightFoot: new Vector3(-0.13, 0.106 - HEIGHT, 0.34),
} as const;

/** Authored metre rig, +Z forward. Apply AFTER mixer.update; hands stay fixed while chest breathes. */
export function createLeaningPose(character: Character) {
  const root = character.root;
  const bones = new Map<string, Bone>();
  const skins: { mesh: SkinnedMesh; culled: boolean }[] = [];
  root.traverse(object => {
    if (object instanceof Bone) {
      // GLTFLoader removes dots from node names for animation bindings.
      const name = object.name.replace(/(upper_arm|forearm|hand)([LR])$/, "$1.$2");
      bones.set(name, object);
    }
    if (object instanceof SkinnedMesh) skins.push({ mesh: object, culled: object.frustumCulled });
  });
  const rest = [...bones.values()].map(bone => ({ bone, rotation: bone.quaternion.clone(), position: bone.position.clone() }));
  const supported = ["spine", "chest", ...["L", "R"].flatMap(side => ["upper_arm", "forearm", "hand"].map(name => `${name}.${side}`))]
    .every(name => bones.has(name));
  const previousRotation = root.quaternion.clone();
  let active = false;
  const restore = () => rest.forEach(({ bone, rotation, position }) => {
    bone.quaternion.copy(rotation); bone.position.copy(position);
  });
  function aim(bone: Bone, child: Bone, target: Vector3) {
    const origin = bone.getWorldPosition(new Vector3());
    const delta = new Quaternion().setFromUnitVectors(child.getWorldPosition(new Vector3()).sub(origin).normalize(), target.clone().sub(origin).normalize());
    const rotation = delta.multiply(bone.getWorldQuaternion(new Quaternion()));
    bone.quaternion.copy(bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(rotation));
    bone.updateWorldMatrix(false, true);
  }
  return {
    supported,
    update(on: boolean, forward: Vector3, contacts: readonly [Vector3, Vector3], time: number, reducedMotion: boolean) {
      if (character.disposed) return;
      if (!on) {
        if (active) {
          restore(); character.mixer.update(0); root.quaternion.copy(previousRotation);
          for (const { mesh, culled } of skins) mesh.frustumCulled = culled;
        }
        active = false; return;
      }
      if (!active) previousRotation.copy(root.quaternion);
      active = true;
      root.rotation.set(0, Math.atan2(forward.x, forward.z), 0);
      if (!supported) return;
      restore();
      for (const { mesh } of skins) mesh.frustumCulled = false;
      bones.get("spine")!.rotateX(.10 + (reducedMotion ? 0 : Math.sin(time * 1.5) * .006));
      bones.get("chest")!.rotateX(.08);
      root.updateWorldMatrix(true, true);
      for (const [i, side] of ["L", "R"].entries()) {
        const upper = bones.get(`upper_arm.${side}`)!, lower = bones.get(`forearm.${side}`)!, hand = bones.get(`hand.${side}`)!;
        const goal = contacts[i]!;
        const origin = upper.getWorldPosition(new Vector3());
        const l1 = origin.distanceTo(lower.getWorldPosition(new Vector3()));
        const l2 = lower.getWorldPosition(new Vector3()).distanceTo(hand.getWorldPosition(new Vector3()));
        const direction = goal.clone().sub(origin);
        const distance = Math.max(1e-6, Math.min(direction.length(), l1 + l2 - 1e-6));
        direction.normalize();
        const bend = new Vector3(forward.z * (i ? -1 : 1), -.8, -forward.x * (i ? -1 : 1));
        bend.addScaledVector(direction, -bend.dot(direction)).normalize();
        const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
        const elbow = origin.clone().addScaledVector(direction, along)
          .addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
        aim(upper, lower, elbow); aim(lower, hand, goal);
        // Palm down, fingers forward: orient from the restored authored wrist.
        const worldRotation = root.getWorldQuaternion(new Quaternion());
        hand.quaternion.copy(hand.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(worldRotation));
        hand.updateWorldMatrix(false, true);
      }
    },
  };
}

/** Seated bench pose (HZ-02): reuses the authored rig like createRiderPose; walking restores on exit. */
export function createSittingPose(character: Character) {
  const root = character.root;
  const bones = new Map<string, Bone>();
  const skins: { mesh: SkinnedMesh; culled: boolean }[] = [];
  root.traverse(object => {
    if (object instanceof Bone) {
      const name = object.name.replace(/^(upper_arm|forearm|hand|thigh|shin|foot)([LR])$/, "$1.$2");
      bones.set(name, object);
    }
    if (object instanceof SkinnedMesh) skins.push({ mesh: object, culled: object.frustumCulled });
  });
  const rest = [...bones.values()].map(bone => ({ bone, position: bone.position.clone(), rotation: bone.quaternion.clone(), scale: bone.scale.clone() }));
  root.updateWorldMatrix(true, true);
  const rootInverse = root.getWorldQuaternion(new Quaternion()).invert();
  const orientations = new Map([...bones].map(([name, bone]) => [name, rootInverse.clone().multiply(bone.getWorldQuaternion(new Quaternion()))]));
  const required = ["hips", "spine", "chest", "head", ...["L", "R"].flatMap(side =>
    ["upper_arm", "forearm", "hand", "thigh", "shin", "foot"].map(name => `${name}.${side}`))];
  const supported = required.every(name => bones.has(name));
  const previousRotation = root.quaternion.clone();
  let active = false;
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
    orient(end, root.getWorldQuaternion(new Quaternion()).multiply(orientations.get(c)!));
  }
  function restore() {
    for (const { bone, position, rotation, scale } of rest) {
      bone.position.copy(position); bone.quaternion.copy(rotation); bone.scale.copy(scale);
    }
  }
  return {
    supported,
    update(on: boolean, forward: Vector3, time: number, reducedMotion: boolean) {
      if (character.disposed) return;
      if (!on) {
        if (active) {
          restore(); character.mixer.update(0); root.quaternion.copy(previousRotation);
          for (const { mesh, culled } of skins) mesh.frustumCulled = culled;
        }
        active = false; return;
      }
      if (!active) previousRotation.copy(root.quaternion);
      active = true;
      root.rotation.set(0, Math.atan2(forward.x, forward.z), 0);
      if (!supported) return;
      for (const { mesh } of skins) mesh.frustumCulled = false;
      restore();
      root.updateWorldMatrix(true, true);
      const hips = bones.get("hips")!;
      hips.position.copy(hips.parent!.worldToLocal(world(SIT_CONTACTS.hips)));
      orient(hips, root.getWorldQuaternion(new Quaternion())
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.06)).multiply(orientations.get("hips")!));
      bones.get("spine")!.rotateX(-0.04 + (reducedMotion ? 0 : Math.sin(time * 1.5) * 0.006));
      bones.get("chest")!.rotateX(0.06);
      root.updateWorldMatrix(true, true);
      for (const side of ["L", "R"] as const) {
        const sign = side === "L" ? 1 : -1;
        limb(`upper_arm.${side}`, `forearm.${side}`, `hand.${side}`,
          side === "L" ? SIT_CONTACTS.leftHand : SIT_CONTACTS.rightHand, new Vector3(sign * 0.38, 0.62 - HEIGHT, -0.15));
        limb(`thigh.${side}`, `shin.${side}`, `foot.${side}`,
          side === "L" ? SIT_CONTACTS.leftFoot : SIT_CONTACTS.rightFoot, new Vector3(sign * 0.14, 0.55 - HEIGHT, 0.45));
      }
      root.updateWorldMatrix(true, true);
    },
  };
}
