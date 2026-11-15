import { AdditiveBlending, BufferGeometry, CircleGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh,
  Points, ShaderMaterial, Vector3, type Material, type Object3D } from "three";
import type { WaterMaterial } from "./material";

/** Arc of the falling sheet: [along the stream from the spring (m), height above the pool (m)]. */
export const CASCADE_PROFILE = [[-2.6, 1.65], [-2.15, 1.5], [-1.7, 0.8], [-1.2, 0.15], [-0.4, -0.04]] as const;
export const CASCADE_ROWS = 18;

/** Catmull-Rom through the authored profile, so the sheet bends smoothly over the lip. */
export function cascadeProfile(rows = CASCADE_ROWS): [number, number][] {
  const points = CASCADE_PROFILE;
  return Array.from({ length: rows + 1 }, (_, row) => {
    const t = row / rows * (points.length - 1), i = Math.min(points.length - 2, Math.floor(t)), f = t - i;
    const p0 = points[Math.max(0, i - 1)]!, p1 = points[i]!, p2 = points[i + 1]!, p3 = points[Math.min(points.length - 1, i + 2)]!;
    const spline = (k: 0 | 1) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * f + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f * f
      + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f * f * f);
    return [spline(0), spline(1)];
  });
}

const NOISE_GLSL = /* glsl */ `
  float cascadeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float cascadeNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(cascadeHash(i), cascadeHash(i + vec2(1.0, 0.0)), f.x),
      mix(cascadeHash(i + vec2(0.0, 1.0)), cascadeHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float cascadeFbm(vec2 p) {
    // Each octave rotated, so no lattice rows or columns survive.
    return cascadeNoise(p) * 0.5 + cascadeNoise(mat2(0.8, 0.6, -0.6, 0.8) * p * 2.03 + 7.1) * 0.3
      + cascadeNoise(mat2(0.28, -0.96, 0.96, 0.28) * p * 4.1 - 3.3) * 0.2;
  }
  float cascadeCells(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float first = 8.0, second = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 r = o + vec2(cascadeHash(i + o), cascadeHash(i + o + 17.0)) - f;
      float d = dot(r, r);
      if (d < first) { second = first; first = d; } else if (d < second) second = d;
    }
    return sqrt(second) - sqrt(first);
  }
`;

/** Aerated whitewater over the clear sheet, the plunge foam and a fine spray.
 * Visual only (no raycast), clocked by the spring's own water material so pause,
 * reduced motion and quality swaps behave exactly as the river does. */
