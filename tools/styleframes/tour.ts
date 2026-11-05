// In-context zone tour (Lead tool, not in the web build): the real world composer (terrain, forest, ground,
// river, sea, sky, position grade, direction C paper pass) plus the eight zone set-pieces, framed per zone.
// ?zone=<id>&view=approach|wide. No character; physics only feeds the tile colliders the composer requires.
import RAPIER from "@dimforge/rapier3d-compat";
import { ACESFilmicToneMapping, PCFSoftShadowMap, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { createWorldScene, surfaceHeight } from "../../src/features/world/scene/compose";
import { createGradedPaperPass } from "../../src/features/world/scene/paper";
import { placeZoneScenes, zoneFoliageBounds } from "../../src/features/world/zones";

declare global { interface Window { __frameReady: boolean } }
window.__frameReady = false;

async function start() {
  const params = new URLSearchParams(location.search);
  const zoneId = params.get("zone") ?? "first-light";
  const view = params.get("view") ?? "approach";
  const canvas = document.getElementById("frame") as HTMLCanvasElement;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  const scene = new Scene();
  const paper = createGradedPaperPass(renderer, "High");
  paper.setSize(window.innerWidth, window.innerHeight);

  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const zones = placeZoneScenes(surfaceHeight);
  for (const zone of zones) scene.add(zone.group);
  const composed = createWorldScene({
    RAPIER, world, scene, quality: "High", paper,
    zoneBounds: zoneFoliageBounds(zones), zoneBoxes: zones.flatMap(zone => zone.boxes),
  });
  const zone = zones.find(item => item.zoneId === zoneId);
  if (!zone) throw new Error(`Unknown zone ${zoneId}`);
  const anchor = zone.group.position.clone();
  composed.update(anchor, 0);

  const forward = new Vector3(zone.layout.lookDirection.x, 0, zone.layout.lookDirection.z).normalize();
  const right = new Vector3(forward.z, 0, -forward.x);
  const towardObject = Math.sign(right.dot(zone.target.position.clone().sub(anchor))) || 1;
  const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 320);
  const eye = view === "wide"
    ? anchor.clone().addScaledVector(forward, -26).addScaledVector(right, -towardObject * 10)
    : anchor.clone().addScaledVector(forward, -11).addScaledVector(right, -towardObject * 3);
  eye.y = surfaceHeight(eye.x, eye.z) + (view === "wide" ? 9 : 3.4);
  camera.position.copy(eye);
  camera.lookAt(view === "wide" ? anchor.clone().setY(anchor.y + 2) : zone.target.position.clone().setY(zone.target.position.y + 0.5));

  let frames = 0;
  let last = performance.now();
  function render(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const item of zones) item.update?.(dt, false);
    paper.render(scene, camera);
    if (++frames >= 6) window.__frameReady = true;
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

void start().catch(error => { document.body.textContent = String(error); });
