import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, ShaderMaterial, UniformsLib, UniformsUtils, Vector4 } from "three";
import { PALETTE } from "../art/palette";
import { FISH_ROUTE_SAMPLES } from "./fish-schools";

/** 93 triangles: tapered eight-sided body, forked tail and restrained fins. +Z is the nose. */
export function createFishGeometry() {
  const vertices: number[] = [], indices: number[] = [];
  const rings = [[-0.3, 0.023, 0.022], [-0.18, 0.078, 0.057], [0, 0.105, 0.075],
    [0.17, 0.08, 0.058], [0.29, 0.025, 0.026], [0.33, 0, 0]] as const;
  for (const [z, xRadius, yRadius] of rings) for (let side = 0; side < 8; side++) {
    const angle = side / 8 * Math.PI * 2;
    vertices.push(Math.cos(angle) * xRadius, Math.sin(angle) * yRadius, z);
  }
  for (let ring = 0; ring < rings.length - 1; ring++) for (let side = 0; side < 8; side++) {
    const a = ring * 8 + side, b = ring * 8 + (side + 1) % 8;
    indices.push(a, b, a + 8, b, b + 8, a + 8);
  }
  vertices.push(0, 0, -0.3);
  for (let side = 0; side < 8; side++) indices.push(48, (side + 1) % 8, side);
  function fin(points: number[], triangles: number[]) {
    const start = vertices.length / 3;
    vertices.push(...points); indices.push(...triangles.map(index => start + index));
  }
  fin([0, 0, -0.27, 0, 0.15, -0.54, 0, 0, -0.46, 0, -0.15, -0.54], [0, 1, 2, 0, 2, 3]);
  fin([0, 0.06, 0.1, 0, 0.135, -0.07, 0, 0.04, -0.18], [0, 1, 2]);
  for (const side of [-1, 1]) fin([side * 0.065, -0.01, 0.09, side * 0.18, -0.025, -0.06,
    side * 0.06, -0.03, -0.03], [0, 1, 2]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.scale(1, 0.6, 1); geometry.computeVertexNormals();
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
      uBelly: { value: new Color("#555247") }, uWater: { value: new Color(PALETTE.water) },
    }]),
    vertexShader: /* glsl */ `
      attribute vec4 fishSchool;
      attribute vec4 fishMotion;
      attribute vec4 fishReach;
      uniform vec4 uRoute[${route.length}];
      uniform vec4 uPlayer;
      uniform float uTime;
      uniform float uCalm;
      uniform float uLowSchool;
      varying float vDepth;
      varying float vBack;
      varying vec3 vNormal;
      varying vec3 vView;
      #include <fog_pars_vertex>
      void main() {
        float school = fishSchool.w;
        float phase = uTime * 0.22 + fishReach.z + sin(fishMotion.x) * 0.035;
        float age = max(0.0, uTime - uPlayer.w);
        float proximity = 1.0 - smoothstep(8.0, 13.0, length(uPlayer.xz - fishSchool.xz));
        float fright = (1.0 - uCalm) * proximity * (1.0 - exp(-age * 18.0))
          * exp(-max(0.0, age - 0.35) * 0.85);
        float breathing = pow(0.5 + 0.5 * sin(uTime * 0.31 + fishReach.z), 8.0) * (1.0 - uCalm);
        float along = sin(phase) * fishReach.x + fishMotion.y * (1.0 + fright * 0.7)
          + sin(uTime * 0.7 + fishMotion.x) * 0.12;
        float across = clamp(fishMotion.z * (1.0 + breathing * 0.7 + fright * 2.0)
          - cos(phase) * 0.12 + sin(uTime * 0.65 + fishMotion.x) * 0.06,
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
        vec2 heading = normalize(vec2(cos(phase), sin(phase) * 0.16 + fright * sin(fishMotion.x) * 0.45));
        vec3 direction = forward * heading.x + right * heading.y;
        vec3 side = vec3(direction.z, 0.0, -direction.x);
        vec3 body = position * fishMotion.w;
        float tail = pow(clamp((0.1 - position.z) / 0.64, 0.0, 1.0), 2.0);
        body.x += sin(uTime * (8.0 + fright * 10.0) + fishMotion.x + position.z * 13.0) * tail * (0.075 + fright * 0.055);
        vec3 world = center + side * body.x + vec3(0.0, body.y, 0.0) + direction * body.z;
        vec4 mvPosition = viewMatrix * modelMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        if (distance(world, cameraPosition) > 60.0 || (uLowSchool >= 0.0 && abs(uLowSchool - school) > 0.1))
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        vDepth = depth;
        vBack = smoothstep(-0.02, 0.055, position.y);
        vNormal = normalize(mat3(viewMatrix) * (side * normal.x + vec3(0.0, normal.y, 0.0) + direction * normal.z));
        vView = -mvPosition.xyz;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBack;
      uniform vec3 uBelly;
      uniform vec3 uWater;
      varying float vDepth;
      varying float vBack;
      varying vec3 vNormal;
      varying vec3 vView;
      #include <fog_pars_fragment>
      void main() {
        vec3 pigment = mix(uBelly, uBack, vBack);
        float glint = pow(max(0.0, dot(normalize(vNormal), normalize(vView))), 18.0) * vBack;
        pigment += vec3(0.018, 0.019, 0.014) * glint;
        // GFX-P4 Beer-Lambert coefficient: depth softens the submerged silhouette.
        float transmission = exp(-max(vDepth, 0.0) * 0.85);
        gl_FragColor = vec4(mix(uWater * 0.35, pigment, transmission), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}
