import { BoxGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, PerspectiveCamera, Scene } from "three";
import { expect, it } from "vitest";
import { createStreambedCuller, cullStreambed } from "../../../src/features/world/water/streambed-cull";

it("compacts all stone attributes together, restores Low and finds stones after a camera turn", () => {
  const scene = new Scene(), camera = new PerspectiveCamera(60, 1, 0.1, 100);
  const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 3);
  mesh.geometry.setAttribute("bedWet", new InstancedBufferAttribute(new Float32Array([10, 11, 20, 21, 30, 31]), 2));
  for (let i = 0; i < 3; i++) mesh.setMatrixAt(i, new Matrix4().makeTranslation((i - 1) * 15, 0, -10));
  mesh.position.x = 4; scene.add(mesh); camera.position.x = 4;
  const original = mesh.instanceMatrix.array.slice(), binding = createStreambedCuller(mesh);
  binding.register(scene); binding.setLimit(3, true);
  try {
    cullStreambed(scene, camera);
    expect(mesh.count).toBe(1);
    expect(mesh.instanceMatrix.array.slice(0, 16)).toEqual(original.slice(16, 32));
    expect(mesh.geometry.getAttribute("bedWet").getX(0)).toBe(20);
    const version = mesh.instanceMatrix.version;
    mesh.count = 3; cullStreambed(scene, camera);
    expect(mesh.count).toBe(1); expect(mesh.instanceMatrix.version).toBe(version);
    camera.lookAt(-11, 0, -10); cullStreambed(scene, camera);
    expect(mesh.count).toBeGreaterThan(0);
    expect(mesh.geometry.getAttribute("bedWet").getX(0)).toBe(10);
    binding.setLimit(1, false);
    expect(mesh.count).toBe(1); expect(mesh.instanceMatrix.array.slice(0, 16)).toEqual(original.slice(0, 16));
    cullStreambed(scene, camera);
    expect(mesh.instanceMatrix.array.slice(0, 16)).toEqual(original.slice(0, 16));
    binding.setLimit(3, true); camera.lookAt(4, 0, -10); cullStreambed(scene, camera);
    expect(mesh.geometry.getAttribute("bedWet").getX(0)).toBe(20);
    binding.dispose(); camera.lookAt(19, 0, -10); cullStreambed(scene, camera);
    expect(mesh.geometry.getAttribute("bedWet").getX(0)).toBe(20);
  } finally { binding.dispose(); mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); }
});

it("retains stones intersecting a frustum edge and restores an empty view", () => {
  const scene = new Scene(), camera = new PerspectiveCamera(60, 1, 0.1, 100);
  const mesh = new InstancedMesh(new BoxGeometry(4, 4, 4), new MeshBasicMaterial(), 1);
  mesh.setMatrixAt(0, new Matrix4().makeTranslation(7, 0, -10)); scene.add(mesh);
  const binding = createStreambedCuller(mesh); binding.register(scene); binding.setLimit(1, true);
  try {
    cullStreambed(scene, camera); expect(mesh.count).toBe(1);
    camera.lookAt(0, 0, 10); cullStreambed(scene, camera); expect(mesh.count).toBe(0);
    camera.lookAt(0, 0, -10); cullStreambed(scene, camera); expect(mesh.count).toBe(1);
  } finally { binding.dispose(); mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); }
});
