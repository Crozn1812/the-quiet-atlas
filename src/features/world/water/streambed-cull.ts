import { Frustum, InstancedBufferAttribute, Matrix4, Sphere, type Camera, type InstancedMesh, type Scene } from "three";

export interface StreambedCuller {
  register(owner: Scene): void;
  setLimit(next: number, cull: boolean): void;
  update(camera: Camera): void;
  dispose(): void;
}
const scenes = new WeakMap<Scene, Set<StreambedCuller>>();

/** Compact static stones before renderer uploads buffers. Bounds stay at full
 * reach size so an empty batch can re-enter the view on the next camera turn. */
export function createStreambedCuller(mesh: InstancedMesh): StreambedCuller {
  const attributes = [mesh.instanceMatrix, ...(mesh.instanceColor ? [mesh.instanceColor] : []),
    ...Object.values(mesh.geometry.attributes).filter((a): a is InstancedBufferAttribute => a instanceof InstancedBufferAttribute)];
  const originals = attributes.map(a => a.array.slice());
  const capacity = mesh.count, transform = new Matrix4();
  mesh.geometry.computeBoundingSphere();
  const spheres = Array.from({ length: capacity }, (_, i) => {
    mesh.getMatrixAt(i, transform);
    return new Sphere().copy(mesh.geometry.boundingSphere!).applyMatrix4(transform);
  });
  const frustum = new Frustum(), view = new Matrix4(), lastView = new Matrix4();
  let enabled = false, limit = capacity, lastLimit = -1, count = capacity;
  let indices = Array.from({ length: capacity }, (_, i) => i);
  let scene: Scene | undefined;
  function write(next: number[]) {
    if (next.length !== indices.length || next.some((value, i) => value !== indices[i])) {
      attributes.forEach((attribute, i) => {
        const source = originals[i]!;
        next.forEach((index, slot) => {
          const start = index * attribute.itemSize;
          attribute.array.set(source.subarray(start, start + attribute.itemSize), slot * attribute.itemSize);
        });
        attribute.needsUpdate = true;
      });
      indices = next;
    }
    count = next.length; mesh.count = count;
  }
  const binding = {
    register(owner: Scene) {
      scene = owner;
      let registered = scenes.get(owner);
      if (!registered) { registered = new Set(); scenes.set(owner, registered); }
      registered.add(binding);
    },
    setLimit(next: number, cull: boolean) {
      limit = Math.min(capacity, Math.max(0, next));
      if (!cull && (enabled || limit !== lastLimit)) {
        write(Array.from({ length: limit }, (_, i) => i)); lastLimit = limit;
      }
      if (cull !== enabled) lastLimit = -1;
      enabled = cull;
    },
    update(camera: Camera) {
      if (!enabled) return;
      mesh.updateWorldMatrix(true, false);
      view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld);
      if (lastLimit === limit && view.equals(lastView)) { mesh.count = count; return; }
      lastView.copy(view); lastLimit = limit;
      frustum.setFromProjectionMatrix(view);
      const next: number[] = [];
      for (let i = 0; i < limit; i++) if (frustum.intersectsSphere(spheres[i]!)) next.push(i);
      write(next);
    },
    dispose() { if (scene) scenes.get(scene)?.delete(binding); },
  };
  return binding;
}

/** Called before all color/shadow/post draws; this never changes Low batches. */
export function cullStreambed(scene: Scene, camera: Camera) {
  camera.updateMatrixWorld();
  for (const binding of scenes.get(scene) ?? []) binding.update(camera);
}
