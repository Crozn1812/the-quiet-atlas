import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { createFern, createGrassTuft } from "../foliage/ground";
import { createLibraryBatch, fitDressing, type DressingLoader, type DressingSite } from "../props/library-batch";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneSceneContext } from "./types";

// Damp shade hugs the buttresses; a fallen limb and split boulder sit behind
// the tree. The small sunlit grass gap stays opposite the Skills approach.
const composition: readonly Omit<DressingSite, "tint">[] = [
  { asset: "rock-boulder-1", x: 10.3, z: 3.9, size: [1.9, 0.95, 1.5], yaw: 0.35 },
  { asset: "rock-boulder-3", x: 11.4, z: 4.6, size: [1.1, 0.55, 0.85], yaw: -0.6 },
  { asset: "rock-boulder-3", x: 9.6, z: 4.9, size: [0.6, 0.3, 0.5], yaw: 1.2 },
  { asset: "prop-fern", x: 9.3, z: 2.6, size: [1.4, 0.8, 1.2], yaw: 0.4 },
  { asset: "prop-fern", x: 8.8, z: -3.9, size: [1.2, 0.7, 1.1], yaw: -0.8 },
  { asset: "prop-fern", x: 3.6, z: 3.9, size: [0.95, 0.6, 0.9], yaw: 1.4 },
  { asset: "prop-fern", x: 3.45, z: 5.2, size: [0.7, 0.45, 0.65], yaw: -0.5 },
  { asset: "prop-bush", x: 11.6, z: -2.8, size: [1.6, 1.1, 1.4], yaw: 0.7 },
  { asset: "prop-bush", x: 10.8, z: -4.1, size: [1.0, 0.65, 0.9], yaw: -0.4 },
  { asset: "prop-fallen-log", x: 11.7, z: 0.8, size: [3.1, 0.55, 0.7], yaw: -0.9 },
  { asset: "prop-grass", x: 5.0, z: 7.2, size: [0.65, 0.85, 0.6], yaw: 0.3 },
  { asset: "prop-grass", x: 5.7, z: 7.6, size: [0.8, 1.0, 0.7], yaw: -0.7 },
  { asset: "prop-grass", x: 6.5, z: 7.8, size: [0.55, 0.7, 0.5], yaw: 1.1 },
  { asset: "prop-grass", x: 6.9, z: 7.1, size: [0.6, 0.8, 0.55], yaw: -1.2 },
];

/** Follow the accepted stump bank/offset; reject entire rotated footprints. */
export function rootsDressingSites(context: ZoneSceneContext, side = 1, offsetZ = 0): DressingSite[] {
  return composition.flatMap((source, index) => {
    const site = { ...source, x: side * source.x, z: offsetZ + source.z, yaw: side * source.yaw };
    const c = Math.abs(Math.cos(site.yaw)), s = Math.abs(Math.sin(site.yaw));
    const rx = (site.size[0] * c + site.size[2] * s) / 2;
    const rz = (site.size[2] * c + site.size[0] * s) / 2;
    const nx = Math.ceil(rx * 2 / 0.15), nz = Math.ceil(rz * 2 / 0.15);
    for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
      const x = site.x - rx + rx * 2 * ix / nx, z = site.z - rz + rz * 2 * iz / nz;
      const y = context.heightAt(x, z);
      if (!Number.isFinite(y) || Math.abs(x) <= PATH_CLEARANCE || context.onPath(x, z) || context.underWater(x, z)
        || Math.hypot(x, y + site.size[1], z) > ZONE_BUDGET.radius) return [];
    }
    return [{ ...site, tint: 0.9 + ((Math.imul(context.seed ^ index, 1664525) >>> 0) % 9) / 100 }];
  });
}

function batchAttributes(geometry: BufferGeometry) {
  for (const name of Object.keys(geometry.attributes))
    if (!["position", "normal", "color"].includes(name)) geometry.deleteAttribute(name);
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute("uv", new Float32BufferAttribute(new Float32Array(count * 2), 2));
  geometry.setAttribute("dressingSurface", new Float32BufferAttribute(new Float32Array(count).fill(-1), 1));
}

