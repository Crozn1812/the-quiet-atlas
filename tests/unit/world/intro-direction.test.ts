import { expect, it, vi } from "vitest";
import { Mesh, PerspectiveCamera, Raycaster, Scene, ShaderMaterial, Vector2, Vector3, type WebGLRenderer } from "three";
import { createFarLandscape } from "../../../src/features/world/scene/far-landscape";
import { createSkyDome } from "../../../src/features/world/sky/dome";
import { WORLD_DIRECTION, STYLE_PRESETS } from "../../../src/features/world/art/direction";
import { createIntro, introAtmosphere, INTRO_DURATION } from "../../../src/features/world/cinematic/intro";
import { nearestRiver } from "../../../src/features/world/terrain/samples";
import { waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";
import { riverPointAt } from "../../../src/features/world/layout/river";
import { createPaperPass } from "../../../src/features/world/post/paper";

const gameplay = { position: new Vector3(0, 20, 10), target: new Vector3(0, 3, 0), fov: 55 };

it("retains the gameplay dawn dome above the intro camera without writing fog depth", () => {
  const sky = createSkyDome();
  try {
    expect(sky.mesh.material.depthWrite).toBe(false);
    expect(sky.mesh.material.depthTest).toBe(false);
    expect(sky.mesh.material.uniforms.skyTop!.value.equals(sky.mesh.material.uniforms.skyHorizon!.value)).toBe(false);
    for (const time of [0, 1.5, 4, 7, 10, 15]) {
      const frame = createIntro(gameplay).sample(time);
      const camera = new PerspectiveCamera(frame.fov, 16 / 9, 0.1, 2000);
      camera.position.copy(frame.position);
      camera.updateMatrixWorld();
      sky.mesh.onBeforeRender({} as WebGLRenderer, new Scene(), camera, sky.mesh.geometry, sky.mesh.material, null!);
      expect(new Vector3().setFromMatrixPosition(sky.mesh.matrixWorld)).toEqual(frame.position);
      expect(sky.mesh.visible).toBe(true);
    }
  } finally { sky.dispose(); }
});

it("covers all below-horizon corner and centre rays with far landscape", () => {
  const landscape = createFarLandscape();
  // Production disables scenery picking; restore triangle raycasting for this visibility check.
  landscape.mesh.raycast = Mesh.prototype.raycast;
  try {
    expect(landscape.mesh.visible).toBe(true);
    for (const time of [0, 1.5, 4, 7, 10, 15]) for (const aspect of [1, 16 / 9]) {
      const frame = createIntro(gameplay).sample(time);
      const camera = new PerspectiveCamera(frame.fov, aspect, 0.1, 2000);
      camera.position.copy(frame.position);
      camera.lookAt(frame.target);
      camera.updateMatrixWorld();
      let tested = 0;
      for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]] as const) {
        const ray = new Raycaster();
        ray.setFromCamera(new Vector2(x, y), camera);
        if (ray.ray.direction.y >= 0) continue;
        tested++;
        expect(ray.intersectObject(landscape.mesh).length, `time=${time}, ray=${x},${y}`).toBeGreaterThan(0);
      }
      expect(tested).toBeGreaterThanOrEqual(3);
    }
  } finally { landscape.dispose(); }
});

it("glides above the 18 m pines with an 18 m margin and sky in the upper quarter to third at 8–15 s", () => {
  const intro = createIntro(gameplay);
  for (let time = 8; time <= 15; time += 1 / 60) {
    const frame = intro.sample(time);
    const altitude = frame.position.y - worldHeight(frame.position.x, frame.position.z);
    expect(altitude).toBeGreaterThanOrEqual(36);
    expect(altitude).toBeLessThanOrEqual(40);
    const direction = frame.target.clone().sub(frame.position).normalize();
    expect(direction.z).toBeGreaterThan(0);
    const depression = Math.asin(-direction.y);
    const skyFraction = (1 - Math.tan(depression) / Math.tan(frame.fov * Math.PI / 360)) / 2;
    const visibleSky = (skyFraction - 0.12) / 0.76;
    expect(visibleSky).toBeGreaterThanOrEqual(0.25);
    expect(visibleSky).toBeLessThanOrEqual(1 / 3);
  }
});

