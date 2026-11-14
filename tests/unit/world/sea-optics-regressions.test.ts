import { Color, DataTexture, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { timeOfDayAt } from "../../../src/features/world/layout/lighting";
import { directGrade } from "../../../src/features/world/scene/compose";
import { SEA_OPTICS_GLSL } from "../../../src/features/world/shore/sea-optics";
import { applyCoastAtmosphere, lightingAt } from "../../../src/features/world/sky/grade";
import { surfaceHeight } from "../../../src/features/world/terrain/height";
import { createWaterMaterial, type WaterMaterial } from "../../../src/features/world/water/material";
import { WATER_LEVEL } from "../../../src/features/world/water/ribbon";
import { createSea } from "../../../src/features/world/water/sea";
import { fract, smoothstep } from "./water-noise";

// A small, deliberately strict evaluator for the straight-line GLSL below.
// Arithmetic is component-wise, including signed colour subtraction. Unknown
// syntax fails instead of silently testing a stale CPU copy of the shader.
type Value = number | number[];
type Scope = Record<string, Value>;
const vector = (v: Value): number[] => Array.isArray(v) ? v : [v];
function zip(a: Value, b: Value, fn: (x: number, y: number) => number): Value {
  if (typeof a === "number" && typeof b === "number") return fn(a, b);
  const av = vector(a), bv = vector(b);
  return Array.from({ length: Math.max(av.length, bv.length) }, (_, i) => fn(av[i % av.length]!, bv[i % bv.length]!));
}
const add = (a: Value, b: Value) => zip(a, b, (x, y) => x + y);
const sub = (a: Value, b: Value) => zip(a, b, (x, y) => x - y);
const mul = (a: Value, b: Value) => zip(a, b, (x, y) => x * y);
const div = (a: Value, b: Value) => zip(a, b, (x, y) => x / y);
const dot = (a: Value, b: Value) => vector(mul(a, b)).reduce((sum, x) => sum + x, 0);
const length = (v: Value) => Math.sqrt(dot(v, v));
const normalize = (v: Value) => div(v, length(v));
const swizzle = (v: Value, fields: string) => {
  const values = [...fields].map(c => vector(v)["xyzw".indexOf(c) < 0 ? "rgba".indexOf(c) : "xyzw".indexOf(c)]!);
  return values.length === 1 ? values[0]! : values;
};

function expression(source: string): string {
  const tokens = source.match(/(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?|[A-Za-z_]\w*|[()+*/.,-]/g) ?? [];
  // Ensure a newly introduced operator cannot be dropped by the tokenizer.
  if (tokens.join("") !== source.replace(/\s/g, "")) throw new Error(`Unsupported GLSL: ${source}`);
  let index = 0;
  function parse(minimum = 0): string {
    const token = tokens[index++]!;
    let result: string;
    if (token === "-") result = `mul(-1,${parse(3)})`;
    else if (token === "(") {
      result = parse();
      if (tokens[index++] !== ")") throw new Error("Unclosed GLSL expression");
    } else if (/^\d|^\.\d/.test(token)) result = token;
    else if (tokens[index] === "(") {
      index++;
      const args: string[] = [];
      if (tokens[index] !== ")") do { args.push(parse()); } while (tokens[index] === "," && ++index);
      if (tokens[index++] !== ")") throw new Error("Unclosed GLSL call");
      result = `${token}(${args.join(",")})`;
    } else result = `s.${token}`;
    while (tokens[index] === ".") {
      index++;
      result = `swizzle(${result},"${tokens[index++]}")`;
    }
    const operators: Record<string, [number, string]> = { "+": [1, "add"], "-": [1, "sub"], "*": [2, "mul"], "/": [2, "div"] };
    while (operators[tokens[index]!] && operators[tokens[index]!]![0] > minimum) {
      const [precedence, name] = operators[tokens[index++]!]!;
      result = `${name}(${result},${parse(precedence)})`;
    }
    return result;
  }
  const result = parse();
  if (index !== tokens.length) throw new Error(`Unparsed GLSL: ${source}`);
  return result;
}

function preprocess(source: string, defines: Record<string, unknown>) {
  const stack: boolean[] = [];
  return source.split("\n").filter(line => {
    const directive = line.trim();
    if (/^#ifn?def /.test(directive)) {
      const [, kind, name] = directive.match(/^#(ifdef|ifndef) (\w+)/)!;
      stack.push(kind === "ifdef" ? !!defines[name!] : !defines[name!]);
    } else if (directive === "#else") stack[stack.length - 1] = !stack.at(-1);
    else if (directive === "#endif") stack.pop();
    else if (directive.startsWith("#")) throw new Error(`Unsupported directive: ${directive}`);
    else return stack.every(Boolean);
    return false;
  }).join("\n");
}

function program(source: string) {
  const js = source.replace(/\/\/[^\n]*/g, "").split(";").map(statement => {
    const text = statement.trim();
    if (!text) return "";
    if (text.startsWith("return ")) return `return ${expression(text.slice(7))};`;
    const match = text.match(/^(?:(?:float|vec[234])\s+)?(\w+)\s*([+*]?=)\s*([\s\S]+)$/);
    if (!match) throw new Error(`Unsupported GLSL statement: ${text}`);
    const [, name, operator, value] = match;
    const rhs = expression(value!);
    return `s.${name} = ${operator === "+=" ? `add(s.${name},${rhs})` : operator === "*=" ? `mul(s.${name},${rhs})` : rhs};`;
  }).join("\n");
  const builtins = { add, sub, mul, div, dot, length, normalize, swizzle,
    vec2: (...v: Value[]) => v.flat(), vec3: (...v: Value[]) => v.flat(),
    sin: Math.sin, cos: Math.cos, exp: Math.exp, abs: Math.abs, min: Math.min, max: Math.max, pow: Math.pow,
    smoothstep, clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)),
    mix: (a: Value, b: Value, t: number) => add(a, mul(sub(b, a), t)),
    reflect: (v: Value, n: Value) => sub(v, mul(n, 2 * dot(n, v))),
  };
  const evaluate = new Function("s", "texture2D", "fwidth", "seaSlopes", "seaGlitter", "seaMist", ...Object.keys(builtins), js);
  return (scope: Scope, texture: (uv: number[]) => number[], footprint: number, slopes?: (p: number[], time: number) => Value) => {
    evaluate(scope, (_sampler: Value, uv: number[]) => texture(uv), () => [footprint, 0], slopes,
      glitter, mist, ...Object.values(builtins));
    return scope;
  };
}

// Scalar optics are evaluated from the production source, as are all vector
// expressions and their coefficients in the slopes/reflection/glitter path.
function scalar(name: string, args: string[]) {
  const body = SEA_OPTICS_GLSL.match(new RegExp(`float ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n  \\}`))![1]!;
  return new Function(...args, "smoothstep", body.replace(/\bfloat\s/g, "let ").replace(/\bexp\(/g, "Math.exp("));
}
const glitter = scalar("seaGlitter", ["halfAcross", "halfAlong", "variance", "facing"]);
const mistSource = scalar("seaMist", ["distanceToEye", "viewElevation"]);
const mist = (distance: number, elevation: number) => mistSource(distance, elevation, smoothstep) as number;

// Bilinear repeat sampling at texel centres. These tests use resolved near-field
// samples, not a GPU mip/derivative simulation; far-field checks use analytic Low.
function normalSampler(texture?: DataTexture) {
  if (!texture) return () => [0.5, 0.5];
  const { width, height } = texture.image;
  const data = texture.image.data as Uint8Array;
  return (uv: number[]) => {
    const x = fract(uv[0]!) * width - 0.5, y = fract(uv[1]!) * height - 0.5;
    const col = Math.floor(x), row = Math.floor(y);
    const at = (dx: number, dy: number, c: number) => data[(((row + dy + height) % height) * width + (col + dx + width) % width) * 2 + c]! / 255;
    return [0, 1].map(c => (at(0, 0, c) * (1 - fract(x)) + at(1, 0, c) * fract(x)) * (1 - fract(y))
      + (at(0, 1, c) * (1 - fract(x)) + at(1, 1, c) * fract(x)) * fract(y));
  };
}

function optics(material: WaterMaterial) {
  const texture = normalSampler(material.uniforms.uSeaNormal?.value as DataTexture | undefined);
  const slopeBody = SEA_OPTICS_GLSL.match(/vec2 seaSlopes\([^)]*\) \{([\s\S]*?)\n  \}/)![1]!;
  const slopeProgram = program(preprocess(slopeBody, material.defines).replace("return slopes;", "result = slopes;"));
  const slopes = (p: number[], time: number, footprint = 0) => slopeProgram({ p, time, uSeaNormal: 0 }, texture, footprint).result!;
  const fragment = material.fragmentShader;
  const start = fragment.indexOf("vec2 seaSurfaceSlopes =");
  const end = fragment.indexOf("float brush =", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  // Identity view rotation: world-space view/normal inputs produce the same
  // dot/reflection results as rotating both into camera space in the GPU.
  const body = preprocess(fragment.slice(start, end), material.defines)
    .replace(/mat3\(viewMatrix\) \* /g, "").replace(/ \* mat3\(viewMatrix\)/g, "");
  const render = program(body);
  const sample = (point: Vector3, camera: Vector3, time = 0, footprint = 0, shallow = 0, flatSurface = false) => {
    const uniforms: Scope = {};
    for (const [key, uniform] of Object.entries(material.uniforms)) {
      const value = uniform.value;
      if (typeof value === "number") uniforms[key] = value;
      else if (value instanceof Color || value instanceof Vector3) uniforms[key] = value.toArray();
    }
    return render({ ...uniforms, uSeaNormal: 0, uTime: time, SKY_REFLECTION: Number(material.defines.SKY_REFLECTION),
      vWaterWorld: point.toArray(), cameraPosition: camera.toArray(), vViewDirection: camera.clone().sub(point).toArray(),
      vSurfaceNormal: [0, 1, 0], breaker: 0, offshore: 100, breakerDistance: 0,
      color: (material.uniforms.uDeepColor!.value as Color).clone().lerp(material.uniforms.uEdgeColor!.value, shallow).toArray(),
    }, texture, footprint, (p, t) => flatSurface ? [0, 0] : slopes(p, t, footprint));
  };
  return { sample, slopes };
}

const qualities = ["Low", "Balanced", "High"] as const;
const luma = (v: Value) => dot(v, [0.2126, 0.7152, 0.0722]);
const color = (s: Scope) => new Color().fromArray(vector(s.color!));
const gradeAt = (t: number) => applyCoastAtmosphere(directGrade(lightingAt(timeOfDayAt(t)), timeOfDayAt(t)), t);

// Same ACES exposure=1/output transfer used by the removed surface regression.
function displayColor(linear: Color, aces: boolean) {
  if (!aces) return linear.clone().convertLinearToSRGB();
  const { r, g, b } = linear.clone().multiplyScalar(1 / 0.6);
  const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  const x = fit(0.59719 * r + 0.35458 * g + 0.04823 * b);
  const y = fit(0.076 * r + 0.90834 * g + 0.01566 * b);
  const z = fit(0.0284 * r + 0.13383 * g + 0.83777 * b);
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return new Color().setRGB(clamp(1.60475 * x - 0.53108 * y - 0.07367 * z),
    clamp(-0.10208 * x + 1.10813 * y - 0.00605 * z),
    clamp(-0.00327 * x - 0.07276 * y + 1.07602 * z)).convertLinearToSRGB();
}
function ray(material: WaterMaterial, distance: number, degrees = 0) {
  return (material.uniforms.uSunDirection!.value as Vector3).clone().setY(0).normalize()
    .applyAxisAngle(new Vector3(0, 1, 0), degrees * Math.PI / 180).multiplyScalar(distance).setY(WATER_LEVEL);
}

describe("SEA-TESTS restored optical invariants after HR-SEA", () => {
  it.each(qualities)("brightens %s monotonically toward the actual dusk horizon", quality => {
    const material = createWaterMaterial(quality, { surface: "sea", grade: gradeAt(1) });
    try {
      const { sample } = optics(material), camera = new Vector3(0, WATER_LEVEL + 8, 0);
      let previous = 0;
      for (const distance of [80, 160, 320, 640, 1600, 4000, 1000000]) {
        // Isolate the horizon envelope from local normal-map sparkle/sky IBL.
        const result = sample(new Vector3(0, WATER_LEVEL, -distance), camera, 0, 4, 0, true);
        const displayed = color(result).convertLinearToSRGB();
        expect(luma(displayed.toArray())).toBeGreaterThanOrEqual(previous);
        previous = luma(displayed.toArray());
        if (distance === 1000000) expect(displayed.toArray()).toEqual(
          (material.uniforms.uSkyHorizon!.value as Color).clone().convertLinearToSRGB().toArray().map(v => expect.closeTo(v, 3)));
      }
    } finally { material.dispose(); }
  });

  it.each(qualities)("increases %s Fresnel toward grazing without coastline or sky-mix bands", quality => {
    const material = createWaterMaterial(quality, { surface: "sea", grade: gradeAt(1) });
    try {
      const { sample } = optics(material), point = new Vector3(0, WATER_LEVEL, -80);
      let previous = 0;
      for (const elevation of [1, 0.8, 0.5, 0.2, 0.05, 0.001]) {
        const view = new Vector3(0, elevation, Math.sqrt(1 - elevation * elevation));
        const result = sample(point, point.clone().add(view), 0, 4, 0, true);
        expect(result.reflection).toBeCloseTo(0.02 + 0.98 * (1 - elevation) ** 5, 12);
        expect(result.reflection).toBeGreaterThanOrEqual(previous);
        previous = result.reflection as number;
      }
      const before = sample(point, new Vector3(0, 8, 0), 0, 4).reflection;
      for (const skyMix of [0, 0.35, 1]) {
        material.setSkyMix(skyMix);
        expect(sample(point, new Vector3(0, 8, 0), 0, 4).reflection).toBe(before);
      }
      const grade = gradeAt(1), horizon = (material.uniforms.uSkyHorizon!.value as Color).clone();
      grade.skyHorizon.setRGB(0.3, 0.2, 0.1);
      material.setGrade(grade);
      expect(material.uniforms.uSkyHorizon!.value).toEqual(grade.skyHorizon);
      expect(material.uniforms.uSkyHorizon!.value).not.toEqual(horizon);
    } finally { material.dispose(); }
  });

  it.each(qualities)("keeps %s sunward glitter warm, visible and directional through the slow cycle", quality => {
    const material = createWaterMaterial(quality, { surface: "sea", grade: gradeAt(0.95) });
    try {
      const { sample } = optics(material), camera = new Vector3(0, WATER_LEVEL + 1.7, 0);
      for (const skyMix of [0, 0.35, 1]) for (const time of [0, 1, 2, 4, 6, 8]) {
        material.setSkyMix(skyMix);
        const on = sample(ray(material, 80), camera, time);
        const off = sample(ray(material, 80, 90), camera, time);
        expect(on.glitter).toBeGreaterThan(0.1);
        expect(off.glitter).toBe(0);
        expect(luma(on.color!) - luma(off.color!)).toBeGreaterThanOrEqual(0.07);
        const warm = color(on), cool = color(off);
        expect(warm.r / warm.b).toBeGreaterThan(cool.r / cool.b + 0.3);
      }
    } finally { material.dispose(); }
  });

  it.each(qualities)("fades %s glitter smoothly off the sun and averages distant waves into mist", quality => {
    const material = createWaterMaterial(quality, { surface: "sea", grade: gradeAt(1) });
    try {
      const { sample } = optics(material), camera = new Vector3(0, WATER_LEVEL + 1.7, 0);
      let previous = sample(ray(material, 80), camera, 0, 4, 0, true).glitter as number;
      // Large pixel footprints suppress analytic swells and broaden the finite
      // slope distribution; no old hard 12-degree/640 m cutoffs are expected.
      for (let step = 0; step <= 3600; step++) {
        const angle = step / 20;
        const result = sample(ray(material, 80, angle), camera, 0, 4, 0, true);
        expect(result.glitter).toBeLessThanOrEqual(previous + 1e-12);
        expect(previous - (result.glitter as number)).toBeLessThan(0.07);
        previous = result.glitter as number;
        if (angle >= 90) expect(result.glitter).toBe(0);
      }
      const remaining = [80, 160, 320, 640, 1600, 4000, 10000].map(distance => 1 - mist(distance, 0.01));
      expect(remaining).toEqual([...remaining].sort((a, b) => b - a));
      expect(remaining.at(-1)).toBeLessThan(0.01);
      material.setSunDirection(new Vector3(0.8, 0, -0.6));
      expect(sample(ray(material, 80), camera).glitter).toBe(0);
    } finally { material.dispose(); }
  });

  it.each(qualities)("keeps %s offshore blue and shallow jade at t=0.95", quality => {
    const material = createWaterMaterial(quality, { surface: "sea", grade: gradeAt(0.95) });
    try {
      const { sample } = optics(material), camera = new Vector3(0, WATER_LEVEL + 8, 0);
      const deepPigment = material.uniforms.uDeepColor!.value as Color;
      const shallowPigment = material.uniforms.uEdgeColor!.value as Color;
      expect(deepPigment.b).toBeGreaterThan(deepPigment.g);
      expect(deepPigment.b).toBeGreaterThan(deepPigment.r);
      expect(shallowPigment.g).toBeGreaterThan(shallowPigment.b);
      // At grazing/far ranges actual warm sky and aerosol can dominate blue
      // pigment. Keep the chromatic surface check in the downward near field.
      for (const distance of [6, 8, 10]) {
        const point = ray(material, distance, 140);
        const deep = color(sample(point, camera));
        expect(deep.b).toBeGreaterThan(deep.g);
        expect(deep.b).toBeGreaterThan(deep.r);
        const shallow = color(sample(point, camera, 0, 0, 1));
        expect(shallow.g).toBeGreaterThan(shallow.b);
      }
      const edge = (material.uniforms.uEdgeColor!.value as Color).clone().convertLinearToSRGB();
      expect((Math.max(...edge.toArray()) - Math.min(...edge.toArray())) / Math.max(...edge.toArray())).toBeLessThan(0.35);
    } finally { material.dispose(); }
  });

  it.each(qualities)("bounds %s displayed offshore luma across the actual Last Postcard azimuths", quality => {
    const sea = createSea(quality), material = sea.mesh.material;
    try {
      const { sample } = optics(material), camera = pathPointAt(1).setY(WATER_LEVEL + 8);
      let count = 0, minimum = Infinity, maximum = 0, maxSwing = 0;
      for (const t of [0.93, 0.95, 1]) {
        material.setGrade(gradeAt(t));
        const sun = material.uniforms.uSunDirection!.value as Vector3;
        const sunAngle = Math.atan2(sun.x, -sun.z);
        for (const distance of [80, 160, 320, 640]) for (const time of [0, 2, 4, 6, 8]) for (const aces of [false, true]) {
          const values: number[] = [];
          for (let degrees = -80; degrees <= 80; degrees++) {
            const angle = degrees * Math.PI / 180;
            const point = camera.clone().add(new Vector3(Math.sin(angle) * distance, -8, -Math.cos(angle) * distance));
            if (surfaceHeight(point.x, point.z) > -2.5) continue;
            const delta = Math.atan2(Math.sin(angle - sunAngle), Math.cos(angle - sunAngle));
            if (Math.abs(delta) <= 12 * Math.PI / 180) continue;
            // These samples are south of the real 2.5 m shelf, not a synthetic
            // coastline-distance pigment mask. Resolved optics, no scene fog.
            const result = sample(point, camera, time);
            const displayed = displayColor(color(result), aces);
            expect(displayed.toArray().every(Number.isFinite)).toBe(true);
            expect(luma(displayed.toArray())).toBeGreaterThanOrEqual(0.12);
            minimum = Math.min(minimum, luma(displayed.toArray()));
            maximum = Math.max(maximum, luma(displayed.toArray()));
            values.push(luma(displayed.toArray()));
            count++;
          }
          if (values.length) maxSwing = Math.max(maxSwing, Math.max(...values) - Math.min(...values));
        }
      }
      process.stdout.write(JSON.stringify({ quality, count, minimum, maximum, maxSwing }) + "\n");
      // HR-SEA uses full sky radiance and brighter hemispheric scattering.
      // Bounds exclude the glitter corridor and retain both output transfers;
      // they must still catch black water, blowout and large fan-shaped swings.
      expect(minimum).toBeGreaterThanOrEqual(0.35);
      expect(maximum).toBeLessThanOrEqual(0.75);
      expect(maxSwing).toBeLessThanOrEqual(0.28);
      expect(count).toBeGreaterThan(10000);
    } finally { sea.dispose(); }
  });

  it.each(qualities)("breaks resolved %s glitter crests into short marks", quality => {
    const material = createWaterMaterial(quality, { surface: "sea", grade: gradeAt(0.95) });
    try {
      const { sample } = optics(material), camera = new Vector3(0, WATER_LEVEL + 1.7, 0);
      let longest = 0, peak = 0, gaps = 0;
      // The golden path is now continuous at low intensity. Individual bright
      // crests are the top 10% of the unit microfacet distribution; keep the old
      // 40 m length cap in resolved near water, before subpixel averaging.
      const threshold = 0.9;
      for (const angle of [-4, -2, 0, 2, 4]) for (const time of [0, 2, 4, 6, 8]) {
        let run = 0;
        for (let step = 50; step <= 1200; step++) {
          const value = sample(ray(material, step / 10, angle), camera, time).glitter as number;
          run = value > threshold ? run + 0.1 : 0;
          gaps += Number(value <= threshold);
          longest = Math.max(longest, run); peak = Math.max(peak, value);
        }
      }
      expect(peak).toBeGreaterThan(0.95);
      expect(gaps).toBeGreaterThan(1000);
      expect(longest).toBeLessThanOrEqual(40);
      process.stdout.write(JSON.stringify({ quality, threshold, longest, peak }) + "\n");
    } finally { material.dispose(); }
  });

  it.each(qualities)("keeps %s combined sea detail moving without repeated lanes or a single-scale tile", quality => {
    const material = createWaterMaterial(quality, { surface: "sea" });
    try {
      const { slopes } = optics(material);
      // Deliberately test each authored tile scale and the old 8 s surf period.
      // Individual Fourier modes are periodic by design; their world-space
      // combination must not repeat as visible rows/dashes at any one scale.
      const shifts = [...Array.from({ length: 151 }, (_, i) => 0.5 + i * 0.05), 19, 38];
      for (const origin of [-80, 100, 400]) for (const shift of shifts) {
        let energy = 0, acrossError = 0, alongError = 0, timeError = 0;
        for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
          const p = [origin + x * 0.71, origin + z * 0.93];
          const value = slopes(p, 0);
          const across = sub(value, slopes([p[0]! + shift, p[1]!], 0));
          const along = sub(value, slopes([p[0]!, p[1]! + shift], 0));
          const later = sub(value, slopes(p, 8));
          energy += dot(value, value); acrossError += dot(across, across);
          alongError += dot(along, along); timeError += dot(later, later);
        }
        expect(energy).toBeGreaterThan(0.01);
        // Low's long analytic swells vary slowly over 0.5 m, but even there
        // repeated lanes would give zero residual rather than >=5% RMS.
        expect(Math.sqrt(acrossError / energy)).toBeGreaterThan(0.05);
        expect(Math.sqrt(alongError / energy)).toBeGreaterThan(0.05);
        expect(Math.sqrt(timeError / energy)).toBeGreaterThan(0.1);
      }
      const river = material.fragmentShader.match(/#ifndef SEA_WATER\s+(\/\/ River-only detail:[\s\S]*?)#endif/)![0];
      expect(preprocess(river, material.defines).trim()).toBe("");
    } finally { material.dispose(); }
  });

  it("filters subpixel analytic swells on Low instead of leaving horizon rays", () => {
    const material = createWaterMaterial("Low", { surface: "sea" });
    try {
      const { slopes } = optics(material);
      let peak = 0;
      for (const height of [1.7, 9]) for (const resolution of [720, 1080, 2160]) {
        const pixelAngle = 2 * Math.tan(55 * Math.PI / 360) / resolution;
        for (const distance of [12, 40, 80, 160, 320, 640, 800]) {
          const footprint = distance * distance * pixelAngle / height;
          for (const time of [0, 2, 4, 6, 8]) {
            const p = [distance * 0.8, -distance * 0.6];
            const original = length(slopes(p, time));
            const filtered = length(slopes(p, time, footprint));
            peak = Math.max(peak, original);
            expect(filtered).toBeLessThanOrEqual(original + 1e-12);
            if (footprint >= 4) expect(filtered).toBe(0);
          }
        }
      }
      expect(peak).toBeGreaterThan(0.04);
    } finally { material.dispose(); }
  });

  it.each(qualities)("follows the %s sun azimuth continuously in the reflected sunset envelope", quality => {
    const material = createWaterMaterial(quality, { surface: "sea", grade: gradeAt(1) });
    try {
      const { sample } = optics(material), camera = new Vector3(0, WATER_LEVEL + 8, 0);
      const at = (angle: number) => color(sample(ray(material, 120, angle), camera, 0, 0, 0, true));
      const warm = at(40), cool = at(140);
      expect(warm.r / warm.b).toBeGreaterThan(cool.r / cool.b + 0.5);
      expect(luma(warm.toArray())).toBeGreaterThan(luma(cool.toArray()));
      let previous = warm;
      for (let angle = 41; angle <= 140; angle++) {
        const next = at(angle);
        expect(Math.abs(luma(next.toArray()) - luma(previous.toArray()))).toBeLessThan(0.005);
        previous = next;
      }
      const sun = (material.uniforms.uSunDirection!.value as Vector3).clone().applyAxisAngle(new Vector3(0, 1, 0), 0.6);
      const before = [40, 140].map(angle => sample(ray(material, 120, angle), camera, 0, 0, 0, true));
      material.setSunDirection(sun);
      for (const [index, angle] of [40, 140].entries()) {
        const after = sample(ray(material, 120, angle), camera, 0, 0, 0, true);
        // World-anchored long swells may modulate pigment after rotation. The
        // angular optics themselves must follow the sun exactly.
        for (const key of ["skyAlignment", "halfAlong", "halfAcross", "glitter", "reflection", "mist"]) {
          expect(after[key]).toBeCloseTo(before[index]![key] as number, 12);
        }
      }
    } finally { material.dispose(); }
  });

  it.each(qualities)("keeps %s dusk water readable and warmer than noon through the cycle", quality => {
    const material = createWaterMaterial(quality, { surface: "sea" });
    try {
      const { sample } = optics(material), camera = new Vector3(0, 1.7, -860);
      const points = [new Vector3(64, WATER_LEVEL, -908), new Vector3(40, WATER_LEVEL, -940),
        new Vector3(88, WATER_LEVEL, -876), new Vector3(64, WATER_LEVEL, -1100), new Vector3(64, WATER_LEVEL, -1400)];
      const samples = (t: number) => {
        material.setGrade(gradeAt(t));
        return Array.from({ length: 17 }, (_, frame) => points.map(point => color(sample(point, camera, frame / 2)))).flat();
      };
      const noon = samples(0.55), dusk = samples(0.93);
      for (const [i, value] of dusk.entries()) {
        expect(value.r / value.b).toBeGreaterThan(noon[i]!.r / noon[i]!.b);
        expect(luma(displayColor(value, true).toArray())).toBeGreaterThanOrEqual(0.06);
      }
    } finally { material.dispose(); }
  });

  it.each(qualities)("keeps %s downward gameplay water readable while preserving low-view sky radiance", quality => {
    const material = createWaterMaterial(quality, { surface: "sea", grade: gradeAt(1) });
    try {
      const { sample } = optics(material);
      for (const height of [8, 10, 12]) for (const distance of [40, 80, 120]) {
        const camera = new Vector3(0, WATER_LEVEL + height, 0);
        const warm = sample(ray(material, distance, 25), camera);
        const away = sample(ray(material, distance, 140), camera);
        for (const aces of [false, true]) {
          expect(luma(displayColor(color(warm), aces).toArray())).toBeGreaterThan(0.22);
          expect(color(warm).r / color(warm).b).toBeGreaterThan(color(away).r / color(away).b);
        }
      }
      for (const height of [0.6, 2, 8]) {
        const result = sample(ray(material, 1000000), new Vector3(0, WATER_LEVEL + height, 0));
        expect(vector(result.color!)).toEqual((material.uniforms.uSkyHorizon!.value as Color).toArray().map(v => expect.closeTo(v, 6)));
      }
    } finally { material.dispose(); }
  });
});
