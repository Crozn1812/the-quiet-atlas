import { Color, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, type Material, Matrix4, type Mesh, MeshDepthMaterial, MeshDistanceMaterial, Object3D, Ray, RGBADepthPacking, Vector2, Vector3 } from "three";
import { PALETTE } from "../art/palette";
import { paletteColor, WORLD_DIRECTION } from "../art/direction";
import { createRampMaterial, RAMP_PRESETS } from "../materials/ramp";
import { PRESETS, type Quality } from "../terrain";
import { nearestPath } from "../terrain/samples";
import { TRUNK_HEIGHT } from "./colliders";
import type { FoliageTree } from "./scatter";
import { BROADLEAF_BATCH_SEEDS, BROADLEAF_VARIANT_SEEDS, createBroadleafCrown, createPineCrown, createTreeTrunk, mossColor, pineHeight, PINE_VARIANT_SEEDS } from "./shapes";

export { createBroadleafCrown, createPineCrown } from "./shapes";

type FoliageWind = { value: Vector2 };
const foliageWinds = new WeakMap<Material, FoliageWind>();

function advanceWind(wind: FoliageWind, dt: number, reducedMotion: boolean) {
  wind.value.y = reducedMotion ? 0 : 1;
  if (!reducedMotion && Number.isFinite(dt)) wind.value.x += Math.max(0, dt);
}

/** Index can animate compose's public mesh list without accessing tile internals. */
export function updateFoliageWind(meshes: readonly Mesh[], dt: number, reducedMotion: boolean): void {
  const updated = new Set<FoliageWind>();
  for (const mesh of meshes) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    const wind = foliageWinds.get(material);
    if (wind && !updated.has(wind)) {
      advanceWind(wind, dt, reducedMotion);
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

/** Bound wood after the shared ramp, before fog/ACES. This linear interval also
 * stays below 0.55 display luma with the world's ACES exposure of one. */
function installBarkLighting(material: Material, branches = false) {
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.forestBarkLuma = { value: new Vector2(0.15, 0.18) };
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
outgoingLight = max(outgoingLight, diffuseColor.rgb * 0.85);
float barkLuma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
outgoingLight *= clamp(barkLuma, forestBarkLuma.x, forestBarkLuma.y) / max(barkLuma, 0.00001);
}
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => previousKey() + `|forest-bark-bounded-v2:${branches}`;
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
  if (leafBacklit) {
    vec3 leafShade = rampShadowTint;
    #if NUM_HEMI_LIGHTS > 0
      leafShade = mix(leafShade, hemisphereLights[0].skyColor, 0.5);
    #endif
    float leafLuma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
    outgoingLight += leafShade * (max(0.06 - leafLuma, 0.0)
      / max(dot(leafShade, vec3(0.2126, 0.7152, 0.0722)), 0.00001));
  }
}
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => previousKey() + "|forest-leaf-light-v1";
}

