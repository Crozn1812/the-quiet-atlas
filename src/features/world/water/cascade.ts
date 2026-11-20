import { AdditiveBlending, BufferGeometry, CircleGeometry, Color, DoubleSide, Float32BufferAttribute, FramebufferTexture, LinearFilter, Mesh,
  Points, ShaderMaterial, Vector2, Vector3, type Material, type Object3D } from "three";
import type { WaterMaterial } from "./material";

/** Arc of the falling sheet: [along the stream from the spring (m), height above the pool (m)]. */
export const CASCADE_PROFILE = [[-2.6, 1.65], [-2.15, 1.5], [-1.7, 0.8], [-1.2, 0.15], [-0.4, -0.04]] as const;
export const CASCADE_ROWS = 18;
/** Separate falling strands (one mesh, one draw) and quads across each strand. */
export const CASCADE_STRANDS = 7;
export const CASCADE_STRAND_COLUMNS = 4;

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

/** Separate clear strands, aerated whitewater, plunge foam and fine spray.
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
  // The fall is several separate strands, not one board: water leaves the lip as an
  // almost continuous sheet, then splits into ropes that narrow, separate and aerate.
  const profile = cascadeProfile();
  const positions: number[] = [], uvs: number[] = [], seeds: number[] = [], indices: number[] = [];
  let distance = 0;
  for (let strand = 0; strand < CASCADE_STRANDS; strand++) {
    const seed = (Math.sin(strand * 91.7 + 3.1) * 43758.5453) % 1;
    const jitter = Math.abs(seed);
    const centre = ((strand + 0.5) / CASCADE_STRANDS * 2 - 1) * 0.82 + (jitter - 0.5) * 0.02;
    // Thicker strands carry more water and fall slightly further out.
    const weight = 0.75 + jitter * 0.5;
    const first = positions.length / 3;
    distance = 0;
    for (const [row, [along, rise]] of profile.entries()) {
      if (row) distance += Math.hypot(along - profile[row - 1]![0], rise - profile[row - 1]![1]);
      const fall = row / CASCADE_ROWS;
      const width = 0.44 + fall * 0.4;
      const half = (0.09 - fall * (0.04 - jitter * 0.015)) * weight;
      const outward = (weight - 1) * fall * 0.18;
      const before = profile[Math.max(0, row - 1)]!, after = profile[Math.min(CASCADE_ROWS, row + 1)]!;
      const normal = forward.clone().multiplyScalar(before[1] - after[1]);
      normal.y = after[0] - before[0]; normal.normalize();
      for (let column = 0; column <= CASCADE_STRAND_COLUMNS; column++) {
        const u = column / CASCADE_STRAND_COLUMNS;
        const p = origin.clone().addScaledVector(forward, along * (1 + outward) + (jitter - 0.5) * 0.05)
          .addScaledVector(right, (centre + (u * 2 - 1) * half) * width);
        // A bowed cross-section gives each ribbon a real changing surface normal.
        p.addScaledVector(normal, Math.sin(u * Math.PI) * half * width * 0.65);
        positions.push(p.x, level + rise + 0.012 + jitter * 0.01, p.z);
        uvs.push(u, distance); seeds.push(jitter + strand);
        if (row && column < CASCADE_STRAND_COLUMNS) {
          const a = first + (row - 1) * (CASCADE_STRAND_COLUMNS + 1) + column, b = a + CASCADE_STRAND_COLUMNS + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
  }
  const sheetGeometry = new BufferGeometry();
  uniforms.uLength.value = distance;
  sheetGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  sheetGeometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  sheetGeometry.setAttribute("strandSeed", new Float32BufferAttribute(seeds, 1));
  sheetGeometry.setIndex(indices); sheetGeometry.computeVertexNormals();
  const sheetMaterial = new ShaderMaterial({
    name: "spring-whitewater", uniforms: { ...uniforms, uBackdrop: { value: null }, uResolution: { value: new Vector2(1, 1) }, uRefraction: { value: 0 } },
    transparent: true, depthWrite: false, side: DoubleSide, fog: false, forceSinglePass: true,
    vertexShader: /* glsl */ `
      attribute float strandSeed;
      varying vec2 vUv; varying float vSeed; varying vec3 vNormal; varying vec3 vView;
      void main() {
        vUv = uv; vSeed = strandSeed;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalMatrix * normal; vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uLight; uniform vec3 uTint; uniform float uMotion; uniform float uLength;
      uniform sampler2D uBackdrop; uniform vec2 uResolution; uniform float uRefraction;
      varying vec2 vUv; varying float vSeed; varying vec3 vNormal; varying vec3 vView;
      ${NOISE_GLSL}
      void main() {
        float fall = vUv.y;
        // Glassy over the lip, aerated toward the foot; free fall accelerates the texture.
        float aeration = smoothstep(0.25, 1.7, fall);
        float flowY = fall * 1.4 - uTime * (1.3 + fall * 1.1) * uMotion;
        float x = vUv.x * 2.0 - 1.0;
        // Torn, wandering edges that travel down with the water.
        float wobble = (cascadeNoise(vec2(flowY * 1.6, vSeed * 17.0)) - 0.5) * 0.55
          + (cascadeNoise(vec2(flowY * 5.0, vSeed * 5.0 + 3.0)) - 0.5) * 0.3 * aeration;
        float side = abs(x + wobble * 0.35);
        float body = 1.0 - smoothstep(0.6 - 0.25 * aeration, 0.98, side + abs(wobble) * 0.25);
        // Low in the fall each strand frays into ropes and drops.
        float rope = cascadeFbm(vec2(vUv.x * 3.0 + vSeed * 9.0, flowY * 0.45));
        body *= mix(1.0, smoothstep(0.32, 0.56, rope), aeration * 0.85);
        float lip = smoothstep(0.0, 0.12, fall) * (1.0 - smoothstep(uLength - 0.75, uLength - 0.05, fall));
        // Clear water: a dark refracting core, bright rims (Fresnel on a round strand)
        // and sliding specular highlights where the surface catches the sky.
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float fresnel = pow(1.0 - facing, 2.5);
        float glint = smoothstep(0.48, 0.72, cascadeFbm(vec2(vUv.x * 6.0 + vSeed * 3.0, flowY * 0.2)))
          * (1.0 - smoothstep(0.12, 0.42, abs(x - 0.32)));
        float sparkle = smoothstep(0.72, 0.88, cascadeFbm(vec2(vUv.x * 14.0 + vSeed, flowY * 0.7 + 2.0))) * (0.4 + 0.6 * aeration);
        float white = smoothstep(0.52 - aeration * 0.24, 0.8, cascadeFbm(vec2(vUv.x * 5.0 + vSeed * 4.0, flowY * 0.32 + 1.0))) * aeration;
        vec3 color = uTint * (0.35 + 0.25 * facing) + uLight * (0.12 + 0.32 * fresnel + 0.85 * glint + 0.55 * sparkle);
        color = mix(color, uLight, white * 0.85);
        float alpha = body * lip * clamp(0.32 + 0.45 * fresnel + 0.55 * max(glint, sparkle) + 0.65 * white, 0.0, 0.92);
        if (uRefraction > 0.5) {
          // Sample the actual rocks/bed already rendered behind this fall. No
          // second scene pass: one framebuffer copy while the fall is visible.
          vec3 n = normalize(vNormal); vec3 view = normalize(vView);
          if (dot(n, view) < 0.0) n = -n;
          vec2 bend = refract(-view, n, 0.7502).xy * (0.003 + 0.002 * wobble);
          vec2 screen = gl_FragCoord.xy / uResolution;
          vec3 refracted = texture2D(uBackdrop, clamp(screen + bend, vec2(0.001), vec2(0.999))).rgb;
          color = mix(refracted * vec3(0.95, 0.985, 0.98), color, clamp(0.18 + fresnel * 0.3 + glint * 0.65 + white * 0.65, 0.0, 1.0));
          alpha = max(alpha, body * lip * 0.85);
        }
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sheet = new Mesh(sheetGeometry, sheetMaterial);
  sheet.name = "spring-whitewater"; sheet.raycast = () => {}; sheet.renderOrder = 3;
  let backdrop: FramebufferTexture | undefined;
  sheet.onBeforeRender = renderer => {
    sync();
    const target = renderer.getRenderTarget();
    // The existing High post target is linear HDR. Low/direct output
    // uses the clear alpha fallback, avoiding a second tone/color conversion.
    sheetMaterial.uniforms.uRefraction!.value = target && uniforms.uMotion.value ? 1 : 0;
    if (!target || !uniforms.uMotion.value) return;
    if (!backdrop || backdrop.image.width !== target.width || backdrop.image.height !== target.height || backdrop.type !== target.texture.type) {
      backdrop?.dispose(); backdrop = new FramebufferTexture(target.width, target.height);
      backdrop.type = target.texture.type; backdrop.format = target.texture.format;
      backdrop.minFilter = backdrop.magFilter = LinearFilter;
      sheetMaterial.uniforms.uBackdrop!.value = backdrop;
      (sheetMaterial.uniforms.uResolution!.value as Vector2).set(target.width, target.height);
    }
    renderer.copyFramebufferToTexture(backdrop);
  };
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
  const count = 140, spraySeeds: number[] = [], anchors: number[] = [];
  let state = 0x51ed27;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  for (let i = 0; i < count; i++) {
    const lip = i % 5 === 0;
    const at = lip ? origin.clone().addScaledVector(forward, -1.95).addScaledVector(right, (random() - 0.5) * 0.8)
      : impact.clone().addScaledVector(right, (random() - 0.5) * 0.7).addScaledVector(forward, (random() - 0.5) * 0.3);
    anchors.push(at.x, level + (lip ? 1.05 : 0.02), at.z);
    spraySeeds.push(random(), random(), random(), lip ? 1 : 0);
  }
  const sprayGeometry = new BufferGeometry();
  sprayGeometry.setAttribute("position", new Float32BufferAttribute(anchors, 3));
  sprayGeometry.setAttribute("spraySeed", new Float32BufferAttribute(spraySeeds, 4));
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
  // Mist: a few large, faint billows rising from the impact and drifting downstream.
  const mistCount = 26, mistAnchors: number[] = [], mistSeeds: number[] = [];
  for (let i = 0; i < mistCount; i++) {
    const at = impact.clone().addScaledVector(right, (random() - 0.5) * 0.9).addScaledVector(forward, (random() - 0.3) * 0.6);
    mistAnchors.push(at.x, level + 0.05, at.z);
    mistSeeds.push(random(), random(), random(), random());
  }
  const mistGeometry = new BufferGeometry();
  mistGeometry.setAttribute("position", new Float32BufferAttribute(mistAnchors, 3));
  mistGeometry.setAttribute("mistSeed", new Float32BufferAttribute(mistSeeds, 4));
  const mistMaterial = new ShaderMaterial({
    name: "spring-mist", uniforms: { ...uniforms, uForward: { value: new Vector3().copy(forward) } },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 mistSeed; uniform float uTime; uniform vec3 uForward; uniform float uMotion;
      varying float vFade; varying float vSeed;
      void main() {
        float life = fract(uTime * (0.08 + mistSeed.x * 0.06) + mistSeed.y);
        float angle = mistSeed.z * 6.2831;
        vec3 drift = vec3(cos(angle), 0.0, sin(angle)) * 0.25 + uForward * 0.45;
        vec3 p = position + drift * life + vec3(0.0, 0.15 + life * (0.7 + mistSeed.w * 0.5), 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        // 0.5-1.1 m billows at roughly 860 px per radian, capped for close cameras.
        gl_PointSize = min(420.0, (0.5 + mistSeed.w * 0.6) * (0.6 + life * 0.6) * 860.0 / max(-mv.z, 0.3)) * uMotion;
        vFade = sin(life * 3.14159) * uMotion; vSeed = mistSeed.x;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight; varying float vFade; varying float vSeed;
      ${NOISE_GLSL}
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float wisp = cascadeNoise(gl_PointCoord * 3.0 + vSeed * 11.0);
        float a = exp(-dot(c, c) * 14.0) * (0.55 + 0.45 * wisp) * vFade * 0.075;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uLight, a);
        #include <colorspace_fragment>
      }`,
  });
  const mist = new Points(mistGeometry, mistMaterial);
  mist.name = "spring-mist"; mist.raycast = () => {}; mist.renderOrder = 5;
  mist.onBeforeRender = sync;
  const objects: Object3D[] = [sheet, foam, spray, mist];
  const materials: Material[] = [sheetMaterial, foamMaterial, sprayMaterial, mistMaterial];
  let disposed = false;
  return { objects, dispose() {
    if (disposed) return;
    disposed = true;
    for (const object of objects) object.removeFromParent();
    sheetGeometry.dispose(); foamGeometry.dispose(); sprayGeometry.dispose(); mistGeometry.dispose();
    backdrop?.dispose();
    materials.forEach(material => material.dispose());
  } };
}
