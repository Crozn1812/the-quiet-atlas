import { readFileSync } from "node:fs";
import { AnimationClip, Bone, Box3, Group, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createCharacter } from "../../../src/features/world/character/runtime";
import { createRiderPose, RIDE_CONTACTS } from "../../../src/features/world/character/ride";
import { createLeaningPose } from "../../../src/features/world/character/lean";
import { HEIGHT } from "../../../src/features/world/scene";
import { initialVehicle, mount, step, type VehicleCorridor } from "../../../src/features/vehicle/model";
import { requestDismount, type DismountGround } from "../../../src/features/world/vehicle/dismount";

/** Read the shipped GLB's actual joint hierarchy and bind transforms, without a renderer/decoder. */
function rig() {
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
  const root = new Group(), scene = new Group();
  scene.position.y = -HEIGHT;
  nodes.filter(node => !node.parent).forEach(node => scene.add(node));
  root.add(scene);
  return createCharacter(root, ["Idle", "Walk", "Run"].map(name => new AnimationClip(name, 1, [])));
}

describe("RD-01 leaning pose", () => {
  it.each([false, true])("keeps both hands on the rail through breathing (loader names: %s)", sanitized => {
    const character = rig();
    if (sanitized) character.root.traverse(node => { node.name = node.name.replaceAll(".", ""); });
    const pose = createLeaningPose(character);
    character.root.position.set(3, 2 + HEIGHT, -8);
    const before = character.root.getObjectByName("spine")!.quaternion.clone();
    const forward = new Vector3(0, 0, -1);
    const contacts = [new Vector3(2.73, 3.15, -8.45), new Vector3(3.27, 3.15, -8.45)] as [Vector3, Vector3];
    expect(pose.supported).toBe(true);
    for (const reduced of [false, true]) {
      for (const time of [0, .8, 2, 10]) {
        pose.update(true, forward, contacts, time, reduced);
        for (const [i, side] of ["L", "R"].entries()) {
          const hand = character.root.getObjectByName(sanitized ? `hand${side}` : `hand.${side}`)!.getWorldPosition(new Vector3());
          expect(hand.distanceTo(contacts[i]!), `hand ${side}`).toBeLessThan(.025);
        }
      }
    }
    pose.update(false, forward, contacts, 0, true);
    expect(character.root.getObjectByName("spine")!.quaternion.equals(before)).toBe(true);
    expect(character.root.rotation.y).toBeCloseTo(0);
    character.dispose();
  });
});