/** Palette-derived hue wash and independent +/-8% linear brightness. */
function instanceLeafColor(x: number, z: number, base: Color): Color {
  const hue = foliageVariantAt(x + 13.17, z - 7.91, 2001) / 1000 - 1;
  const brightness = 1 + 0.08 * (foliageVariantAt(z + 3.79, x - 29.13, 2001) / 1000 - 1);
  const luma = (color: Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  const color = base.clone().lerp(new Color(hue < 0 ? PALETTE.grass : PALETTE.indigo), Math.abs(hue) * 0.04);
  return color.multiplyScalar(luma(base) * brightness / luma(color));
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
attribute vec2 treeStyle;
attribute vec3 shapeA; attribute vec3 shapeB;
float treeA() { return step(0.5, treeStyle.x) - step(1.5, treeStyle.x); }
float treeB() { return step(1.5, treeStyle.x); }
` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader
      .replace("#include <defaultnormal_vertex>", `#include <defaultnormal_vertex>
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
transformed += shapeA * treeA() + shapeB * treeB();
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
  material.customProgramCacheKey = () => previousKey() + "|forest-shapes-v2|affine-normals-v1|forest-wind-v1";
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
  const inverse = new Matrix4();
  const start = new Vector3(), end = new Vector3(), hit = new Vector3();
  const ray = new Ray();
  const selected: number[] = [];
  for (let i = 0; i < crowns.count; i++) {
    crowns.getMatrixAt(i, inverse);
    inverse.premultiply(crowns.matrixWorld).invert();
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
  const deep = new Color(PALETTE.forestDeep);
  function createSpecies(seeds: readonly number[], broadleaf: boolean) {
    const variants = seeds.map(seed => {
      const geometry = broadleaf ? createBroadleafCrown() : createPineCrown(seed);
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
      if (!broadleaf) {
        geometry.setAttribute("surface", new Float32BufferAttribute(new Float32Array(position.count), 1));
      }
      // Bounds include all three real silhouettes; camera selection stays conservative.
      geometry.boundingBox!.getBoundingSphere(geometry.boundingSphere!);
      geometry.setAttribute("treeStyle", new InstancedBufferAttribute(new Float32Array(maxPerKind * 2), 2));
      const crowns = new InstancedMesh(geometry, crownMaterial, maxPerKind);
      crowns.customDepthMaterial = depthMaterial;
      crowns.customDistanceMaterial = distanceMaterial;
      return { seed, trunks: new InstancedMesh(trunkGeometry, trunkMaterial, maxPerKind), crowns };
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
  const transform = new Object3D();
  // A crown-local shear grows from the leader's foot (-0.8 m), so its limbs
  // reach inward while the lower leader remains joined to the upright trunk.
  const reachingLimbs = new Matrix4().set(1, 0.3, 0, 0.24, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  function update() {
    if (disposed) throw new Error("Foliage has been disposed");
    for (const mesh of meshes) mesh.count = 0;
    const count = Math.round(trees.length * PRESETS[quality].density);
    // Stratified selection spans all tiles and species; total count is exact.
    for (let i = 0; i < count; i++) {
      const tree = trees[Math.floor((i + 0.5) * trees.length / count)]!;
      const { variants } = species[tree.kind];
      const { seed, trunks, crowns } = variants[foliageVariantAt(tree.x, tree.z, variants.length)]!;
      const index = trunks.count++;
      crowns.count++;
      // Ordinary trees vary from 0.8 to 1.3; mature trail broadleaves reach 2.
      // Limit pine height to 14–18 m while
      // retaining its width variation and leaving every physics cylinder alone.
      const nominalHeight = pineHeight(seed);
      // Uniformly grow mature trail trees, preserving round leaf masses instead
      // of stretching only X/Z into the old flat umbrellas.
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
      transform.position.set(tree.x - Math.sin(tree.lean) * anchorHeight, tree.y + Math.cos(tree.lean) * anchorHeight, tree.z);
      transform.scale.set(tree.scale, heightScale, tree.scale);
      if (tree.trailCanopy && tree.kind === "broadleaf") {
        const path = nearestPath(tree.x, tree.z);
        // Face the existing reaching limbs toward the trail.
        transform.rotateY(Math.atan2(tree.z - path.z, path.x - tree.x));
        transform.scale.setScalar(heightScale);
      }
      transform.updateMatrix();
      if (tree.trailCanopy && tree.kind === "broadleaf") transform.matrix.multiply(reachingLimbs);
      crowns.setMatrixAt(index, transform.matrix);
      const pigment = instanceLeafColor(tree.x, tree.z, isDeepCrown(tree.x, tree.z) ? deep : crownMaterial.color);
      // Instance colours multiply the shared ramp colour; compensate in linear RGB.
      pigment.setRGB(pigment.r / crownMaterial.color.r, pigment.g / crownMaterial.color.g, pigment.b / crownMaterial.color.b);
      crowns.setColorAt(index, pigment);
      const style = crowns.geometry.getAttribute("treeStyle");
      style.setXY(index, tree.kind === "broadleaf" ? foliageVariantAt(tree.x, tree.z, BROADLEAF_VARIANT_SEEDS.length) : 0,
        tree.kind === "broadleaf" && hasHangingFoliage(tree.x, tree.z) ? 1 : 0);
    }
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      const style = mesh.geometry.getAttribute("treeStyle");
      if (style) style.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      // Box-derived bounds remain conservative for inward-sheared crowns;
      // max-column sphere scaling alone underestimates a shear's stretch.
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
      update();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      foliageWinds.delete(crownMaterial);
      trees = [];
      group.removeFromParent();
      group.clear();
      for (const mesh of meshes) { mesh.count = 0; mesh.dispose(); }
      trunkGeometry.dispose();
      for (const { variants } of Object.values(species)) {
        for (const { crowns } of variants) crowns.geometry.dispose();
      }
      trunkMaterial.dispose();
      crownMaterial.dispose();
      depthMaterial.dispose();
      distanceMaterial.dispose();
      // Ramp gradients are shared and owned by the world, not this factory.
    },
  };
}
