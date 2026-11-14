import { BufferGeometry, Color, Float32BufferAttribute, Mesh, type Material } from "three";
import { SURF_GLSL, type SurfListener } from "../../audio/waves";
import { PALETTE } from "../art/palette";
import { createPhotoFallback } from "../materials/cc0";
import { createRampMaterial } from "../materials/ramp";
import { worldHeight } from "../terrain/height";
import type { WaterMaterial } from "../water/material";
import { sampleShoreContour, shoreGroundHeight, type ShoreSegment } from "./contour";

let active: { segments: readonly ShoreSegment[]; material(): WaterMaterial } | undefined;

/** Project onto the actual bay/headland contour, including its returning sides. */
export function nearestSurf(x: number, z: number, segments: readonly ShoreSegment[]) {
  let distance = Infinity, shoreX = x, shoreZ = z;
  for (const { a, b } of segments) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const px = a.x + t * dx, pz = a.z + t * dz;
    const d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < distance) { distance = d; shoreX = px; shoreZ = pz; }
  }
  return { distance: Math.sqrt(distance), x: shoreX, z: shoreZ };
}

/** The shell publishes this at its existing 4 Hz cadence; no second clock/timer. */
export function surfAt(x: number, z: number, rightX: number, rightZ: number, height = 0): SurfListener | undefined {
  if (!active) return undefined;
  const shore = nearestSurf(x, z, active.segments);
  const length = Math.max(1, shore.distance);
  return {
    seconds: active.material().uniforms.uTime!.value as number,
    along: shore.x, distance: Math.hypot(shore.distance, Math.max(0, height)),
    pan: Math.max(-1, Math.min(1, ((shore.x - x) * rightX + (shore.z - z) * rightZ) / length)),
  };
}

