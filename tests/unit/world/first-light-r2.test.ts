import { expect, it, vi } from "vitest";
import { Box3, Matrix4, Mesh, PerspectiveCamera, Ray, Raycaster, ShaderLib, Vector2, Vector3, type MeshBasicMaterial, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { createFirstLightFish } from "../../../src/features/world/water/fish";
import { riverPointAt } from "../../../src/features/world/layout/river";
import { waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";
import { surfaceHeight } from "../../../src/features/world/scene/compose";
import { nearestRiver } from "../../../src/features/world/terrain/samples";
import { createDenseFirstLightTree, createFirstLightGrove, createFirstLightTree } from "../../../src/features/world/foliage/first-light-grove";
import { createForestCeiling } from "../../../src/features/world/foliage/forest-ceiling";
import { createSpring } from "../../../src/features/world/terrain/spring";
import { worldSpawn } from "../../../src/features/world/scene/compose";

it("leaves six or more soft shafts in the spawn frame after excluding cliff and sky", () => {
  const spring = createSpring(), grove = createFirstLightGrove(surfaceHeight, []);
  try {
    const mesh = grove.group.getObjectByName("first-light-dawn-rays") as Mesh<import("three").BufferGeometry, MeshBasicMaterial>;
    const shader = { ...ShaderLib.basic, uniforms: {} } as WebGLProgramParametersWithUniforms;
    mesh.material.onBeforeCompile(shader, {} as WebGLRenderer);
    const minima = shader.uniforms.dawnCliffMin!.value as Vector3[];
    const maxima = shader.uniforms.dawnCliffMax!.value as Vector3[];
    const boxes = minima.map((min, i) => new Box3(min, maxima[i]!));
    const target = worldSpawn(), yaw = Math.atan2(7, 9), pitch = Math.PI / 10;
    const camera = new PerspectiveCamera(55, 1600 / 900, 0.1, 100);
    camera.position.copy(target).addScaledVector(new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)), 12);
    camera.lookAt(target); camera.updateMatrixWorld(true);
    const positions = mesh.geometry.getAttribute("position"), ray = new Ray(), hit = new Vector3();
    const visible: number[] = [];
    for (let shaft = 0; shaft < 8; shaft++) {
      let open = false;
      for (let row = 1; row < 8; row++) {
        const point = new Vector3().fromBufferAttribute(positions, shaft * 81 + row * 9 + 4);
        const projected = point.clone().project(camera);
        ray.set(camera.position, point.clone().sub(camera.position).normalize());
        if (Math.abs(projected.x) < 0.98 && Math.abs(projected.y) < 0.98 && ray.direction.y < 0
          && !boxes.some(box => ray.intersectBox(box, hit))) open = true;
      }
      if (open) visible.push(shaft);
    }
    expect(mesh.material.opacity).toBeLessThanOrEqual(0.18);
    expect(visible.length, `Visible shafts: ${visible.join(", ")}`).toBeGreaterThanOrEqual(6);
    console.info(`FL-03 shafts outside cliff/sky silhouette: ${visible.length}/8`);
  } finally { spring.dispose(); grove.dispose(); }
});

it("keeps static fish origins submerged above the rendered bed and disposes once", () => {
  const fish = createFirstLightFish();
  const disposals = [vi.spyOn(fish.mesh, "dispose"), vi.spyOn(fish.mesh.geometry, "dispose"), vi.spyOn(fish.mesh.material, "dispose")];
  const matrix = new Matrix4(), point = new Vector3();
  for (let frame = 0; frame < 120; frame++) {
    fish.update(0.5, false);
    for (let i = 0; i < fish.mesh.count; i++) {
      fish.mesh.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix);
      expect(nearestRiver(point.x, point.z).distance).toBeLessThan(0.7);
      expect(waterLevelAt(point.z) - point.y).toBeGreaterThan(0.14);
      expect(point.y - surfaceHeight(point.x, point.z)).toBeGreaterThan(0.02);
      expect(fish.mesh.boundingSphere!.containsPoint(point)).toBe(true);
    }
  }
  const before = fish.mesh.instanceMatrix.array.slice();
  fish.update(10, true); expect(fish.mesh.instanceMatrix.array).toEqual(before);
  fish.update(0, false); expect(fish.mesh.instanceMatrix.array).toEqual(before);
  fish.dispose(); fish.dispose(); disposals.forEach(spy => expect(spy).toHaveBeenCalledOnce());
});

