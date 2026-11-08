import { Matrix4, NoBlending, ShaderMaterial, Vector2 } from "three";

/** Depth-only scalable AO: metres in view space, deterministic (no temporal noise). */
export function createAOMaterial() {
  return new ShaderMaterial({
    depthTest: false, depthWrite: false, blending: NoBlending, toneMapped: false,
    defines: { AO_SAMPLES: 12 },
    uniforms: {
      tDepth: { value: null },
      inverseProjection: { value: new Matrix4() },
      projection: { value: new Matrix4() },
      depthTexel: { value: new Vector2() },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDepth;
      uniform mat4 inverseProjection;
      uniform mat4 projection;
      uniform vec2 depthTexel;
      varying vec2 vUv;
      vec3 positionAt(vec2 uv) {
        vec4 p = inverseProjection * vec4(uv * 2.0 - 1.0, texture2D(tDepth, uv).r * 2.0 - 1.0, 1.0);
        return p.xyz / p.w;
      }
      void main() {
        if (texture2D(tDepth, vUv).r >= 0.99999) {
          gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
          return;
        }
        vec3 p = positionAt(vUv);
        vec3 l = p - positionAt(vUv - vec2(depthTexel.x, 0.0));
        vec3 r = positionAt(vUv + vec2(depthTexel.x, 0.0)) - p;
        vec3 b = p - positionAt(vUv - vec2(0.0, depthTexel.y));
        vec3 t = positionAt(vUv + vec2(0.0, depthTexel.y)) - p;
        // Choose the continuous side at silhouettes instead of bridging foreground/background.
        vec3 normal = cross(abs(l.z) < abs(r.z) ? l : r, abs(b.z) < abs(t.z) ? b : t);
        vec3 n = normal / sqrt(max(dot(normal, normal), 0.00000001));
        if (dot(n, -p) < 0.0) n = -n;
        vec4 clip = projection * vec4(p, 1.0);
        // One metre radius in both perspective and orthographic projections.
        vec2 radiusUV = 0.5 * vec2(projection[0][0], projection[1][1]) / max(abs(clip.w), 0.0001);
        float obscurance = 0.0;
        for (int i = 0; i < AO_SAMPLES; i++) {
          float f = (float(i) + 0.5) / float(AO_SAMPLES);
          float angle = float(i) * 2.39996323;
          // Concentrate taps near contacts; the outer taps still reach one metre.
          vec2 uv = vUv + vec2(cos(angle), sin(angle)) * f * radiusUV;
          if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) continue;
          if (texture2D(tDepth, uv).r >= 0.99999) continue;
          vec3 delta = positionAt(uv) - p;
          float distanceSquared = dot(delta, delta);
          float falloff = max(0.0, 1.0 - distanceSquared);
          // 3 cm bias prevents self-darkening on smooth planes and grazing terrain.
          obscurance += max(0.0, dot(n, delta) - 0.03) / sqrt(max(distanceSquared, 0.0001)) * falloff;
        }
        float fade = 1.0 - smoothstep(60.0, 100.0, -p.z);
        // Contact strength is capped at 40%; open planes retain full visibility.
        float ao = 1.0 - min(0.4, obscurance * (3.2 / float(AO_SAMPLES))) * fade;
        // Store linear view depth alongside visibility for bilateral upsampling.
        gl_FragColor = vec4(ao, min(-p.z, 65000.0), 0.0, 1.0);
      }
    `,
  });
}

/** Four nearest half-resolution taps, rejecting unrelated depth layers. */
export const aoCompositeShader = /* glsl */ `
  uniform sampler2D tAO;
  uniform vec2 aoSize;
  float ambientVisibility(float viewDepth) {
    vec2 pixel = vUv * aoSize - 0.5;
    vec2 base = floor(pixel);
    vec2 f = fract(pixel);
    float total = 0.0;
    float weight = 0.0;
    for (int y = 0; y < 2; y++) {
      for (int x = 0; x < 2; x++) {
        vec2 corner = vec2(float(x), float(y));
        vec2 sampleAO = texture2D(tAO, (base + corner + 0.5) / aoSize).rg;
        vec2 w = mix(1.0 - f, f, corner);
        float bilateral = w.x * w.y * exp(-abs(sampleAO.g - viewDepth) / 0.15);
        total += sampleAO.r * bilateral;
        weight += bilateral;
      }
    }
    return weight > 0.0001 ? clamp(total / weight, 0.6, 1.0) : 1.0;
  }
`;
