// Asset line-up for showcases (Lead tool, not part of the web build): every procedural world asset on one
// paper ground, lit and post-processed like the world (direction C). ?view=<id> frames one asset; default is all.
import {
  ACESFilmicToneMapping, Color, DirectionalLight, Group, HemisphereLight, Mesh, PCFSoftShadowMap,
  PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGLRenderer, type Object3D,
} from "three";
import { paletteColor, WORLD_DIRECTION } from "../../src/features/world/art/direction";
import { PALETTE } from "../../src/features/world/art/palette";
import { createMascotMesh } from "../../src/features/mascot/shape";
import { createRampMaterial } from "../../src/features/world/materials/ramp";
import { createPaperPass } from "../../src/features/world/post/paper";
import { createProp } from "../../src/features/world/props";
import { createSecretLandmark } from "../../src/features/world/props/secrets";
import { lightingAt } from "../../src/features/world/sky/grade";
import { createGd110 } from "../../src/features/world/vehicle/mesh";

declare global { interface Window { __frameReady: boolean } }
window.__frameReady = false;

const canvas = document.getElementById("frame") as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.toneMapping = ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new Scene();
scene.background = new Color(PALETTE.paper);
const paper = createPaperPass(renderer, { quality: "High" });
paper.setSize(window.innerWidth, window.innerHeight);
paper.setFog({ near: 60, far: 400, color: new Color(PALETTE.paper) });
paper.setMist({ strength: 0, height: -10 });
paper.setEdges(WORLD_DIRECTION.background.edges);

const grade = lightingAt(0.3);
const sun = new DirectionalLight(grade.sunColor, grade.sunIntensity);
sun.position.set(-8, 12, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 8, bottom: -4, near: 1, far: 60 });
scene.add(sun, new HemisphereLight(grade.hemiSky, grade.hemiGround, grade.hemiIntensity));
const ground = new Mesh(new PlaneGeometry(80, 40), createRampMaterial(paletteColor(WORLD_DIRECTION.background.terrain), WORLD_DIRECTION.background.ramp));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function shadows(object: Object3D) {
  object.traverse(child => { if (child instanceof Mesh) { child.castShadow = true; child.receiveShadow = true; } });
  return object;
}
function floor(object: Object3D) {
  // Props are centred on their bounding box; landmarks/GD110/mascot already stand on y = 0.
  if (object instanceof Mesh) {
    object.geometry.computeBoundingBox();
    object.position.y = -object.geometry.boundingBox!.min.y;
  }
  return object;
}
const lineUp: { id: string; object: Object3D; x: number }[] = [
  { id: "mirror", object: createSecretLandmark("vine-arch-mirror"), x: -11 },
  { id: "chime", object: createSecretLandmark("wind-chime"), x: -7.5 },
  { id: "trail", object: createSecretLandmark("faint-trail"), x: -4.5 },
  { id: "bench", object: createSecretLandmark("bench"), x: -0.5 },
  { id: "signpost", object: createProp("signpost"), x: 2.5 },
  { id: "desk", object: createProp("desk"), x: 5 },
  { id: "gd110", object: createGd110(), x: 8.5 },
  { id: "mascot", object: createMascotMesh(), x: 11.5 },
];
const group = new Group();
for (const item of lineUp) {
  const object = shadows(floor(item.object));
  object.position.x = item.x;
  if (item.id === "mascot") object.position.y = 1.2;
  if (item.id === "gd110") object.rotation.y = -Math.PI / 2.6;
  group.add(object);
}
scene.add(group);

const view = new URLSearchParams(location.search).get("view");
const focus = lineUp.find(item => item.id === view);
const camera = new PerspectiveCamera(focus ? 35 : 32, window.innerWidth / window.innerHeight, 0.1, 200);
const target = focus ? new Vector3(focus.x, focus.id === "trail" ? 0.2 : focus.id === "mascot" ? 1.35 : 0.9, focus.id === "trail" ? -4 : 0) : new Vector3(0, 0.9, 0);
const offset = focus?.id === "mascot" ? new Vector3(0.6, 0.3, 1.6) : focus?.id === "trail" ? new Vector3(3, 3.5, 4) : new Vector3(2.4, 1.6, 5.2);
camera.position.copy(target).add(focus ? offset : new Vector3(0, 3.6, 27));
camera.lookAt(target);

let frames = 0;
function render() {
  paper.render(scene, camera);
  if (++frames >= 3) window.__frameReady = true;
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
