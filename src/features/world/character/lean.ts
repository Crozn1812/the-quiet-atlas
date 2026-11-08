import { Bone, Quaternion, SkinnedMesh, Vector3 } from "three";
import type { Character } from "./runtime";

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