export function createSpringCascade(origin: Readonly<Vector3>, forward: Readonly<Vector3>, level: number,
  water: () => WaterMaterial) {
  const right = new Vector3(-forward.z, 0, forward.x);
  const uniforms = {
    uTime: { value: 0 }, uLength: { value: 1 }, uLight: { value: new Color(1, 1, 1) }, uTint: { value: new Color(0.3, 0.45, 0.42) },
    uMotion: { value: 1 },
  };
  const sync = () => {
    const material = water();
    uniforms.uTime.value = material.uniforms.uTime!.value as number;
    // uPaperColor carries the river pigment absorption (about 0.3); aerated water scatters instead.
    uniforms.uLight.value.copy(material.uniforms.uPaperColor!.value as Color).multiplyScalar(2.6);
    uniforms.uTint.value.copy(material.uniforms.uEdgeColor!.value as Color);
    uniforms.uMotion.value = material.quality === "Low" ? 0 : 1;
  };
  // Whitewater sheet: rides 1.5 cm proud of the clear sheet, slightly wider, ragged sides.
  const profile = cascadeProfile();
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  let distance = 0;
  const columns = 6;
  for (const [row, [along, rise]] of profile.entries()) {
    if (row) distance += Math.hypot(along - profile[row - 1]![0], rise - profile[row - 1]![1]);
    const width = 0.44 + row / CASCADE_ROWS * 0.4;
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      const p = origin.clone().addScaledVector(forward, along).addScaledVector(right, (u * 2 - 1) * width);
      positions.push(p.x, level + rise + 0.015, p.z);
      uvs.push(u, distance);
      if (row && column < columns) {
        const a = (row - 1) * (columns + 1) + column, b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const sheetGeometry = new BufferGeometry();
  uniforms.uLength.value = distance;
  sheetGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  sheetGeometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  sheetGeometry.setIndex(indices); sheetGeometry.computeVertexNormals();
  const sheetMaterial = new ShaderMaterial({
    name: "spring-whitewater", uniforms, transparent: true, depthWrite: false, side: DoubleSide, fog: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uLight; uniform vec3 uTint; uniform float uMotion; uniform float uLength;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        float fall = vUv.y;
        // Free-fall accelerates the streaks; the lip is glassy, the foot fully aerated.
        float speed = 1.2 + fall * 0.9;
        float flowY = fall * 1.3 - uTime * speed * uMotion;
        // Streaks stretched along the fall (sampled in a 1:6 domain), gently meandering.
        float meander = cascadeFbm(vec2(vUv.x * 3.0, flowY * 0.4)) - 0.5;
        float strands = cascadeFbm(vec2((vUv.x + meander * 0.08) * 11.0, flowY * 0.22));
        float fine = cascadeFbm(vec2((vUv.x + meander * 0.05) * 30.0, flowY * 0.7 + 4.0));
        float aeration = smoothstep(0.15, 1.3, fall);
        float white = smoothstep(0.38 - aeration * 0.2, 0.7, strands * 0.8 + fine * 0.3);
        float side = abs(vUv.x * 2.0 - 1.0);
        float wobble = (cascadeNoise(vec2(fall * 3.5 - uTime * 2.4 * uMotion, vUv.x * 3.0)) - 0.5) * 0.45;
        float body = 1.0 - smoothstep(0.55, 0.95, side + wobble);
        float lip = smoothstep(0.0, 0.25, fall) * (1.0 - smoothstep(uLength - 0.9 + wobble, uLength - 0.1, fall));
        float alpha = body * lip * (0.12 + 0.78 * white * (0.45 + 0.55 * aeration));
        if (alpha < 0.01) discard;
        vec3 color = mix(uTint * 1.3 + uLight * 0.15, uLight * 1.05, white);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sheet = new Mesh(sheetGeometry, sheetMaterial);
  sheet.name = "spring-whitewater"; sheet.raycast = () => {}; sheet.renderOrder = 3;
  sheet.onBeforeRender = sync;
  // Plunge pool: bubbles spread outward from the impact, thinning into the pool.
  const impact = origin.clone().addScaledVector(forward, -0.45);
  const foamGeometry = new CircleGeometry(1.15, 40, 0, Math.PI * 2).rotateX(-Math.PI / 2);
  foamGeometry.scale(1, 1, 1.25).rotateY(Math.atan2(forward.x, forward.z)).translate(impact.x, level + 0.022, impact.z);
  const foamMaterial = new ShaderMaterial({
    name: "spring-plunge-foam", uniforms: { ...uniforms, uImpact: { value: impact } }, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uLight; uniform vec3 uImpact; uniform float uMotion;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      void main() {
        vec2 d = vWorld.xz - uImpact.xz;
        float r = length(d);
        float t = uTime * uMotion;
        // Radial drift in two staggered phases (each restarts while faded out),
        // so the foam streams outward forever without stretching or popping.
        vec2 outward = d / (r + 0.35);
        float alpha = 0.0, clumps = 0.0;
        for (int k = 0; k < 2; k++) {
          float phase = fract(t * 0.15 + float(k) * 0.5);
          float weight = 1.0 - abs(1.0 - 2.0 * phase);
          vec2 p = vWorld.xz - outward * phase * 1.4 + float(k) * 7.3;
          vec2 warp = vec2(cascadeNoise(p * 4.0 + 3.0), cascadeNoise(p * 4.0 - 5.0)) * 0.35;
          float lace = (1.0 - smoothstep(0.02, 0.1, cascadeCells((p + warp) * 13.0))) * smoothstep(0.35, 0.7, cascadeFbm(p * 6.0));
          float c = smoothstep(0.3, 0.75, cascadeFbm(p * 3.2));
          alpha += weight * lace * c;
          clumps += weight * c;
        }
        float rim = cascadeNoise(outward * 2.5 + vec2(t * 0.7, -t * 0.4));
        float churn = 1.0 - smoothstep(0.1, 0.55, r + (rim - 0.5) * 0.25);
        float spread = 1.0 - smoothstep(0.45, 1.1, r);
        alpha = max(churn * (0.45 + 0.45 * clumps), alpha * spread * 0.5);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uLight * (0.9 + 0.15 * clumps), alpha * 0.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const foam = new Mesh(foamGeometry, foamMaterial);
  foam.name = "spring-plunge-foam"; foam.raycast = () => {}; foam.renderOrder = 2;
  foam.onBeforeRender = sync;
  // Spray: droplets thrown from the impact and from the lip, each on its own ballistic loop.
  const count = 140, seeds: number[] = [], anchors: number[] = [];
  let state = 0x51ed27;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  for (let i = 0; i < count; i++) {
    const lip = i % 5 === 0;
    const at = lip ? origin.clone().addScaledVector(forward, -1.95).addScaledVector(right, (random() - 0.5) * 0.8)
      : impact.clone().addScaledVector(right, (random() - 0.5) * 0.7).addScaledVector(forward, (random() - 0.5) * 0.3);
    anchors.push(at.x, level + (lip ? 1.05 : 0.02), at.z);
    seeds.push(random(), random(), random(), lip ? 1 : 0);
  }
  const sprayGeometry = new BufferGeometry();
  sprayGeometry.setAttribute("position", new Float32BufferAttribute(anchors, 3));
  sprayGeometry.setAttribute("spraySeed", new Float32BufferAttribute(seeds, 4));
  const sprayMaterial = new ShaderMaterial({
    name: "spring-spray", uniforms: { ...uniforms, uForward: { value: new Vector3().copy(forward) } },
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 spraySeed; uniform float uTime; uniform vec3 uForward; uniform float uMotion;
      varying float vFade;
      void main() {
        float life = fract(uTime * (0.9 + spraySeed.x * 0.8) + spraySeed.y);
        float angle = spraySeed.z * 6.2831;
        vec3 throwDir = vec3(cos(angle), 0.0, sin(angle)) * (0.35 + spraySeed.x * 0.6) + uForward * 0.4;
        float upward = mix(1.3 + spraySeed.y * 1.2, 0.2, spraySeed.w);
        vec3 p = position + throwDir * life * 0.9 + vec3(0.0, upward * life - 4.9 * life * life * 0.55, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        // Droplets 6-20 mm at roughly 860 px per radian (1600x900, 55 deg).
        gl_PointSize = max(1.0, (0.006 + spraySeed.x * 0.014) * 860.0 / max(-mv.z, 0.3)) * uMotion;
        vFade = (1.0 - life) * smoothstep(0.0, 0.08, life) * uMotion;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight; varying float vFade;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = (1.0 - smoothstep(0.2, 0.5, length(c))) * vFade * 0.35;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uLight * a, a);
        #include <colorspace_fragment>
      }`,
  });
  const spray = new Points(sprayGeometry, sprayMaterial);
  spray.name = "spring-spray"; spray.raycast = () => {}; spray.renderOrder = 4;
  spray.onBeforeRender = sync;
  const objects: Object3D[] = [sheet, foam, spray];
  const materials: Material[] = [sheetMaterial, foamMaterial, sprayMaterial];
  return { objects, dispose() {
    for (const object of objects) object.removeFromParent();
    sheetGeometry.dispose(); foamGeometry.dispose(); sprayGeometry.dispose();
    materials.forEach(material => material.dispose());
  } };
}
