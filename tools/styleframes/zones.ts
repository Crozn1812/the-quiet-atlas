// Zone set-piece viewer (Lead tool, not in the web build): one zone on flat paper ground, lit and
// post-processed like the world (direction C). ?zone=<id>&view=front|side|top. Path corridor drawn as a pale strip.
import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, Mesh, MeshBasicMaterial, PCFSoftShadowMap,
  PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGLRenderer,
} from "three";
import { paletteColor, WORLD_DIRECTION } from "../../src/features/world/art/direction";
import { PALETTE } from "../../src/features/world/art/palette";
import { createRampMaterial } from "../../src/features/world/materials/ramp";
import { createPaperPass } from "../../src/features/world/post/paper";
import { lightingAt } from "../../src/features/world/sky/grade";
import { PATH_CLEARANCE, type ZoneSceneFactory } from "../../src/features/world/zones/types";

declare global { interface Window { __frameReady: boolean } }
window.__frameReady = false;

const factories = import.meta.glob<Record<string, ZoneSceneFactory>>("../../src/features/world/zones/*.ts", { eager: true });
const params = new URLSearchParams(location.search);
const zoneId = params.get("zone") ?? "first-light";
const view = params.get("view") ?? "front";
const zoneModule = factories[`../../src/features/world/zones/${zoneId}.ts`];
const factory = zoneModule && Object.entries(zoneModule).find(([name]) => /^create.*Scene$/.test(name))?.[1];
if (!factory) throw new Error(`No zone factory for ${zoneId}`);

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
paper.setFog({ near: 70, far: 400, color: new Color(PALETTE.paper) });
paper.setMist({ strength: 0, height: -10 });
paper.setEdges(WORLD_DIRECTION.background.edges);

const tod = zoneId === "quiet-shore" || zoneId === "last-postcard" ? 0.95 : zoneId === "horizon" ? 0.75 : 0.2;
const grade = lightingAt(tod);
const sun = new DirectionalLight(grade.sunColor, grade.sunIntensity);
sun.position.set(-14, 18, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 90 });
scene.add(sun, new HemisphereLight(grade.hemiSky, grade.hemiGround, grade.hemiIntensity));
const ground = new Mesh(new PlaneGeometry(120, 120), createRampMaterial(paletteColor(WORLD_DIRECTION.background.terrain), WORLD_DIRECTION.background.ramp));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const path = new Mesh(new PlaneGeometry(PATH_CLEARANCE * 2, 80), new MeshBasicMaterial({ color: new Color(PALETTE.paper).lerp(new Color(PALETTE.dusk), 0.15) }));
path.rotation.x = -Math.PI / 2;
path.position.y = 0.01;
scene.add(path);

const zone = factory({ heightAt: () => 0, onPath: x => Math.abs(x) <= PATH_CLEARANCE, underWater: () => false, seed: 1 });
zone.group.traverse(child => { if (child instanceof Mesh) { child.castShadow = true; child.receiveShadow = true; } });
scene.add(zone.group);
const marker = new Mesh(new PlaneGeometry(0.6, 0.6), new MeshBasicMaterial({ color: PALETTE.vermilion }));
marker.rotation.x = -Math.PI / 2;
marker.position.set(zone.interactable.position.x, 0.02, zone.interactable.position.z);
scene.add(marker);

const camera = new PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 400);
const target = new Vector3(0, 1.2, 0);
camera.position.copy(view === "top" ? new Vector3(0.01, 55, 0) : view === "side" ? new Vector3(26, 9, 4) : new Vector3(4, 7, -24));
camera.lookAt(target);

let frames = 0;
function render() {
  paper.render(scene, camera);
  if (++frames >= 3) window.__frameReady = true;
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
