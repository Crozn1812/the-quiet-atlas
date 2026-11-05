import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnimationClip, Bone, BoxGeometry, CapsuleGeometry, Color, Float32BufferAttribute,
  Group, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, MeshToonMaterial,
  NumberKeyframeTrack, Quaternion, Skeleton, SkinnedMesh, Texture, Uint16BufferAttribute, Vector3,
} from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RUN_SPEED, WALK_SPEED } from "../../../src/features/interaction/movement";
import {
  characterWeights, createCharacterAnimator, MAX_TURN_RATE, RUN_STRIDE, WALK_STRIDE,
} from "../../../src/features/world/character/animator";
import { loadCharacter, type Character } from "../../../src/features/world/character/loader";
import { createRampGradient, disposeRampGradients } from "../../../src/features/world/materials/ramp";
import { HALF_HEIGHT, HEIGHT, RADIUS } from "../../../src/features/world/scene";

const characters: Character[] = [];
afterEach(() => {
  for (const character of characters) character.dispose();
  characters.length = 0;
  disposeRampGradients();
  vi.restoreAllMocks();
});

/** Real Three skin and clips, created entirely in memory; no network, renderer or asset file. */
function fixture() {
  const scene = new Group();
  const bone = new Bone();
  bone.name = "hips";
  const geometry = new BoxGeometry();
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(
    Array.from({ length: count * 4 }, (_, i) => i % 4 === 0 ? 1 : 0), 4,
  ));
  const material = new MeshStandardMaterial();
  // Non-8-bit linear values catch accidental sRGB conversion/quantisation.
  material.color.setRGB(0.12345, 0.34567, 0.76543);
  const mesh = new SkinnedMesh<BoxGeometry, Material | Material[]>(geometry, material);
  mesh.add(bone);
  mesh.bind(new Skeleton([bone]));
  scene.add(mesh);
  const animations = [
    new AnimationClip("Idle", 4, [new NumberKeyframeTrack("hips.scale[y]", [0, 2, 4], [1, 1.02, 1])]),
    new AnimationClip("Walk", 1, [new NumberKeyframeTrack("hips.rotation[x]", [0, 0.5, 1], [0, 0.25, 0])]),
    new AnimationClip("Run", 0.7, [new NumberKeyframeTrack("hips.rotation[x]", [0, 0.35, 0.7], [0, 0.5, 0])]),
  ];
  const gltf = { scene, scenes: [scene], animations, cameras: [], asset: { version: "2.0" } } as unknown as GLTF;
  return { gltf, mesh, bone, material, geometry };
}

async function loaded() {
  const asset = fixture();
  const load = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValue(asset.gltf);
  const character = await loadCharacter("/world/character.glb");
  characters.push(character);
  return { ...asset, character, load };
}

function settle(animator: ReturnType<typeof createCharacterAnimator>, speed: number, grounded = true) {
  for (let frame = 0; frame < 240; frame++) animator.update(1 / 60, speed, grounded);
}

function weights(character: Character) {
  return Object.values(character.actions).map((action) => action.getEffectiveWeight());
}

