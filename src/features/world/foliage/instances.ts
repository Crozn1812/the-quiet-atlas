import { Box3, Color, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, type Material, Matrix4, type Mesh, MeshDepthMaterial, MeshDistanceMaterial, Object3D, Ray, RGBADepthPacking, Vector2, Vector3 } from "three";
import { PALETTE } from "../art/palette";
import { paletteColor, WORLD_DIRECTION } from "../art/direction";
import { createRampMaterial, RAMP_PRESETS } from "../materials/ramp";
import { PRESETS, type Quality } from "../terrain";
import { nearestPath } from "../terrain/samples";
import { TRUNK_HEIGHT } from "./colliders";
import type { FoliageTree } from "./scatter";
import { createPineCrownV2 } from "./pine";
import { resumeTreeLibraries } from "./library";
import { advanceHrTrees } from "./hr-runtime";
import { BROADLEAF_BATCH_SEEDS, BROADLEAF_VARIANT_SEEDS, createBroadleafCrown, createTreeTrunk, fitAuthoredTree, loadAuthoredTrees, mossColor, pineHeight, PINE_VARIANT_SEEDS } from "./shapes";

export { createBroadleafCrown, createPineCrown } from "./shapes";

type FoliageWind = { value: Vector2 };
const foliageWinds = new WeakMap<Material, FoliageWind>();
const foliageLoads = new WeakMap<Material, () => void>();
let authoredTrees: ReturnType<typeof loadAuthoredTrees> | undefined;

function advanceWind(wind: FoliageWind, dt: number, reducedMotion: boolean) {
  wind.value.y = reducedMotion ? 0 : 1;
  if (!reducedMotion && Number.isFinite(dt)) wind.value.x += Math.max(0, dt);
}

/** Index can animate compose's public mesh list without accessing tile internals. */
export function updateFoliageWind(meshes: readonly Mesh[], dt: number, reducedMotion: boolean): void {
  if (dt > 0) resumeTreeLibraries(meshes);
  advanceHrTrees(meshes, dt, reducedMotion);
  const updated = new Set<FoliageWind>();
  for (const mesh of meshes) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    const wind = foliageWinds.get(material);
    if (wind && !updated.has(wind)) {
      advanceWind(wind, dt, reducedMotion);
      if (dt > 0) foliageLoads.get(material)?.();
      updated.add(wind);
    }
  }
}

/** Position-only hash: selection survives input ordering, streaming and quality changes. */
export function foliageVariantAt(x: number, z: number, count: number): number {
  let hash = 2166136261;
  const key = `${x}:${z}`;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  return (hash >>> 0) % count;
}

/** Independent hash buckets keep ~30% deep crowns stable through streaming/LOD. */
export function isDeepCrown(x: number, z: number): boolean {
  return foliageVariantAt(x, z, 100) < 30;
}

export function hasHangingFoliage(x: number, z: number): boolean {
  return foliageVariantAt(z + 19.73, x - 41.19, 100) < 40;
}

/** Bark stays below the 0.12 leaf shade floor, after the ramp and before fog/ACES.
 * Pigment remains 0.12–0.22; lighting must not turn it into pale cream. */
