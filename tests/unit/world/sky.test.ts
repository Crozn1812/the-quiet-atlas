import { Color, PerspectiveCamera, Scene, Vector3, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { timeOfDayAt } from "../../../src/features/world/layout/lighting";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { fogAt, STYLE_PRESETS } from "../../../src/features/world/art/direction";
import { directGrade } from "../../../src/features/world/scene/compose";
import { applyCoastAtmosphere, cloneGrade, coastAtmosphereWeight, GRADE_COLORS, lightingAt } from "../../../src/features/world/sky/grade";
import { createGradeFollower } from "../../../src/features/world/sky/smoothing";
import { createCoastMountainMist, createSkyDome } from "../../../src/features/world/sky/dome";

// Execute the dome's actual GLSL arithmetic on the CPU; only vector syntax is adapted.
function sampleDome(dome: ReturnType<typeof createSkyDome>, direction: Vector3, skyHeight = direction.clone().normalize().y): Color {
  const { uniforms, fragmentShader } = dome.mesh.material;
  const body = fragmentShader.match(/vec3 skyColor\(vec3 direction\) \{([\s\S]*?)\n      \}/)![1]!
    .replace(/\b(?:float|vec3) (\w+) =/g, "let $1 =")
    .replace("return color + sunGlow * radiance;", "return color.map((v, i) => v + sunGlow[i] * radiance);");
  const mix = (a: number | number[], b: number | number[], t: number): number | number[] =>
    Array.isArray(a) ? a.map((v, i) => v + ((b as number[])[i]! - v) * t) : a + ((b as number) - a) * t;
  const smoothstep = (a: number, b: number, x: number) => {
    const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  const names = ["skyTop", "skyHorizon", "paper", "sunDirection", "sunGlow", "coastWeight"];
  const values = names.map(name => {
    const value = uniforms[name]!.value;
    return value instanceof Color ? value.toArray() : value;
  });
  const evaluate = new Function("direction", "skyHeight", ...names, "mix", "smoothstep", "max", "abs", "sqrt", "cos", "radians", "dot", "normalize", body);
  const rgb = evaluate(direction.clone().normalize(), skyHeight, ...values, mix, smoothstep, Math.max, Math.abs, Math.sqrt, Math.cos,
    (degrees: number) => degrees * Math.PI / 180, (a: Vector3, b: Vector3) => a.dot(b), (v: Vector3) => v.clone().normalize()) as number[];
  return new Color().setRGB(rgb[0]!, rgb[1]!, rgb[2]!);
}

function placedGrade(t: number) {
  const tod = timeOfDayAt(t);
  return applyCoastAtmosphere(directGrade(lightingAt(tod), tod), t);
}

function tint(key: keyof typeof PALETTE, amount: number) {
  return new Color(PALETTE.paper).lerp(new Color(PALETTE[key]), amount);
}

const coastHorizon = tint("dusk", 0.28).lerp(tint("flower", 0.28), 0.4).lerp(tint("vermilion", 0.28), 0.42);
const coastTop = tint("indigo", 0.64).lerp(tint("vermilion", 0.64), 0.06);
const coastFog = tint("mist", 0.18).lerp(coastHorizon, 0.2);

describe("position-driven sky grade", () => {
    // B2-031 Art Director r2: dawn sun 2 -> 2.3, hemisphere fill 1.5 -> 1.0 (dawn) and 1.4 -> 0.95 (dusk).
  it.each([
    { tod: 0, sun: 0.24, intensity: 2.3, direction: [-0.9, 0.2, 0.4], hemi: 0.25,
      ground: 0.28, ambient: 1.0, fog: tint("dusk", 0.1), top: tint("mist", 0.32), shadow: 0.32 },
    { tod: 0.5, sun: 0.08, intensity: 2.8, direction: [0, 0.94, 0.34], hemi: 0.4,
      ground: 0.22, ambient: 2, fog: tint("mist", 0.12), top: tint("mist", 0.55), shadow: 0.26 },
    // B2-155: sea-facing dusk replaces the inland sun and jade sky with diluted peach/indigo.
    { tod: 1, sun: 0.4, intensity: 1.7, direction: [0.8, 0.14, -0.6], hemi: 0.24,
      ground: 0.32, ambient: 0.95, fog: coastFog, top: coastTop, shadow: 0.36 },
  ])("matches the complete keyframe at $tod", spec => {
    const grade = lightingAt(spec.tod);
    const expected = {
      sunColor: tint(spec.tod === 0.5 ? "mist" : "dusk", spec.sun),
      // AD r3: preserve the palette hue, with 12% less linear ground bounce at every keyframe.
      hemiSky: tint("mist", spec.hemi), hemiGround: tint("indigo", spec.ground).multiplyScalar(0.88),
      fogColor: spec.fog, skyHorizon: spec.tod === 1 ? coastHorizon : spec.fog, skyTop: spec.top,
      shadowTint: tint("indigo", spec.shadow),
    };
    for (const key of GRADE_COLORS) {
      expect(grade[key].toArray()).toEqual(expected[key].toArray().map(v => expect.closeTo(v, 12)));
    }
    expect(grade.sunIntensity).toBe(spec.intensity);
    expect(grade.hemiIntensity).toBe(spec.ambient);
    expect(grade.sunDirection.distanceTo(new Vector3(...spec.direction).normalize())).toBeLessThan(1e-12);
  });

  it("uses smoothstep between the frames, with continuous muted colors throughout", () => {
    const dawn = lightingAt(0);
    const middle = lightingAt(0.5);
    const u = 0.2;
    const alpha = u * u * (3 - 2 * u);
    expect(lightingAt(0.1).skyTop.toArray()).toEqual(dawn.skyTop.clone().lerp(middle.skyTop, alpha).toArray());
    let previous = dawn;
    for (let i = 0; i <= 1000; i++) {
      const grade = lightingAt(i / 1000);
      for (const key of GRADE_COLORS) {
        const components = grade[key].toArray();
        const max = Math.max(...components);
        expect((max - Math.min(...components)) / max).toBeLessThanOrEqual(0.85);
        // Also check displayed sRGB, rather than only the linear working values.
        const srgb = grade[key].clone().convertLinearToSRGB().toArray();
        expect((Math.max(...srgb) - Math.min(...srgb)) / Math.max(...srgb)).toBeLessThanOrEqual(0.85);
        const delta = components.map((v, j) => v - previous[key].toArray()[j]!);
        expect(Math.hypot(...delta)).toBeLessThan(0.01);
      }
      expect(grade.sunDirection.length()).toBeCloseTo(1, 12);
      previous = grade;
    }
    expect(dawn.sunDirection.y).toBeLessThan(middle.sunDirection.y);
    expect(lightingAt(1).sunDirection.y).toBeLessThan(middle.sunDirection.y);
  });

  it("clamps position time and returns independent mutable colors and directions", () => {
    expect(lightingAt(-1)).toEqual(lightingAt(0));
    expect(lightingAt(Infinity)).toEqual(lightingAt(1));
    expect(lightingAt(NaN)).toEqual(lightingAt(0));
    const grade = lightingAt(timeOfDayAt(0.2));
    grade.skyTop.set(0);
    grade.sunDirection.set(0, 0, 0);
    expect(lightingAt(0).skyTop).toEqual(tint("mist", 0.32));
    expect(lightingAt(0).sunDirection.length()).toBeCloseTo(1);
    expect(lightingAt(timeOfDayAt(0.9))).toEqual(lightingAt(1));
  });
});

describe("coast dusk atmosphere", () => {
  it("keeps the sun low, seaward, on the walking route's right and ahead across the coast", () => {
    for (let i = 0; i <= 100; i++) {
      const t = 0.82 + 0.18 * i / 100;
      const { sunDirection } = lightingAt(timeOfDayAt(t));
      const forward = pathPointAt(Math.min(1, t + 0.001)).sub(pathPointAt(t - 0.001)).normalize();
      const right = forward.clone().cross(new Vector3(0, 1, 0));
      expect(sunDirection.z).toBeLessThan(0);
      expect(sunDirection.dot(right)).toBeGreaterThan(0);
      expect(sunDirection.dot(forward)).toBeGreaterThan(0);
      const elevation = Math.asin(sunDirection.y) * 180 / Math.PI;
      expect(elevation).toBeGreaterThan(0);
      expect(elevation).toBeLessThanOrEqual(12);
    }
  });

  it("dilutes a peach-pink horizon and retains pale blue-violet overhead and 400 m fog", () => {
    const grade = lightingAt(1);
    expect(grade.skyHorizon.toArray()).toEqual(coastHorizon.toArray().map(v => expect.closeTo(v, 12)));
    expect(grade.skyHorizon.r - grade.skyHorizon.g).toBeGreaterThan(grade.skyHorizon.g - grade.skyHorizon.b);
    expect(grade.skyTop.b).toBeGreaterThan(grade.skyTop.r);
    for (const color of [grade.skyHorizon, grade.skyTop]) {
      const srgb = color.clone().convertLinearToSRGB().toArray();
      expect(Math.min(...srgb)).toBeGreaterThan(0.6);
      expect(Math.max(...srgb) - Math.min(...srgb)).toBeLessThan(0.2);
    }
    for (const zone of ZONES.filter(zone => zone.biome === "coast-dusk")) {
      expect(fogAt(zone.t, STYLE_PRESETS.C)).toEqual({ near: 100, far: 400 });
    }
  });

  it("restores coast colors after direction overrides and blends smoothly from the hill in either direction", () => {
    const hill = directGrade(lightingAt(timeOfDayAt(0.76)), timeOfDayAt(0.76));
    expect(applyCoastAtmosphere(cloneGrade(hill), 0.76)).toEqual(hill);
    const sample = (t: number) => {
      const tod = timeOfDayAt(t);
      return applyCoastAtmosphere(directGrade(lightingAt(tod), tod), t);
    };
    let previous = sample(0.76);
    for (let i = 1; i <= 100; i++) {
      const t = 0.76 + (0.89 - 0.76) * i / 100;
      const grade = sample(t);
      for (const key of GRADE_COLORS) {
        expect(Math.hypot(...grade[key].toArray().map((v, j) => v - previous[key].toArray()[j]!))).toBeLessThan(0.01);
      }
      expect(sample(t)).toEqual(grade);
      previous = grade;
    }
    const end = sample(0.89);
    expect(end.skyHorizon.toArray()).toEqual(coastHorizon.toArray().map(v => expect.closeTo(v, 12)));
    expect(end.skyTop.toArray()).toEqual(coastTop.toArray().map(v => expect.closeTo(v, 12)));
    expect(end.fogColor.toArray()).toEqual(coastFog.toArray().map(v => expect.closeTo(v, 12)));
    expect(coastAtmosphereWeight((0.76 + 0.89) / 2)).toBeCloseTo(0.5);
    expect(coastAtmosphereWeight(NaN)).toBe(0);
    expect(coastAtmosphereWeight(-Infinity)).toBe(0);
    expect(coastAtmosphereWeight(Infinity)).toBe(1);
    expect(sample(0.76)).toEqual(hill);
  });
});

describe("coast mountain mist without a GPU", () => {
  it("uses one inland plane and one transparent pass, fades with the biome and releases resources once", () => {
    const mist = createCoastMountainMist();
    const { mesh } = mist;
    const material = mesh.material;
    const scene = new Scene();
    scene.add(mesh);
    expect(mesh.visible).toBe(false);
    expect(mesh.children).toHaveLength(0);
    expect(mesh.geometry.getAttribute("position").count).toBe(4);
    expect(mesh.geometry.index!.count).toBe(6);
    expect(material.transparent).toBe(true);
    expect(material.forceSinglePass).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.depthTest).toBe(true);
    const anchor = new Vector3(12, 4, -850);
    const grade = lightingAt(1);
    const color = material.uniforms.mistColor!.value;
    mist.update(0.76, anchor, grade);
    expect(mesh.visible).toBe(false);
    mist.update((0.76 + 0.89) / 2, anchor, grade);
    expect(material.uniforms.strength!.value).toBeCloseTo(0.21);
    mist.update(0.89, anchor, grade);
    expect(mesh.visible).toBe(true);
    expect(material.uniforms.strength!.value).toBe(0.42);
    expect(material.uniforms.mistColor!.value).toBe(color);
    expect(color).toEqual(tint("mist", 0.24).lerp(grade.fogColor, 0.2));
    expect(mesh.position).toEqual(anchor);
    mesh.updateMatrixWorld(true);
    const positions = mesh.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const point = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      expect(point.z).toBeGreaterThan(anchor.z); // No shelf over the -Z sea.
      expect(point.y).toBeGreaterThanOrEqual(anchor.y);
    }
    mist.update(0.76, anchor, grade);
    expect(mesh.visible).toBe(false);
    expect(material.uniforms.strength!.value).toBe(0);
    const disposeGeometry = vi.spyOn(mesh.geometry, "dispose");
    const disposeMaterial = vi.spyOn(material, "dispose");
    mist.dispose();
    mist.dispose();
    mist.update(1, anchor, grade);
    expect(mesh.parent).toBeNull();
    expect(mesh.visible).toBe(false);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
  });
});

