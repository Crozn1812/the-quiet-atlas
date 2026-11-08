import {
  Box3, BoxGeometry, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute,
  Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, PlaneGeometry, TorusGeometry, Vector3,
  type DirectionalLight, type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paletteColor, WORLD_DIRECTION } from "../art/direction";
import type { PaletteKey } from "../art/palette";
import { createFern } from "../foliage/ground";
import { createPineCrownV2 } from "../foliage/pine";
import { pineHeight } from "../foliage/shapes";
import { createRampMaterial, RAMP_PRESETS } from "../materials/ramp";
import { createLogGeometry, createPlankGeometry, createPostGeometry } from "../props/wood";
import { createRockGeometry } from "../props/rocks";
import { deferBakedBatch, type BakedBatchPart } from "../props/batched";
import type { PropAsset } from "../props/deferred";
import { pathPointAt } from "../layout/path";
import { FOREST_SUN_SHAFT_PROGRESS } from "../layout/sun-shafts";
import { ZONES } from "../layout/zones";
import { lightingAt } from "../sky/grade";
import { waterLevelAt } from "../terrain/height";
import { nearestRiver } from "../terrain/samples";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneCollider, type ZoneSceneFactory } from "./types";

type Surface = "wood" | "paper" | "green" | "stone" | "sun" | "ink" | "flower" | "petal";
type Part = { geometry: BufferGeometry; surface: Surface; pigment?: Color; name?: string; baked?: PropAsset };
const part = (geometry: BufferGeometry, surface: Surface, pigment?: Color): Part => ({ geometry, surface, pigment });
const tint = (base: PaletteKey, mix: PaletteKey, amount: number) =>
  paletteColor({ base, mix, amount, saturation: 1, brightness: 1 });
const hues = {
  wood: tint("dusk", "rockDark", 0.65), paper: tint("cloud", "cloud", 0),
  green: tint("grass", "forestDeep", 0.6), stone: tint("rock", "rockDark", 0.2),
  sun: tint("sunGold", "cloud", 0.7), ink: tint("rockDark", "forestDeep", 0.45),
  flower: tint("flower", "flower", 0), petal: tint("cloud", "sand", 0.12),
};
// Kit pigments are linear palette colours; pine pigments are relative to its shared ramp.
const kit = (geometry: BufferGeometry, surface: Surface, pigment = new Color(1, 1, 1)) =>
  part(geometry, surface, pigment);

/** 96 triangles, feathered on every edge; shared by the three route instances. */
function sunVeil(width: number): PlaneGeometry {
  const veil = new PlaneGeometry(width, 6, 6, 8);
  const positions = veil.getAttribute("position");
  const colors: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const across = Math.max(0, 1 - Math.abs(positions.getX(i)) / (width / 2));
    const along = Math.max(0, 1 - Math.abs(positions.getY(i)) / 3);
    colors.push(1, 1, 1, Math.min(1, across * 2) * Math.min(1, along * 4));
  }
  veil.setAttribute("color", new Float32BufferAttribute(colors, 4));
  return veil;
}