function installBarkLighting(material: Material, branches = false) {
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.forestBarkLuma = { value: new Vector2(0.02, 0.05) };
    if (branches) {
      // surface may already be declared by the tree-shape install (it derives "hanging" from it).
      if (!shader.vertexShader.includes("attribute float surface;")) shader.vertexShader = "attribute float surface;\n" + shader.vertexShader;
      shader.vertexShader = "varying float vForestWood;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <color_vertex>", `#include <color_vertex>
vForestWood = step(0.5, surface) * (1.0 - step(1.5, surface));
#ifdef USE_INSTANCING_COLOR
// Deep leaf instances must not tint their wooden branches green.
if (vForestWood > 0.5) vColor.xyz /= instanceColor;
#endif`);
      shader.fragmentShader = "varying float vForestWood;\n" + shader.fragmentShader;
    }
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec2 forestBarkLuma;")
      .replace("#include <opaque_fragment>", `
${branches ? "if (vForestWood > 0.5)" : ""} {
outgoingLight = max(outgoingLight, diffuseColor.rgb * 0.25);
float barkLuma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
outgoingLight *= clamp(barkLuma, forestBarkLuma.x, forestBarkLuma.y) / max(barkLuma, 0.00001);
}
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => previousKey() + `|forest-bark-bounded-v3:${branches}`;
}

/** Reuse Three's graded sun/hemi uniforms; no light copies or extra pass. */
function installLeafLighting(material: Material) {
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
if (vForestWood < 0.5) {
  bool leafBacklit = true;
  #if NUM_DIR_LIGHTS > 0
    float leafNL = clamp(dot(normal, directionalLights[0].direction), -1.0, 1.0);
    leafBacklit = leafNL < 0.0;
    float leafEdge = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
    if (leafBacklit) {
      outgoingLight += diffuseColor.rgb * directionalLights[0].color
        * mix(0.15, 0.25, leafEdge) * (1.0 - leafNL);
    }
  #endif
  // The existing front-lit ramp is retained; rescue only backlit/no-sun leaves.
  // Add only missing ambient luma, preserving relief above the floor.
  // Lead: floor every leaf, also sun-facing leaves inside cast shadow (they rendered black).
  {
    // Lead: rescue with the leaf's own green, only tinted toward the cool shade (was pure shade/sky blue → navy crowns).
    vec3 leafShade = mix(diffuseColor.rgb, rampShadowTint, 0.2) * vec3(1.05, 1.0, 0.72);
    #if NUM_HEMI_LIGHTS > 0
      leafShade = mix(leafShade, leafShade * hemisphereLights[0].skyColor * 2.0, 0.25);
    #endif
    float leafLuma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
    outgoingLight += leafShade * (max(0.075 - leafLuma, 0.0)
      / max(dot(leafShade, vec3(0.2126, 0.7152, 0.0722)), 0.00001));
  }
}
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => previousKey() + "|forest-leaf-light-v2";
}

/** Palette-derived hue wash and independent +/-8% linear brightness. */
function instanceLeafColor(x: number, z: number, base: Color): Color {
  const hue = foliageVariantAt(x + 13.17, z - 7.91, 2001) / 1000 - 1;
  const brightness = 1 + 0.08 * (foliageVariantAt(z + 3.79, x - 29.13, 2001) / 1000 - 1);
  const luma = (color: Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  const color = base.clone().lerp(new Color(hue < 0 ? PALETTE.grass : PALETTE.indigo), Math.abs(hue) * 0.04);
  return color.multiplyScalar(luma(base) * brightness / luma(color));
}

/** Two continuous value-noise samples at most: cutout + painted light wash.
 * Object-space coordinates stay attached to the deformed crown, before wind.
 * Share the cutout verbatim with both existing shadow materials. */
function installPaintedLeaves(material: Material, lighting = false) {
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  material.alphaToCoverage = false;
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    const varyings = `varying vec3 vPaintPosition;
varying vec3 vPaintNormal;
varying vec3 vPaintView;
varying float vPaintSurface;
varying vec2 vPaintNeedle;
`;
    shader.vertexShader = varyings + shader.vertexShader;
    shader.vertexShader = shader.vertexShader
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vPaintPosition = position + mix(shapeA * treeA() + shapeB * treeB(), trailShape, treeStyle.z);
vPaintSurface = surface;
// Negative hanging flag identifies pine using the existing instance attribute.
vPaintNeedle = vec2(1.0 - step(-0.5, treeStyle.y), normal.y);`)
      .replace("#include <project_vertex>", `#include <project_vertex>
// Cofactors preserve the existing smooth normals under nonuniform scale/shear.
mat3 paintAxes = mat3(modelViewMatrix);
#ifdef USE_INSTANCING
paintAxes = paintAxes * mat3(instanceMatrix);
#endif
mat3 paintNormalMatrix = mat3(cross(paintAxes[1], paintAxes[2]),
  cross(paintAxes[2], paintAxes[0]), cross(paintAxes[0], paintAxes[1]));
vPaintNormal = paintNormalMatrix * mix(normal, trailNormal, treeStyle.z);
// Directional shadow cameras are orthographic; point shadows are perspective.
vPaintView = projectionMatrix[2][3] == 0.0 ? vec3(0.0, 0.0, 1.0) : -mvPosition.xyz;`);
    shader.fragmentShader = varyings + `
float paintHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float paintNoise(vec3 p) {
  vec3 cell = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(paintHash(cell), paintHash(cell + vec3(1, 0, 0)), f.x),
                 mix(paintHash(cell + vec3(0, 1, 0)), paintHash(cell + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(paintHash(cell + vec3(0, 0, 1)), paintHash(cell + vec3(1, 0, 1)), f.x),
                 mix(paintHash(cell + vec3(0, 1, 1)), paintHash(cell + vec3(1, 1, 1)), f.x), f.y), f.z);
}
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <alphatest_fragment>", `#include <alphatest_fragment>
// Only cluster leaves: solid branches and narrow hanging ribbons bypass this.
if (vPaintSurface < 0.5) {
  float paintFacing = abs(dot(normalize(vPaintNormal), normalize(vPaintView)));
  float paintRim = 1.0 - smoothstep(0.0, 0.32, paintFacing);
  float paintEdgeFrequency = mix(8.0, 13.0, vPaintNeedle.x);
  if (paintNoise(vPaintPosition * paintEdgeFrequency) < 0.46 * paintRim) discard;
}`);
    if (lighting) shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
if (vPaintSurface < 0.5) {
  // Smooth leaf clumps / finer needles; still only two noise samples.
  float paintWashFrequency = mix(20.0, 30.0, vPaintNeedle.x);
  float paintWash = clamp((paintNoise(vPaintPosition * paintWashFrequency) - 0.5) * 3.0, -1.0, 1.0);
  outgoingLight *= 1.0 + 0.12 * paintWash;
  // Crown-local up survives camera changes/lean; apply after the ambient rescue.
  float paintNeedleShade = mix(0.8, 1.0, smoothstep(-0.1, 0.1, vPaintNeedle.y));
  outgoingLight *= mix(1.0, paintNeedleShade, vPaintNeedle.x);
}
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => previousKey() + `|painted-leaves-v2:${lighting}`;
}

/** Use the same geometry selection in the colour and existing shadow passes.
 * Two absolute shape deltas avoid extra batches or morph textures. */
function installTreeShapes(material: Material, wind: FoliageWind) {
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.forestWind = wind;
    // Lead (batch 25): WebGL guarantees only 16 vertex attributes and instancing already spends 5 (matrix + colour).
    // Variant normals are dropped (base normals light all three silhouettes) and "hanging" is surface == 2.
    if (!shader.vertexShader.includes("attribute float surface;")) shader.vertexShader = "attribute float surface;\n" + shader.vertexShader;
    shader.vertexShader = `uniform vec2 forestWind;
