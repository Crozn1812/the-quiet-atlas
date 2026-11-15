import { Box3, BufferGeometry, Color, DataTexture, DoubleSide, Float32BufferAttribute, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RGBAFormat, SRGBColorSpace, Vector3 } from "three";
import type { HrAsset, HrPart } from "./hr-library";
import { treeRandom } from "./hr-variation";

export type CoastalTreeId = "hr-coast-casuarina" | "hr-coast-casuarina-wind" | "hr-coast-acacia";

/** Original needle/phyllode atlas, generated in memory. Dense overlapping sprays
 * cover the centre while individual hanging tips break up the silhouette. */
export function coastalSprayTexture(acacia: boolean) {
  const size = 256, pixels = new Uint8Array(size * size * 4);
  const line = (ax: number, ay: number, bx: number, by: number, width: number, tone: number) => {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 1.5);
    for (let i = 0; i <= steps; i++) {
      const x = ax + (bx - ax) * i / steps, y = ay + (by - ay) * i / steps;
      for (let ox = -Math.ceil(width); ox <= width; ox++) for (let oy = -Math.ceil(width); oy <= width; oy++) {
        const px = Math.round(x + ox), py = Math.round(y + oy);
        if (px < 0 || px >= size || py < 0 || py >= size || Math.hypot(px - x, py - y) > width) continue;
        const p = (py * size + px) * 4;
        pixels[p] = tone * (acacia ? 0.72 : 0.85); pixels[p + 1] = tone; pixels[p + 2] = tone * (acacia ? 0.48 : 0.82); pixels[p + 3] = 255;
      }
    }
  };
  for (let branch = 0; branch < 46; branch++) {
    const r = (salt: number) => treeRandom(branch, acacia ? 1 : 0, salt);
    const x = 26 + r(1) * 204, y = 24 + r(2) * 125;
    const length = 35 + r(3) * 57, lean = (x - 128) * 0.16;
    line(x - lean, y - 15, x + lean, y + length, 1.2, 78);
    for (let n = 0; n < (acacia ? 12 : 27); n++) {
      const t = n / (acacia ? 12 : 27), side = n % 2 ? -1 : 1;
      const bx = x + lean * (2 * t - 1), by = y + length * t;
      const spread = (acacia ? 14 : 24) * (0.4 + r(30 + n) * 0.6) * side;
      line(bx, by, bx + spread, by + 14 + r(70 + n) * 24, acacia ? 2.8 : 0.85, 78 + r(110 + n) * 55);
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.colorSpace = SRGBColorSpace; texture.magFilter = LinearFilter; texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

/** Windbreak trees use a rooted trunk and layered, three-dimensional hanging
 * sprays, rather than stretching a sparse tropical crown into a coastal tree.
 * Bark retains the existing licensed photographic PBR maps. Two instanced draws. */
export function createCoastalTree(id: CoastalTreeId, bark: MeshStandardMaterial, level: number): HrAsset {
  const acacia = id.endsWith("acacia"), wind = id.endsWith("wind");
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [], colors: number[] = [];
  const wood: number[] = [], woodUvs: number[] = [], woodIndices: number[] = [];
  const seed = acacia ? 73 : wind ? 41 : 19;
  const random = (i: number, salt: number) => treeRandom(i, seed, salt);
  const height = acacia ? 11 : 15, radius = acacia ? 4.5 : 3.9;
  const radialSegments = level === 0 ? 10 : 8;
  function tube(start: Vector3, end: Vector3, width: number) {
    const direction = end.clone().sub(start).normalize(), side = new Vector3().crossVectors(direction, new Vector3(0, 0, 1)).normalize();
    const across = new Vector3().crossVectors(direction, side).normalize(), base = wood.length / 3;
    for (let ring = 0; ring <= 4; ring++) for (let n = 0; n < radialSegments; n++) {
      const t = ring / 4, angle = n / radialSegments * Math.PI * 2;
      const point = start.clone().lerp(end, t).addScaledVector(side, Math.cos(angle) * width * (1 - t * 0.88)).addScaledVector(across, Math.sin(angle) * width * (1 - t * 0.88));
      wood.push(point.x + Math.sin(t * Math.PI) * width, point.y, point.z); woodUvs.push(n / radialSegments, point.y * 0.7);
      if (ring < 4) { const a = base + ring * radialSegments + n, b = base + ring * radialSegments + (n + 1) % radialSegments; woodIndices.push(a, b, a + radialSegments, b, b + radialSegments, a + radialSegments); }
    }
  }
  const lean = wind ? 0.9 : 0.25;
  tube(new Vector3(), new Vector3(lean, height, 0.3), acacia ? 0.27 : 0.23);
  const clusters = level === 0 ? 106 : 76;
  for (let i = 0; i < clusters; i++) {
    const t = (i + 0.5) / clusters, angle = i * 2.39996;
    // Full, overlapping middle crown; the top closes gently rather than a cone.
    const y = height * (0.4 + t * 0.58);
    const spread = radius * Math.pow(Math.sin(t * Math.PI), acacia ? 0.32 : 0.55) * (0.65 + random(i, 2) * 0.35);
    const x = Math.cos(angle) * spread + lean * y / height, z = Math.sin(angle) * spread;
    if (i % 4 === 0) tube(new Vector3(lean * y / height, y - 0.65, 0), new Vector3(x, y + 0.2, z), 0.045 + (1 - t) * 0.025);
    const width = (acacia ? 2.4 : 2.15) * (0.8 + random(i, 3) * 0.45), length = width * (acacia ? 0.86 : 1.15);
    const shade = new Color(acacia ? "#b4bd8c" : "#a4b6af").multiplyScalar(0.77 + random(i, 4) * 0.35);
    for (let card = 0; card < 3; card++) {
      const yaw = angle + card * Math.PI / 3, base = positions.length / 3;
      for (let rib = 0; rib <= 4; rib++) for (const side of [-1, 1]) {
        const v = rib / 4, across = side * width * 0.5;
        const sag = Math.sin(v * Math.PI) * 0.22;
        positions.push(x + Math.cos(yaw) * across + Math.sin(yaw) * sag, y + (0.45 - v) * length, z + Math.sin(yaw) * across - Math.cos(yaw) * sag);
        uvs.push((side + 1) / 2, 1 - v); colors.push(shade.r, shade.g, shade.b);
        if (rib < 4 && side === -1) { const a = base + rib * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
  }
  const geometry = (p: number[], uv: number[], index: number[]) => {
    const result = new BufferGeometry(); result.setAttribute("position", new Float32BufferAttribute(p, 3)); result.setAttribute("uv", new Float32BufferAttribute(uv, 2)); result.setIndex(index);
    result.computeVertexNormals(); result.computeBoundingBox(); result.computeBoundingSphere(); return result;
  };
  const foliage = geometry(positions, uvs, indices); foliage.setAttribute("color", new Float32BufferAttribute(colors, 3));
  const texture = coastalSprayTexture(acacia), barkMaterial = bark.clone(); barkMaterial.color.set("#9c9287");
  const material = new MeshStandardMaterial({ map: texture, vertexColors: true, alphaTest: 0.38, roughness: 0.95, side: DoubleSide });
  const parts: HrPart[] = [{ geometry: geometry(wood, woodUvs, woodIndices), material: barkMaterial, leaf: false }, { geometry: foliage, material, leaf: true }];
  const bounds = parts.reduce((box, part) => box.union(part.geometry.boundingBox!), new Box3());
  return { parts, bounds, center: bounds.getCenter(new Vector3()), dispose() { parts.forEach(p => { p.geometry.dispose(); p.material.dispose(); }); texture.dispose(); } };
}
