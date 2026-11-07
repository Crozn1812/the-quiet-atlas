import { expect, it } from "vitest";
import { Color, Fog, Mesh, Triangle, PerspectiveCamera, Raycaster, Scene, ShaderMaterial, Vector2, Vector3, type WebGLRenderer } from "three";
import { createIntro, introAtmosphere } from "../../../src/features/world/cinematic/intro";
import { createEnding, endingAtmosphere } from "../../../src/features/world/cinematic/ending";
import { createFarLandscape } from "../../../src/features/world/scene/far-landscape";
import { createSea } from "../../../src/features/world/water/sea";
import { createRiverRibbon } from "../../../src/features/world/water/ribbon";
import { SECRETS } from "../../../src/features/story/secrets";
import { ZONES } from "../../../src/features/world/layout/zones";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { worldHeight } from "../../../src/features/world/terrain/height";
import { HEIGHT } from "../../../src/features/world/scene";
import { CAMERA_CLEARANCE, CAMERA_PITCH, INITIAL_ZOOM } from "../../../src/features/world/camera";
import { buildTile, tilesForPathRange } from "../../../src/features/world/terrain/tiles";
import { createTileMesh } from "../../../src/features/world/terrain/mesh";
import { pathLength } from "../../../src/features/world/layout/path";
import { createGradedPaperPass } from "../../../src/features/world/scene/paper";
import { WORLD_DIRECTION } from "../../../src/features/world/art/direction";
import { lightingAt, applyCoastAtmosphere } from "../../../src/features/world/sky/grade";
import { PALETTE } from "../../../src/features/world/art/palette";

const postcard = ZONES.find(zone => zone.id === "last-postcard")!;
const landing = pathPointAt(postcard.t - 0.003);
landing.y = worldHeight(landing.x, landing.z) + HEIGHT + 0.02;
const yaw = Math.atan2(landing.x - postcard.position.x, landing.z - postcard.position.z);
const endPosition = landing.clone().add(new Vector3(Math.sin(yaw) * Math.cos(CAMERA_PITCH), Math.sin(CAMERA_PITCH), Math.cos(yaw) * Math.cos(CAMERA_PITCH)).multiplyScalar(INITIAL_ZOOM));
endPosition.y = Math.max(endPosition.y, worldHeight(endPosition.x, endPosition.z) + CAMERA_CLEARANCE);
const bench = SECRETS.find(secret => secret.id === "unwritten-page")!.position;
const ending = createEnding({
  bench: new Vector3(bench.x, bench.y, bench.z),
  gameplayPose: { position: endPosition, target: landing, fov: 55 },
});
const intro = createIntro({ position: new Vector3(0, 20, 10), target: new Vector3(0, 3, 0), fov: 55 });