attribute vec3 treeStyle;
attribute vec3 trailShape; attribute vec3 trailNormal;
attribute vec3 shapeA; attribute vec3 shapeB;
float treeA() { return step(0.5, treeStyle.x) - step(1.5, treeStyle.x); }
float treeB() { return step(1.5, treeStyle.x); }
` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader
      .replace("#include <defaultnormal_vertex>", `
objectNormal = mix(objectNormal, trailNormal, treeStyle.z);
#include <defaultnormal_vertex>
#ifdef USE_INSTANCING
// Three's default normal transform assumes orthogonal instance axes. Cofactors
// also handle reaching limbs; positive determinants let normalization cancel it.
mat3 forestAxes = mat3(instanceMatrix);
mat3 forestNormal = mat3(cross(forestAxes[1], forestAxes[2]),
  cross(forestAxes[2], forestAxes[0]), cross(forestAxes[0], forestAxes[1]));
transformedNormal = normalMatrix * forestNormal * objectNormal;
#ifdef FLIP_SIDED
transformedNormal = -transformedNormal;
#endif
#endif`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
transformed += mix(shapeA * treeA() + shapeB * treeB(), trailShape, treeStyle.z);
// Collapse every ribbon vertex to the same point on trees without vines.
transformed *= 1.0 - step(1.5, surface) * (1.0 - treeStyle.y);
#ifdef USE_INSTANCING
float forestPhase = dot(instanceMatrix[3].xz, vec2(0.73, 0.37));
float forestPeriod = 4.0 + 3.0 * (0.5 + 0.5 * sin(forestPhase));
float forestTip = smoothstep(0.0, 6.0, transformed.y);
float forestLeaf = 1.0 - step(0.5, surface) * (1.0 - step(1.5, surface));
float forestSway = 0.08 * forestWind.y * forestTip * forestLeaf
  * sin(forestWind.x * 6.28318530718 / forestPeriod + forestPhase);