/** One static 2 m lattice, matching the terrain triangles. Nothing moves on the CPU. */
export function createSurfGeometry(segments: readonly ShoreSegment[]): BufferGeometry {
  const cells = new Set<string>();
  for (const { a, b } of segments) {
    for (let x = Math.floor((Math.min(a.x, b.x) - 5) / 2) * 2; x <= Math.max(a.x, b.x) + 5; x += 2) {
      for (let z = Math.floor((Math.min(a.z, b.z) - 5) / 2) * 2; z <= Math.max(a.z, b.z) + 5; z += 2) {
        cells.add(`${x}:${z}`);
      }
    }
  }
  const positions: number[] = [], distances: number[] = [], along: number[] = [], masks: number[] = [];
  const vertices = new Map<string, number>();
  const indices: number[] = [];
  function vertex(x: number, z: number): number {
    const key = `${x}:${z}`;
    const cached = vertices.get(key);
    if (cached !== undefined) return cached;
    const id = distances.length, h = shoreGroundHeight(x, z), shore = nearestSurf(x, z, segments);
    positions.push(x, Math.max(0, h) + 0.018, z);
    distances.push(shore.distance * (worldHeight(x, z) >= 0 ? 1 : -1));
    along.push(shore.x);
    masks.push(0, 0, 0, 1); // Existing CC0 terrain API selects the sand atlas tile.
    vertices.set(key, id);
    return id;
  }
  for (const cell of cells) {
    const [x, z] = cell.split(":").map(Number) as [number, number];
    if (nearestSurf(x + 1, z + 1, segments).distance > 4.5) continue;
    const a = vertex(x, z), b = vertex(x + 2, z), c = vertex(x, z + 2), d = vertex(x + 2, z + 2);
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("surfDistance", new Float32BufferAttribute(distances, 1));
  geometry.setAttribute("surfAlong", new Float32BufferAttribute(along, 1));
  geometry.setAttribute("cc0Surface", new Float32BufferAttribute(masks, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox();
  return geometry;
}

export function createSurf(material: () => WaterMaterial) {
  const segments = sampleShoreContour();
  const registration = { segments, material };
  active = registration;
  const geometry = createSurfGeometry(segments);
  const source = createRampMaterial(new Color(PALETTE.sand).getHex(), { steps: 4, soft: true });
  const base = createPhotoFallback("terrain", source);
  const mesh = new Mesh<BufferGeometry, Material>(geometry, base);
  // Opt into the existing CC0 surface controller: it supplies/owns photo replacements.
  mesh.name = "terrain-tile";
  mesh.userData.surf = true;
  // Transparent, shader-clipped swash must never become a solid camera/interaction hit.
  mesh.raycast = () => {};
  mesh.renderOrder = 2;
  mesh.receiveShadow = true;
  const time = { value: 0 }, detail = { value: 1 };
  const wetness = { value: 0.34 };
  const water = { value: new Color(PALETTE.seaShallow) };
  const foam = { value: new Color(PALETTE.paper) };
  const decorated = new WeakSet<Material>();
  mesh.onBeforeRender = () => {
    const sea = material();
    time.value = sea.uniforms.uTime!.value as number;
    detail.value = sea.quality === "Low" ? 0 : 1;
    water.value.copy(sea.uniforms.uEdgeColor!.value);
    // CC0's software fallback is unlit; retain cream-white foam instead of
    // applying the sea's dark irradiance a second time over pale dry sand.
    const current = mesh.material;
    if (decorated.has(current)) return;
    decorated.add(current);
    current.transparent = true;
    current.depthWrite = false;
    current.polygonOffset = true;
    current.polygonOffsetFactor = -2;
    current.polygonOffsetUnits = -2;
    const compile = current.onBeforeCompile.bind(current);
    const cacheKey = current.customProgramCacheKey();
    current.customProgramCacheKey = () => `${cacheKey}:surf-v1`;
    current.onBeforeCompile = (shader, renderer) => {
      compile(shader, renderer);
      Object.assign(shader.uniforms, { uSurfTime: time, uSurfDetail: detail, uSurfWetness: wetness, uSurfWater: water, uSurfFoam: foam });
      if (!shader.vertexShader.includes("attribute float surfDistance")) shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
        attribute float surfDistance; attribute float surfAlong;
        varying float vSurfDistance; varying float vSurfAlong; varying float vSurfHeight;`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          vSurfDistance = surfDistance; vSurfAlong = surfAlong; vSurfHeight = position.y;`);
      if (!shader.fragmentShader.includes("uniform float uSurfTime")) shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
        uniform float uSurfTime; uniform float uSurfDetail; uniform float uSurfWetness;
        uniform vec3 uSurfWater; uniform vec3 uSurfFoam;
        varying float vSurfDistance; varying float vSurfAlong; varying float vSurfHeight;
        ${SURF_GLSL}`)
        .replace("#include <opaque_fragment>", `
          float p = surfCycle(uSurfTime, vSurfAlong);
          float runup = surfRunup(p);
          float d = vSurfDistance;
          // Reject cliffs and dry terraces: swash climbs low sand, never a headland.
          float beach = 1.0 - smoothstep(0.28, 0.65, vSurfHeight);
          float border = smoothstep(-1.2, -0.35, d) * (1.0 - smoothstep(2.6, 3.25, d));
          float flooded = (1.0 - smoothstep(runup - 0.18, runup + 0.06, d));
          float edge = 1.0 - smoothstep(0.06, 0.35, abs(d - runup));
          float froth = 0.75 + 0.25 * sin(vSurfAlong * 2.3 + d * 8.0 + uSurfTime * 1.5);
          float draining = smoothstep(0.44, 0.55, p) * (1.0 - smoothstep(0.78, 0.98, p));
          float lace = pow(0.5 + 0.5 * sin(d * 13.0 + vSurfAlong * 1.7), 6.0)
            * draining * flooded * uSurfDetail;
          // A lagged envelope leaves a dark wet band after water recedes, drying before the next wave.
          float wetReach = max(runup, surfRunup(max(0.0, p - 0.15)));
          float wet = (1.0 - smoothstep(wetReach, wetReach + 0.65, d)) * step(0.0, d);
          outgoingLight *= 1.0 - uSurfWetness * wet * uSurfDetail;
          outgoingLight = mix(outgoingLight, uSurfWater, flooded * 0.6 * uSurfDetail);
          outgoingLight = mix(outgoingLight, uSurfFoam, clamp(edge * froth * 0.85 + lace * 0.24, 0.0, 0.95));
          diffuseColor.a = border * beach * max(max(flooded * 0.65 * uSurfDetail, edge), wet * 0.75 * uSurfDetail);
          if (diffuseColor.a < 0.005) discard;
          #include <opaque_fragment>`);
    };
    current.needsUpdate = true;
  };
  let disposed = false;
  return {
    mesh,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (active === registration) active = undefined;
      mesh.removeFromParent(); geometry.dispose(); base.dispose(); source.dispose();
    },
  };
}
