import { BufferGeometry, CatmullRomCurve3, Color, DoubleSide, Float32BufferAttribute, Matrix4, Mesh, MeshStandardMaterial, TubeGeometry, Vector3, type InstancedMesh, type Scene } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { nearestPath } from "../terrain/samples";

/** Original low limbs rooted inside the HR forest's persistent trunk positions.
 * The same roots survive streaming, network failure and switching to Low. */
export function createBirdPerches(scene: Scene, anchor: Readonly<Vector3>) {
  const sites: Vector3[] = [], matrix = new Matrix4();
  for (let variant = 0; variant < 3; variant++) {
    const trees = scene.getObjectByName(`first-light-grove-trees-${variant}`) as InstancedMesh | undefined;
    if (!trees?.isInstancedMesh) continue;
    trees.updateWorldMatrix(true, false);
    // Only use the prefix retained by the grove's Low-quality thinning.
    for (let i = 0; i < Math.min(trees.count, Math.ceil(trees.instanceMatrix.count * 0.7)); i++) {
      trees.getMatrixAt(i, matrix); matrix.premultiply(trees.matrixWorld);
      const site = new Vector3().setFromMatrixPosition(matrix);
      if (Math.hypot(site.x - anchor.x, site.z - anchor.z) < 31) sites.push(site);
    }
  }
  sites.sort((a, b) => Math.hypot(a.x - anchor.x, a.z - anchor.z) - Math.hypot(b.x - anchor.x, b.z - anchor.z));
  const parts: BufferGeometry[] = [];
  const perches: { home: Vector3; yaw: number; species: number }[] = [];
  const leaves: BufferGeometry[] = [];
  let seed = 1;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  // Bark: tapered, slightly lumpy limb with longitudinal furrows, lichen and moss on the upper side.
  // barkCoord = (around in radians, along in metres, 1 = bark); leaves carry 0 in the third slot.
  function limb(points: Vector3[], radius: number, tipRadius = 0.18) {
    const curve = new CatmullRomCurve3(points);
    const length = curve.getLength();
    const tubular = Math.max(8, Math.round(length * 14)), radial = radius > 0.05 ? 16 : 8;
    const g = new TubeGeometry(curve, tubular, 1, radial, false), p = g.getAttribute("position");
    const colors: number[] = [], bark: number[] = [];
    const base = new Color(0x766c58), dark = new Color(0x4a4236), lichen = new Color(0x9aa08a), moss = new Color(0x4f5f2a);
    for (let i = 0; i < p.count; i++) {
      const ring = Math.floor(i / (radial + 1)), around = (i % (radial + 1)) / radial * Math.PI * 2, t = ring / tubular;
      const center = curve.getPointAt(t);
      const offset = new Vector3().fromBufferAttribute(p, i).sub(center);
      const furrow = 1 + 0.07 * Math.sin(around * 7 + Math.sin(t * 23) * 1.5) + 0.04 * Math.sin(t * length * 31 + around * 3);
      const knot = 1 + 0.18 * Math.exp(-(((t - 0.37) * length) ** 2) / 0.004) * Math.max(0, Math.cos(around - 1));
      const top = Math.max(0, offset.clone().normalize().y);
      const v = offset.multiplyScalar(radius * (1 - t * (1 - tipRadius)) * furrow * knot).add(center);
      p.setXYZ(i, v.x, v.y, v.z);
      const patch = 0.5 + 0.5 * Math.sin(v.x * 13 + v.z * 9 + Math.sin(v.y * 17) * 2);
      const pigment = base.clone().lerp(dark, Math.max(0, Math.sin(around * 7 + Math.sin(t * 23) * 1.5)) * 0.5)
        .lerp(lichen, Math.max(0, patch - 0.62) * 1.6 * (1 - top * 0.5))
        .lerp(moss, Math.max(0, top - 0.55) * Math.max(0, patch - 0.3) * 1.5);
      colors.push(pigment.r, pigment.g, pigment.b);
      bark.push(around, t * length, 1);
    }
    g.computeVertexNormals(); g.deleteAttribute("uv");
    g.setAttribute("color", new Float32BufferAttribute(colors, 3));
    g.setAttribute("barkCoord", new Float32BufferAttribute(bark, 3));
    parts.push(g);
    return curve;
  }
  // Small evergreen leaves along the outer twigs: cupped, alternating, drooping.
  function leafSpray(curve: CatmullRomCurve3, from: number, count: number) {
    for (let i = 0; i < count; i++) {
      const t = Math.min(1, from + (1 - from) * (i + random() * 0.6) / count);
      const at = curve.getPointAt(t), tangent = curve.getTangentAt(t);
      const side = new Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(i % 2 ? 1 : -1);
      const size = 0.06 + random() * 0.05, droop = -0.25 - random() * 0.4;
      const out = side.clone().multiplyScalar(0.7).addScaledVector(tangent, 0.55).add(new Vector3(0, droop, 0)).normalize();
      const across = new Vector3().crossVectors(out, new Vector3(0, 1, 0)).normalize();
      const positions: number[] = [], colors: number[] = [], bark: number[] = [], index: number[] = [];
      const shade = new Color(0x3d5a26).lerp(new Color(0x5d6f33), random());
      for (let row = 0; row <= 5; row++) for (const edge of [-1, 0, 1]) {
        const u = row / 5, half = Math.sin(Math.PI * Math.min(1, u * 1.05)) * 0.38 * size;
        const point = at.clone().addScaledVector(out, 0.012 + u * size * 2.2)
          .addScaledVector(across, edge * half).add(new Vector3(0, -Math.abs(edge) * half * 0.35 - u * u * size * 0.25, 0));
        positions.push(point.x, point.y, point.z);
        const vein = edge === 0 ? 1.25 : 0.92;
        colors.push(shade.r * vein, shade.g * vein, shade.b * vein);
        bark.push(edge, u, 0);
        if (row) for (const column of [0, 1]) {
          const a = (row - 1) * 3 + column, b = row * 3 + column;
          index.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(positions, 3));
      g.setAttribute("color", new Float32BufferAttribute(colors, 3));
      g.setAttribute("barkCoord", new Float32BufferAttribute(bark, 3));
      g.setIndex(index); g.computeVertexNormals();
      leaves.push(g);
    }
  }
  for (const [species, site] of sites.slice(0, 3).entries()) {
    const path = nearestPath(site.x, site.z);
    const towardPath = new Vector3(path.x - site.x, 0, path.z - site.z).normalize();
    const start = site.clone().add(new Vector3(0, 1.65 + species * 0.14, 0));
    const end = start.clone().addScaledVector(towardPath, 3.2).add(new Vector3(0, 0.38, 0));
    const middle = start.clone().lerp(end, 0.57).add(new Vector3(0, -0.13, 0));
    seed = 977 + species * 131;
    // The main limb keeps the existing perch path; the bird's seat (end) is unchanged.
    const main = limb([start, middle, end, end.clone().addScaledVector(towardPath, 0.55).add(new Vector3(0, 0.12, 0))], 0.085, 0.05);
    const fork = middle.clone().lerp(end, 0.38), tip = end.clone().addScaledVector(towardPath, 0.40).add(new Vector3(towardPath.z * 0.55, 0.26, -towardPath.x * 0.55));
    const twig = limb([fork, fork.clone().lerp(tip, 0.5).add(new Vector3(0, -0.04, 0)), tip], 0.025, 0.3);
    leafSpray(twig, 0.35, 9);
    leafSpray(main, 0.9, 5);
    for (const [at, lift] of [[0.3, 1], [0.62, -1]] as const) {
      const root = main.getPointAt(at), sideways = new Vector3(towardPath.z, 0, -towardPath.x).multiplyScalar(lift);
      const shoot = root.clone().addScaledVector(sideways, 0.45).addScaledVector(towardPath, 0.25).add(new Vector3(0, 0.22, 0));
      leafSpray(limb([root, root.clone().lerp(shoot, 0.5).add(new Vector3(0, 0.03, 0)), shoot], 0.016, 0.35), 0.4, 7);
    }
    // Feet wrap the narrow upper surface, 20 cm below the bird's local origin.
    perches.push({ home: end.clone().add(new Vector3(0, 0.213, 0)), yaw: Math.atan2(towardPath.x, towardPath.z) + Math.PI / 3, species });
  }
  if (!parts.length) return { perches, branch: undefined };
  const geometry = mergeGeometries([...parts, ...leaves])!; [...parts, ...leaves].forEach(g => g.dispose());
  const branch = new Mesh(geometry, createBarkMaterial());
  branch.name = "bird-perch-branches"; branch.raycast = () => {}; branch.receiveShadow = true;
  return { perches, branch };
}

/** Vertex-coloured bark with derivative-bump furrows and plates; leaves keep a soft waxy sheen. */
function createBarkMaterial() {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: DoubleSide });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      attribute vec3 barkCoord; varying vec3 vBark;`).replace("#include <begin_vertex>", `#include <begin_vertex>
      vBark = barkCoord;`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vBark;
      float barkHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float barkNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(barkHash(i), barkHash(i + vec2(1.0, 0.0)), f.x), mix(barkHash(i + vec2(0.0, 1.0)), barkHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }`).replace("#include <color_fragment>", `#include <color_fragment>
      float isBark = step(0.5, vBark.z);
      // Furrows run along the limb, broken into irregular plates.
      vec2 bp = vec2(vBark.x * 2.2, vBark.y * 9.0);
      float ridges = barkNoise(vec2(bp.x * 1.6 + barkNoise(bp * vec2(0.6, 0.3)) * 1.8, bp.y * 0.35));
      float plates = barkNoise(bp * vec2(2.4, 1.1) + 4.0);
      float furrow = smoothstep(0.25, 0.6, ridges);
      float barkHeight = isBark * (furrow * 0.8 + plates * 0.25);
      diffuseColor.rgb *= mix(1.0, 0.68 + 0.5 * furrow + 0.14 * (plates - 0.5), isBark);
      // Leaf: midrib and a few side veins.
      float leaf = 1.0 - isBark;
      float veins = 1.0 - smoothstep(0.0, 0.06, abs(fract(vBark.y * 6.0 - abs(vBark.x) * 2.0) - 0.5) - 0.44);
      diffuseColor.rgb *= 1.0 + leaf * veins * 0.08;
      barkHeight += leaf * veins * 0.2;`).replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
      roughnessFactor = mix(0.55, roughnessFactor, isBark);`).replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      {
        vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
        float hx = dFdx(barkHeight), hy = dFdy(barkHeight);
        vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
        float det = dot(dpx, r1);
        normal = normalize(abs(det) * normal - sign(det) * (hx * r1 + hy * r2) * 0.012);
      }`);
  };
  material.customProgramCacheKey = () => "hr-perch-bark-v1";
  return material;
}
