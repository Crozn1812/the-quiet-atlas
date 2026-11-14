import { BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Matrix4, Mesh, MeshStandardMaterial, TubeGeometry, Vector3, type InstancedMesh, type Scene } from "three";
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
  function limb(points: Vector3[], radius: number) {
    const curve = new CatmullRomCurve3(points);
    const g = new TubeGeometry(curve, 12, 1, 8, false), p = g.getAttribute("position");
    const colors: number[] = [], bark = new Color(0x655c47), light = new Color(0x91836a);
    for (let i = 0; i < p.count; i++) {
      const t = Math.floor(i / 9) / 12, center = curve.getPointAt(t);
      const v = new Vector3().fromBufferAttribute(p, i).sub(center).multiplyScalar(radius * (1 - t * 0.82)).add(center);
      p.setXYZ(i, v.x, v.y, v.z);
      const pigment = bark.clone().lerp(light, Math.max(0, Math.sin(v.y * 43 + v.x * 17 + v.z * 23)) * 0.35);
      colors.push(pigment.r, pigment.g, pigment.b);
    }
    g.computeVertexNormals(); g.deleteAttribute("uv"); g.setAttribute("color", new Float32BufferAttribute(colors, 3)); parts.push(g);
  }
  for (const [species, site] of sites.slice(0, 3).entries()) {
    const path = nearestPath(site.x, site.z);
    const towardPath = new Vector3(path.x - site.x, 0, path.z - site.z).normalize();
    const start = site.clone().add(new Vector3(0, 1.65 + species * 0.14, 0));
    const end = start.clone().addScaledVector(towardPath, 3.2).add(new Vector3(0, 0.38, 0));
    const middle = start.clone().lerp(end, 0.57).add(new Vector3(0, -0.13, 0));
    limb([start, middle, end], 0.085);
    const fork = middle.clone().lerp(end, 0.38), tip = end.clone().addScaledVector(towardPath, 0.40).add(new Vector3(towardPath.z * 0.55, 0.26, -towardPath.x * 0.55));
    limb([fork, fork.clone().lerp(tip, 0.5).add(new Vector3(0, -0.04, 0)), tip], 0.025);
    // Feet wrap the narrow upper surface, 20 cm below the bird's local origin.
    perches.push({ home: end.clone().add(new Vector3(0, 0.213, 0)), yaw: Math.atan2(towardPath.x, towardPath.z) + Math.PI / 3, species });
  }
  if (!parts.length) return { perches, branch: undefined };
  const geometry = mergeGeometries(parts)!; parts.forEach(g => g.dispose());
  const branch = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  branch.name = "bird-perch-branches"; branch.raycast = () => {}; branch.receiveShadow = true;
  return { perches, branch };
}
