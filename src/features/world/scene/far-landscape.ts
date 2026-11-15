import { BufferAttribute, BufferGeometry, Color, Mesh, MeshBasicMaterial, type Material } from "three";
import { hex } from "../art/palette";
import { foliageBiomeAt } from "../foliage/scatter";
import { createFarMaterial } from "./far-material";
import { farEase, farHeight, farNoise, limitFarSlopes } from "./far-relief";
import { bakeFarHorizons } from "./far-shadows";
import { createFarForest, farForestSites, type FarForestSite } from "./far-forest";
import { nearestPath, nearestRiver } from "../terrain/samples";
import { worldHeight } from "../terrain/height";
import { createTileMesh } from "../terrain/mesh";
import { TERRAIN_RADIUS, TILE_CELLS, TILE_SIZE } from "../terrain/tiles";
import { WORLD_LENGTH } from "../layout/scale";

export const FAR_LANDSCAPE = Object.freeze({
  /** Fixed scenic margins retain the bay, cape and peaks around the shorter route. */
  originX: -1024,
  originZ: -WORLD_LENGTH - 700,
  size: 2048,
  /** 4 m sampling resolves eroded shoulders and the skyline in one draw. */
  cells: 512,
  /** Sink ground below detail tiles; streamed HR crowns sit above it. */
  sink: 0.6,
});

/** High includes the full backdrop diagonal, so a frustum cannot cut off a
 * range's foot while leaving its summit visible. Low retains its short view. */
export const GAMEPLAY_FAR = Object.freeze({ Low: 260, Balanced: 500, High: 2400 });

const canopyDeep = new Color(hex("forestDeep"));
const canopyLight = new Color(hex("forestLight"));
/** B2-239 lifted near forest ground to sunlit moss; the far canopy averages moss and crowns so tile edges stay hidden. */
const canopyMoss = new Color(hex("grass")).lerp(new Color(hex("grassDry")), 0.64);
const FAR_CANOPY_MOSS = 0.38;

/** Coarse faces can bridge a valley above the detailed ground despite the sink.
 * Bound each nearby corner by the lowest fine-grid sample of all adjacent faces.
 * Linear terrain triangles cannot dip below those samples, so neither can this
 * backdrop inside the streamed corridor. Keep remote scenery and crowns intact. */
function* seatFarGround(geometry: BufferGeometry) {
  const { originX, originZ, size, cells } = FAR_LANDSCAPE;
  // Include the full 16 m Low face as well as the finer High neighbours.
  const step = size / cells * 4, fineStep = TILE_SIZE / TILE_CELLS;
  const inner = TERRAIN_RADIUS + step * Math.SQRT2, outer = inner + 48;
  const positions = geometry.getAttribute("position");
  const heights = new Map<string, number>();
  for (let i = 0; i < positions.count; i++) {
    if (i % (cells + 1) === 0) yield;
    const x = originX + positions.getX(i), z = originZ + positions.getZ(i);
    const distance = nearestPath(x, z).distance;
    if (distance >= outer) continue;
    let floor = positions.getY(i);
    for (let gx = Math.floor((x - step) / fineStep); gx <= Math.ceil((x + step) / fineStep); gx++) {
      for (let gz = Math.floor((z - step) / fineStep); gz <= Math.ceil((z + step) / fineStep); gz++) {
        const key = `${gx}:${gz}`;
        let height = heights.get(key);
        if (height === undefined) {
          height = Math.fround(worldHeight(gx * fineStep, gz * fineStep));
          heights.set(key, height);
        }
        floor = Math.min(floor, height);
      }
    }
    // The guaranteed lower envelope ends outside every Low corridor face.
    // Ease back to the remote field rather than cutting it off in one column:
    // that cutoff made a 19 m diagonal wall in the Old Trail overview.
    positions.setY(i, positions.getY(i) + (floor - positions.getY(i)) * (1 - farEase(inner, outer, distance)));
  }
}

/**
 * Trees only stream along the path, so far slopes would read as bare lawn. Where the scatter grows forest (the
 * forest biome, and the wooded coastal ridge above the beach) the far mesh takes a broken canopy colour instead.
 * Cliffs keep their rock, water and beach keep theirs.
 */