// Convert metres back into crown space, including mature scales and limb shear.
transformed += inverse(mat3(modelMatrix) * mat3(instanceMatrix)) * vec3(forestSway, 0.0, 0.0);
#endif`);
  };
  material.customProgramCacheKey = () => previousKey() + "|forest-shapes-v2|affine-normals-v1|forest-wind-v1|trail-canopy-shape-v2";
}

type CrownInverseCache = {
  attribute: InstancedBufferAttribute;
  version: number;
  count: number;
  world: Matrix4;
  source: Float64Array;
  inverses: Matrix4[];
  bounds: Box3;
  worldBounds: Box3[];
  transform: Matrix4;
};
const crownInverseCaches = new WeakMap<InstancedMesh, CrownInverseCache>();

/** Matrices are static between streaming/quality changes; camera motion needs no new inverse. */
function crownTransforms(crowns: InstancedMesh, bounds: Box3): CrownInverseCache {
  const attribute = crowns.instanceMatrix;
  let cache = crownInverseCaches.get(crowns);
  const rebuild = !cache || cache.attribute !== attribute || cache.version !== attribute.version
    || cache.count !== crowns.count || !cache.world.equals(crowns.matrixWorld);
  if (!cache) {
    cache = { attribute, version: attribute.version, count: crowns.count, world: new Matrix4(),
      source: new Float64Array(crowns.count * 16), inverses: [], bounds: bounds.clone(),
      worldBounds: [], transform: new Matrix4() };
    crownInverseCaches.set(crowns, cache);
  }
  const boundsChanged = !cache.bounds.equals(bounds);
  if (cache.source.length < crowns.count * 16) cache.source = new Float64Array(crowns.count * 16);
  for (let i = 0; i < crowns.count; i++) {
    const offset = i * 16;
    let changed = rebuild;
    // setMatrixAt() and direct CPU writes need not set needsUpdate until a later render.
    // Preserve the selector's immediate CPU semantics without inverting unchanged poses.
    if (!changed) for (let j = 0; j < 16; j++) {
      if (cache.source[offset + j] !== attribute.array[offset + j]) { changed = true; break; }
    }
    if (!changed && !boundsChanged) continue;
    const transform = cache.transform;
    crowns.getMatrixAt(i, transform);
    transform.premultiply(crowns.matrixWorld);
    const box = cache.worldBounds[i] ??= new Box3();
    box.copy(bounds).applyMatrix4(transform);
    // Reject only definite misses. A small outward margin absorbs affine/inverse
    // round-off at shared box/segment faces; the original local ray confirms hits.
    box.expandByScalar(1e-7 * Math.max(1, Math.abs(box.min.x), Math.abs(box.min.y), Math.abs(box.min.z),
      Math.abs(box.max.x), Math.abs(box.max.y), Math.abs(box.max.z)));
    if (changed) {
      (cache.inverses[i] ??= new Matrix4()).copy(transform).invert();
      for (let j = 0; j < 16; j++) cache.source[offset + j] = attribute.array[offset + j]!;
    }
  }
  cache.attribute = attribute; cache.version = attribute.version; cache.count = crowns.count;
  cache.world.copy(crowns.matrixWorld);
  cache.bounds.copy(bounds);
  return cache;
}