it("keeps the postcard foreground on open water or detailed upward-facing terrain", () => {
  const landscape = createFarLandscape();
  const sea = createSea("High");
  const river = createRiverRibbon("High");
  landscape.mesh.raycast = Mesh.prototype.raycast;
  sea.mesh.updateMatrixWorld(true);
  const tiles = tilesForPathRange(pathLength() * 0.8, pathLength()).map(({ ix, iz }) => {
    const mesh = createTileMesh(buildTile(ix, iz), landscape.mesh.material);
    mesh.name = `tile:${ix},${iz}`;
    return mesh;
  });
  try {
    for (const seconds of [26, 31, 34, 34.5]) for (const aspect of [1, 16 / 9]) {
      const camera = cameraAt(ending.sample(seconds), aspect);
      for (let xi = 0; xi < 8; xi++) for (let yi = 0; yi < 5; yi++) {
        const ray = new Raycaster();
        ray.setFromCamera(new Vector2(-1 + xi * 2 / 7, -0.76 + yi * 1.14 / 4), camera);
        if (ray.ray.direction.y >= 0) continue;
        const hit = ray.intersectObjects([sea.mesh, river.mesh, ...tiles, landscape.mesh])[0];
        expect(hit, `time=${seconds} aspect=${aspect} grid=${xi},${yi}`).toBeDefined();
        expect(hit!.object, `no overlapping river at ${seconds}: ${xi},${yi}`).not.toBe(river.mesh);
        expect(hit!.face!.normal.y).toBeGreaterThan(0);
        if (hit!.object !== sea.mesh && hit!.distance < 130) {
          const mesh = hit!.object as Mesh;
          const face = hit!.face!;
          const points = [face.a, face.b, face.c].map(i => new Vector3().fromBufferAttribute(mesh.geometry.getAttribute("position"), i));
          const bary = new Triangle(points[0]!, points[1]!, points[2]!).getBarycoord(mesh.worldToLocal(hit!.point.clone()), new Vector3())!;
          let lumaAtHit = 0;
          for (const [index, vertex] of [face.a, face.b, face.c].entries()) {
            const pigment = new Color().fromBufferAttribute(mesh.geometry.getAttribute("color"), vertex);
            const luma = pigment.r * 0.2126 + pigment.g * 0.7152 + pigment.b * 0.0722;
            lumaAtHit += luma * bary.getComponent(index);
          }
          expect(lumaAtHit, `lit ground pigment at ${seconds}: ${xi},${yi}`).toBeGreaterThan(0.15);
        }
        // Only the distant island may use coarse geometry, never the foreground shelf.
        if (hit!.distance < 130) expect(hit!.object).not.toBe(landscape.mesh);
      }
      if (seconds === 31 && aspect === 16 / 9) for (const [x, y] of [[0.55, 0.95], [0.85, 0.9]]) {
        const ray = new Raycaster();
        ray.setFromCamera(new Vector2(x! * 2 - 1, 1 - y! * 2), camera);
        const hit = ray.intersectObjects([sea.mesh, river.mesh, ...tiles, landscape.mesh])[0]!;
        expect(hit.object).not.toBe(landscape.mesh);
        expect(hit.face!.normal.y).toBeGreaterThan(0);
      }
    }
    // Regression: the almost sea-level river tail was the dark right-hand wedge.
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2(0.97 * 2 - 1, 1 - 0.8 * 2), cameraAt(ending.sample(34.5), 16 / 9));
    expect(ray.intersectObjects([sea.mesh, river.mesh])[0]!.object).toBe(sea.mesh);
  } finally {
    river.dispose(); landscape.dispose(); sea.dispose();
    tiles.forEach(tile => tile.geometry.dispose());
  }
});
it("renders intro fog in the current skyHorizon colour at every quality", () => {
  for (const quality of ["Low", "Balanced", "High"] as const) {
    let actual: Color | undefined;
    const renderer = {
      getSize: (v: Vector2) => v.set(320, 180), getPixelRatio: () => 1,
      getRenderTarget: () => null, setRenderTarget: () => {}, autoClear: true,
      render: (scene: Scene) => {
        const mesh = scene.children[0] as Mesh | undefined;
        actual = (mesh?.material as ShaderMaterial | undefined)?.uniforms?.fogColor?.value.clone()
          ?? scene.fog?.color.clone();
      },
    } as unknown as WebGLRenderer;
    const pass = createGradedPaperPass(renderer, quality, WORLD_DIRECTION);
    const scene = new Scene();
    scene.fog = new Fog(PALETTE.mist, 1, 100);
    try {
      const grade = applyCoastAtmosphere(lightingAt(0.2), 0.2);
      pass.setFog({ near: 1, far: 100 });
      pass.setGrade(grade);
      pass.render(scene, cameraAt(intro.sample(0), 16 / 9));
      const gameplayFog = actual!.clone();
      for (const time of [1.5, 4, 7, 10]) {
        const frame = intro.sample(time);
        const grade = applyCoastAtmosphere(lightingAt(time / 22), time / 22);
        const atmosphere = introAtmosphere(frame.position, frame.mistBoost, grade.skyHorizon);
        pass.setFogColorOverride(grade.skyHorizon);
        pass.setFog(atmosphere.fog);
        pass.setGrade(grade);
        pass.setMist(atmosphere.mist);
        pass.render(scene, cameraAt(frame, 16 / 9));
        expect(actual!.toArray()).toEqual(grade.skyHorizon.toArray());
        expect(scene.fog.color.toArray()).toEqual(grade.skyHorizon.toArray());
      }
      pass.setFogColorOverride(null);
      pass.setGrade(grade);
      pass.render(scene, cameraAt(intro.sample(0), 16 / 9));
      expect(actual!.toArray()).toEqual(gameplayFog.toArray());
      expect(scene.fog.color.toArray()).toEqual(gameplayFog.toArray());
    } finally { pass.dispose(); }
  }
});

