import {
  Box3, BoxGeometry, BufferGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute,
  Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Vector3,
  type DirectionalLight, type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paletteColor, WORLD_DIRECTION } from "../art/direction";
import type { PaletteKey } from "../art/palette";
import { createPineCrown, createTreeTrunk } from "../foliage/shapes";
import { createRampMaterial } from "../materials/ramp";
import { pathPointAt } from "../layout/path";
import { ZONES } from "../layout/zones";
import { lightingAt } from "../sky/grade";
import { waterLevelAt } from "../terrain/height";
import { nearestRiver } from "../terrain/samples";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneCollider, type ZoneSceneFactory } from "./types";

type Surface = "wood" | "paper" | "green" | "stone" | "sun" | "ink" | "flower" | "petal";
type Part = { geometry: BufferGeometry; surface: Surface };
const part = (geometry: BufferGeometry, surface: Surface): Part => ({ geometry, surface });
const tint = (base: PaletteKey, mix: PaletteKey, amount: number) =>
  paletteColor({ base, mix, amount, saturation: 1, brightness: 1 });

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

export const FOREST_SUN_SHAFT_PROGRESS = Object.freeze([0.065, 0.105, 0.29]);

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

/** An uneven octagonal plank, with one small bevel around both caps. */
function plank(width: number, height: number, depth: number): BufferGeometry {
  const cut = Math.min(width, height) * 0.13;
  const outline = [
    [-width / 2 + cut, -height / 2], [width / 2 - cut, -height / 2],
    [width / 2, -height / 2 + cut], [width / 2 - cut * 0.15, height / 2 - cut],
    [width / 2 - cut, height / 2], [-width / 2 + cut, height / 2 - cut * 0.1],
    [-width / 2, height / 2 - cut], [-width / 2, -height / 2 + cut],
  ];
  const positions: number[] = [];
  const bevel = Math.min(depth * 0.2, cut * 0.25);
  const vertex = (ring: number, index: number) => {
    const [x, y] = outline[index]!;
    const inset = ring === 0 || ring === 3 ? 0.95 : 1;
    positions.push(x! * inset, y! * inset,
      [-depth / 2, -depth / 2 + bevel, depth / 2 - bevel, depth / 2][ring]!);
  };
  for (let i = 1; i < 7; i++) {
    vertex(0, 0); vertex(0, i + 1); vertex(0, i);
    vertex(3, 0); vertex(3, i); vertex(3, i + 1);
  }
  for (let ring = 0; ring < 3; ring++) {
    for (let i = 0; i < 8; i++) {
      const next = (i + 1) % 8;
      vertex(ring, i); vertex(ring, next); vertex(ring + 1, next);
      vertex(ring, i); vertex(ring + 1, next); vertex(ring + 1, i);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

function notebook(): Part[] {
  return [
    part(plank(0.19, 1.4, 0.18).translate(0, 0.7, 0), "ink"),
    part(plank(0.82, 0.12, 0.61).rotateZ(-0.025).translate(0, 1.42, 0), "wood"),
    // A broad cover overhang and thick paper block keep the book readable above the shelf.
    part(plank(0.66, 0.045, 0.48).rotateY(0.08).translate(0, 1.5225, 0), "wood"),
    part(new BoxGeometry(0.61, 0.075, 0.43).rotateY(0.08).translate(0, 1.5825, 0), "paper"),
    // Two blank, gently opened pages; all writing belongs to the HTML overlay.
    part(new BoxGeometry(0.295, 0.018, 0.42).rotateZ(0.08).rotateY(0.08).translate(-0.15, 1.64, 0), "paper"),
    part(new BoxGeometry(0.295, 0.018, 0.42).rotateZ(-0.08).rotateY(0.08).translate(0.15, 1.64, 0), "paper"),
  ];
}

/** Five arched fronds, paired leaflets: a few readable clusters rather than scattered grass. */
function fern(compact = false): BufferGeometry {
  const positions: number[] = [];
  const fronds = compact ? 4 : 5, segments = compact ? 4 : 5, leaflets = compact ? 3 : 5;
  for (let frond = 0; frond < fronds; frond++) {
    const angle = frond * Math.PI * 2 / fronds;
    const point = (r: number, side: number, y: number) => {
      positions.push(Math.cos(angle) * r - Math.sin(angle) * side, y,
        Math.sin(angle) * r + Math.cos(angle) * side);
    };
    for (let segment = 0; segment < segments; segment++) {
      const a = segment / 6, b = (segment + 1) / 6;
      point(a * 0.72, -0.009, Math.sin(a * Math.PI * 0.8) * 0.52);
      point(a * 0.72, 0.009, Math.sin(a * Math.PI * 0.8) * 0.52);
      point(b * 0.72, 0, Math.sin(b * Math.PI * 0.8) * 0.52);
    }
    for (let leaf = 0; leaf < leaflets; leaf++) {
      const t = (leaf + 1) / (leaflets + 1);
      const r = t * 0.72;
      const y = Math.sin(t * Math.PI * 0.8) * 0.52;
      const width = 0.16 * (1 - t * 0.6);
      for (const side of [-1, 1]) {
        point(r - 0.09, 0, y - 0.035);
        point(r + 0.035, side * width, y + 0.018);
        point(r + 0.09, 0, y + 0.025);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

export const createFirstLightScene: ZoneSceneFactory = (context) => {
  const group = new Group();
  group.name = "first-light-clearing";
  const buckets: Record<Surface, BufferGeometry[]> = {
    wood: [], paper: [], green: [], stone: [], sun: [], ink: [], flower: [], petal: [],
  };
  const colliders: ZoneCollider[] = [];

  /** Check the whole conservative footprint, including overhanging foliage and box corners. */
  function place(parts: Part[], x: number, z: number, solid = false): boolean {
    const bounds = new Box3();
    for (const { geometry } of parts) {
      geometry.translate(x, 0, z);
      geometry.computeBoundingBox();
      bounds.union(geometry.boundingBox!);
    }
    // Ground each solid assembly by its lowest foot, then follow terrain across its footprint.
    if (solid) parts.forEach(({ geometry }) => geometry.translate(0, -bounds.min.y, 0));
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
    for (const { geometry } of parts) {
      const positions = geometry.getAttribute("position");
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
    for (const { geometry, surface } of parts) {
      const flat = geometry.index ? geometry.toNonIndexed() : geometry;
      if (flat !== geometry) geometry.dispose();
      // Normalize attributes for mergeGeometries; neutral vertex pigment multiplies palette hue.
      const alpha = surface === "sun" ? flat.getAttribute("color") : undefined;
      for (const name of Object.keys(flat.attributes)) {
        if (name !== "position" && !(alpha && name === "color")) flat.deleteAttribute(name);
      }
      const positions = flat.getAttribute("position");
      const colors: number[] = [];
      for (let i = 0; i < positions.count; i++) {
        const wash = 0.94 + Math.sin(positions.getX(i) * 7 + positions.getY(i) * 3 + positions.getZ(i) * 5) * 0.04;
        colors.push(wash, wash, wash);
        if (alpha) colors.push(alpha.getW(i));
      }
      flat.setAttribute("color", new Float32BufferAttribute(colors, alpha ? 4 : 3));
      flat.computeVertexNormals();
      buckets[surface].push(flat);
    }
    if (solid) colliders.push({ center: grounded.getCenter(new Vector3()), size: grounded.getSize(new Vector3()) });
    return true;
  }

  // Fixed reachable alternatives handle a path bend or a wet bank without moving anything onto the path.
  const greeting = [[4.8, 3.8], [-4.8, 4.2], [4.8, -4.4], [-4.8, -4.4]]
    .find(([x, z]) => place(notebook(), x!, z!, true));
  if (!greeting) throw new RangeError("First Light needs a dry greeting footprint beside the path.");
  const [greetingX, greetingZ] = greeting as [number, number];

  // Fallen pine seat: low bark cylinder, exposed end grain, one broad moss wash.
  const logPlaced = place([
    part(new CylinderGeometry(0.39, 0.46, 3.7, 9).rotateZ(Math.PI / 2).rotateY(-0.18).translate(0, 0.46, 0), "ink"),
    ...[-1, 1].map(side => part(new CylinderGeometry(0.34, 0.34, 0.018, 9)
      .rotateZ(Math.PI / 2).translate(side * 1.86, 0, 0).rotateY(-0.18).translate(0, 0.46, 0), "wood")),
    part(new IcosahedronGeometry(1, 0).scale(1.45, 0.09, 0.29).rotateY(-0.18).translate(0, 0.84, 0), "green"),
  ], -7.2, 3.8, true);

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

  for (const [x, z, scale] of [[-6.7, 7.2, 1], [-8.3, 7.9, 0.7], [7.5, -2.8, 0.85]]) {
    const rock = new IcosahedronGeometry(1, 0);
    const vertices = rock.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) {
      const wobble = 1 + Math.sin(vertices.getX(i) * 9 + vertices.getZ(i) * 5 + context.seed) * 0.08;
      vertices.setXYZ(i, vertices.getX(i) * wobble, vertices.getY(i) * wobble, vertices.getZ(i) * wobble);
    }
    rock.scale(scale! * 1.1, scale! * 0.57, scale! * 0.8);
    rock.computeBoundingBox();
    rock.translate(0, -rock.boundingBox!.min.y, 0);
    place([
      part(rock, "stone"),
      part(new IcosahedronGeometry(1, 0).scale(scale! * 0.7, scale! * 0.08, scale! * 0.49)
        .translate(-0.08, scale! * 1.02, 0), "green"),
    ], x!, z!, true);
  }

  for (const [index, [x, z]] of [[-10.5, 1], [-11.8, 11], [9.8, 9], [12.5, -5.5]].entries()) {
    place([
      part(createTreeTrunk().scale(1, 5, 1).translate(0, 2.5, 0), "ink"),
      part(createPineCrown((context.seed + index) >>> 0).translate(0, 5, 0), "green"),
    ], x!, z!, true);
  }

  for (const [x, z] of [[-5.8, 6], [-8.8, 2.7], [6.7, 5.8]]) {
    place([part(fern(), "green")], x!, z!);
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
    place(flowers, x!, z!);
  }

  for (const [x, z, width] of [[6.8, 8, 0.65], [-8.5, 10, 0.95]]) {
    const veil = sunVeil(width!);
    place([part(veil.rotateZ(-0.28).rotateY(0.35).translate(0, 4.2, 0), "sun")], x!, z!);
  }

  // Two damp clusters beside the greeting post: 2 × (40 fern + 20 moss) = 120 triangles.
  // Independent placement leaves the post footprint, collider and interaction untouched.
  for (const [dx, dz, scale] of [[0.65, 0.35, 0.42], [-0.6, -0.35, 0.36]]) {
    place([
      part(fern(true).scale(scale!, scale!, scale!).rotateY(context.seed * 0.01 + dx!), "green"),
      part(new IcosahedronGeometry(1, 0).scale(0.25, 0.055, 0.19).translate(-dx! * 0.5, 0.06, 0), "green"),
    ], greetingX + dx!, greetingZ + dz!);
  }

  const materials = {
    wood: createRampMaterial(tint("dusk", "rockDark", 0.65), WORLD_DIRECTION.foliage.ramp),
    paper: createRampMaterial(tint("cloud", "cloud", 0), WORLD_DIRECTION.foliage.ramp),
    green: createRampMaterial(tint("grass", "forestDeep", 0.6), WORLD_DIRECTION.foliage.ramp),
    stone: createRampMaterial(tint("rock", "rockDark", 0.2), WORLD_DIRECTION.foliage.ramp),
    sun: createRampMaterial(tint("sunGold", "cloud", 0.7)),
    ink: createRampMaterial(tint("rockDark", "forestDeep", 0.45), WORLD_DIRECTION.foliage.ramp),
    flower: createRampMaterial(tint("flower", "flower", 0), WORLD_DIRECTION.foliage.ramp),
    petal: createRampMaterial(tint("grassDry", "grassDry", 0), WORLD_DIRECTION.foliage.ramp),
  };
  materials.green.side = DoubleSide;
  for (const surface of Object.keys(buckets) as Surface[]) {
    const material = materials[surface];
    material.vertexColors = true;
    if (!buckets[surface].length) { material.dispose(); continue; }
    const geometry = mergeGeometries(buckets[surface], false)!;
    buckets[surface].forEach(geometry => geometry.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, material);
    mesh.name = `first-light-${surface}`;
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
      for (const child of [...group.children]) {
        const mesh = child as Mesh<BufferGeometry, typeof materials.wood>;
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      group.clear();
    },
  };
};
