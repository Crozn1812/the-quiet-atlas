import { readFileSync } from "node:fs";
import { AnimationClip, Bone, Group } from "three";
import { describe, expect, it } from "vitest";
import { VEHICLE_TRANSITION_SECONDS } from "../../../src/features/vehicle/model";
import { createRiderPose } from "../../../src/features/world/character/ride";
import { createCharacter } from "../../../src/features/world/character/runtime";
import { vehicleAnimationDelta } from "../../../src/features/world/vehicle/transition";
import { createVehicleView } from "../../../src/features/world/vehicle/view";
import { initialVehicle } from "../../../src/features/vehicle/model";

// Exercise the shipped rig and real pose, without a renderer or asset decoder.
function characterRig() {
  const buffer = readFileSync(new URL("../../../public/world/start/character-duy.glb", import.meta.url));
  const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString()) as {
    nodes: { name: string; translation?: [number, number, number]; rotation?: [number, number, number, number]; children?: number[] }[];
    skins: { joints: number[] }[];
  };
  const joints = new Set(json.skins[0]!.joints);
  const nodes = json.nodes.map((node, index) => {
    const object = joints.has(index) ? new Bone() : new Group();
    object.name = node.name;
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    return object;
  });
  json.nodes.forEach((node, index) => node.children?.forEach(child => nodes[index]!.add(nodes[child]!)));
  const root = new Group();
  nodes.filter(node => !node.parent).forEach(node => root.add(node));
  return createCharacter(root, ["Idle", "Walk", "Run"].map(name => new AnimationClip(name, 1, [])));
}

describe("vehicle transition time", () => {
  it.each([60, 2])("finishes mount and dismount at %s FPS within one frame of their duration", fps => {
    const character = characterRig(), pose = createRiderPose(character);
    const view = createVehicleView({ surfaceHeight: () => 0 });
    const parked = initialVehicle({ x: 0, z: 20 }), riding = { ...parked, mode: "ride" as const };
    try {
      expect(pose.supported).toBe(true);
      view.update(parked, 0);
      pose.update(parked, view.riderFrame, 0, false);
      for (const state of [riding, parked]) {
        view.update(state, 0);
        pose.update(state, view.riderFrame, 0, false);
        expect(pose.transitioning).toBe(true);
        const frames = Math.ceil(VEHICLE_TRANSITION_SECONDS * fps);
        for (let frame = 1; frame <= frames; frame++) {
          const dt = vehicleAnimationDelta(1 / fps, true);
          view.update(state, dt);
          pose.update(state, view.riderFrame, dt, false);
          expect(pose.transitioning, `frame ${frame} of ${frames}`).toBe(frame < frames);
        }
        const stand = view.group.getObjectByName("kickstand")!;
        expect(stand.rotation.x).toBeCloseTo(state.mode === "ride" ? 1.5 : 0);
        if (state.mode === "walk") expect(pose.snapshot(view.riderFrame).rootUp).toBeCloseTo(1);
      }
    } finally { character.dispose(); view.dispose(); }
  });

  it("freezes a transition while paused, rejects invalid time and finishes on a long active frame", () => {
    const character = characterRig(), pose = createRiderPose(character), frame = new Group();
    const state = { mode: "ride" as const, speed: 0 };
    try {
      pose.update(state, frame, 0, false);
      pose.update(state, frame, vehicleAnimationDelta(.5, true), false);
      expect(pose.transitioning).toBe(true);
      for (const [elapsed, active] of [[600, false], [-1, true], [NaN, true], [Infinity, true]] as const) {
        const before = character.root.position.clone();
        const dt = vehicleAnimationDelta(elapsed, active);
        expect(dt).toBe(0);
        pose.update(state, frame, dt, false);
        expect(pose.transitioning).toBe(true);
        expect(character.root.position.distanceTo(before)).toBeLessThan(1e-8);
      }
      const dt = vehicleAnimationDelta(600, true);
      expect(dt).toBe(VEHICLE_TRANSITION_SECONDS);
      pose.update(state, frame, dt, false);
      expect(pose.transitioning).toBe(false);
    } finally { character.dispose(); }
  });
});
