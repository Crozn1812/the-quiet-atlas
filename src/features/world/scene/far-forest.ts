import { BufferAttribute, BufferGeometry, Color, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Vector2, Vector3, type Material, type Mesh, type WebGLRenderer } from "three";
import { acquireHrTree } from "../foliage/hr-library";
import { installHrMaterial } from "../foliage/hr-material";
import { hrLeafTint, treeRandom, type HrTreeId } from "../foliage/hr-variation";
import { foliageBiomeAt } from "../foliage/scatter";
import { ZONES } from "../layout/zones";
import { WORLD_LENGTH } from "../layout/scale";
import { nearestPath, nearestRiver } from "../terrain/samples";
import { waterLevelAt, worldHeight } from "../terrain/height";
import { farHeight, farNoise } from "./far-relief";

export interface FarForestSite { x: number; z: number; y: number; height: number; id: HrTreeId; yaw: number }
const species: readonly HrTreeId[] = ["hr-tree-spreading-crown", "hr-tree-umbrella-crown", "hr-tree-bamboo-clump"];
/** Entire crown envelopes stay outside streamed trees, interactive pads and the
 * Horizon turbine candidates (all within its radius + 18 m). Sheltered hill
 * pockets carry short bamboo/umbrella understorey rather than a uniform plantation. */
export function* farForestSites(sites: FarForestSite[]) {
  for (let gx = -45; gx <= 45; gx++) {
    yield;
    for (let gz = Math.floor((-WORLD_LENGTH - 450) / 16); gz <= 10; gz++) {
      const r = treeRandom(gx, gz, 81), q = treeRandom(gx, gz, 82);
      const x = gx * 16 + (r - 0.5) * 15.2, z = gz * 16 + (q - 0.5) * 15.2;
      const path = nearestPath(x, z), river = nearestRiver(x, z);
      if (path.distance < 48 || path.distance > 205 || river.distance < 28
        || ZONES.some(zone => Math.hypot(x - zone.position.x, z - zone.position.z) < zone.radius + 18)) continue;
      const y = worldHeight(x, z), biome = foliageBiomeAt(x, z);
      if (y < waterLevelAt(z) + 4) continue;
      // Independent thinning and full-cell jitter break the nursery rows while
      // keeping broad, continuous groves on sheltered slopes.
      if (treeRandom(gx, gz, 83) > 0.62 + farNoise(x, z, 37) * 0.34) continue;
      const slope = Math.hypot(worldHeight(x + 3, z) - worldHeight(x - 3, z), worldHeight(x, z + 3) - worldHeight(x, z - 3)) / 6;
      if (slope > 1.6 || (biome !== "forest-dawn" && farNoise(x, z, 52) < 0.48 + Math.min(slope, 0.6) * 0.12)) continue;
      const shrub = biome === "hill" && r > 0.7 && slope < 0.65;
      // Remote peaks use continuous mesh canopy, never a skyline of atlas cards.
      // Mid groves are low, broad crowns; bury the baked bare trunks in the slope.
      const retreat = 1 - Math.max(0, (path.distance - 105) / 100) * 0.55;
      sites.push({ x, z, y: farHeight(x, z) - 0.7, height: (shrub ? 3.8 + q * 2 : 5 + r * 3) * retreat,
        id: species[shrub ? 2 : ((gx + gz) % 2 + 2) % 2]!, yaw: r * Math.PI * 2 });
    }
  }
}

/** Compact real leaf triangles, never a billboard or a bare bamboo stem. Sample
 * across the full source crown, with owned attributes so pool users stay intact. */
