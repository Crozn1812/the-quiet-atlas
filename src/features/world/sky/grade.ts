import { Color, Vector3 } from "three";
import { PALETTE } from "../art/palette";

/** Colors are in three.js linear working space; direction points toward the sun. */
export interface LightingGrade {
  /** Position-only coast mask; absent on unplaced time-of-day grades. */
  coastWeight?: number;
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

const SKY_TOP = new Color(PALETTE.skyHigh);
const SKY_HORIZON = new Color(PALETTE.skyLow);
const COAST_HORIZON = SKY_HORIZON.clone().lerp(new Color(PALETTE.sunGold), 0.55);
const COAST_FOG = tint("mist", 0.18).lerp(COAST_HORIZON, 0.2);

/** Same smooth hill-to-coast window as fogAt; position only, with no stored state. */
export function coastAtmosphereWeight(pathT: number): number {
  const u = Number.isNaN(pathT) ? 0 : Math.max(0, Math.min(1, (pathT - 0.76) / (0.89 - 0.76)));
  return u * u * (3 - 2 * u);
}

/** Restore direction A AFTER legacy sky overrides; preserve light following and fog distances. */
export function applyCoastAtmosphere(grade: LightingGrade, pathT: number): LightingGrade {
  const weight = coastAtmosphereWeight(pathT);
  if (weight > 0) grade.coastWeight = weight;
  else delete grade.coastWeight;
  grade.skyTop.copy(SKY_TOP);
  grade.skyHorizon.copy(SKY_HORIZON).lerp(COAST_HORIZON, weight);
  grade.fogColor.lerp(COAST_FOG, weight);
  return grade;
}

// Private snapshots: callers can freely mutate returned grades without changing keyframes.
const KEYFRAMES: readonly LightingGrade[] = [
  {
    sunColor: new Color(PALETTE.cloud).lerp(new Color(PALETTE.sunGold), 0.24), sunIntensity: 2.3,
    sunDirection: new Vector3(-0.9, 0.2, 0.4).normalize(),
    hemiSky: SKY_HORIZON.clone(), hemiGround: new Color(PALETTE.grassDry).lerp(SKY_HORIZON, 0.25).multiplyScalar(0.88), hemiIntensity: 1.0,
    fogColor: SKY_HORIZON.clone(), skyTop: SKY_TOP.clone(),
    skyHorizon: SKY_HORIZON.clone(), shadowTint: SKY_TOP.clone().lerp(new Color(PALETTE.cloud), 0.2),
  },
  {
    sunColor: new Color(PALETTE.cloud).lerp(new Color(PALETTE.sunGold), 0.08), sunIntensity: 2.8,
    sunDirection: new Vector3(0, 0.94, 0.34).normalize(),
    hemiSky: SKY_HORIZON.clone().lerp(SKY_TOP, 0.15), hemiGround: new Color(PALETTE.grassDry).lerp(SKY_HORIZON, 0.3).multiplyScalar(0.88), hemiIntensity: 2,
    fogColor: SKY_HORIZON.clone(), skyTop: SKY_TOP.clone(),
    skyHorizon: SKY_HORIZON.clone(), shadowTint: SKY_TOP.clone().lerp(new Color(PALETTE.cloud), 0.26),
  },
  {
    sunColor: new Color(PALETTE.cloud).lerp(new Color(PALETTE.sunGold), 0.4), sunIntensity: 1.7,
    // Low over the sea (-Z), on the walking route's right (+X), with forward reach.
    sunDirection: new Vector3(0.8, 0.14, -0.6).normalize(),
    hemiSky: SKY_HORIZON.clone(), hemiGround: new Color(PALETTE.grassDry).lerp(SKY_HORIZON, 0.2).multiplyScalar(0.88), hemiIntensity: 0.95,
    fogColor: COAST_FOG,
    skyTop: SKY_TOP.clone(),
    skyHorizon: COAST_HORIZON,
    shadowTint: SKY_TOP.clone().lerp(new Color(PALETTE.cloud), 0.16),
  },
];

/** Interpolate in place; also used by the temporal follower without allocating colors. */
export function blendGrade(out: LightingGrade, a: LightingGrade, b: LightingGrade, alpha: number): LightingGrade {
  if (alpha === 0 || alpha === 1) {
    const source = alpha === 0 ? a : b;
    if (source.coastWeight === undefined) delete out.coastWeight;
    else out.coastWeight = source.coastWeight;
    for (const key of GRADE_COLORS) out[key].copy(source[key]);
    out.sunIntensity = source.sunIntensity;
    out.hemiIntensity = source.hemiIntensity;
    out.sunDirection.copy(source.sunDirection);
    return out;
  }
  if (a.coastWeight !== undefined || b.coastWeight !== undefined) {
    out.coastWeight = (a.coastWeight ?? 0) + ((b.coastWeight ?? 0) - (a.coastWeight ?? 0)) * alpha;
  } else delete out.coastWeight;
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