describe("grade follower", () => {
  it("copies the position mask without sharing state and clears it when snapping back to forest", () => {
    const coast = placedGrade(0.9);
    const follower = createGradeFollower(2);
    const copy = cloneGrade(coast);
    coast.coastWeight = 0.5;
    expect(copy.coastWeight).toBe(1);
    expect(follower.snap(copy).coastWeight).toBe(1);
    expect(follower.update(placedGrade(0.3), 0.1).coastWeight).toBeCloseTo(Math.exp(-0.2), 12);
    expect(follower.snap(placedGrade(0.3))).toEqual(placedGrade(0.3));
  });

  it("follows exponentially, converges after reversal, and snaps on teleport", () => {
    const follower = createGradeFollower(3);
    const dawn = lightingAt(0);
    const dusk = lightingAt(1);
    expect(follower.update(dusk, 0)).toEqual(dawn);
    const first = follower.update(dusk, 0.1);
    expect(first.sunIntensity).toBeCloseTo(2.3 + (1.7 - 2.3) * (1 - Math.exp(-0.3)), 12);
    expect(first.sunDirection.length()).toBeCloseTo(1);
    for (let i = 0; i < 120; i++) follower.update(dusk, 1 / 30);
    expect(follower.update(dusk, 0).skyTop.r).toBeCloseTo(dusk.skyTop.r, 5);
    for (let i = 0; i < 120; i++) follower.update(dawn, 1 / 30);
    const result = follower.update(dawn, 0);
    for (const key of GRADE_COLORS) {
      expect(result[key].toArray()).toEqual(dawn[key].toArray().map(v => expect.closeTo(v, 5)));
    }
    expect(result.sunDirection.distanceTo(dawn.sunDirection)).toBeLessThan(0.0001);
    expect(follower.snap(dusk)).toEqual(dusk);
    dusk.skyTop.set(0);
    expect(follower.update(lightingAt(0), 0).skyTop).toEqual(lightingAt(1).skyTop);
  });

  it("has frame-independent exponential response and validates inputs", () => {
    const a = createGradeFollower(2);
    const b = createGradeFollower(2);
    const target = lightingAt(1);
    const oneStep = a.update(target, 1);
    for (let i = 0; i < 60; i++) b.update(target, 1 / 60);
    const manySteps = b.update(target, 0);
    for (const key of GRADE_COLORS) {
      expect(manySteps[key].toArray()).toEqual(oneStep[key].toArray().map(v => expect.closeTo(v, 12)));
    }
    expect(manySteps.sunIntensity).toBeCloseTo(oneStep.sunIntensity, 12);
    expect(manySteps.hemiIntensity).toBeCloseTo(oneStep.hemiIntensity, 12);
    expect(manySteps.sunDirection.distanceTo(oneStep.sunDirection)).toBeLessThan(1e-12);
    for (const rate of [0, -1, NaN, Infinity]) expect(() => createGradeFollower(rate)).toThrow(RangeError);
    for (const dt of [-1, NaN, Infinity]) expect(() => a.update(target, dt)).toThrow(RangeError);
  });
});