export function farCrownGeometry(source: BufferGeometry) {
  const geometry = new BufferGeometry();
  const index = source.index, count = index?.count ?? source.getAttribute("position").count;
  const stride = Math.max(1, Math.ceil(count / 3 / 8000)), selected: number[] = [];
  for (let triangle = 0; triangle < count / 3; triangle += stride) {
    for (let corner = 0; corner < 3; corner++) selected.push(index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner);
  }
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const values = new Float32Array(selected.length * attribute.itemSize);
    selected.forEach((vertex, i) => {
      for (let c = 0; c < attribute.itemSize; c++) values[i * attribute.itemSize + c] = attribute.getComponent(vertex, c);
    });
    geometry.setAttribute(name, new BufferAttribute(values, attribute.itemSize));
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Shadowless instanced leaf draws, using the existing HR-TREE1 CC0 pool.
 * Acquire only after a playable frame; Low and failed requests retain the textured
 * terrain canopy. Leases include pending requests and are released on teardown. */
export function createFarForest(parent: Mesh, sites: FarForestSite[], originX: number, originZ: number,
  firstLightView: { value: number }) {
  const group = new Group(); group.name = "far-hr-forest"; parent.add(group);
  let disposed = false, started = false;
  const leases: ReturnType<typeof acquireHrTree>[] = [];
  const meshes: InstancedMesh[] = [];
  function start(renderer: WebGLRenderer) {
    if (started || disposed) return;
    started = true;
    for (const id of species) {
      const selected = sites.filter(site => site.id === id);
      if (!selected.length) continue;
      const lease = acquireHrTree(renderer, id, 1); leases.push(lease);
      void lease.ready.then(asset => {
        if (disposed) return;
        const size = asset.bounds.getSize(new Vector3());
        const parts = asset.parts.filter(part => part.leaf && !part.vine);
        parts.forEach(part => { if (!part.geometry.boundingBox) part.geometry.computeBoundingBox(); });
        const crownBase = Math.min(...parts.map(part => part.geometry.boundingBox!.min.y));
        for (const part of parts) {
          const geometry = farCrownGeometry(part.geometry);
          const tint = new Float32Array(selected.length * 3);
          selected.forEach((site, i) => hrLeafTint(site.x, site.z).lerp(new Color(0.8, 0.91, 0.9), 0.3).toArray(tint, i * 3));
          geometry.setAttribute("hrTint", new InstancedBufferAttribute(tint, 3));
          geometry.setAttribute("hrSeed", new InstancedBufferAttribute(new Float32Array(selected.length), 1));
          geometry.setAttribute("hrFade", new InstancedBufferAttribute(new Float32Array(selected.length).fill(1), 1));
          const material = part.material.clone();
          material.premultipliedAlpha = true;
          installHrMaterial(material, new Vector2(), true);
          const hook = material.onBeforeCompile.bind(material), key = material.customProgramCacheKey.bind(material);
          material.onBeforeCompile = (shader, renderer) => {
            hook(shader, renderer); shader.uniforms.firstLightView = firstLightView;
            shader.fragmentShader = "uniform float firstLightView;\n" + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>",
              "#include <clipping_planes_fragment>\nif(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)<firstLightView) discard;");
          };
          material.customProgramCacheKey = () => key() + "-far-volume-v1";
          const mesh = new InstancedMesh(geometry, material, selected.length);
          mesh.name = `far-${id}`; mesh.castShadow = mesh.receiveShadow = false; mesh.raycast = () => {};
          const matrix = new Matrix4();
          selected.forEach((site, i) => {
            const scale = site.height / size.y;
            matrix.makeRotationY(site.yaw).scale(new Vector3(scale * 1.25, scale, scale * 1.25));
            matrix.setPosition(site.x - originX, site.y - crownBase * scale, site.z - originZ);
            mesh.setMatrixAt(i, matrix);
          });
          mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
          group.add(mesh); meshes.push(mesh);
        }
      }).catch(() => { /* The continuous canopy remains on network failure. */ });
    }
  }
  return { group, start, dispose() {
    if (disposed) return; disposed = true;
    group.removeFromParent();
    meshes.forEach(mesh => { mesh.dispose(); mesh.geometry.dispose(); (mesh.material as Material).dispose(); });
    leases.forEach(lease => lease.release());
  } };
}