it("opens obliquely at 80–140 m, with dawn sky and both sides of the river bend in view", () => {
  const intro = createIntro(gameplay);
  expect(intro.duration).toBeGreaterThanOrEqual(18);
  expect(intro.duration).toBeLessThanOrEqual(22);
  const first = intro.sample(0);
  const altitude = first.position.y - worldHeight(first.position.x, first.position.z);
  expect(altitude).toBeGreaterThanOrEqual(80);
  expect(altitude).toBeLessThanOrEqual(140);
  const camera = new PerspectiveCamera(first.fov, 1, 0.1, 2000);
  camera.position.copy(first.position);
  camera.lookAt(first.target);
  camera.updateMatrixWorld();
  const forward = camera.getWorldDirection(new Vector3());
  // The upper half of the vertical FOV crosses the horizon, leaving space for sky/clouds.
  expect(Math.asin(-forward.y) * 180 / Math.PI).toBeLessThan(first.fov / 2);
  for (const t of [0.1, 0.15, 0.2, 0.25, 0.3]) {
    const point = riverPointAt(t);
    point.y = waterLevelAt(point.z);
    const projected = point.project(camera);
    expect(Math.abs(projected.x)).toBeLessThan(0.95);
    expect(Math.abs(projected.y)).toBeLessThan(0.76); // Inside the retained 12% letterbox bars.
    expect(projected.z).toBeGreaterThan(-1);
    expect(projected.z).toBeLessThan(1);
  }
});

it("keeps the river visible at 1, 5, 10 and 15 s, then descends to water without a paper wash", () => {
  expect(WORLD_DIRECTION).toBe(STYLE_PRESETS.R);
  const intro = createIntro(gameplay);
  for (const time of [1, 5, 10, 15]) {
    const frame = intro.sample(time);
    const altitude = frame.position.y - worldHeight(frame.position.x, frame.position.z);
    expect(altitude).toBeGreaterThanOrEqual(15);
    expect(altitude).toBeLessThanOrEqual(140);
    const river = nearestRiver(frame.position.x, frame.position.z);
    const distance = Math.hypot(river.distance, frame.position.y - waterLevelAt(river.z));
    const air = introAtmosphere(frame.position, frame.mistBoost);
    expect(distance).toBeLessThan(air.fog.near);
    expect(air.fog.far).toBeGreaterThan(air.fog.near);
    expect(air.mist.strength).toBeLessThanOrEqual(0.08);
    expect(air.mist.height).toBe(waterLevelAt(frame.position.z) + 1.2);
  }
  const detail = intro.sample(18);
  expect(detail.position.y - waterLevelAt(detail.position.z)).toBeGreaterThanOrEqual(1);
  expect(detail.position.y - waterLevelAt(detail.position.z)).toBeLessThanOrEqual(2);
  for (let i = 0; i <= INTRO_DURATION * 60; i++) expect(intro.sample(i / 60).paperOpacity).toBe(0);
});

it("cannot enable the legacy paper corridor in R after quality changes", () => {
  const render = vi.fn();
  const renderer = {
    getSize: (v: Vector2) => v.set(320, 180), getPixelRatio: () => 1,
    getRenderTarget: () => null, setRenderTarget() {}, clear() {}, render,
  } as unknown as WebGLRenderer;
  const paper = createPaperPass(renderer, { quality: "High", preset: WORLD_DIRECTION });
  try {
    for (const quality of ["High", "Low", "Balanced"] as const) {
      paper.setQuality(quality);
      paper.setCorridor([riverPointAt(0), riverPointAt(0.3)], 32);
      paper.render(new Scene(), new PerspectiveCamera());
      if (quality !== "Low") {
        const screen = render.mock.calls.at(-1)![0] as Scene;
        const material = (screen.children[0] as Mesh).material as ShaderMaterial;
        expect(material.uniforms.corridorCount!.value).toBe(0);
      }
    }
  } finally { paper.dispose(); }
});