/** Keep the existing soft ramp, adding only an angular alpha mask (no pass/texture). */
function backlitVeil(mesh: Mesh<BufferGeometry, MeshToonMaterial>): void {
  const material = mesh.material;
  Object.assign(material, {
    transparent: true, opacity: 0.15, depthWrite: false, side: DoubleSide, forceSinglePass: true,
    vertexColors: true,
  });
  material.emissive.copy(material.color).multiplyScalar(0.35);
  const sunDirection = lightingAt(0).sunDirection;
  const target = new Vector3();
  const rampCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    rampCompile(shader, renderer);
    shader.uniforms.shaftSunDirection = { value: sunDirection };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 shaftSunDirection;")
      .replace("#include <opaque_fragment>", `
float shaftAlignment = dot( normalize( -vViewPosition ), normalize( mat3( viewMatrix ) * shaftSunDirection ) );
diffuseColor.a *= smoothstep( 0.55, 0.9, shaftAlignment );
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => "painted-toon-backlit-veil-v1";
  // Compose owns the world-space sun. Follow it even when a zone is rotated/reflected.
  mesh.onBeforeRender = (_renderer, scene) => {
    const sun = scene.children.find((child): child is DirectionalLight =>
      "isDirectionalLight" in child && child.isDirectionalLight === true);
    if (sun) {
      sun.getWorldPosition(sunDirection);
      sun.target.getWorldPosition(target);
      sunDirection.sub(target).normalize();
    }
  };
}

export { FOREST_SUN_SHAFT_PROGRESS } from "../layout/sun-shafts";

/** Three dry path-side canopy gaps: 288 rendered triangles, one additional draw call. */
export function createForestSunShafts(heightAt: (x: number, z: number) => number) {
  const group = new Group();
  group.name = "forest-sun-shafts";
  const geometry = sunVeil(0.9).translate(0, 3, 0);
  const material = createRampMaterial(tint("sunGold", "cloud", 0.7));
  const mesh = new InstancedMesh(geometry, material, FOREST_SUN_SHAFT_PROGRESS.length);
  mesh.name = "forest-path-sun";
  backlitVeil(mesh);
  const sun = lightingAt(0).sunDirection;
  const across = new Vector3(-sun.z, 0, sun.x).normalize();
  const along = new Vector3(sun.x * 0.35, 1, sun.z * 0.35).normalize();
  const normal = new Vector3().crossVectors(across, along).normalize();
  const transform = new Matrix4().makeBasis(across, along, normal);
  const sites: { t: number; position: Vector3 }[] = [];
  for (const t of FOREST_SUN_SHAFT_PROGRESS) {
    const point = pathPointAt(t);
    const forward = pathPointAt(t + 0.001).sub(pathPointAt(t - 0.001)).normalize();
    const right = new Vector3(-forward.z, 0, forward.x);
    const river = nearestRiver(point.x, point.z);
    const drySide = (point.x - river.x) * right.x + (point.z - river.z) * right.z >= 0 ? 1 : -1;
    // Stay in the canopy-free path shoulder; widen out only if a sloping wet bank requires it.
    for (const offset of [3, 4.5, 6]) {
      const position = point.clone().addScaledVector(right, offset * drySide);
      position.y = heightAt(position.x, position.z) + 0.3;
      transform.setPosition(position);
      const vertices = geometry.getAttribute("position");
      let valid = true;
      const vertex = new Vector3();
      for (let i = 0; i < vertices.count && valid; i++) {
        vertex.fromBufferAttribute(vertices, i).applyMatrix4(transform);
        const ground = heightAt(vertex.x, vertex.z);
        valid = Number.isFinite(ground) && ground > waterLevelAt(vertex.z)
          && vertex.y >= ground
          && ZONES.every(zone => Math.hypot(vertex.x - zone.position.x, vertex.z - zone.position.z) > zone.radius + 4);
      }
      if (!valid) continue;
      mesh.setMatrixAt(sites.length, transform);
      sites.push({ t, position });
      break;
    }
  }
  mesh.count = sites.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.raycast = () => {};
  group.add(mesh);
  let disposed = false;
  return {
    group, sites,
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
      group.clear();
      group.removeFromParent();
    },
  };
}

/** A hewn post, weathered wooden letter pocket and the original greeting book. */
function notebook(side: number): Part[] {
  const board = (width: number, height: number, depth: number, seed: number) => {
    const geometry = createPlankGeometry(width, seed);
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new Vector3());
    return geometry.scale(1, height / size.y, depth / size.z);
  };
  const parts = [
    kit(createPostGeometry(1.45, 201).scale(1.65, 1, 1.65).translate(0, -0.05, 0), "wood"),
    kit(board(0.82, 0.12, 0.61, 202).rotateZ(-0.025).translate(0, 1.42, 0), "wood"),
    kit(board(0.66, 0.045, 0.48, 203).rotateY(0.08).translate(0, 1.5225, 0), "wood"),
    part(new BoxGeometry(0.61, 0.075, 0.43).rotateY(0.08).translate(0, 1.5825, 0), "paper"),
    part(new BoxGeometry(0.295, 0.018, 0.42).rotateZ(0.08).rotateY(0.08).translate(-0.15, 1.64, 0), "paper"),
    part(new BoxGeometry(0.295, 0.018, 0.42).rotateZ(-0.08).rotateY(0.08).translate(0.15, 1.64, 0), "paper"),
  ];
  // Side-mounted pocket, below the shelf: the book stays visible from either path edge.
  for (const [x, y, z, w, h, d, seed] of [
    [0, 1.04, 0.14, 0.48, 0.055, 0.28, 211],
    [0, 1.24, 0.27, 0.48, 0.36, 0.045, 212],
    [-0.22, 1.22, 0.14, 0.05, 0.32, 0.28, 213],
    [0.22, 1.22, 0.14, 0.05, 0.32, 0.28, 214],
    [0, 1.37, 0.14, 0.52, 0.06, 0.32, 215],
  ]) {
    const geometry = board(w!, h!, d!, seed!).translate(x!, y!, z!).rotateY(side * Math.PI / 2);
    const colors = geometry.getAttribute("color");
    const silver = new Color(tint("rock", "sand", 0.28));
    for (let i = 0; i < colors.count; i++) {
      const grain = 0.86 + colors.getX(i) * 0.25;
      colors.setXYZ(i, silver.r * grain, silver.g * grain, silver.b * grain);
    }
    parts.push(kit(geometry, "wood"));
  }
  return parts;
}

// Collision envelopes stay at their shipped anchors as the visible assets change.
const logBox = new Box3(new Vector3(-1.899674, 0, -0.691764), new Vector3(1.897498, 0.909570, 0.783773));
// Local clearing coordinates: 6.73 m from spawn, on the dry shoulder of the
// actual handoff camera (yaw atan2(7, 9)), with room for the entire log footprint.
const welcomeX = 5, welcomeZ = -4.5;
/** Retain the old seeded collision extents without rendering the old prop geometry. */
function rockCollisionBox(seed: number, scale: number): Box3 {
  const bounds = new Box3();
  const a = Math.fround(0.5257311121191336), b = Math.fround(0.85065080835204);
  for (const signA of [-1, 1]) for (const signB of [-1, 1]) {
    for (const [x, y, z] of [[signA * a, signB * b, 0], [0, signA * a, signB * b], [signB * b, 0, signA * a]]) {
      const wobble = 1 + Math.sin(x! * 9 + z! * 5 + seed) * 0.08;
      bounds.expandByPoint(new Vector3(Math.fround(x! * wobble) * scale * 1.1,
        Math.fround(y! * wobble) * scale * 0.57, Math.fround(z! * wobble) * scale * 0.8));
    }
  }
  bounds.max.y -= bounds.min.y;
  bounds.min.y = 0;
  bounds.max.y = Math.max(bounds.max.y, scale * (1.02 + b * 0.08));
  return bounds;
}

/** Collision-only outline of the shipped crown: the visible pine always uses V2. */
function pineCollisionBox(seed: number): Box3 {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const tiers = 3 + (seed >>> 0) % 3;
  const lean = (random() < 0.5 ? -1 : 1) * (0.2 + random() * 0.12);
  const phase = random() * Math.PI * 2;
  const bounds = new Box3();
  const point = (x: number, z: number) => bounds.expandByPoint(new Vector3(Math.fround(x), 0, Math.fround(z)));
  for (let tier = 0; tier < tiers; tier++) {
    const t = tier / (tiers - 1), radius = (1.82 - t * 1.18) * (0.96 + random() * 0.04);
    random(); // Legacy tier height; consume its seed step before the outline.
    const rim = Array.from({ length: 11 }, () => 0.88 + random() * 0.24);
    const cx = lean * t, cz = Math.sin(phase + t * 2) * 0.07;
    for (let ring = 0; ring < 2; ring++) for (let j = 0; j < 11; j++) {
      const angle = phase + tier * 0.37 + j * Math.PI * 2 / 11;
      const r = radius * rim[j]! * (ring === 0 ? 1 : 0.52);
      random(); // Legacy rim height.
      point(cx + Math.cos(angle) * r + ring * lean * 0.12, cz + Math.sin(angle) * r);
    }
    point(cx + lean * 0.4, cz + 0.04);
    point(cx, cz);
  }
  const size = bounds.getSize(new Vector3());
  const fit = Math.min(1, 2.7 / Math.max(size.x, size.z));
  bounds.min.multiplyScalar(fit);
  bounds.max.multiplyScalar(fit).setY(pineHeight(seed));
  return bounds;
}

export const createFirstLightScene: ZoneSceneFactory = (context) => {
  const group = new Group();
  group.name = "first-light-clearing";
  const buckets: Record<Surface, BufferGeometry[]> = {
    wood: [], paper: [], green: [], stone: [], sun: [], ink: [], flower: [], petal: [],
  };
  const colliders: ZoneCollider[] = [];
  const namedParts: { name: string; surface: Surface; start: number; count: number }[] = [];
  const baked = new Map<BufferGeometry, Omit<BakedBatchPart, "index">>();
  const releaseDetails: (() => void)[] = [];

  /** Check the whole conservative footprint, including overhanging foliage and box corners. */
  function place(parts: Part[], x: number, z: number, solid = false, collisionBox?: Box3): boolean {
    const bounds = new Box3();
    for (const { geometry } of parts) {
      geometry.translate(x, 0, z);
      geometry.computeBoundingBox();
      bounds.union(geometry.boundingBox!);
    }
    // Embed feet by 5 cm; the extended greeting post preserves the book's eye-level anchor.
    if (solid) parts.forEach(({ geometry }) => geometry.translate(0, -bounds.min.y - 0.05, 0));
    if (collisionBox) bounds.union(collisionBox.clone().translate(new Vector3(x, 0, z)));
    let valid = true;
    const nx = Math.max(1, Math.ceil((bounds.max.x - bounds.min.x) / 0.2));
    const nz = Math.max(1, Math.ceil((bounds.max.z - bounds.min.z) / 0.2));
    for (let ix = 0; ix <= nx && valid; ix++) {
      for (let iz = 0; iz <= nz && valid; iz++) {
        const px = bounds.min.x + (bounds.max.x - bounds.min.x) * ix / nx;
        const pz = bounds.min.z + (bounds.max.z - bounds.min.z) * iz / nz;
        valid = Math.abs(px) > PATH_CLEARANCE && Math.hypot(px, pz) > 3
          && !context.onPath(px, pz) && !context.underWater(px, pz);
      }
    }
    const grounded = new Box3();
    for (const { geometry, baked: asset } of parts) {
      const positions = geometry.getAttribute("position");
      if (asset) {
        geometry.computeBoundingBox();
        const base = new Color(hues.stone);
        baked.set(geometry, { asset, bounds: geometry.boundingBox!.clone(),
          colorScale: new Vector3(1 / base.r, 1 / base.g, 1 / base.b) });
      }
      for (let i = 0; i < positions.count; i++) {
        const px = positions.getX(i), pz = positions.getZ(i);
        const py = positions.getY(i) + context.heightAt(px, pz);
        positions.setY(i, py);
        valid &&= Number.isFinite(py) && Math.hypot(px, py, pz) <= ZONE_BUDGET.radius
          && !context.onPath(px, pz) && !context.underWater(px, pz);
      }
      geometry.computeBoundingBox();
      grounded.union(geometry.boundingBox!);
    }
    if (!valid) {
      parts.forEach(({ geometry }) => geometry.dispose());
      return false;
    }
    for (const { geometry, surface, pigment, name } of parts) {
      const flat = geometry.index ? geometry.toNonIndexed() : geometry;
      if (flat !== geometry) geometry.dispose();
      // Rebase kit pigments into each shared material without losing grain or moss colours.
      const source = flat.getAttribute("color");
      const alpha = surface === "sun" ? source : undefined;
      const base = new Color(hues[surface]);
      for (const name of Object.keys(flat.attributes)) {
        if (name !== "position" && !(alpha && name === "color")) flat.deleteAttribute(name);
      }
      const positions = flat.getAttribute("position");
      const colors: number[] = [];
      for (let i = 0; i < positions.count; i++) {
        const wash = 0.94 + Math.sin(positions.getX(i) * 7 + positions.getY(i) * 3 + positions.getZ(i) * 5) * 0.04;
        if (pigment && source) {
          colors.push(source.getX(i) * pigment.r / base.r * wash,
            source.getY(i) * pigment.g / base.g * wash, source.getZ(i) * pigment.b / base.b * wash);
        } else colors.push(wash, wash, wash);
        if (alpha) colors.push(alpha.getW(i));
      }
      flat.setAttribute("color", new Float32BufferAttribute(colors, alpha ? 4 : 3));
      flat.computeVertexNormals();
      if (name) namedParts.push({ name, surface, start: buckets[surface].reduce((n, g) => n + g.getAttribute("position").count, 0), count: positions.count });
      buckets[surface].push(flat);
    }
    if (solid) {
      if (collisionBox) {
        grounded.makeEmpty();
        for (const px of [collisionBox.min.x, collisionBox.max.x]) {
          for (const py of [collisionBox.min.y, collisionBox.max.y]) {
            for (const pz of [collisionBox.min.z, collisionBox.max.z]) {
              grounded.expandByPoint(new Vector3(x + px, py + context.heightAt(x + px, z + pz), z + pz));
            }
          }
        }
      }
      colliders.push({ center: grounded.getCenter(new Vector3()), size: grounded.getSize(new Vector3()) });
    }
    return true;
  }

  // Fixed reachable alternatives handle a path bend or a wet bank without moving anything onto the path.
  const greeting = [[4.8, 3.8], [-4.8, 4.2], [4.8, -4.4], [-4.8, -4.4]]
    .find(([x, z]) => place(notebook(Math.sign(x!)), x!, z!, true,
      new Box3(new Vector3(-0.410982, 0, -0.305), new Vector3(0.408762, 1.660759, 0.305))));
  if (!greeting) throw new RangeError("First Light needs a dry greeting footprint beside the path.");
  const [greetingX, greetingZ] = greeting as [number, number];

  // Bark facets, snapped limbs and end-grain rings come from the shared log kit.
  const log = createLogGeometry(201);
  log.computeBoundingBox();
  const logSize = log.boundingBox!.getSize(new Vector3());
  const logPlaced = place([
    kit(log.scale(3.65 / logSize.x, 0.86 / logSize.y, 0.8 / logSize.z).rotateY(-0.18), "wood"),
  ], -7.2, 3.8, true, logBox);
  if (logPlaced) {
    for (const [index, [x, z]] of [[-8.65, 3.12], [-6.1, 4.45]].entries()) {
      place([kit(createRockGeometry("pebble", 261 + index, true).translate(0, -0.04, 0), "stone")], x!, z!);
    }
  }

  let welcomeCollider: ZoneCollider | undefined;
  // A compact welcome still life, in the opening camera direction.
  {
    const named = (geometry: BufferGeometry, surface: Surface, name: string): Part =>
      ({ ...part(geometry, surface), name });
    const details: Part[] = [];
    for (const side of [-1, 1]) {
      details.push(named(new BoxGeometry(0.38, 0.035, 0.52).rotateZ(side * -0.1)
        .translate(side * 0.19, 0.84, 0), "paper", "seat-open-notebook"));
      for (let line = 0; line < 3; line++) details.push(named(
        new BoxGeometry(0.19 - line * 0.025, 0.004, 0.014).rotateZ(side * -0.1)
          .translate(side * 0.2, 0.866, -0.15 + line * 0.1), "ink", "notebook-ink-strokes"));
    }
    details.push(named(new CylinderGeometry(0.105, 0.085, 0.19, 8, 1, true)
      .translate(0.85, 0.93, 0), "paper", "seat-cup"));
    details.push(named(new TorusGeometry(0.065, 0.018, 4, 8)
      .translate(0.98, 0.94, 0), "paper", "cup-handle"));
    const post = kit(createPostGeometry(1.2, 270).translate(-1.25, -0.05, 0.25), "wood");
    post.name = "seat-mailbox-post";
    details.push(post);
    for (const [y, depth] of [[0.92, 0.3], [1.2, 0.36]]) {
      const board = kit(createPlankGeometry(0.48, 271).scale(1, 0.6, depth! / 0.28)
        .translate(-1.25, y!, 0.25), "wood");
      if (y! > 1) board.geometry.translate(1.25, -y!, -0.25)
        .rotateX(Math.PI / 2).translate(-1.25, 1.08, 0.4);
      board.name = "seat-mailbox-pocket";
      details.push(board);
    }
    const welcomeLog = createLogGeometry(201);
    welcomeLog.computeBoundingBox();
    const size = welcomeLog.boundingBox!.getSize(new Vector3());
    const seatPlaced = place([{ ...kit(welcomeLog.scale(3.65 / size.x, 0.86 / size.y, 0.8 / size.z)
      .rotateY(-0.18), "wood"), name: "welcome-log-seat" }], welcomeX, welcomeZ, true, logBox);
    if (seatPlaced) {
      welcomeCollider = colliders.pop();
      place(details, welcomeX, welcomeZ);
    } else details.forEach(p => p.geometry.dispose());
    for (const dx of [-1.25, 1.35]) place([named(new IcosahedronGeometry(1, 0)
      .scale(0.42, 0.075, 0.3).translate(0, -0.025, 0), "green", "seat-foot-moss")], welcomeX + dx, welcomeZ + 0.2);
  }

  // Three pin-sized orange blooms along the open edge of the fallen pine.
  if (logPlaced) {
    for (const [x, z, height] of [[-5.45, 4.7, 0.25], [-6.25, 3.05, 0.29], [-7.65, 3, 0.27]]) {
      const flowers = [part(new CylinderGeometry(0.009, 0.013, height!, 4)
        .translate(0, height! / 2, 0), "green")];
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal * Math.PI * 2 / 5;
        flowers.push(part(new IcosahedronGeometry(1, 0).scale(0.036, 0.012, 0.026).rotateY(-angle)
          .translate(Math.cos(angle) * 0.026, height!, Math.sin(angle) * 0.026), "flower"));
      }
      place(flowers, x!, z!);
    }
    // One compact orange cluster at the near end: ~25 cm flower heads, still a rare accent.
    const cluster: Part[] = [];
    for (const [x, z, height] of [[-0.12, 0, 0.32], [0.12, 0.04, 0.4], [0, 0.23, 0.35]]) {
      cluster.push(part(new CylinderGeometry(0.012, 0.018, height!, 4)
        .translate(x!, height! / 2, z!), "green"));
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal * Math.PI * 2 / 5;
        cluster.push(part(new IcosahedronGeometry(1, 0).scale(0.072, 0.025, 0.052).rotateY(-angle)
          .translate(x! + Math.cos(angle) * 0.066, height!, z! + Math.sin(angle) * 0.066), "flower"));
      }
    }
    place(cluster, -5.15, 3.2);
  }

  for (const [index, [x, z, scale]] of [[-6.7, 7.2, 1], [-8.3, 7.9, 0.7], [7.5, -2.8, 0.85]].entries()) {
    const rock = createRockGeometry("boulder", 201 + index, true);
    rock.computeBoundingBox();
    const size = rock.boundingBox!.getSize(new Vector3());
    const rockPart = kit(rock.scale(1.8 * scale! / size.x, 1.08 * scale! / size.y, 1.25 * scale! / size.z), "stone");
    rockPart.baked = index % 2 ? "rock-large-2" : "rock-large-1";
    place([rockPart],
      x!, z!, true, rockCollisionBox(context.seed, scale!));
    // Three chips seat each rock without enlarging its collision box.
    for (const [chip, [dx, dz]] of [[0.6, -0.36], [-0.58, 0.26], [0.15, 0.55]].entries()) {
      place([kit(createRockGeometry("pebble", 231 + index * 3 + chip).translate(0, -0.04, 0), "stone")],
        x! + dx! * scale!, z! + dz! * scale!);
    }
  }

  // B2-191b: three full needle-mass pines keep the clearing at 5,176 triangles,
  // below its pre-change 5,200; the retained trees keep their anchors and seeds.
  for (const [index, [x, z]] of [[-10.5, 1], [-11.8, 11], [9.8, 9]].entries()) {
    const seed = (context.seed + index) >>> 0;
    const box = pineCollisionBox(seed);
    place([kit(createPineCrownV2(seed).translate(0, 5, 0), "green", new Color(RAMP_PRESETS.crown))],
      x!, z!, true, box);
  }

  for (const [x, z] of [[-5.8, 6], [-8.8, 2.7], [welcomeX, welcomeZ - 1.6]]) {
    place([{ ...kit(createFern().scale(0.75, 0.6, 0.75).rotateY(context.seed * 0.01 + x!), "green"), name: "welcome-fern" }], x!, z!);
    const flowers: Part[] = [];
    for (let i = 0; i < 3; i++) {
      const fx = 0.8 + i * 0.18, fz = i % 2 * 0.27;
      flowers.push(part(new CylinderGeometry(0.012, 0.018, 0.25 + i * 0.04, 4)
        .translate(fx, (0.25 + i * 0.04) / 2, fz), "green"));
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal * Math.PI * 2 / 5;
        flowers.push(part(new IcosahedronGeometry(1, 0).scale(0.052, 0.015, 0.035).rotateY(-angle)
          .translate(fx + Math.cos(angle) * 0.04, 0.26 + i * 0.04, fz + Math.sin(angle) * 0.04), "petal"));
      }
    }
    flowers.forEach(p => { p.name = "welcome-white-flowers"; });
    place(flowers, x!, z!);
  }

  for (const [x, z, width] of [[6.8, 8, 0.65], [welcomeX, welcomeZ, 1.4]]) {
    const veil = sunVeil(width!);
    place([{ ...part(veil.translate(0, 3, 0).rotateZ(-0.28).rotateY(0.35).translate(0, 0.84, 0), "sun"),
      name: "seat-sun-shaft" }], x!, z!);
  }

  // Two damp clusters beside the greeting post: 2 × (40 fern + 20 moss) = 120 triangles.
  // Independent placement leaves the post footprint, collider and interaction untouched.
  for (const [dx, dz, scale] of [[0.65, 0.35, 0.42], [-0.6, -0.35, 0.36]]) {
    place([
      kit(createFern().scale(scale!, scale!, scale!).rotateY(context.seed * 0.01 + dx!), "green"),
      kit(createRockGeometry("stone", dx! > 0 ? 251 : 252, true).scale(0.65, 0.55, 0.65).translate(-dx! * 0.5, -0.04, 0), "stone"),
    ], greetingX + dx!, greetingZ + dz!);
  }

  place([kit(createRockGeometry("pebble", 253, true).translate(0, -0.04, 0), "stone")], greetingX + 0.15, greetingZ - 0.42);

  if (welcomeCollider) colliders.push(welcomeCollider);

  const materials = {
    wood: createRampMaterial(hues.wood, WORLD_DIRECTION.foliage.ramp),
    paper: createRampMaterial(hues.paper, WORLD_DIRECTION.foliage.ramp),
    green: createRampMaterial(hues.green, WORLD_DIRECTION.foliage.ramp),
    stone: createRampMaterial(hues.stone, WORLD_DIRECTION.foliage.ramp),
    sun: createRampMaterial(hues.sun),
    ink: createRampMaterial(hues.ink, WORLD_DIRECTION.foliage.ramp),
    flower: createRampMaterial(hues.flower, WORLD_DIRECTION.foliage.ramp),
    petal: createRampMaterial(hues.petal, WORLD_DIRECTION.foliage.ramp),
  };
  materials.green.side = DoubleSide;
  for (const surface of Object.keys(buckets) as Surface[]) {
    const material = materials[surface];
    material.vertexColors = true;
    if (!buckets[surface].length) { material.dispose(); continue; }
    const geometry = mergeGeometries(buckets[surface], false)!;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, material);
    releaseDetails.push(deferBakedBatch(mesh, buckets[surface], buckets[surface].flatMap((part, index) => {
      const entry = baked.get(part);
      return entry ? [{ ...entry, index }] : [];
    }), context.heightAt));
    buckets[surface].forEach(geometry => geometry.dispose());
    mesh.name = `first-light-${surface}`;
    geometry.userData.parts = namedParts.filter(p => p.surface === surface);
    mesh.castShadow = false;
    if (surface === "sun") {
      backlitVeil(mesh);
      mesh.raycast = () => {};
    }
    group.add(mesh);
  }

  let disposed = false;
  return {
    zoneId: "first-light", group, colliders,
    interactable: {
      position: new Vector3(greetingX, context.heightAt(greetingX, greetingZ) + 1.1, greetingZ),
      label: { en: "A first hello", vi: "Lời chào đầu" },
    },
    // Dawn veils and foliage are intentionally still, including under reduced motion.
    update() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseDetails.forEach(release => release());
      for (const child of [...group.children]) {
        const mesh = child as Mesh<BufferGeometry, typeof materials.wood>;
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      group.clear();
    },
  };
};