describe("world character loading and ownership", () => {
  it("configures the bundled Meshopt decoder, loads named clips and enables skin shadows", async () => {
    const decoder = vi.spyOn(GLTFLoader.prototype, "setMeshoptDecoder");
    const { character, gltf, mesh, load } = await loaded();
    expect(decoder).toHaveBeenCalledWith(MeshoptDecoder);
    expect(load).toHaveBeenCalledWith("/world/character.glb");
    expect(character.root.children).toContain(gltf.scene);
    expect(gltf.scene.position.y).toBe(-HEIGHT);
    expect(character.mixer.getRoot()).toBe(character.root);
    expect(Object.values(character.actions).map((action) => action.getClip().name)).toEqual(["Idle", "Walk", "Run"]);
    expect(mesh.castShadow).toBe(true);
    expect(weights(character)).toEqual([1, 0, 0]);
  });

  it("replaces shared PBR materials and material arrays with ramps, preserving exact linear colours", async () => {
    const asset = fixture();
    const original = asset.material;
    original.opacity = 0.8;
    original.transparent = true;
    const second = new MeshStandardMaterial({ color: 0x889966 });
    asset.mesh.material = [original, second];
    const shared = new Mesh(asset.geometry, original);
    asset.gltf.scene.add(shared);
    const texture = new Texture();
    original.map = original.normalMap = second.roughnessMap = texture;
    const disposeOriginal = vi.spyOn(original, "dispose");
    const disposeSecond = vi.spyOn(second, "dispose");
    const disposeTexture = vi.spyOn(texture, "dispose");
    vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValue(asset.gltf);
    const character = await loadCharacter("/world/character.glb");
    characters.push(character);
    const materials = asset.mesh.material as MeshToonMaterial[];
    expect(materials).toHaveLength(2);
    for (const [i, source] of [original, second].entries()) {
      expect(materials[i]).toBeInstanceOf(MeshToonMaterial);
      expect(materials[i]!.color).toEqual(source.color);
      expect(materials[i]!.gradientMap).toBe(createRampGradient());
    }
    expect(materials[0]!.opacity).toBe(0.8);
    expect(materials[0]!.transparent).toBe(true);
    expect(shared.material).toBe(materials[0]);
    expect(shared.castShadow).toBe(true);
    expect(disposeOriginal).toHaveBeenCalledTimes(1);
    expect(disposeSecond).toHaveBeenCalledTimes(1);
    expect(disposeTexture).toHaveBeenCalledTimes(1);
  });

  it("uses the original capsule on loader errors, absent URLs or missing clips; warns only once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const load = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockRejectedValue(new Error("load failed"));
    const failed = await loadCharacter("/world/missing.glb");
    const absent = await loadCharacter();
    const blank = await loadCharacter("  ");
    const asset = fixture();
    asset.gltf.animations.pop();
    const disposeGeometry = vi.spyOn(asset.geometry, "dispose");
    const disposeSkeleton = vi.spyOn(asset.mesh.skeleton, "dispose");
    load.mockResolvedValue(asset.gltf);
    const invalid = await loadCharacter("/world/incomplete.glb");
    characters.push(failed, absent, blank, invalid);
    expect(load).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    for (const character of [failed, absent, blank, invalid]) {
      expect(character.root).toBeInstanceOf(Mesh);
      const root = character.root as Mesh<CapsuleGeometry, MeshBasicMaterial>;
      expect(root.geometry).toBeInstanceOf(CapsuleGeometry);
      expect(root.geometry.parameters.radius).toBe(RADIUS);
      expect(root.geometry.parameters.height).toBe(HALF_HEIGHT * 2);
      expect(root.material.color).toEqual(new Color(0xcc754e));
      expect(() => createCharacterAnimator(character).update(1 / 60, WALK_SPEED, true)).not.toThrow();
    }
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeSkeleton).toHaveBeenCalledTimes(1);
  });

  it("disposes geometry, materials, skeleton and mixer bindings once without disposing the shared gradient", async () => {
    const { character, mesh, geometry, bone } = await loaded();
    const shared = new SkinnedMesh(geometry, mesh.material);
    shared.bind(mesh.skeleton);
    character.root.add(shared);
    const parent = new Group();
    parent.add(character.root);
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(mesh.material as Material, "dispose");
    const skeletonDispose = vi.spyOn(mesh.skeleton, "dispose");
    const gradientDispose = vi.spyOn(createRampGradient(), "dispose");
    const stop = vi.spyOn(character.mixer, "stopAllAction");
    const uncache = vi.spyOn(character.mixer, "uncacheRoot");
    const animator = createCharacterAnimator(character);
    animator.update(0.25, 0, true);
    expect(bone.scale.y).toBeGreaterThan(1);
    character.dispose();
    character.dispose();
    expect(character.disposed).toBe(true);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(skeletonDispose).toHaveBeenCalledTimes(1);
    expect(gradientDispose).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(uncache).toHaveBeenCalledExactlyOnceWith(character.root);
    expect(character.mixer.existingAction(character.actions.idle.getClip(), character.root)).toBeNull();
    expect(character.root.parent).toBeNull();
    expect(character.root.children).toHaveLength(0);
    expect(bone.scale.y).toBe(1);
    expect(() => animator.update(1, RUN_SPEED, true)).not.toThrow();
  });
});