describe("sky dome without a GPU", () => {
  it("warms and brightens the sea-facing sky at 3 degrees, with a small disc and broad horizon halo", () => {
    const grade = placedGrade(0.9);
    const dome = createSkyDome(grade);
    try {
      const elevation = 3 * Math.PI / 180;
      const toward = new Vector3(grade.sunDirection.x, 0, grade.sunDirection.z).normalize().multiplyScalar(Math.cos(elevation));
      toward.y = Math.sin(elevation);
      const away = new Vector3(-toward.x, toward.y, -toward.z);
      const warm = sampleDome(dome, toward);
      const cool = sampleDome(dome, away);
      const luma = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      expect(luma(warm) - luma(cool)).toBeGreaterThanOrEqual(0.08);
      expect(Number((luma(warm) - luma(cool)).toFixed(6))).toMatchInlineSnapshot(`0.190087`);
      expect(warm.r - warm.b).toBeGreaterThan(cool.r - cool.b);
      const azimuth = new Vector3(0, 1, 0).cross(grade.sunDirection).normalize();
      const atAngle = (degrees: number) => sampleDome(dome, grade.sunDirection.clone().applyAxisAngle(azimuth, degrees * Math.PI / 180));
      expect(luma(atAngle(0)) - luma(atAngle(1.2))).toBeGreaterThan(0.3);
      // A 20-degree sideways sample still catches the halo; at 35 degrees it is gone.
      const haloAt = (degrees: number) => {
        const ray = toward.clone().applyAxisAngle(new Vector3(0, 1, 0), degrees * Math.PI / 180);
        const lit = sampleDome(dome, ray);
        // Preserve the coast gradient while disabling radiance for the reference.
        const glow = dome.mesh.material.uniforms.sunGlow!.value as Color;
        const saved = glow.clone();
        glow.setRGB(0, 0, 0);
        dome.update(grade);
        const unlit = sampleDome(dome, ray);
        glow.copy(saved);
        return luma(lit) - luma(unlit);
      };
      expect(haloAt(20)).toBeGreaterThan(0.01);
      expect(haloAt(35)).toBeCloseTo(0, 12);
      expect(grade.skyHorizon.r - grade.skyTop.r).toBeGreaterThan(0.25);
      expect(grade.skyTop.b).toBeGreaterThan(grade.skyTop.r);
    } finally { dome.dispose(); }
  });

  it("follows a changed graded sun direction and fades the glow to zero outside the coast", () => {
    const grade = placedGrade(0.9);
    const dome = createSkyDome(grade);
    try {
      const ray = grade.sunDirection.clone();
      const before = sampleDome(dome, ray);
      grade.sunDirection.set(-ray.x, ray.y, -ray.z);
      dome.update(grade);
      expect(dome.mesh.material.uniforms.sunDirection!.value).toEqual(grade.sunDirection);
      expect(before.r - sampleDome(dome, ray).r).toBeGreaterThan(0.5);
      dome.update(placedGrade(0.3));
      expect(dome.mesh.material.uniforms.coastWeight!.value).toBe(0);
      expect(sampleDome(dome, ray)).toEqual(sampleDome(dome, new Vector3(-ray.x, ray.y, -ray.z)));
    } finally { dome.dispose(); }
  });

  it("preserves the forest's numeric grade and original sky shader at t=0.3", () => {
    const tod = timeOfDayAt(0.3);
    const grade = applyCoastAtmosphere(directGrade(lightingAt(tod), tod, STYLE_PRESETS.C), 0.3);
    const dome = createSkyDome(grade);
    try {
      const ray = new Vector3(1, Math.tan(3 * Math.PI / 180), 0).normalize();
      expect({
        colors: GRADE_COLORS.map(key => grade[key].toArray()),
        sun: grade.sunDirection.toArray(),
        sky: sampleDome(dome, ray).toArray(),
        fog: fogAt(0.3, STYLE_PRESETS.C),
      }).toMatchInlineSnapshot(`
        {
          "colors": [
            [
              0.8318432930369228,
              0.7277019708857474,
              0.5517448703055415,
            ],
            [
              0.7380892535353787,
              0.7484360034149434,
              0.6337833004173528,
            ],
            [
              0.5473738707950861,
              0.5281501439615677,
              0.47228302818886064,
            ],
            [
              0.8467818740603212,
              0.8057091309989111,
              0.712192091821843,
            ],
            [
              0.7234460618820735,
              0.7368300929057278,
              0.658758744627183,
            ],
            [
              0.8464259715192859,
              0.8056552464209855,
              0.7132977088753779,
            ],
            [
              0.5884883529722503,
              0.5704129285373672,
              0.5150989374678748,
            ],
          ],
          "fog": {
            "far": 260,
            "near": 40,
          },
          "sky": [
            0.8454385839871801,
            0.8049777482921014,
            0.7117736223958504,
          ],
          "sun": [
            -0.8849679658538999,
            0.2294686059411989,
            0.4051862020106478,
          ],
        }
      `);
      const smoothstep = (a: number, b: number, x: number) => {
        const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return u * u * (3 - 2 * u);
      };
      const original = grade.skyHorizon.clone().lerp(grade.skyTop, smoothstep(0, 0.85, ray.y))
        .lerp(new Color(PALETTE.paper), 0.06 * (1 - smoothstep(0, 0.12, ray.y)));
      expect(sampleDome(dome, ray).toArray()).toEqual(original.toArray());
      // Interior triangle samples use interpolated vertex height, not normalized ray height.
      const interpolatedHeight = ray.y * 0.97;
      const originalInterior = grade.skyHorizon.clone().lerp(grade.skyTop, smoothstep(0, 0.85, interpolatedHeight))
        .lerp(new Color(PALETTE.paper), 0.06 * (1 - smoothstep(0, 0.12, interpolatedHeight)));
      expect(sampleDome(dome, ray, interpolatedHeight).toArray()).toEqual(originalInterior.toArray());
    } finally { dome.dispose(); }
  });

  it("uses one cheap texture-free mesh, updates uniforms, follows the camera, and disposes once", () => {
    const dome = createSkyDome();
    const { mesh } = dome;
    const scene = new Scene();
    scene.add(mesh);
    const material = mesh.material;
    expect(mesh.children).toHaveLength(0);
    expect(mesh.geometry.getAttribute("position").count).toBeLessThan(400);
    expect(material.depthWrite).toBe(false);
    expect(material.depthTest).toBe(false);
    expect(material.fragmentShader).toContain("paperBand");
    expect(material.fragmentShader).toContain("#include <colorspace_fragment>");
    expect(material.uniforms.sunDirection!.value).toBeInstanceOf(Vector3);
    expect(material.uniforms.coastWeight!.value).toBe(0);
    const top = material.uniforms.skyTop!.value;
    const grade = lightingAt(1);
    dome.update(grade);
    expect(material.uniforms.skyTop!.value).toBe(top);
    expect(top).toEqual(grade.skyTop);
    expect(material.uniforms.skyHorizon!.value).toEqual(grade.skyHorizon);
    grade.skyTop.set(0);
    expect(top).toEqual(lightingAt(1).skyTop);
    const camera = new PerspectiveCamera();
    camera.position.set(90, 5, -40);
    camera.rotation.y = 1;
    camera.updateMatrixWorld();
    mesh.onBeforeRender({} as WebGLRenderer, scene, camera, mesh.geometry, material, null!);
    expect(new Vector3().setFromMatrixPosition(mesh.matrixWorld)).toEqual(camera.position);
    expect(new Vector3().setFromMatrixColumn(mesh.matrixWorld, 1)).toEqual(new Vector3(0, 1, 0));
    const geometryDispose = vi.spyOn(mesh.geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    dome.dispose();
    dome.dispose();
    expect(mesh.parent).toBeNull();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });
});
