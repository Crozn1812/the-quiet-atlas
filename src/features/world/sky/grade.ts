import { Color, Vector3 } from "three";
import { PALETTE } from "../art/palette";

/** Colors are in three.js linear working space; direction points toward the sun. */
export interface LightingGrade {
  sunColor: Color;
  sunIntensity: number;
  sunDirection: Vector3;
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
  fogColor: Color;
  skyTop: Color;
  skyHorizon: Color;
  shadowTint: Color;
}

export const GRADE_COLORS = [
  "sunColor", "hemiSky", "hemiGround", "fogColor", "skyTop", "skyHorizon", "shadowTint",
] as const satisfies readonly (keyof LightingGrade)[];

function tint(key: keyof typeof PALETTE, amount: number): Color {
  return new Color(PALETTE.paper).lerp(new Color(PALETTE[key]), amount);
}

// Dilute the warm pigment before covering a large horizon; orange stays a small accent.
const COAST_HORIZON = new Color(PALETTE.paper).lerp(
  new Color(PALETTE.dusk).lerp(new Color(PALETTE.flower), 0.4), 0.28,
);
const COAST_TOP = tint("indigo", 0.64).lerp(new Color(PALETTE.mist), 0.04);
const COAST_FOG = tint("mist", 0.18).lerp(COAST_HORIZON, 0.2);

/** Same smooth hill-to-coast window as fogAt; position only, with no stored state. */
export function coastAtmosphereWeight(pathT: number): number {
  const u = Number.isNaN(pathT) ? 0 : Math.max(0, Math.min(1, (pathT - 0.76) / (0.89 - 0.76)));
  return u * u * (3 - 2 * u);
}

/** Apply AFTER art-direction sky overrides, leaving light following and fog distances intact. */
export function applyCoastAtmosphere(grade: LightingGrade, pathT: number): LightingGrade {
  const weight = coastAtmosphereWeight(pathT);
  grade.skyTop.lerp(COAST_TOP, weight);
  grade.skyHorizon.lerp(COAST_HORIZON, weight);
  grade.fogColor.lerp(COAST_FOG, weight);
  return grade;
}

// Private snapshots: callers can freely mutate returned grades without changing keyframes.
const KEYFRAMES: readonly LightingGrade[] = [
  {
    // B2-031 (Art Director r2): less hemisphere fill so soft shade and dark trunks return.
    sunColor: tint("dusk", 0.24), sunIntensity: 2.3,
    sunDirection: new Vector3(-0.9, 0.2, 0.4).normalize(),
    // AD r3: 12% less ground bounce in linear space restores shade without changing hue.
    hemiSky: tint("mist", 0.25), hemiGround: tint("indigo", 0.28).multiplyScalar(0.88), hemiIntensity: 1.0,
    fogColor: tint("dusk", 0.1), skyTop: tint("mist", 0.32),
    skyHorizon: tint("dusk", 0.1), shadowTint: tint("indigo", 0.32),
  },
  {
    sunColor: tint("mist", 0.08), sunIntensity: 2.8,
    sunDirection: new Vector3(0, 0.94, 0.34).normalize(),
    hemiSky: tint("mist", 0.4), hemiGround: tint("indigo", 0.22).multiplyScalar(0.88), hemiIntensity: 2,
    fogColor: tint("mist", 0.12), skyTop: tint("mist", 0.55),
    skyHorizon: tint("mist", 0.12), shadowTint: tint("indigo", 0.26),
  },
  {
    sunColor: tint("dusk", 0.4), sunIntensity: 1.7,
    // Low over the sea (-Z), on the walking route's right (+X), with forward reach.
    sunDirection: new Vector3(0.8, 0.14, -0.6).normalize(),
    hemiSky: tint("mist", 0.24), hemiGround: tint("indigo", 0.32).multiplyScalar(0.88), hemiIntensity: 0.95,
    fogColor: COAST_FOG,
    skyTop: COAST_TOP,
    skyHorizon: COAST_HORIZON,
    shadowTint: tint("indigo", 0.36),
  },
];

/** Interpolate in place; also used by the temporal follower without allocating colors. */
export function blendGrade(out: LightingGrade, a: LightingGrade, b: LightingGrade, alpha: number): LightingGrade {
  if (alpha === 0 || alpha === 1) {
    const source = alpha === 0 ? a : b;
    for (const key of GRADE_COLORS) out[key].copy(source[key]);
    out.sunIntensity = source.sunIntensity;
    out.hemiIntensity = source.hemiIntensity;
    out.sunDirection.copy(source.sunDirection);
    return out;
  }
  for (const key of GRADE_COLORS) out[key].lerpColors(a[key], b[key], alpha);
  out.sunIntensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * alpha;
  out.hemiIntensity = a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * alpha;
  out.sunDirection.lerpVectors(a.sunDirection, b.sunDirection, alpha).normalize();
  return out;
}

export function cloneGrade(grade: LightingGrade): LightingGrade {
  return {
    ...grade, ...Object.fromEntries(GRADE_COLORS.map(key => [key, grade[key].clone()])),
    sunDirection: grade.sunDirection.clone(),
  };
}

/** Position-derived time of day, clamped to [0, 1]; NaN falls back to dawn. */
export function lightingAt(tod: number): LightingGrade {
  const t = Number.isNaN(tod) ? 0 : Math.max(0, Math.min(1, tod));
  const index = t < 0.5 ? 0 : 1;
  const a = KEYFRAMES[index]!;
  const b = KEYFRAMES[index + 1]!;
  const u = (t - index * 0.5) * 2;
  return blendGrade(cloneGrade(a), a, b, u * u * (3 - 2 * u));
}