function* paintFarCanopy(geometry: BufferGeometry, heights: Float32Array) {
  const { originX, originZ, size, cells } = FAR_LANDSCAPE;
  const stride = cells + 1;
  const step = size / cells;
  const colors = geometry.getAttribute("color");
  const canopy = new Color();
  const ground = new Color();
  for (let x = 0; x <= cells; x++) {
    yield;
    for (let z = 0; z <= cells; z++) {
      const vertex = z + x * stride;
      const wx = originX + x * step, wz = originZ + z * step;
      const height = heights[vertex]!;
      const biome = foliageBiomeAt(wx, wz);
      const forested = biome === "forest-dawn" ? 1 : biome === "coast-dusk" ? Math.min(1, Math.max(0, (height - 4) / 6))
        : farEase(0.32, 0.65, farNoise(wx, wz, 52)) * 0.9;
      const riverDistance = nearestRiver(wx, wz).distance;
      if (forested <= 0 || riverDistance < 14) continue;
      const dx = (heights[Math.min(cells, x + 1) * stride + z]! - heights[Math.max(0, x - 1) * stride + z]!) / (2 * step);
      const dz = (heights[x * stride + Math.min(cells, z + 1)]! - heights[x * stride + Math.max(0, z - 1)]!) / (2 * step);
      const steep = Math.min(1, Math.max(0, (Math.hypot(dx, dz) - 0.8) / 0.4));
      const speckle = (Math.sin(wx * 0.37 + wz * 0.11) * Math.sin(wz * 0.29 - wx * 0.07) + 1) / 2;
      canopy.copy(canopyDeep).lerp(canopyLight, 0.25 + 0.35 * speckle).lerp(canopyMoss, FAR_CANOPY_MOSS);
      ground.fromBufferAttribute(colors, vertex).lerp(canopy, forested * (1 - steep) * 0.85);
      colors.setXYZ(vertex, ground.r, ground.g, ground.b);
    }
  }
  colors.needsUpdate = true;
}

/** Same single draw and vertex data as the synchronous terrain factory. Only construction is sliced.
 * Small square patches reuse the terrain painter; they are copied into one mesh, never added to the scene.
 */