function cameraAt(frame: ReturnType<typeof intro.sample>, aspect: number) {
  const camera = new PerspectiveCamera(frame.fov, aspect, 0.1, 2000);
  camera.position.copy(frame.position);
  camera.lookAt(frame.target);
  camera.updateMatrixWorld();
  return camera;
}

it("shows the same quarter-to-third of dawn sky from the opening frame through the canopy glide", () => {
  for (const seconds of [0, 1.5, 4, 7, 10]) {
    const frame = intro.sample(seconds);
    const direction = frame.target.clone().sub(frame.position).normalize();
    const horizon = (1 - Math.tan(Math.asin(-direction.y)) / Math.tan(frame.fov * Math.PI / 360)) / 2;
    const visibleSky = (horizon - 0.12) / 0.76;
    expect(visibleSky, `sky at ${seconds}`).toBeGreaterThanOrEqual(0.25);
    expect(visibleSky, `sky at ${seconds}`).toBeLessThanOrEqual(1 / 3);
  }
});

it("keeps the low sunset inside the postcard frames and retains the camera's coast grade", () => {
  for (const seconds of [26, 31, 34, 34.5]) for (const aspect of [1, 16 / 9]) {
    const frame = ending.sample(seconds);
    const grade = endingAtmosphere(frame.position, frame.sunsetBoost);
    expect(grade.coastWeight, `coast at ${seconds}`).toBeGreaterThanOrEqual(0.8);
    const camera = cameraAt(frame, aspect);
    const sun = frame.position.clone().addScaledVector(grade.sunDirection, 1000).project(camera);
    expect(Math.abs(sun.x), `sun x at ${seconds}`).toBeLessThan(1);
    expect(sun.y, `sun y at ${seconds}`).toBeGreaterThan(0.2);
    expect(sun.y, `sun y at ${seconds}`).toBeLessThan(0.76);
    expect(sun.z).toBeLessThan(1);
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2(0, 0.76), camera);
    expect(ray.ray.direction.y, `sky above horizon at ${seconds}`).toBeGreaterThan(0);
  }
});

it("covers below-horizon rays with the existing landscape or sea at every review timestamp", () => {
  const landscape = createFarLandscape();
  const sea = createSea("High");
  landscape.mesh.raycast = Mesh.prototype.raycast;
  sea.mesh.updateMatrixWorld(true);
  try {
    const frames = [
      ...[0, 1.5, 4, 7, 10].map(time => intro.sample(time)),
      ...[0.5, 4, 9, 14, 20, 26, 31, 34, 34.5].map(time => ending.sample(time)),
    ];
    for (const [index, frame] of frames.entries()) for (const aspect of [1, 16 / 9]) {
      const camera = cameraAt(frame, aspect);
      // Dense rows catch exposed tile corners as well as the centre of the retained picture.
      for (const x of [-1, -0.5, 0, 0.5, 1]) for (const y of [-0.76, -0.38, 0, 0.38, 0.76]) {
        const ray = new Raycaster();
        ray.setFromCamera(new Vector2(x, y), camera);
        if (ray.ray.direction.y >= 0) continue;
        expect(ray.intersectObjects([landscape.mesh, sea.mesh]).length, `frame=${index} aspect=${aspect} ray=${x},${y}`).toBeGreaterThan(0);
      }
    }
  } finally {
    landscape.dispose();
    sea.mesh.material.dispose();
    sea.dispose();
  }
});
