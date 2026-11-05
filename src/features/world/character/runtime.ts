import {
  AnimationClip, AnimationMixer, BufferGeometry, Material, Mesh, Object3D,
  Skeleton, SkinnedMesh, Texture, type AnimationAction,
} from "three";

export interface Character {
  /** Controller-centred pivot; the authored GLB faces +Z with its feet at Y=0. */
  root: Object3D;
  mixer: AnimationMixer;
  actions: { idle: AnimationAction; walk: AnimationAction; run: AnimationAction };
  readonly disposed: boolean;
  dispose(): void;
}

export function disposeCharacterMaterials(materials: Iterable<Material>): void {
  const textures = new Set<Texture>();
  for (const material of new Set(materials)) {
    for (const [key, value] of Object.entries(material)) {
      if (key !== "gradientMap" && value instanceof Texture) textures.add(value);
    }
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
}

/** Character assets own their resources. Never dispose the shared world ramp gradient here. */
export function disposeCharacterTree(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const skeletons = new Set<Skeleton>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
    }
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
  });
  for (const geometry of geometries) geometry.dispose();
  disposeCharacterMaterials(materials);
  for (const skeleton of skeletons) skeleton.dispose();
  root.removeFromParent();
  root.clear();
}

export function createCharacter(root: Object3D, clips: AnimationClip[]): Character {
  function findClip(name: string) {
    const clip = clips.find((clip) => clip.name.toLowerCase() === name);
    if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0) {
      throw new Error(`Character requires a positive-duration ${name} clip.`);
    }
    return clip;
  }
  // Validate all clips before activating any actions/bindings.
  const idle = findClip("idle"), walk = findClip("walk"), run = findClip("run");
  const mixer = new AnimationMixer(root);
  const actions = { idle: mixer.clipAction(idle), walk: mixer.clipAction(walk), run: mixer.clipAction(run) };
  for (const [name, action] of Object.entries(actions)) {
    action.setEffectiveWeight(name === "idle" ? 1 : 0).play();
  }
  let disposed = false;
  return {
    root, mixer, actions,
    get disposed() { return disposed; },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      disposeCharacterTree(root);
    },
  };
}
