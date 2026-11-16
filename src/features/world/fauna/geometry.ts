import { BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, MeshPhysicalMaterial, Quaternion, SphereGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Original anatomy, metres, bill +Z. Three woodland plumages plus coastal gulls.
const PLUMAGE = [
  [0x705640, 0xc6b99b, 0x70452c, 0xe4dac0], // sparrow: chestnut cap, pale cheek
  [0x263238, 0xe7e1cd, 0x202b30, 0xf1e9d4], // magpie robin: dark head, white wing bar
  [0x778151, 0xc9c19a, 0x4b5638, 0xd9d2a4], // olive woodland bird
  [0xabb4b9, 0xeeeada, 0xe1e3df, 0x30383c],
] as const;

export function createBirdGeometry(gull: boolean, low = false, species = 0) {
  const parts: BufferGeometry[] = [];
  const [back, breast, crown, bar] = PLUMAGE[gull ? 3 : species % 3]!;
  const axis = new Vector3(0, 1, 0);
  function part(g: BufferGeometry, color: number, wing = 0, feather = false, anatomy = false, plume?: number[]) {
    g.deleteAttribute("uv");
    // x = across the vane (-1..1), y = base (-1) to tip (1), z = 1 on flight/tail feathers.
    // z = -1 marks bare parts (eyes, bill, legs): no plumage pattern there.
    g.setAttribute("featherCoord", new Float32BufferAttribute(plume ?? Array.from({ length: g.getAttribute("position").count * 3 }, (_, i) => i % 3 === 2 && !anatomy ? -1 : 0), 3));
    const positions = g.getAttribute("position"), normals = g.getAttribute("normal"), pigment = new Color(color);
    const colors: number[] = [], folded: number[] = [];
    const v = new Vector3(), n = new Vector3();
    for (let i = 0; i < positions.count; i++) {
      v.fromBufferAttribute(positions, i); n.fromBufferAttribute(normals, i);
      const grain = 0.97 + 0.03 * Math.sin(v.z * 790 + v.x * 610 + Math.sin(v.y * 770) * 2);
      const shade = grain * (0.9 + 0.1 * Math.max(0, n.y));
      const ink = pigment.clone();
      if (color === back && !wing && !feather) {
        const front = Math.max(0, Math.min(1, (v.z * 0.8 - v.y - 0.015) * 12));
        ink.lerp(new Color(breast), front);
        if (!gull && species === 0) {
          const bib = Math.max(0, 1 - ((v.x / 0.035) ** 2 + ((v.y - 0.07) / 0.065) ** 2 + ((v.z - 0.153) / 0.07) ** 2));
          ink.lerp(new Color(0x302e26), Math.min(1, bib * 3));
        }
      }
      if (anatomy && v.y > 0.105 && v.z > 0.08) {
        ink.lerp(new Color(crown), Math.max(0, Math.min(1, (v.y - 0.105) / 0.035)));
        // Facial plumage follows the skin, with no raised cheek/eyebrow blobs.
        const side = Math.max(0, Math.min(1, (Math.abs(v.x) - 0.030) * 65));
        const cheek = Math.max(0, 1 - (((v.y - 0.131) / 0.029) ** 2 + ((v.z - 0.174) / 0.039) ** 2));
        ink.lerp(new Color(gull ? breast : bar), Math.min(1, cheek * 5) * side);
        if (!gull && species === 0) {
          const ear = Math.max(0, 1 - (((v.y - 0.128) / 0.011) ** 2 + ((v.z - 0.160) / 0.012) ** 2));
          ink.lerp(new Color(0x292b24), Math.min(1, ear * 5) * side);
        }
      }
      colors.push(ink.r * shade, ink.g * shade, ink.b * shade);
      if (wing) {
        // Collapse span against the flank and sweep each primary past the rump.
        // Rotating an entire spread wing left the old rest pose visibly splayed.
        const t = Math.max(0, Math.min(1, (Math.abs(v.x) - 0.085) / 0.40));
        v.x = wing * (0.082 + Math.sin(t * Math.PI) * 0.025 + (v.y - 0.025) * 0.16);
        v.y -= 0.035 + t * 0.030;
        v.z = v.z * 0.65 - t * 0.16;
      }
      folded.push(v.x, v.y, v.z);
    }
    g.setAttribute("color", new Float32BufferAttribute(colors, 3));
    g.setAttribute("wing", new Float32BufferAttribute(new Float32Array(positions.count).fill(wing), 1));
    g.setAttribute("foldedPosition", new Float32BufferAttribute(folded, 3));
    const rest = g.clone();
    rest.setAttribute("position", new Float32BufferAttribute(folded, 3));
    rest.computeVertexNormals();
    g.setAttribute("foldedNormal", rest.getAttribute("normal").clone()); rest.dispose();
    parts.push(g);
  }
  function oval(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, wing = 0, yaw = 0, feather = false) {
    const g = new SphereGeometry(1, low ? 8 : feather ? 12 : 32, low ? 6 : feather ? 12 : 24);
    const plume: number[] = [];
    if (feather) {
      const p = g.getAttribute("position");
      for (let i = 0; i < p.count; i++) plume.push(p.getX(i), -p.getZ(i), 1);
      for (let i = 0; i < p.count; i++) {
        const t = (p.getZ(i) + 1) / 2;
        // Pointed tips, narrow quills, bowed vanes: no capsule-ended feathers.
        p.setXYZ(i, p.getX(i) * (0.23 + t * 0.77), p.getY(i) * 0.7 + Math.sin(t * Math.PI) * 0.22, p.getZ(i));
      }
    }
    g.scale(sx, sy, sz).rotateY(yaw).translate(x, y, z); g.computeVertexNormals();
    part(g, color, wing, feather, false, feather ? plume : undefined);
  }
  // One smooth skin from breast through nape to crown. Intersecting spheres left
  // a visible collar seam and made the head look like a separate wooden bead.
  const profile = [
    [-0.13, 0, 0, -0.025], [-0.11, 0.043, 0.070, -0.025],
    [-0.08, 0.061, 0.103, -0.035], [-0.03, 0.079, 0.149, -0.025],
    [0.02, 0.078, 0.149, -0.010], [0.07, 0.067, 0.129, 0.018],
    [0.10, 0.059, 0.096, 0.073], [0.13, 0.059, 0.076, 0.143],
    [0.16, 0.061, 0.072, 0.164], [0.19, 0.043, 0.050, 0.164],
    [0.208, 0.015, 0.018, 0.160], [0.212, 0, 0, 0.159],
  ];
  function skin(t: number, angle: number, lift = 0) {
    const at = Math.min(profile.length - 2, Math.floor(t)), f = t - at;
    const values = [0, 1, 2, 3].map(axis => {
      const a = profile[Math.max(0, at - 1)]![axis]!, b = profile[at]![axis]!;
      const c = profile[at + 1]![axis]!, d = profile[Math.min(profile.length - 1, at + 2)]![axis]!;
      return 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
    });
    const [y, rx, rz, z] = values as [number, number, number, number];
    return new Vector3(Math.cos(angle) * Math.max(0, rx + lift), y, z + Math.sin(angle) * Math.max(0, rz + lift));
  }
  const vertices: number[] = [], indices: number[] = [];
  const rings = low ? 22 : 88, segments = low ? 12 : 48;
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings * (profile.length - 1);
    for (let segment = 0; segment <= segments; segment++) {
      const angle = segment / segments * Math.PI * 2;
      // Overlapping contour-feather tips break the outline slightly (no smooth plush shell).
      const lobe = Math.pow(0.5 + 0.5 * Math.sin(angle * 31 + ring * 1.9 + Math.sin(ring * 0.7) * 2), 3);
      const down = !low && ring > 1 && ring < rings - 1 ? Math.sin(angle * 47 + t * 17) * 0.00025 + lobe * 0.0008 : 0;
      vertices.push(...skin(t, angle, down).toArray());
      if (ring < rings && segment < segments) {
        const a = ring * (segments + 1) + segment, b = a + segments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const torso = new BufferGeometry(); torso.setAttribute("position", new Float32BufferAttribute(vertices, 3)); torso.setIndex(indices);
  torso.computeVertexNormals(); part(torso, back, 0, false, true);
  // Small, overlapping contour feathers sit on the skin, each with a raised
  // centre and a tapered free tip. They catch light as layers, not plush fuzz.
  if (!low) for (let row = 0; row < 10; row++) for (let column = 0; column < 26; column++) {
    const t = 2.6 + row * 0.36;
    const angle = (column + (row % 2) * 0.5) / 26 * Math.PI * 2;
    const p: number[] = [], triangles: number[] = [];
    for (let station = 0; station <= 3; station++) for (let edge = -1; edge <= 1; edge++) {
      const s = station / 3, width = Math.sin(Math.PI * s) * 0.16 + 0.01;
      const v = skin(t - s * 0.52, angle + edge * width, 0.00055 + (1 - Math.abs(edge)) * Math.sin(s * Math.PI) * 0.0006);
      p.push(...v.toArray());
      if (station && edge < 1) {
        const a = (station - 1) * 3 + edge + 1, b = a + 3;
        triangles.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const g = new BufferGeometry(); g.setAttribute("position", new Float32BufferAttribute(p, 3)); g.setIndex(triangles);
    g.computeVertexNormals();
    const tone = new Color(back).lerp(new Color(breast), Math.max(0, Math.sin(angle)) * (1 - row / 13));
    part(g, tone.getHex(), 0, true, true);
  }
  for (const side of [-1, 1]) {
    oval(side * 0.055, 0.155, 0.197, 0.0028, 0.0048, 0.0048, 0x090e0d);
    if (!low) oval(side * 0.057, 0.157, 0.199, 0.0008, 0.0011, 0.0011, 0xf5eddd);
    // Folded wing covers the flank from shoulder to rump, as on a perched passerine.
    oval(side * 0.17, 0.045, -0.01, 0.115, 0.056, 0.19, back, side, side * 0.15, true);
    if (!low) oval(side * 0.15, 0.065, 0.02, 0.09, 0.03, 0.11, crown, side, side * 0.1, true);
    const count = low ? 5 : 9;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      oval(side * (0.2 + t * 0.22), 0.012 - t * 0.012, -0.07 - t * 0.075,
        0.036 - t * 0.014, 0.009, 0.125 - t * 0.035,
        gull && t > 0.5 ? bar : back, side, side * (0.2 + t * 0.55), true);
      if (!low) oval(side * (0.13 + t * 0.14), 0.057, -0.01 - t * 0.025,
        0.022, 0.009, 0.055, i % 3 === 0 ? bar : back, side, side * 0.35, true);
    }
    // Overlapping rectrices: a closed, slightly notched tail rather than separate sticks.
    for (let i = 0; i < (low ? 2 : 6); i++) oval(side * (0.008 + i * 0.008), -0.025 + i * 0.001, -0.245 + i * 0.008,
      0.02, 0.0045, (species === 1 ? 0.18 : 0.14) - i * 0.009, species === 1 && i > 3 ? bar : back, 0, side * (0.015 + i * 0.03), true);
    // Jointed tarsi, three gripping toes and rear toe. Feet meet y=-0.20.
    const leg = (a: Vector3, b: Vector3, radius: number, claw = false) => {
      const g = new CylinderGeometry(claw ? radius * 0.08 : radius * 0.7, radius, a.distanceTo(b), low ? 4 : 7);
      g.applyQuaternion(new Quaternion().setFromUnitVectors(axis, b.clone().sub(a).normalize()));
      g.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
      part(g, claw ? 0x34332b : 0x86725a);
    };
    const ankle = new Vector3(side * 0.035, -0.166, 0.027);
    leg(new Vector3(side * 0.035, -0.085, -0.015), new Vector3(side * 0.035, -0.116, 0.037), 0.005);
    leg(new Vector3(side * 0.035, -0.116, 0.037), ankle, 0.004);
    for (let toe = -1; toe <= 1; toe++) {
      const knuckle = new Vector3(side * 0.035 + toe * 0.014, -0.175, 0.062);
      leg(ankle, knuckle, 0.003); leg(knuckle, new Vector3(knuckle.x, -0.20, 0.065), 0.002);
      if (!low) leg(new Vector3(knuckle.x, -0.196, 0.065), new Vector3(knuckle.x, -0.203, 0.056), 0.0018, true);
    }
    leg(ankle, new Vector3(side * 0.035, -0.20, -0.010), 0.003);
    if (!low) leg(new Vector3(side * 0.035, -0.197, -0.010), new Vector3(side * 0.035, -0.203, 0.002), 0.0018, true);
  }
  // Separate mandibles leave a small dark seam; shorter, stout sparrow bill.
  for (const upper of [true, false]) {
    const bill = new ConeGeometry(gull ? 0.014 : species === 0 ? 0.016 : 0.010, gull ? 0.10 : species === 0 ? 0.045 : 0.060, low ? 8 : 16);
    bill.scale(1, 1, 0.45).rotateX(Math.PI / 2).translate(0, 0.145 + (upper ? 0.002 : -0.002), gull ? 0.276 : 0.246);
    part(bill, gull ? 0xd8b05c : upper ? 0x45473b : 0x30342d);
  }
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  geometry.computeBoundingSphere();
  return geometry;
}

/** Matte keratin plumage: sheen instead of a plastic specular lobe, contour-feather
 * scallops with derivative bump, and rachis/barbs on every flight and tail feather. */
export function createBirdMaterial() {
  const material = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.92, metalness: 0,
    specularIntensity: 0.18, sheen: 0.55, sheenRoughness: 0.7, sheenColor: new Color(0.42, 0.4, 0.36) });
  material.onBeforeCompile = shader => {
    shader.vertexShader = `attribute float wing;
attribute float wingAngle;
attribute float flightMix;
attribute vec3 foldedPosition;
attribute vec3 foldedNormal;
attribute vec3 featherCoord;
varying vec3 vAnatomy;
varying vec3 vFeather;
` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
float a = wing * wingAngle;
mat2 flap = mat2(cos(a), sin(a), -sin(a), cos(a));
if (abs(wing) > 0.5) objectNormal.xy = flap * objectNormal.xy;
objectNormal = normalize(mix(foldedNormal, objectNormal, flightMix));`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vAnatomy = mix(foldedPosition, position, flightMix);
vFeather = featherCoord;
if (abs(wing) > 0.5) {
  transformed.x -= wing * 0.085;
  transformed.xy = flap * transformed.xy;
  transformed.x += wing * 0.085;
}
transformed = mix(foldedPosition, transformed, flightMix);`);
    shader.fragmentShader = `varying vec3 vAnatomy;
varying vec3 vFeather;
float birdHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float birdNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(birdHash(i), birdHash(i + vec2(1.0, 0.0)), f.x), mix(birdHash(i + vec2(0.0, 1.0)), birdHash(i + vec2(1.0, 1.0)), f.x), f.y); }
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
vec3 p = vAnatomy;
float resolved = 1.0 - smoothstep(0.1, 0.9, length(fwidth(p)) * 110.0);
// Contour feathers: overlapping rows, rounded tips pointing to the tail (-Z).
vec2 vane = vec2((p.x + p.z * 0.25) * 78.0, (p.z * 0.85 - p.y * 0.35) * 66.0);
// Feather tracts are not a lattice: warp rows and stagger them irregularly.
vane += (vec2(birdNoise(p.yz * 45.0), birdNoise(p.xz * 45.0 + 9.0)) - 0.5) * 0.9;
vane.x += birdHash(vec2(floor(vane.y), 3.0)) * 0.8;
vec2 cell = fract(vane) - 0.5;
vec2 cellId = floor(vane);
float tipShape = length(cell * vec2(1.0, 0.8) - vec2(0.0, -0.18));
float overlap = smoothstep(0.18, 0.48, tipShape);
float fringe = smoothstep(0.38, 0.47, tipShape) * (1.0 - smoothstep(0.47, 0.52, tipShape));
float barb = sin((abs(cell.x) * 1.2 + cell.y * 0.5) * 70.0);
float breastMask = (1.0 - smoothstep(0.06, 0.14, p.y)) * smoothstep(-0.02, 0.08, p.z);
float streak = pow(max(0.0, 1.0 - abs(cell.x) * 5.0), 5.0) * smoothstep(-0.15, 0.35, cell.y);
float body = 1.0 - abs(vFeather.z);
float tone = birdHash(cellId) - 0.5;
float plumage = resolved * body;
float mottle = birdNoise(p.xz * 160.0 + p.y * 90.0) - 0.5;
diffuseColor.rgb *= 1.0 + plumage * (barb * 0.015 - overlap * 0.06 + fringe * 0.045 + tone * 0.1 + mottle * 0.08)
  - streak * breastMask * plumage * 0.2;
float dorsalTract = smoothstep(0.02, 0.09, p.y) * (1.0 - smoothstep(0.12, 0.16, p.y)) * (1.0 - smoothstep(-0.05, 0.05, p.z));
diffuseColor.rgb *= 1.0 - plumage * dorsalTract * (1.0 - smoothstep(0.05, 0.28, abs(cell.x))) * step(0.45, birdHash(cellId + 5.0)) * 0.35;
float featherHeight = plumage * (1.0 - overlap) * 0.6;
// Flight feathers: dark rachis, oblique barbs, pale fringe and slightly darker tip.
float shaft = 1.0 - smoothstep(0.03, 0.09, abs(vFeather.x));
float barbs = 0.5 + 0.5 * sin((abs(vFeather.x) * 1.3 - vFeather.y * 0.8) * 90.0);
float edge = smoothstep(0.7, 0.95, abs(vFeather.x));
float notch = step(0.82, birdHash(vec2(floor(vFeather.y * 9.0), sign(vFeather.x)))) * smoothstep(0.4, 0.9, abs(vFeather.x));
float flight = max(vFeather.z, 0.0) * (1.0 - smoothstep(0.1, 0.9, length(fwidth(vFeather.xy)) * 0.6));
diffuseColor.rgb *= 1.0 + flight * (-shaft * 0.35 + (barbs - 0.5) * 0.1 + edge * 0.18 - smoothstep(0.55, 1.0, vFeather.y) * 0.12 - notch * 0.12);
featherHeight += flight * (shaft * 0.5 + barbs * 0.15 - edge * 0.3);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
{
  // Derivative bump (no tangents): lifts each feather against its neighbours.
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float hx = dFdx(featherHeight), hy = dFdy(featherHeight);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  normal = normalize(abs(det) * normal - grad * 0.0007);
}`);
  };
  material.customProgramCacheKey = () => "hr-birds-anatomy-v5";
  return material;
}