/**
 * The legacy camera selector uses a fixed sphere at the collider top (5 m).
 * Test the three sight segments against each actual crown's local bounding box
 * instead, so tall crowns, lean, scale and parent transforms need no new threshold.
 * Returned indices belong to this mesh, including after quality compaction.
 */
export function selectFoliageOccludingCrowns(crowns: InstancedMesh, camera: Vector3, player: Vector3): number[] {
  if (!crowns.geometry.boundingBox) crowns.geometry.computeBoundingBox();
  const bounds = crowns.geometry.boundingBox!;
  crowns.updateWorldMatrix(true, false);
  const { inverses, worldBounds } = crownTransforms(crowns, bounds);
  // Every point on all three sight segments lies inside this envelope. Most
  // instances in a nearby streamed batch still lie well outside the short arm.
  const sightBounds = new Box3().setFromPoints([camera, player]);
  sightBounds.min.y = Math.min(camera.y, player.y - 0.65);
  sightBounds.max.y = Math.max(camera.y, player.y + 0.65);
  const start = new Vector3(), end = new Vector3(), hit = new Vector3();
  const ray = new Ray();
  const selected: number[] = [];
  for (let i = 0; i < crowns.count; i++) {
    if (!worldBounds[i]!.intersectsBox(sightBounds)) continue;
    const inverse = inverses[i]!;
    start.copy(camera).applyMatrix4(inverse);
    for (const offset of [-0.65, 0, 0.65]) {
      end.copy(player);
      end.y += offset;
      end.applyMatrix4(inverse);
      const length = end.distanceTo(start);
      if (length === 0) continue;
      ray.set(start, end.sub(start).divideScalar(length));
      if (bounds.containsPoint(start) || (ray.intersectBox(bounds, hit) && start.distanceTo(hit) < length)) {
        selected.push(i);
        break;
      }
    }
  }
  return selected;
}