describe("D-23 mounted pose", () => {
  it.each([false, true])("lands upright after stepping off a banked bike (reduced motion: %s)", reducedMotion => {
    const character = rig();
    const root = character.root;
    root.traverse(node => { node.name = node.name.replaceAll(".", ""); });
    root.rotation.y = .4;
    const standingRotation = root.quaternion.clone();
    const hips = root.getObjectByName("hips")!;
    const standingHips = hips.quaternion.clone();
    const pose = createRiderPose(character);
    const bike = new Group();
    bike.rotation.set(.12, 1.1, -.18);
    bike.position.set(3, 2, -5);
    expect(pose.supported).toBe(true);
    pose.update({ mode: "ride", speed: 0 }, bike);
    expect(root.quaternion.angleTo(standingRotation)).toBeGreaterThan(.2);
    expect(hips.quaternion.angleTo(standingHips)).toBeGreaterThan(.2);

    const destination = new Vector3(4, 2 + HEIGHT, -5);
    root.position.copy(destination);
    pose.update({ mode: "walk", speed: 0 }, bike, 0, reducedMotion);
    expect(pose.transitioning).toBe(!reducedMotion);
    if (!reducedMotion) {
      pose.update({ mode: "walk", speed: 0 }, bike, .45, false);
      expect(root.quaternion.angleTo(standingRotation)).toBeLessThan(.3);
      pose.update({ mode: "walk", speed: 0 }, bike, .25, false);
    }
    expect(pose.transitioning).toBe(false);
    expect(root.position.distanceTo(destination)).toBeLessThan(1e-6);
    expect(root.quaternion.angleTo(standingRotation)).toBeLessThan(1e-6);
    expect(hips.quaternion.angleTo(standingHips)).toBeLessThan(1e-6);
    character.dispose();
  });
  it("keeps a character without rig bones visible and safely restores walking", () => {
    const character = createCharacter(new Group(), ["Idle", "Walk", "Run"].map(name => new AnimationClip(name, 1, [])));
    const pose = createRiderPose(character);
    expect(pose.supported).toBe(false);
    expect(() => {
      pose.update({ mode: "ride", speed: 0 }, new Group());
      pose.update({ mode: "walk", speed: 0 }, new Group());
    }).not.toThrow();
    expect(character.root.visible).toBe(true);
    character.dispose();
  });
  it.each([0, 5, -1])("places the real rig contacts on the bike at speed %s", speed => {
    const character = rig(), pose = createRiderPose(character), frame = new Group();
    frame.position.set(12, 3, -8);
    frame.rotation.set(0, 1.2, -.15);
    const parent = new Group();
    parent.position.set(-3, 2, 4); parent.rotation.y = -.4;
    parent.add(character.root);
    expect(pose.supported).toBe(true);
    const original = character.root.getObjectByName("thigh.L")!.quaternion.clone();
    const originalRoot = character.root.quaternion.clone();
    const local = (name: string) => frame.worldToLocal(character.root.getObjectByName(name)!.getWorldPosition(new Vector3()));
    for (let i = 0; i < 60; i++) pose.update({ mode: "ride", speed }, frame);
    const contacts = { hips: RIDE_CONTACTS.hips, "hand.L": RIDE_CONTACTS.leftHand, "hand.R": RIDE_CONTACTS.rightHand,
      "foot.L": speed === 0 ? RIDE_CONTACTS.plantedFoot : RIDE_CONTACTS.leftFoot, "foot.R": RIDE_CONTACTS.rightFoot };
    for (const [name, target] of Object.entries(contacts)) {
      expect(local(name).distanceTo(target), name).toBeLessThan(.025);
    }
    // Independent envelopes from mesh.ts's seat, grips and pegs (not pose targets).
    const inside = (name: string, min: [number, number, number], max: [number, number, number]) =>
      expect(new Box3(new Vector3(...min), new Vector3(...max)).containsPoint(local(name)), name).toBe(true);
    inside("hips", [-.04, .77, -.26], [.04, .84, -.16]);
    inside("hand.L", [.29, .98, .31], [.38, 1.05, .40]);
    inside("hand.R", [-.38, .98, .31], [-.29, 1.05, .40]);
    inside("foot.R", [-.23, .37, -.14], [-.14, .43, -.05]);
    if (speed === 0) inside("foot.L", [.31, .08, -.24], [.39, .14, -.16]);
    else inside("foot.L", [.14, .37, -.14], [.23, .43, -.05]);
    expect(local("head").y).toBeGreaterThan(1.25 * .81 + .15);
    expect(local("chest").z).toBeGreaterThan(local("hips").z);
    pose.update({ mode: "walk", speed: 0 }, frame);
    expect(character.root.getObjectByName("thigh.L")!.quaternion.equals(original)).toBe(true);
    expect(character.root.quaternion.equals(originalRoot)).toBe(true);
    character.dispose();
    expect(() => pose.update({ mode: "ride", speed }, frame)).not.toThrow();
  });
});

const corridor: VehicleCorridor = { length: 100, halfWidthAt: () => 3,
  pointAt: s => ({ x: 0, z: s }), tangentAt: () => ({ x: 0, z: 2 }) };
const ground: DismountGround = { surfaceHeight: () => 2, waterLevelAt: () => 0, contains: () => true, clear: () => true };
const riding = () => mount(initialVehicle(corridor, 20), 1).state;

describe("E dismount transition", () => {
  it("brakes to rest, then E returns walk and a capsule position", () => {
    let state = { ...riding(), speed: 3 };
    // Half a second of S reaches rest; releasing S also coasts any tiny reverse velocity to zero.
    state = step(state, corridor, .25, { s: true });
    state = step(state, corridor, .25, { s: true });
    state = step(state, corridor, .25, {});
    expect(state.speed).toBe(0);
    const result = requestDismount(state, corridor, ground, "vi");
    expect(result).toMatchObject({ ok: true, state: { mode: "walk", speed: 0, cruise: false } });
    if (result.ok) expect(result.position.y).toBeCloseTo(2 + HEIGHT + .02);
  });
  it("tries the other side and a nearer standing place before rejecting an edge", () => {
    const result = requestDismount(riding(), corridor, { ...ground,
      contains: p => p.x < 0 && p.x > -1.3 }, "en");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.position.x).toBeCloseTo(-.9);
  });
  it.each(["vi", "en"] as const)("explains movement and unsafe ground in %s", locale => {
    expect(requestDismount({ ...riding(), speed: -1 }, corridor, ground, locale)).toMatchObject({ ok: false, reason: "moving", message: expect.any(String) });
    for (const override of [{ clear: () => false }, { surfaceHeight: () => 0 }, { contains: () => false },
      { surfaceHeight: (x: number) => 2 + x * 2 }]) {
      const result = requestDismount(riding(), corridor, { ...ground, ...override }, locale);
      expect(result).toMatchObject({ ok: false, state: { mode: "ride" }, reason: "unsafe-ground", message: expect.any(String) });
    }
  });
});
