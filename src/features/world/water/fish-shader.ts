import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, ShaderMaterial, UniformsLib, UniformsUtils, Vector4 } from "three";
import { PALETTE } from "../art/palette";
import { FISH_ROUTE_SAMPLES } from "./fish-schools";

/** Body stations, tail to snout: z, half-height, half-width (metres, +Z is the nose).
 * A laterally compressed stream fish (barb/minnow proportions), not a flattened lozenge. */
const BODY = [
  [-0.19, 0.017, 0.008], [-0.165, 0.021, 0.010], [-0.13, 0.03, 0.015], [-0.085, 0.042, 0.021],
  [-0.035, 0.053, 0.026], [0.015, 0.06, 0.029], [0.06, 0.061, 0.031], [0.1, 0.057, 0.03],
  [0.135, 0.05, 0.028], [0.16, 0.042, 0.025], [0.182, 0.032, 0.021], [0.198, 0.022, 0.016],
  [0.21, 0.013, 0.010], [0.217, 0.006, 0.005],
] as const;
const SIDES = 14;
export const FISH_SNOUT_Z = 0.222;
export const FISH_TAIL_Z = -0.335;

/** About 480 triangles: smooth compressed body, forked caudal fin, dorsal, anal,
 * paired pelvic/pectoral fins. Attributes: fishPart (0 body, 1 fin) and finRoot. */