/** Owns the old moss plus all new dressing in its existing single draw. */
export function createRootsDressing(context: ZoneSceneContext, moss: BufferGeometry, side = 1, offsetZ = 0, load?: DressingLoader) {
  const tint = new Color(PALETTE.grass).lerp(new Color(PALETTE.forestDeep), 0.6);
  const colors = moss.getAttribute("color");
  for (let i = 0; i < colors.count; i++) colors.setXYZ(i, colors.getX(i) * tint.r, colors.getY(i) * tint.g, colors.getZ(i) * tint.b);
  batchAttributes(moss);
  // The first nine crests are the old tree's continuous root covers. The
  // foot ferns/cut patches after them stay available on every quality tier.
  const surface = moss.getAttribute("dressingSurface");
  for (let i = 0; i < Math.min(surface.count, 9 * 48 * 3); i++) surface.setX(i, -2);
  const sites = rootsDressingSites(context, side, offsetZ);
  const parts = sites.map((site, index) => {
    let source: BufferGeometry;
    if (site.asset === "prop-fern") source = createFern();
    else if (site.asset === "prop-grass") source = createGrassTuft(context.seed + index);
    else if (site.asset === "prop-fallen-log") source = new CylinderGeometry(0.5, 0.42, 2, 7).rotateZ(Math.PI / 2);
    else source = new IcosahedronGeometry(1, site.asset === "prop-bush" ? 1 : 0);
    const flat = source.index ? source.toNonIndexed() : source;
    if (flat !== source) source.dispose();
    const count = flat.getAttribute("position").count;
    if (!flat.getAttribute("color")) {
      const pigment = site.asset.startsWith("rock") ? [0.24, 0.26, 0.22]
        : site.asset === "prop-bush" ? [0.09, 0.17, 0.08] : [0.17, 0.12, 0.08];
      flat.setAttribute("color", new Float32BufferAttribute(Array.from({ length: count }, () => pigment).flat(), 3));
    }
    batchAttributes(flat);
    const fitted = fitDressing(flat, site, context.heightAt); flat.dispose();
    return fitted;
  });
  const fallback = mergeGeometries([moss, ...parts])!;
  fallback.userData.mossVertices = moss.getAttribute("position").count;
  parts.forEach(part => part.dispose());
  fallback.computeBoundingBox(); fallback.computeBoundingSphere();
  const batch = createLibraryBatch(fallback, sites, context.heightAt, load, moss);
  batch.mesh.name = "roots-moss";
  batch.mesh.userData.dressingSites = sites.length;
  // Only the retained tree moss: break its old continuous ribbons into damp
  // islands. Library ferns, rocks, grass and logs keep their authored surfaces.
  const compile = batch.mesh.material.onBeforeCompile;
  const cacheKey = batch.mesh.material.customProgramCacheKey.bind(batch.mesh.material);
  const detail = { value: 0 };
  batch.mesh.material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.uniforms.rootsTreeDetail = detail;
    shader.vertexShader = "varying vec3 vRootsMossPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvRootsMossPosition = position;");
    shader.fragmentShader = "uniform float rootsTreeDetail; varying vec3 vRootsMossPosition;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <alphamap_fragment>", `
if (rootsTreeDetail > 0.5 && vDressingSurface < -1.5) discard;
if (vDressingSurface < -0.5) {
  vec3 p = vRootsMossPosition;
  float mossIsland = sin(p.x * 3.1 + p.z * 2.3) + sin(p.z * 5.7 - p.x);
  float grain = sin(p.x * 89.0 + sin(p.z * 43.0) * 3.0) * sin(p.z * 77.0 + p.y * 53.0);
  if (mossIsland + grain * 0.38 < 0.3) discard;
  diffuseColor.rgb *= 0.48 + 0.28 * grain + 0.2 * smoothstep(0.3, 1.5, mossIsland);
}
#include <alphamap_fragment>`);
  };
  batch.mesh.material.customProgramCacheKey = () => cacheKey() + "|roots-tree-moss-islands-v1";
  return { ...batch, setTreeDetail(active: boolean) { detail.value = active ? 1 : 0; } };
}
