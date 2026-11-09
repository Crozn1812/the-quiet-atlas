import { Color, type MeshToonMaterial } from "three";
import { PALETTE } from "../art/palette";
import { nearestPath } from "../terrain/samples";
import { foliageVariantAt } from "./instances";
import { createFirstLightTree } from "./first-light-grove";
import { createForestR1Trees } from "./forest-r1";
import type { FoliageTree } from "./scatter";

/** Start at the coastal lead-in; hills and their authored solitary trees stay intact. */
export function coastR1Weight(pathT: number) {
  const t = Math.max(0, Math.min(1, (pathT - 0.82) / 0.04));
  return t * t * (3 - 2 * t);
}

export function isCoastR1Tree(tree: Pick<FoliageTree, "x" | "z">) {
  return foliageVariantAt(tree.x + 31.7, tree.z - 5.3, 1000) / 1000
    < coastR1Weight(nearestPath(tree.x, tree.z).t);
}

/** R1 branches and planar lobes, flattened into a wind-pruned coastal crown. */
export function createCoastR1Tree(variant: number) {
  const geometry = createFirstLightTree(variant);
  const positions = geometry.getAttribute("position"), colors = geometry.getAttribute("color");
  const green = new Color(PALETTE.forestLight).lerp(new Color(PALETTE.grass), 0.42);
  const dry = new Color(PALETTE.grassDry);
  const pigment = new Color();
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    // Continuous shear keeps every branch connected; the root remains at the same point.
    positions.setXYZ(i, positions.getX(i) * 1.12 + y * y * 0.018,
      y < 4.5 ? y * 0.85 : 3.825 + (y - 4.5) * 0.5, positions.getZ(i));
    pigment.fromBufferAttribute(colors, i);
    if (pigment.g > pigment.r * 1.1) {
      const wash = 0.92 + 0.12 * Math.sin(Math.floor(i / 3) * 1.73);
      pigment.copy(green).lerp(dry, 0.12 + variant * 0.035).multiplyScalar(wash);
      colors.setXYZ(i, pigment.r, pigment.g, pigment.b);
    }
  }
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Reuse the streamed R1 lifecycle/fade and three draws; no new animation or scatter field. */
export function createCoastR1Trees(trees: readonly FoliageTree[]) {
  return createForestR1Trees(trees, {
    geometry: createCoastR1Tree,
    name: "coast-r1-trees",
    scale: tree => tree.growth === "shrub" ? [1.7, 0.48, 1.5] : [1, 1, 1],
  });
}

/** Keep the existing G-03 rock/sand pigments, clearing fine texture from broad coastal faces. */
export function bindCoastR1Ground(material: MeshToonMaterial) {
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.vertexShader = "attribute float coastSurface;\nvarying float vCoastSurface;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvCoastSurface = coastSurface;");
    shader.fragmentShader = "varying float vCoastSurface;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal = mix(normal, normalize(vNormal), vCoastSurface * 0.8);")
      .replace("#include <opaque_fragment>", "vec3 coastClean = outgoingLight;\n#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, coastClean, vCoastSurface * 0.85);");
  };
  material.customProgramCacheKey = () => `${key.call(material)}-coast-r1-v1`;
}
