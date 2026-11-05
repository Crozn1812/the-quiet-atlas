import {
  Color, DirectionalLight, InstancedMesh, Matrix4, Mesh, MeshToonMaterial, PerspectiveCamera,
  Scene, ShaderLib, Vector3, type BufferGeometry, type WebGLProgramParametersWithUniforms, type WebGLRenderer,
} from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { paletteColor } from "../../../../src/features/world/art/direction";
import { pathPointAt } from "../../../../src/features/world/layout/path";
import { ZONES } from "../../../../src/features/world/layout/zones";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { surfaceHeight } from "../../../../src/features/world/scene/compose";
import { lightingAt } from "../../../../src/features/world/sky/grade";
import { waterLevelAt } from "../../../../src/features/world/terrain/height";
import { nearestPath } from "../../../../src/features/world/terrain/samples";
import { createFirstLightScene, createForestSunShafts, FOREST_SUN_SHAFT_PROGRESS } from "../../../../src/features/world/zones/first-light";

const resources: { dispose(): void }[] = [];
afterEach(() => { resources.splice(0).forEach(resource => resource.dispose()); disposeRampGradients(); });
const create = (height = surfaceHeight) => {
  const shafts = createForestSunShafts(height);
  resources.push(shafts);
  return shafts;
};
const shaftMesh = (shafts: ReturnType<typeof create>) =>
  shafts.group.children[0] as InstancedMesh<BufferGeometry, MeshToonMaterial>;