it("makes the opening channel shallow on the analytic and rendered collider surface", () => {
  for (const t of [0.015, 0.025, 0.04, 0.055]) {
    const p = riverPointAt(t), water = waterLevelAt(p.z);
    expect(water - worldHeight(p.x, p.z)).toBeCloseTo(0.42, 2);
    expect(water - surfaceHeight(p.x, p.z)).toBeGreaterThan(0.2);
    expect(water - surfaceHeight(p.x, p.z)).toBeLessThan(0.65);
  }
});

it("adds branching and overlapping crowns within the existing instanced tree budget", () => {
  for (let variant = 0; variant < 3; variant++) {
    const old = createFirstLightTree(variant), dense = createDenseFirstLightTree(variant);
    const oldSize = old.boundingBox!.getSize(new Vector3()), size = dense.boundingBox!.getSize(new Vector3());
    expect(size.x).toBeGreaterThan(oldSize.x * 1.1);
    expect(dense.getAttribute("position").count / 3).toBeLessThan(350);
    console.info(`FL-03 tree ${variant}: ${old.getAttribute("position").count / 3} -> ${dense.getAttribute("position").count / 3} triangles; 3 shared draws`);
    old.dispose(); dense.dispose();
  }
});

it("keeps the forest roof above the camera and releases its single batch cleanly", () => {
  const ceiling = createForestCeiling(surfaceHeight);
  const releases = [vi.spyOn(ceiling.mesh, "dispose"), vi.spyOn(ceiling.mesh.geometry, "dispose"), vi.spyOn(ceiling.mesh.material, "dispose")];
  const bounds = ceiling.mesh.geometry;
  bounds.computeBoundingBox();
  for (const site of ceiling.sites) {
    const bottom = site.position.y + bounds.boundingBox!.min.y * site.scale.y;
    expect(bottom - surfaceHeight(site.position.x, site.position.z)).toBeGreaterThan(7.5);
  }
  expect(ceiling.group.children).toHaveLength(1);
  expect(ceiling.mesh.count * bounds.getAttribute("position").count / 3).toBeLessThan(20000);
  ceiling.setQuality("Low"); expect(ceiling.mesh.visible).toBe(false);
  ceiling.setQuality("High"); expect(ceiling.mesh.visible).toBe(true);
  ceiling.dispose(); ceiling.dispose(); releases.forEach(release => expect(release).toHaveBeenCalledOnce());
});

it("places the layered cliff across at least 60% of the actual 1600x900 spawn frame", () => {
  const spring = createSpring();
  try {
    const target = worldSpawn(), yaw = Math.atan2(7, 9), pitch = Math.PI / 10;
    const camera = new PerspectiveCamera(55, 1600 / 900, 0.1, 100);
    camera.position.copy(target).addScaledVector(new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)), 12);
    camera.lookAt(target); camera.updateMatrixWorld(true); spring.group.updateMatrixWorld(true);
    const ray = new Raycaster(), samples = 160;
    let widest = 0;
    for (const y of [0.4, 0.55, 0.7]) {
      let hits = 0;
      for (let x = 0; x < samples; x++) {
        ray.setFromCamera(new Vector2((x + 0.5) / samples * 2 - 1, y), camera);
        if (ray.intersectObject(spring.cliff).length) hits++;
      }
      widest = Math.max(widest, hits / samples);
    }
    expect(widest).toBeGreaterThanOrEqual(0.6);
    console.info(`FL-03 spawn cliff coverage: ${(widest * 100).toFixed(1)}%`);
  } finally { spring.dispose(); }
});