export function createFarLandscape({ deferred = false } = {}) {
  const { originX, originZ, size, cells, sink } = FAR_LANDSCAPE;
  const stride = cells + 1;
  const step = size / cells;
  const firstLightView = { value: 0 };
  const material = createFarMaterial(firstLightView);
  const lowMaterial = new MeshBasicMaterial({ vertexColors: true, depthWrite: false, transparent: true });
  // Low shares the same clearing mask, but avoids PBR and crown detail shading.
  lowMaterial.onBeforeCompile = shader => {
    shader.uniforms.firstLightView = firstLightView;
    shader.fragmentShader = "uniform float firstLightView;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>",
      "#include <clipping_planes_fragment>\nif(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)<firstLightView) discard;");
  };
  lowMaterial.customProgramCacheKey = () => "hr-far-low-v1";
  const geometry = new BufferGeometry();
  const mesh = new Mesh<BufferGeometry, Material>(geometry, material);
  mesh.position.set(originX, -sink, originZ);
  mesh.name = "far-landscape";
  // Transparent sea writes depth at order 0. Test against it *after* its colour
  // draw, so the sea cannot paint a straight far-plane edge over mountain feet.
  // Keep foreground surf (2) and light ribbons (4) in front of this backdrop.
  mesh.renderOrder = 1;
  mesh.visible = false;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.raycast = () => {};
  mesh.updateMatrixWorld(true);
  let disposed = false;
  let highCount = 0, lowCount = 0;
  let forest: ReturnType<typeof createFarForest> | undefined;
  let forestRequested = false;
  const sites: FarForestSite[] = [];
  let software: boolean | undefined;
  mesh.onBeforeRender = renderer => {
    if (software === undefined && renderer.getContext) {
      const gl = renderer.getContext(), debug = gl.getExtension("WEBGL_debug_renderer_info");
      software = /swiftshader|llvmpipe|softpipe|software/i.test(String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)));
    }
    const low = software || renderer.domElement?.closest<HTMLElement>(".world-viewport")?.dataset.worldQuality === "low";
    if (highCount) geometry.setDrawRange(low ? highCount : 0, low ? lowCount : highCount);
    mesh.material = low ? lowMaterial : material;
    material.prepareDepth(renderer, !low && firstLightView.value < 1);
    if (forest) forest.group.visible = !low;
  };
  mesh.onAfterRender = renderer => {
    const viewport = renderer.domElement?.closest<HTMLElement>(".world-viewport");
    if (disposed || forestRequested || viewport && (viewport.dataset.worldQuality === "low" || viewport.dataset.worldBuild !== "done"
      || viewport.dataset.worldIntro !== "done" || viewport.dataset.worldPaused === "true")) return;
    forestRequested = true;
    const gl = renderer.getContext(), debug = gl.getExtension("WEBGL_debug_renderer_info");
    if (debug && /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)))) return;
    void material.startDetail(renderer);
    forest?.start(renderer);
  };
  function* construct() {
    const heights = new Float32Array(stride * stride);
    const positions = new Float32Array(heights.length * 3);
    const normals = new Float32Array(positions.length);
    const colors = new Float32Array(positions.length);
    const indices = new Uint32Array(cells * cells * 6);
    for (let x = 0; x <= cells; x++) {
      for (let z = 0; z <= cells; z++) {
        const vertex = z + x * stride;
        heights[vertex] = farHeight(originX + x * step, originZ + z * step);
        positions.set([x * step, heights[vertex]!, z * step], vertex * 3);
        if (x < cells && z < cells) {
          const next = vertex + stride;
          indices.set([vertex, vertex + 1, next, next, vertex + 1, next + 1], (x * cells + z) * 6);
        }
      }
      yield;
    }
    yield* limitFarSlopes(heights, cells, step, originX);
    for (let i = 0; i < heights.length; i++) positions[i * 3 + 1] = heights[i]!;
    const patchCells = 8;
    for (let x = 0; x < cells; x += patchCells) for (let z = 0; z < cells; z += patchCells) {
      const patchHeights = new Float32Array((patchCells + 1) ** 2);
      for (let px = 0; px <= patchCells; px++) for (let pz = 0; pz <= patchCells; pz++) {
        patchHeights[pz + px * (patchCells + 1)] = heights[z + pz + (x + px) * stride]!;
      }
      const patch = createTileMesh({ cells: patchCells, size: patchCells * step, heights: patchHeights,
        origin: { x: originX + x * step, y: 0, z: originZ + z * step } }, material).geometry;
      try {
        for (let px = 0; px <= patchCells; px++) for (let pz = 0; pz <= patchCells; pz++) {
          const source = (pz + px * (patchCells + 1)) * 3;
          const target = (z + pz + (x + px) * stride) * 3;
          normals.set(patch.getAttribute("normal").array.subarray(source, source + 3), target);
          colors.set(patch.getAttribute("color").array.subarray(source, source + 3), target);
        }
      } finally { patch.dispose(); }
      yield;
    }
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(normals, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    geometry.setIndex(new BufferAttribute(indices, 1));
    yield* paintFarCanopy(geometry, heights);
    yield* seatFarGround(geometry);
    geometry.computeVertexNormals();
    yield* bakeFarHorizons(geometry, cells, step);
    const cheap: number[] = [];
    for (let x = 0; x < cells; x += 4) for (let z = 0; z < cells; z += 4) {
      const a = x * stride + z, b = a + stride * 4;
      cheap.push(a, a + 4, b, b, a + 4, b + 4);
    }
    // Both tier indices live in one GPU buffer; switching quality only moves the
    // draw range, so repeated toggles cannot orphan an old element buffer.
    highCount = indices.length; lowCount = cheap.length;
    const tierIndices = new Uint32Array(highCount + lowCount);
    tierIndices.set(indices); tierIndices.set(cheap, highCount);
    geometry.setIndex(new BufferAttribute(tierIndices, 1));
    geometry.setDrawRange(0, highCount);
    yield* farForestSites(sites);
    // Seat crowns on the rendered backdrop triangles, including FIX-PATCH's
    // lowering; analytic height at a jittered site can float above coarse faces.
    for (const site of sites) {
      const u = (site.x - originX) / step, v = (site.z - originZ) / step;
      const ix = Math.floor(u), iz = Math.floor(v), fx = u - ix, fz = v - iz;
      const a = ix * stride + iz;
      const p = geometry.getAttribute("position");
      site.y = (fx + fz <= 1
        ? p.getY(a) + (p.getY(a + stride) - p.getY(a)) * fx + (p.getY(a + 1) - p.getY(a)) * fz
        : p.getY(a + stride + 1) + (p.getY(a + 1) - p.getY(a + stride + 1)) * (1 - fx)
          + (p.getY(a + stride) - p.getY(a + stride + 1)) * (1 - fz)) - 0.15;
    }
    geometry.userData.farForestSites = sites;
    geometry.userData.highTriangles = indices.length / 3;
    geometry.userData.lowTriangles = cheap.length / 3;
    forest = createFarForest(mesh, sites, originX, originZ, firstLightView);
    geometry.computeBoundingBox();
    yield;
    geometry.computeBoundingSphere();
    mesh.visible = true;
  }
  const build = construct();
  if (!deferred) while (!build.next().done) { /* Compatibility for standalone callers. */ }
  return {
    mesh, build,
    setFirstLightView(weight: number) { firstLightView.value = Math.max(0, Math.min(1, weight)); },
    dispose() {
      if (disposed) return;
      disposed = true;
      build.return();
      mesh.removeFromParent();
      forest?.dispose();
      geometry.dispose();
      material.dispose();
      lowMaterial.dispose();
    },
  };
}