describe("forest canopy sun shafts (B2-169)", () => {
  it("places exactly three dry gaps along the forest path, beyond zone pads", () => {
    const shafts = create();
    const mesh = shaftMesh(shafts);
    expect(shafts.sites.map(site => site.t)).toEqual(FOREST_SUN_SHAFT_PROGRESS);
    expect(mesh.count).toBe(3);
    expect(shafts.group.children).toHaveLength(1);
    expect(mesh).toBeInstanceOf(InstancedMesh);
    expect(mesh.geometry.groups).toHaveLength(0);
    expect(mesh.material.forceSinglePass).toBe(true);
    const vertices = mesh.geometry.getAttribute("position");
    const triangles = (mesh.geometry.index?.count ?? vertices.count) / 3;
    expect(triangles * mesh.count).toBe(288);
    expect(mesh.geometry.boundingBox).toBeTruthy();
    expect(mesh.boundingSphere).toBeTruthy();
    const matrix = new Matrix4();
    for (let instance = 0; instance < mesh.count; instance++) {
      mesh.getMatrixAt(instance, matrix);
      const site = shafts.sites[instance]!;
      expect(site.position.distanceTo(pathPointAt(site.t))).toBeLessThan(15);
      for (let i = 0; i < vertices.count; i++) {
        const point = new Vector3().fromBufferAttribute(vertices, i).applyMatrix4(matrix);
        expect(point.toArray().every(Number.isFinite)).toBe(true);
        expect(point.y).toBeGreaterThanOrEqual(surfaceHeight(point.x, point.z) - 1e-5);
        expect(surfaceHeight(point.x, point.z)).toBeGreaterThan(waterLevelAt(point.z));
        expect(nearestPath(point.x, point.z).distance).toBeLessThan(7);
        for (const zone of ZONES) expect(Math.hypot(point.x - zone.position.x, point.z - zone.position.z)).toBeGreaterThan(zone.radius + 4);
        const nearest = ZONES.reduce((best, zone) => Math.abs(zone.t - site.t) < Math.abs(best.t - site.t) ? zone : best);
        expect(nearest.biome).toBe("forest-dawn");
      }
    }
  });

  it("uses faint sunGold/cloud and feathers all four edges without textures", () => {
    const mesh = shaftMesh(create());
    expect(mesh.material.color).toEqual(new Color(paletteColor({
      base: "sunGold", mix: "cloud", amount: 0.7, saturation: 1, brightness: 1,
    })));
    expect(mesh.material.opacity).toBe(0.15);
    expect(mesh.material.transparent).toBe(true);
    expect(mesh.material.depthWrite).toBe(false);
    expect(mesh.material.map).toBeNull();
    const positions = mesh.geometry.getAttribute("position");
    const colors = mesh.geometry.getAttribute("color");
    const alpha: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const a = colors.getW(i);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      if (Math.abs(positions.getX(i)) > 0.449 || positions.getY(i) === 0 || positions.getY(i) === 6) expect(a).toBeLessThan(1e-6);
      alpha.push(a);
    }
    expect(alpha.some(a => a > 0 && a < 1)).toBe(true);
    expect(Math.max(...alpha)).toBe(1);
  });

  it("shows both First Light veils and the three route shafts only toward the actual world sun", () => {
    const first = createFirstLightScene({ seed: 101, heightAt: () => 0, onPath: x => Math.abs(x) <= 2.6, underWater: () => false });
    resources.push(first);
    const veils = first.group.getObjectByName("first-light-sun") as Mesh<BufferGeometry, MeshToonMaterial>;
    expect(veils.geometry.getAttribute("position").count / 3).toBe(192); // Two existing 96-triangle veils.
    const route = shaftMesh(create());
    const scene = new Scene();
    const sun = new DirectionalLight();
    sun.position.set(20, 12, -4);
    sun.target.position.set(3, 2, -1);
    scene.add(sun, sun.target);
    scene.updateMatrixWorld(true);
    const camera = new PerspectiveCamera();
    const gpu = {} as WebGLRenderer;
    for (const mesh of [veils, route]) {
      const shader = {
        uniforms: {}, vertexShader: ShaderLib.toon!.vertexShader, fragmentShader: ShaderLib.toon!.fragmentShader,
      } as WebGLProgramParametersWithUniforms;
      mesh.material.onBeforeCompile(shader, gpu);
      expect(shader.fragmentShader).toContain("rampShadowTint");
      expect(shader.fragmentShader).toContain("normalize( -vViewPosition )");
      expect(shader.fragmentShader).toContain("mat3( viewMatrix ) * shaftSunDirection");
      const uniforms = shader.uniforms as { shaftSunDirection: { value: Vector3 } };
      expect(uniforms.shaftSunDirection.value).toEqual(lightingAt(0).sunDirection);
      mesh.onBeforeRender(gpu, scene, camera, mesh.geometry, mesh.material, null!);
      const direction = sun.position.clone().sub(sun.target.position).normalize();
      expect(uniforms.shaftSunDirection.value.distanceTo(direction)).toBeLessThan(1e-12);
      const mask = shader.fragmentShader.match(/diffuseColor.a \*= smoothstep\( ([\d.]+), ([\d.]+), shaftAlignment \)/)!;
      const a = Number(mask[1]), b = Number(mask[2]);
      const alpha = (look: Vector3) => {
        const u = Math.max(0, Math.min(1, (look.dot(direction) - a) / (b - a)));
        return u * u * (3 - 2 * u);
      };
      expect(alpha(direction)).toBeCloseTo(1);
      expect(alpha(direction.clone().negate())).toBe(0);
      expect(alpha(new Vector3().crossVectors(direction, new Vector3(0, 1, 0)).normalize())).toBe(0);
      const edge = direction.clone().multiplyScalar(0.75).add(new Vector3().crossVectors(direction, new Vector3(0, 1, 0)).normalize().multiplyScalar(Math.sqrt(1 - 0.75 ** 2)));
      expect(alpha(edge)).toBeGreaterThan(0);
      expect(alpha(edge)).toBeLessThan(1);
    }
  });

  it("repeats all instances deterministically, skips flooded sites and disposes once", () => {
    const first = create(), second = create();
    expect(first.sites).toEqual(second.sites);
    expect(Array.from(shaftMesh(first).instanceMatrix.array)).toEqual(Array.from(shaftMesh(second).instanceMatrix.array));
    expect(Array.from(shaftMesh(first).geometry.getAttribute("position").array)).toEqual(Array.from(shaftMesh(second).geometry.getAttribute("position").array));
    expect(shaftMesh(create(() => -10)).count).toBe(0);
    const mesh = shaftMesh(first);
    const geometryDispose = vi.spyOn(mesh.geometry, "dispose");
    const materialDispose = vi.spyOn(mesh.material, "dispose");
    const scene = new Scene();
    scene.add(first.group);
    first.dispose();
    first.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(first.group.children).toHaveLength(0);
    expect(scene.children).toHaveLength(0);
  });
});
