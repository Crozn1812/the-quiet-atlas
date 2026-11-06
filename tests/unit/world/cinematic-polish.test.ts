import { expect, it } from "vitest";
import { Mesh, PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import { createIntro } from "../../../src/features/world/cinematic/intro";
import { createEnding, endingAtmosphere } from "../../../src/features/world/cinematic/ending";
import { createFarLandscape } from "../../../src/features/world/scene/far-landscape";
import { createSea } from "../../../src/features/world/water/sea";
import { SECRETS } from "../../../src/features/story/secrets";
import { ZONES } from "../../../src/features/world/layout/zones";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { worldHeight } from "../../../src/features/world/terrain/height";
import { HEIGHT } from "../../../src/features/world/scene";
import { CAMERA_CLEARANCE, CAMERA_PITCH, INITIAL_ZOOM } from "../../../src/features/world/camera";

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