/** Capacity is per species. Overflow throws before changing the current scene. */
export function createFoliage(maxPerKind: number) {
  if (!Number.isSafeInteger(maxPerKind) || maxPerKind < 0) throw new RangeError("Foliage capacity must be a non-negative integer");
  const group = new Group();
  const trunkGeometry = createTreeTrunk(true);
  const trunkMaterial = createRampMaterial(paletteColor(WORLD_DIRECTION.foliage.trunk), WORLD_DIRECTION.foliage.ramp);
  trunkMaterial.vertexColors = true;
  // Encode the same palette wood/moss pigment relative to the active material.
  const trunkPositions = trunkGeometry.getAttribute("position");
  const trunkNormals = trunkGeometry.getAttribute("normal");
  const trunkColors = trunkGeometry.getAttribute("color");
  for (let i = 0; i < trunkPositions.count; i++) {
    const height = trunkPositions.getY(i) + 0.5;
    const damp = (trunkNormals.getZ(i) + 1) / 2;
    const color = mossColor(height, trunkNormals.getY(i), damp, trunkMaterial.color.getHex());
    trunkColors.setXYZ(i, color.r, color.g, color.b);
  }
  installBarkLighting(trunkMaterial);
  const crownMaterial = createRampMaterial(RAMP_PRESETS.crown);
  crownMaterial.vertexColors = true;
  const depthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  const distanceMaterial = new MeshDistanceMaterial();
  // Disabled until the owner supplies its motion preference through update().
  const wind = { value: new Vector2(0, 0) };
  foliageWinds.set(crownMaterial, wind);
  for (const material of [crownMaterial, depthMaterial, distanceMaterial]) installTreeShapes(material, wind);
  installBarkLighting(crownMaterial, true);
  installLeafLighting(crownMaterial);
  installPaintedLeaves(crownMaterial, true);
  installPaintedLeaves(depthMaterial);
  installPaintedLeaves(distanceMaterial);
  const deep = new Color(PALETTE.forestDeep);
  function createSpecies(seeds: readonly number[], broadleaf: boolean) {
    const variants = seeds.map(seed => {
      // V2 already uses crown-local Y=-TRUNK_HEIGHT at the root. Preserve its
      // surface tags so wood stays rigid and bypasses leaf translucency/tint.
      const geometry = broadleaf ? createBroadleafCrown() : createPineCrownV2(seed);
      const position = geometry.getAttribute("position");
      for (const [targetIndex, suffix] of [[1, "A"], [2, "B"]] as const) {
        const target = broadleaf ? createBroadleafCrown(BROADLEAF_VARIANT_SEEDS[targetIndex]) : undefined;
        for (const [source, attribute] of [[position, "shape"]] as const) {
          const values = new Float32Array(source.count * 3);
          if (target) {
            const end = target.getAttribute(attribute === "shape" ? "position" : "normal");
            for (let i = 0; i < values.length; i++) values[i] = end.array[i]! - source.array[i]!;
          }
          geometry.setAttribute(attribute + suffix, new Float32BufferAttribute(values, 3));
        }
        if (target) { geometry.boundingBox!.union(target.boundingBox!); target.dispose(); }
      }
      // Bounds include all three real silhouettes; camera selection stays conservative.
      geometry.boundingBox!.getBoundingSphere(geometry.boundingSphere!);
      const trail = broadleaf ? createBroadleafCrown(BROADLEAF_VARIANT_SEEDS[0], true) : undefined;
      const trailValues = new Float32Array(position.count * 3);
      if (trail) {
        const target = trail.getAttribute("position");
        for (let i = 0; i < trailValues.length; i++) trailValues[i] = target.array[i]! - position.array[i]!;
        geometry.boundingBox!.union(trail.boundingBox!);
        geometry.boundingBox!.getBoundingSphere(geometry.boundingSphere!);
        trail.dispose();
      }
      geometry.setAttribute("trailNormal", (trail?.getAttribute("normal") ?? geometry.getAttribute("normal")).clone());
      geometry.setAttribute("trailShape", new Float32BufferAttribute(trailValues, 3));
      geometry.setAttribute("treeStyle", new InstancedBufferAttribute(new Float32Array(maxPerKind * 3), 3));
      const crowns = new InstancedMesh(geometry, crownMaterial, maxPerKind);
      crowns.customDepthMaterial = depthMaterial;
      crowns.customDistanceMaterial = distanceMaterial;
      return { seed, trunks: new InstancedMesh(trunkGeometry, trunkMaterial, maxPerKind), crowns, crownBounds: geometry.boundingBox!.clone() };
    });
    // Legacy material access targets variant zero; all variants share those materials.
    return { trunks: variants[0]!.trunks, crowns: variants[0]!.crowns, variants };
  }
  const species = {
    pine: createSpecies(PINE_VARIANT_SEEDS, false),
    broadleaf: { ...createSpecies(BROADLEAF_BATCH_SEEDS, true), shapeSeeds: BROADLEAF_VARIANT_SEEDS },
  };
  const meshes = Object.values(species).flatMap(({ variants }) => variants.flatMap(({ trunks, crowns }) => [trunks, crowns]));
  for (const mesh of meshes) {
    mesh.count = 0;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  let trees: readonly FoliageTree[] = [];
  let quality: Quality = "High";
  let disposed = false;
  const replacements = new Map<typeof species.pine.variants[number], { procedural: typeof trunkGeometry; authored: typeof trunkGeometry }>();
  let requested = false;
  function requestTrees() {
    if (requested || disposed || quality === "Low" || typeof window === "undefined" || typeof window.setTimeout !== "function") return;
    requested = true;
    // First active frame has entered play. Yield a paint before importing decoders/fetching.
    window.setTimeout(() => {
      if (disposed) return;
      authoredTrees ??= loadAuthoredTrees().catch(error => { authoredTrees = undefined; throw error; });
      void authoredTrees.then(assets => {
        if (disposed) return;
        const pending: typeof replacements = new Map();
        try {
          for (const [kind, { variants }] of Object.entries(species)) for (const variant of variants) {
            const original = variant.crowns.geometry;
            const offset = kind === "pine" ? 0 : 3;
            const shapes = (kind === "pine" ? [assets[offset + PINE_VARIANT_SEEDS.indexOf(variant.seed as 300 | 301 | 302)]!] : assets.slice(3))
              .map(asset => fitAuthoredTree(asset, original));
            const geometry = shapes[0]!;
            const position = geometry.getAttribute("position");
            // Recover the old reaching silhouette before replacing the base geometry.
            const expanded = original.toNonIndexed();
            for (const [name, target] of [["shapeA", shapes[1]], ["shapeB", shapes[2]], ["trailShape", expanded]] as const) {
              const values = new Float32Array(position.count * 3);
              if (target) {
                const p = target.getAttribute("position"), trail = expanded.getAttribute("trailShape");
                for (let i = 0; i < values.length; i++) values[i] = p.array[i]! + (name === "trailShape" ? trail.array[i]! : 0) - position.array[i]!;
                geometry.boundingBox!.union(target.boundingBox ?? original.boundingBox!);
              }
              geometry.setAttribute(name, new Float32BufferAttribute(values, 3));
            }
            geometry.setAttribute("trailNormal", expanded.getAttribute("trailNormal").clone());
            geometry.setAttribute("treeStyle", original.getAttribute("treeStyle"));
            geometry.boundingBox!.union(original.boundingBox!);
            geometry.boundingBox!.getBoundingSphere(geometry.boundingSphere!);
            expanded.dispose(); shapes.slice(1).forEach(shape => shape.dispose());
            pending.set(variant, { procedural: original, authored: geometry });
          }
          for (const [variant, pair] of pending) replacements.set(variant, pair);
          applyTreeQuality(); update();
        } catch {
          for (const pair of pending.values()) pair.authored.dispose();
          // Malformed/over-budget assets retain the complete procedural fallback.
        }
      }).catch(() => { /* Network/decoder failure never blocks play. */ });
    }, 0);
  }
  function applyTreeQuality() {
    for (const [variant, pair] of replacements) {
      variant.crowns.geometry = quality === "Low" ? pair.procedural : pair.authored;
      variant.crownBounds.copy(variant.crowns.geometry.boundingBox!);
    }
  }
  foliageLoads.set(crownMaterial, requestTrees);
  const transform = new Object3D();
  function update() {
    if (disposed) throw new Error("Foliage has been disposed");
    for (const mesh of meshes) mesh.count = 0;
    for (const { variants } of Object.values(species)) for (const { crowns, crownBounds } of variants) {
      crowns.geometry.boundingBox!.copy(crownBounds);
    }
    const count = Math.round(trees.length * PRESETS[quality].density);
    // Stratified selection spans all tiles and species; total count is exact.
    for (let i = 0; i < count; i++) {
      const tree = trees[Math.floor((i + 0.5) * trees.length / count)]!;
      const { variants } = species[tree.kind];
      const { seed, trunks, crowns } = variants[foliageVariantAt(tree.x, tree.z, variants.length)]!;
      const index = trunks.count++;
      crowns.count++;
      // Ordinary trees vary from 0.8 to 1.3; trail crowns use 1.35–1.40.
      // Limit pine height to 14–18 m while
      // retaining its width variation and leaving every physics cylinder alone.
      const nominalHeight = pineHeight(seed);
      // Grow trail trees uniformly; authored limbs leave the leader upright.
      const heightScale = tree.kind === "pine" ? Math.max(14, Math.min(18, nominalHeight * tree.scale)) / nominalHeight
        : tree.scale * (tree.trailCanopy ? 3 : 1);
      const anchorHeight = TRUNK_HEIGHT * heightScale;
      // Extend the visual trunk slightly into the crown to hide the join.
      const height = tree.kind === "pine" ? nominalHeight * (2 / 3 + 0.05) * heightScale : anchorHeight;
      transform.rotation.set(0, 0, tree.lean);
      transform.position.set(tree.x - Math.sin(tree.lean) * height / 2, tree.y + Math.cos(tree.lean) * height / 2, tree.z);
      transform.scale.set(1, height, 1);
      transform.updateMatrix();
      trunks.setMatrixAt(index, transform.matrix);
      // Neutral per-tree bark variation; never reuse the green crown tint.
      const barkValue = 0.96 + 0.08 * foliageVariantAt(tree.x - 5.31, tree.z + 9.17, 2001) / 2000;
      trunks.setColorAt(index, new Color(barkValue, barkValue, barkValue));
      transform.position.set(tree.x - Math.sin(tree.lean) * anchorHeight, tree.y + Math.cos(tree.lean) * anchorHeight, tree.z);
      transform.scale.set(tree.scale, heightScale, tree.scale);
      let trailShape = 0;
      if (tree.trailCanopy && tree.kind === "broadleaf") {
        const path = nearestPath(tree.x, tree.z);
        // Face the existing reaching limbs toward the trail.
        transform.rotateY(Math.atan2(tree.z - path.z, path.x - tree.x));
        transform.scale.setScalar(heightScale);
        trailShape = 1;
      }
      transform.updateMatrix();
      crowns.setMatrixAt(index, transform.matrix);
      const pigment = instanceLeafColor(tree.x, tree.z, isDeepCrown(tree.x, tree.z) ? deep : crownMaterial.color);
      // Instance colours multiply the shared ramp colour; compensate in linear RGB.
      pigment.setRGB(pigment.r / crownMaterial.color.r, pigment.g / crownMaterial.color.g, pigment.b / crownMaterial.color.b);
      crowns.setColorAt(index, pigment);
      const style = crowns.geometry.getAttribute("treeStyle");
      style.setXYZ(index, tree.kind === "broadleaf" ? foliageVariantAt(tree.x, tree.z, BROADLEAF_VARIANT_SEEDS.length) : 0,
        tree.kind === "pine" ? -1 : hasHangingFoliage(tree.x, tree.z) ? 1 : 0, trailShape);
    }
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      const style = mesh.geometry.getAttribute("treeStyle");
      if (style) {
        style.needsUpdate = true;
        mesh.geometry.boundingBox!.getBoundingSphere(mesh.geometry.boundingSphere!);
      }
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      // Include GPU canopy reach in culling and camera occlusion bounds.
      if (species.broadleaf.variants.some(variant => variant.crowns === mesh)) mesh.boundingBox!.getBoundingSphere(mesh.boundingSphere!);
      if (style) {
        // Conservative at rest too, so toggling motion cannot cause edge culling.
        mesh.boundingBox!.expandByScalar(0.08);
        mesh.boundingSphere!.radius += 0.08;
      }
    }
  }
  return {
    group,
    species,
    update(dt: number, reducedMotion: boolean) {
      if (disposed) throw new Error("Foliage has been disposed");
      advanceWind(wind, dt, reducedMotion);
      if (dt > 0) requestTrees();
    },
    setTiles(next: readonly FoliageTree[]) {
      if (disposed) throw new Error("Foliage has been disposed");
      for (const kind of ["pine", "broadleaf"] as const) {
        if (next.filter(tree => tree.kind === kind).length > maxPerKind) throw new RangeError(`Foliage capacity exceeded: ${kind}`);
      }
      trees = next.map(tree => ({ ...tree }));
      update();
    },
    setQuality(next: Quality) {
      if (disposed) throw new Error("Foliage has been disposed");
      quality = next;
      applyTreeQuality();
      update();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      foliageWinds.delete(crownMaterial);
      foliageLoads.delete(crownMaterial);
      trees = [];
      group.removeFromParent();
      group.clear();
      for (const mesh of meshes) { mesh.count = 0; mesh.dispose(); }
      trunkGeometry.dispose();
      for (const { variants } of Object.values(species)) {
        for (const variant of variants) {
          const pair = replacements.get(variant);
          if (pair) { pair.procedural.dispose(); pair.authored.dispose(); }
          else variant.crowns.geometry.dispose();
        }
      }
      replacements.clear();
      trunkMaterial.dispose();
      crownMaterial.dispose();
      depthMaterial.dispose();
      distanceMaterial.dispose();
      // Ramp gradients are shared and owned by the world, not this factory.
    },
  };
}