export function createFishGeometry() {
  const vertices: number[] = [], indices: number[] = [], parts: number[] = [], roots: number[] = [];
  const vertex = (x: number, y: number, z: number, part: number, root: readonly number[] = [0, 0, 0]) => {
    vertices.push(x, y, z); parts.push(part); roots.push(...root);
    return vertices.length / 3 - 1;
  };
  for (const [z, h, w] of BODY) for (let side = 0; side < SIDES; side++) {
    const angle = side / SIDES * Math.PI * 2, s = Math.sin(angle), c = Math.cos(angle);
    // Fuller belly, keeled back: real cross-sections are egg shaped.
    const y = s * h * (s < 0 ? 0.94 : 1) + h * 0.06;
    vertex(c * w * 1.35 * (1 + 0.12 * Math.max(0, -s)), y, z, 0);
  }
  for (let ring = 0; ring < BODY.length - 1; ring++) for (let side = 0; side < SIDES; side++) {
    const a = ring * SIDES + side, b = ring * SIDES + (side + 1) % SIDES;
    indices.push(a, b, a + SIDES, b, b + SIDES, a + SIDES);
  }
  const tail = vertex(0, 0.001, -0.194, 0), snout = vertex(0, 0.001, FISH_SNOUT_Z, 0);
  const last = (BODY.length - 1) * SIDES;
  for (let side = 0; side < SIDES; side++) {
    indices.push(tail, (side + 1) % SIDES, side);
    indices.push(snout, last + side, last + (side + 1) % SIDES);
  }
  // Fins are fans around a root; finRoot lets the fragment shader draw radiating rays.
  function fin(root: readonly number[], outline: readonly (readonly number[])[]) {
    const centre = vertex(root[0]!, root[1]!, root[2]!, 1, root);
    const ring = outline.map(([x, y, z]) => vertex(x!, y!, z!, 1, root));
    for (let i = 0; i < ring.length - 1; i++) indices.push(centre, ring[i]!, ring[i + 1]!);
  }
  fin([0, 0, -0.18], [[0, 0.019, -0.183], [0, 0.04, -0.235], [0, 0.062, -0.29], [0, 0.079, -0.335],
    [0, 0.05, -0.305], [0, 0.024, -0.284], [0, 0, -0.272], [0, -0.024, -0.284], [0, -0.049, -0.305],
    [0, -0.076, -0.333], [0, -0.06, -0.288], [0, -0.038, -0.234], [0, -0.019, -0.183]]);
  fin([0, 0.06, 0.03], [[0, 0.066, 0.07], [0, 0.088, 0.055], [0, 0.106, 0.03], [0, 0.098, 0.005],
    [0, 0.082, -0.02], [0, 0.068, -0.04], [0, 0.056, -0.042]]);
  fin([0, -0.036, -0.1], [[0, -0.044, -0.068], [0, -0.07, -0.085], [0, -0.075, -0.11], [0, -0.058, -0.13], [0, -0.03, -0.125]]);
  for (const side of [-1, 1]) {
    fin([side * 0.014, -0.05, 0.02], [[side * 0.016, -0.054, 0.035], [side * 0.034, -0.072, 0.0],
      [side * 0.04, -0.077, -0.03], [side * 0.022, -0.064, -0.02], [side * 0.012, -0.056, 0.0]]);
    fin([side * 0.026, -0.022, 0.13], [[side * 0.028, -0.016, 0.135], [side * 0.058, -0.03, 0.1],
      [side * 0.075, -0.041, 0.06], [side * 0.055, -0.042, 0.075], [side * 0.03, -0.034, 0.115]]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("fishPart", new Float32BufferAttribute(parts, 1));
  geometry.setAttribute("finRoot", new Float32BufferAttribute(roots, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function createFishMaterial(route: Vector4[]) {
  return new ShaderMaterial({
    name: "submerged-fish", fog: true, side: DoubleSide,
    uniforms: UniformsUtils.merge([UniformsLib.fog, {
      uTime: { value: 0 }, uCalm: { value: 0 }, uLowSchool: { value: -1 },
      // XYZ = player; W = most recent approach time. One uniform for the reaction.
      uPlayer: { value: new Vector4(10000, 10000, 10000, -100) },
      uRoute: { value: route }, uBack: { value: new Color("#272c23") },
      uFlank: { value: new Color("#8f8a6c") },
      uBelly: { value: new Color("#c9c5b2") }, uWater: { value: new Color(PALETTE.water) },
    }]),
    vertexShader: /* glsl */ `
      attribute vec4 fishSchool;
      attribute vec4 fishMotion;
      attribute vec4 fishReach;
      attribute float fishPart;
      attribute vec3 finRoot;
      uniform vec4 uRoute[${route.length}];
      uniform vec4 uPlayer;
      uniform float uTime;
      uniform float uCalm;
      uniform float uLowSchool;
      varying float vDepth;
      varying float vPart;
      varying float vHue;
      varying vec3 vLocal;
      varying vec3 vRoot;
      varying vec3 vObjectNormal;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vUp;
      #include <fog_pars_vertex>
      void main() {
        float school = fishSchool.w;
        float phase = uTime * 0.22 + fishReach.z + sin(fishMotion.x) * 0.035;
        float age = max(0.0, uTime - uPlayer.w);
        float proximity = 1.0 - smoothstep(8.0, 13.0, length(uPlayer.xz - fishSchool.xz));
        float fright = (1.0 - uCalm) * proximity * (1.0 - exp(-age * 18.0))
          * exp(-max(0.0, age - 0.35) * 0.85);
        float breathing = pow(0.5 + 0.5 * sin(uTime * 0.31 + fishReach.z), 8.0) * (1.0 - uCalm);
        // Each fish keeps its own lag and cadence: no lock-step school.
        float lag = fract(sin(fishMotion.x * 12.9898) * 43758.5453);
        float along = sin(phase - lag * 0.35) * fishReach.x + fishMotion.y * (1.0 + fright * 0.7)
          + sin(uTime * (0.55 + lag * 0.4) + fishMotion.x) * 0.16;
        float across = clamp(fishMotion.z * (1.0 + breathing * 0.7 + fright * 2.0)
          - cos(phase - lag * 0.35) * 0.12 + sin(uTime * (0.5 + lag * 0.3) + fishMotion.x) * 0.08,
          -fishReach.y, fishReach.y);
        float sampleAt = clamp(along / fishReach.w + 0.5, 0.0, 1.0) * ${(FISH_ROUTE_SAMPLES - 1).toFixed(1)};
        int row = int(min(floor(sampleAt), ${(FISH_ROUTE_SAMPLES - 2).toFixed(1)}));
        int base = int(school) * ${FISH_ROUTE_SAMPLES};
        vec4 a = uRoute[base + row], b = uRoute[base + row + 1];
        vec4 station = mix(a, b, sampleAt - float(row));
        vec3 forward = normalize(vec3(b.x - a.x, 0.0, b.z - a.z));
        vec3 right = vec3(-forward.z, 0.0, forward.x);
        vec3 center = fishSchool.xyz + station.xyz + right * across;
        // Follow the water grade across the channel as well as along it.
        center.y += (b.y - a.y) / min(b.z - a.z, -0.001) * right.z * across;
        float depth = station.w + sin(fishMotion.x) * 0.02 + sin(uTime + fishMotion.x) * 0.008;
        center.y -= depth;
        vec2 heading = normalize(vec2(cos(phase - lag * 0.35),
          sin(phase - lag * 0.35) * 0.16 + sin(uTime * 0.4 + fishMotion.x * 3.0) * 0.12
          + fright * sin(fishMotion.x) * 0.45));
        vec3 direction = forward * heading.x + right * heading.y;
        vec3 side = vec3(direction.z, 0.0, -direction.x);
        vec3 body = position * fishMotion.w;
        // Carangiform wave: head nearly still, travelling bend toward the caudal fin.
        float tail = pow(clamp((0.1 - position.z) / 0.435, 0.0, 1.0), 1.7);
        float beat = uTime * (6.5 + lag * 3.5 + fright * 10.0) + fishMotion.x;
        float sway = sin(beat + position.z * 15.0) * tail * (0.05 + fright * 0.035) * fishMotion.w;
        // Paired fins scull slowly; median fins ride the body.
        float paired = step(0.5, fishPart) * step(0.009, abs(position.x)) * step(-0.06, position.z);
        sway += paired * sign(position.x) * sin(uTime * 3.1 + fishMotion.x) * 0.008
          * clamp(length(position - finRoot) * 25.0, 0.0, 1.0);
        body.x += sway;
        vec3 world = center + side * body.x + vec3(0.0, body.y, 0.0) + direction * body.z;
        vec4 mvPosition = viewMatrix * modelMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        if (distance(world, cameraPosition) > 60.0 || (uLowSchool >= 0.0 && abs(uLowSchool - school) > 0.1))
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        vDepth = depth;
        vPart = fishPart;
        vHue = lag;
        vLocal = position;
        vRoot = finRoot;
        vObjectNormal = normal;
        vNormal = normalize(mat3(viewMatrix) * (side * normal.x + vec3(0.0, normal.y, 0.0) + direction * normal.z));
        vUp = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
        vView = -mvPosition.xyz;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBack;
      uniform vec3 uFlank;
      uniform vec3 uBelly;
      uniform vec3 uWater;
      uniform float uTime;
      varying float vDepth;
      varying float vPart;
      varying float vHue;
      varying vec3 vLocal;
      varying vec3 vRoot;
      varying vec3 vObjectNormal;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vUp;
      #include <fog_pars_fragment>
      float fishHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vView);
        if (dot(n, v) < 0.0) n = -n;
        vec3 p = vLocal;
        // Countershading: dark dorsal band, olive-silver flank, pale belly.
        float up = clamp(vObjectNormal.y, -1.0, 1.0);
        float dorsal = smoothstep(0.05, 0.75, up + p.y * 6.0);
        float ventral = smoothstep(0.1, 0.8, -up - p.y * 5.0);
        vec3 flank = mix(uFlank, uFlank * vec3(1.08, 0.94, 0.78), vHue);
        vec3 pigment = mix(flank, uBack, dorsal);
        pigment = mix(pigment, uBelly, ventral);
        float sideFacing = smoothstep(0.35, 0.8, abs(vObjectNormal.x));
        // Overlapping cycloid scales in rows, with a darker posterior rim.
        vec2 grid = vec2(p.z * 118.0, p.y * 135.0);
        grid.y += mod(floor(grid.x), 2.0) * 0.5;
        vec2 cell = fract(grid), id = floor(grid);
        float rim = smoothstep(0.32, 0.5, length((cell - vec2(0.72, 0.5)) * vec2(1.0, 0.9)));
        float scaleFilter = 1.0 - smoothstep(0.25, 0.75, length(fwidth(grid)));
        float body = 1.0 - step(0.5, vPart);
        float scaleBand = body * scaleFilter * (1.0 - smoothstep(0.17, 0.2, p.z)) * smoothstep(-0.185, -0.16, p.z);
        float glitter = fishHash(id + floor(vHue * 13.0));
        pigment *= 1.0 - rim * 0.22 * scaleBand;
        // Lateral line: a fine dotted row of pored scales along the mid flank.
        float lineY = 0.008 - 18.0 * (p.z - 0.04) * (p.z - 0.04) * 0.12;
        float lateral = (1.0 - smoothstep(0.0012, 0.0024, abs(p.y - lineY))) * sideFacing * body
          * smoothstep(-0.17, -0.12, p.z) * (1.0 - smoothstep(0.13, 0.15, p.z));
        pigment *= 1.0 - lateral * (0.35 + 0.25 * step(0.5, fract(grid.x)));
        // Gill cover arc and dark mouth line.
        float gill = (1.0 - smoothstep(0.0015, 0.003, abs(length(vec2(p.z - 0.205, p.y * 1.15)) - 0.07)))
          * step(p.z, 0.16) * sideFacing * body * (1.0 - smoothstep(0.035, 0.05, abs(p.y)));
        pigment *= 1.0 - gill * 0.45;
        float mouth = (1.0 - smoothstep(0.0, 0.0018, abs(p.y + 0.002))) * smoothstep(0.205, 0.214, p.z) * body;
        pigment *= 1.0 - mouth * 0.6;
        // Eye: gold iris, black pupil, a wet highlight. Visible from above and the side.
        float eyeDistance = length(vec2(p.z - 0.178, p.y - 0.013));
        float eyeMask = body * smoothstep(0.004, 0.009, abs(p.x));
        float iris = (1.0 - smoothstep(0.0072, 0.0084, eyeDistance)) * eyeMask;
        float pupil = (1.0 - smoothstep(0.0045, 0.0056, eyeDistance)) * eyeMask;
        pigment = mix(pigment, vec3(0.42, 0.33, 0.14), iris);
        pigment = mix(pigment, vec3(0.012, 0.012, 0.01), pupil);
        // Thin translucent fins: radiating rays over a membrane tinted by the water behind.
        vec3 finVector = p - vRoot;
        float rayAngle = atan(finVector.y + finVector.x, abs(finVector.z) + 0.0001);
        float rays = 0.5 + 0.5 * cos(rayAngle * 46.0);
        float finReach = clamp(length(finVector) * 14.0, 0.0, 1.0);
        vec3 finTint = mix(vec3(0.42, 0.36, 0.25), vec3(0.62, 0.3, 0.14), step(0.62, vHue));
        vec3 membrane = mix(uWater * 0.5, finTint, 0.2 + 0.32 * rays * (1.0 - finReach * 0.6));
        membrane = mix(membrane, uBack * 1.4, (1.0 - finReach) * 0.5);
        pigment = mix(pigment, membrane, vPart);
        // Daylight comes through the surface: wrap diffuse from above, cool fill below.
        float lightUp = dot(n, normalize(vUp));
        float diffuse = mix(0.48, 1.0, smoothstep(-0.6, 0.8, lightUp));
        vec3 color = pigment * diffuse;
        // Guanine scale glitter and wet sheen; shimmer as the body flexes.
        vec3 halfway = normalize(normalize(vUp) + v);
        float spec = pow(max(dot(n, halfway), 0.0), 36.0);
        float sparkle = smoothstep(0.72, 0.98, glitter) * scaleBand * (0.6 + 0.4 * sin(uTime * 3.0 + glitter * 30.0));
        color += vec3(0.07, 0.072, 0.06) * spec * (1.0 - vPart) * (0.45 + 1.6 * sparkle) * (0.4 + 0.6 * sideFacing);
        color += vec3(0.11, 0.1, 0.085) * pupil * pow(max(dot(n, halfway), 0.0), 60.0);
        // GFX-P4 Beer-Lambert coefficient: depth softens the submerged silhouette.
        float transmission = exp(-max(vDepth, 0.0) * 0.85);
        gl_FragColor = vec4(mix(uWater * 0.35, color, transmission), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}