describe("world character animation", () => {
  it.each([
    [0, [1, 0, 0]], [WALK_SPEED, [0, 1, 0]], [RUN_SPEED, [0, 0, 1]],
    [RUN_SPEED * 2, [0, 0, 1]], [WALK_SPEED / 2, [0.5, 0.5, 0]],
    [(WALK_SPEED + RUN_SPEED) / 2, [0, 0.5, 0.5]],
  ])("settles at the expected normalised blend at %s m/s", async (speed, expected) => {
    const { character } = await loaded();
    const animator = createCharacterAnimator(character);
    expect(Object.values(characterWeights(speed))).toEqual(expected);
    settle(animator, speed);
    weights(character).forEach((weight, i) => expect(weight).toBeCloseTo(expected[i]!, 8));
    expect(weights(character).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
  });

  it("smooths transitions in simulation time, with sum 1 on every frame", async () => {
    const { character } = await loaded();
    const animator = createCharacterAnimator(character);
    animator.update(1 / 60, RUN_SPEED, true);
    expect(character.actions.run.getEffectiveWeight()).toBeGreaterThan(0);
    expect(character.actions.run.getEffectiveWeight()).toBeLessThan(1);
    for (const speed of [RUN_SPEED, WALK_SPEED, 0, 4, 1]) {
      for (let i = 0; i < 30; i++) {
        animator.update(1 / 60, speed, true);
        const values = weights(character);
        expect(values.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
        for (const value of values) expect(value).toBeGreaterThanOrEqual(0);
      }
    }
    const other = await loaded();
    const coarse = createCharacterAnimator(other.character);
    const fine = await loaded();
    const fineAnimator = createCharacterAnimator(fine.character);
    coarse.update(1, RUN_SPEED, true);
    for (let i = 0; i < 60; i++) fineAnimator.update(1 / 60, RUN_SPEED, true);
    weights(other.character).forEach((value, i) => expect(value).toBeCloseTo(weights(fine.character)[i]!, 12));
  });

  it("scales walk and run cadence with speed and clip duration; freezes gait in air", async () => {
    const { character } = await loaded();
    const animator = createCharacterAnimator(character, { runStride: RUN_STRIDE });
    animator.update(0.1, 1, true);
    const walkScale = character.actions.walk.timeScale;
    const runScale = character.actions.run.timeScale;
    expect(walkScale).toBeCloseTo(character.actions.walk.getClip().duration / WALK_STRIDE);
    expect(runScale).toBeCloseTo(character.actions.run.getClip().duration / RUN_STRIDE);
    animator.update(0.1, 2, true);
    expect(character.actions.walk.timeScale).toBeCloseTo(walkScale * 2);
    expect(character.actions.run.timeScale).toBeCloseTo(runScale * 2);
    // One authored walk cycle covers exactly 0.7m at either world speed.
    for (const speed of [WALK_SPEED, RUN_SPEED]) {
      animator.update(0.1, speed, true);
      expect(speed * character.actions.walk.getClip().duration / character.actions.walk.timeScale).toBeCloseTo(0.7);
    }
    settle(animator, RUN_SPEED, false);
    expect(character.actions.walk.timeScale).toBe(0);
    expect(character.actions.run.timeScale).toBe(0);
    expect(character.actions.idle.timeScale).toBe(0);
    expect(character.actions.idle.getEffectiveWeight()).toBeCloseTo(1);
    expect(characterWeights(RUN_SPEED, false)).toEqual({ idle: 1, walk: 0, run: 0 });
  });

  it("suppresses idle breathing with reduced motion and still animates locomotion", async () => {
    const { character, bone } = await loaded();
    const animator = createCharacterAnimator(character);
    animator.update(0.5, 0, true);
    expect(bone.scale.y).toBeGreaterThan(1);
    animator.setReducedMotion(true);
    animator.update(0.1, 0, true);
    expect(character.actions.idle.time).toBe(0);
    expect(bone.scale.y).toBe(1);
    settle(animator, WALK_SPEED);
    expect(character.actions.walk.time).toBeGreaterThan(0);
    expect(character.actions.walk.getEffectiveWeight()).toBeCloseTo(1);
    expect(bone.rotation.x).not.toBe(0);
    settle(animator, RUN_SPEED);
    expect(character.actions.run.time).toBeGreaterThan(0);
    expect(character.actions.run.getEffectiveWeight()).toBeCloseTo(1);
    animator.setReducedMotion(false);
    settle(animator, 0);
    animator.update(0.5, 0, true);
    expect(bone.scale.y).toBeGreaterThan(1);
  });

  it("turns toward actual motion along the shortest arc, smoothly and at most 540 degrees/s", async () => {
    const { character } = await loaded();
    const animator = createCharacterAnimator(character);
    const target = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
    let previousError = Math.PI;
    for (let frame = 0; frame < 120; frame++) {
      const before = character.root.quaternion.clone();
      character.root.position.z -= WALK_SPEED / 60;
      animator.update(1 / 60, WALK_SPEED, true);
      const change = before.angleTo(character.root.quaternion);
      expect(change).toBeLessThanOrEqual(MAX_TURN_RATE / 60 + 1e-10);
      const error = character.root.quaternion.angleTo(target);
      expect(error).toBeLessThanOrEqual(previousError + 1e-10);
      if (frame === 0) expect(error).toBeGreaterThan(0);
      previousError = error;
    }
    expect(previousError).toBeLessThan(1e-6);
    const before = character.root.quaternion.clone();
    animator.update(1, 0, true);
    expect(character.root.quaternion.equals(before)).toBe(true);
    character.root.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI - 0.01);
    character.root.position.x -= 0.001;
    character.root.position.z -= 0.1;
    const wrapBefore = character.root.quaternion.clone();
    animator.update(1 / 60, WALK_SPEED, true);
    expect(wrapBefore.angleTo(character.root.quaternion)).toBeLessThan(0.02);
  });

  it("handles invalid inputs and paused simulation without advancing the mixer", async () => {
    const { character } = await loaded();
    const animator = createCharacterAnimator(character);
    for (const dt of [0, -1, NaN, Infinity]) animator.update(dt, RUN_SPEED, true);
    expect(character.mixer.time).toBe(0);
    for (const speed of [-1, NaN, Infinity]) {
      animator.update(0.1, speed, true);
      expect(weights(character)).toEqual([1, 0, 0]);
      expect(character.actions.walk.timeScale).toBe(0);
      expect(characterWeights(speed)).toEqual({ idle: 1, walk: 0, run: 0 });
    }
    expect(() => createCharacterAnimator(character, { runStride: 0 })).toThrow(RangeError);
  });
});
