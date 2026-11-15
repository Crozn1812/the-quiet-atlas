/** Single-scattering approximation in linear space; the world owns sun/time/fog endpoints. */
export const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 skyTop, skyHorizon, fogColor, sunDirection, sunGlow;
  uniform vec3 cloudSun, cloudShade;
  uniform sampler2D cloudMap;
  uniform float cloudTime, cloudReady;
  varying vec3 skyDirection;
  const float PI = 3.14159265359;
  vec3 atmosphere(vec3 ray) {
    float height = max(ray.y, 0.0);
    float mu = clamp(dot(ray, sunDirection), -1.0, 1.0);
    // Relative wavelength-dependent Rayleigh extinction; curved air mass remains
    // finite at the horizon, and the Mie lobe follows the existing sun direction.
    vec3 beta = vec3(0.19, 0.34, 0.63);
    float airMass = 1.0 / sqrt(height * height + 0.025);
    vec3 extinction = exp(-beta * airMass);
    float rayleigh = 0.75 * (1.0 + mu * mu);
    float mie = 0.0196 / pow(max(0.04, 1.0 + 0.76 * 0.76 - 1.52 * mu), 1.5);
    vec3 zenith = skyTop * vec3(0.48, 0.68, 1.02);
    vec3 scattered = zenith * (0.82 + 0.18 * rayleigh);
    vec3 horizon = mix(fogColor, skyHorizon, 0.55);
    vec3 color = mix(horizon, scattered, pow(height, 0.38));
    color += (vec3(1.0) - extinction) * sunGlow * (0.055 * rayleigh + 0.24 * mie);
    // Dissolve to the exact scene air at the geometric horizon, avoiding a sky/fog seam.
    color = mix(fogColor, color, smoothstep(-0.035, 0.065, ray.y));
    return color;
  }
  void main() {
    vec3 ray = normalize(skyDirection);
    vec3 color = atmosphere(ray);
    vec2 uv = vec2(atan(ray.z, ray.x) / (2.0 * PI) + 0.5, asin(clamp(ray.y, -1.0, 1.0)) / PI + 0.5);
    // Continuous subpixel advection; Low/software freeze exactly the same High bake.
    uv.x += cloudTime * 0.000004;
    vec4 field = texture2D(cloudMap, uv) * cloudReady;
    float alignment = max(0.0, dot(ray, sunDirection));
    float aerial = smoothstep(0.015, 0.16, ray.y);
    float opacity = field.r * aerial;
    vec3 base = cloudShade;
    vec3 crown = cloudSun;
    // Multiple scattering opens the shaded underside without flattening its volume.
    vec3 cloud = mix(base, crown, clamp(0.12 + field.g * 0.65 + field.b * 0.25, 0.0, 1.0));
    float silver = pow(alignment, 24.0) * field.g * (1.0 - field.r) * 3.0;
    cloud += cloudSun * silver;
    cloud = mix(atmosphere(ray), cloud, aerial);
    color = mix(color, mix(color, crown, field.a), 1.0 - opacity);
    color = mix(color, cloud, opacity);
    // Solar angular diameter ~0.53 degrees, antialiased independently of the cloud bake.
    float mu = dot(ray, sunDirection);
    float disc = smoothstep(cos(0.006), cos(0.0038), mu);
    color += sunGlow * disc * 2.5 * (1.0 - opacity);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
