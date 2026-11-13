import { Color, Vector3 } from "three";
import { PALETTE } from "../art/palette";
import { forestAtmosphereWeight, paletteColor, WORLD_DIRECTION } from "../art/direction";

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

const SKY_TOP = new Color(PALETTE.skyHigh);
const SKY_HORIZON = new Color(PALETTE.skyLow);
const DAWN_TOP = new Color(paletteColor(WORLD_DIRECTION.background.sky.dawn.top));
const DAWN_HORIZON = new Color(paletteColor(WORLD_DIRECTION.background.sky.dawn.horizon));
const COAST_TOP = new Color(paletteColor(WORLD_DIRECTION.background.sky.dusk.top));
const COAST_HORIZON = new Color(paletteColor(WORLD_DIRECTION.background.sky.dusk.horizon));
const DAWN_FOG = new Color(paletteColor(WORLD_DIRECTION.background.forest!.color));
const COAST_FOG = COAST_TOP.clone().lerp(COAST_HORIZON, 0.55);

/** Same smooth hill-to-coast window as fogAt; position only, with no stored state. */
export function coastAtmosphereWeight(pathT: number): number {
  const u = Number.isNaN(pathT) ? 0 : Math.max(0, Math.min(1, (pathT - 0.76) / (0.89 - 0.76)));
  return u * u * (3 - 2 * u);
}

/** Position-only atmosphere: release dawn over the same 40 m as forest fog, then enter dusk. */
export function applyCoastAtmosphere(grade: LightingGrade, pathT: number): LightingGrade {
  const weight = coastAtmosphereWeight(pathT);
  const forest = forestAtmosphereWeight(pathT);
  if (weight > 0) grade.coastWeight = weight;
  else delete grade.coastWeight;
  grade.skyTop.copy(SKY_TOP).lerp(DAWN_TOP, forest).lerp(COAST_TOP, weight);
  grade.skyHorizon.copy(SKY_HORIZON).lerp(DAWN_HORIZON, forest).lerp(COAST_HORIZON, weight);
  grade.fogColor.copy(SKY_HORIZON).lerp(DAWN_FOG, forest).lerp(COAST_FOG, weight);
  return grade;
}

// Private snapshots: callers can freely mutate returned grades without changing keyframes.
const KEYFRAMES: readonly LightingGrade[] = [
  {
    // Shift dawn energy toward diffuse canopy fill: shaded props/path open up
    // while the two-plane illumination stays at the existing dawn reference.
    sunColor: new Color(PALETTE.cloud).lerp(new Color(PALETTE.sunGold), 0.6).lerp(new Color(PALETTE.flower), 0.03), sunIntensity: 0.78,
    // Five degrees, retaining the eastern azimuth behind the forest.
    sunDirection: new Vector3(-0.9, Math.hypot(0.9, 0.4) * Math.tan(5 * Math.PI / 180), 0.4).normalize(),
    hemiSky: SKY_HORIZON.clone().lerp(new Color(PALETTE.indigo), 0.05), hemiGround: new Color(PALETTE.grassDry).lerp(SKY_HORIZON, 0.25).multiplyScalar(0.88), hemiIntensity: 0.58,
    fogColor: DAWN_FOG.clone(), skyTop: DAWN_TOP.clone(),
    skyHorizon: DAWN_HORIZON.clone(), shadowTint: SKY_TOP.clone().lerp(new Color(PALETTE.indigo), 0.35),
  },
  {
    // Late morning stays brightest, with less overhead glare on flat ground.
    sunColor: new Color(PALETTE.cloud).lerp(new Color(PALETTE.sunGold), 0.08), sunIntensity: 2.2,
    sunDirection: new Vector3(0, Math.tan(35 * Math.PI / 180), 1).normalize(),
    hemiSky: SKY_HORIZON.clone().lerp(SKY_TOP, 0.15), hemiGround: new Color(PALETTE.grassDry).lerp(SKY_HORIZON, 0.3).multiplyScalar(0.88), hemiIntensity: 1.6,
    fogColor: SKY_HORIZON.clone(), skyTop: SKY_TOP.clone(),
    skyHorizon: SKY_HORIZON.clone(), shadowTint: SKY_TOP.clone().lerp(new Color(PALETTE.cloud), 0.26),
  },
  {
    sunColor: new Color(PALETTE.sunGold).lerp(new Color(PALETTE.flower), 0.3), sunIntensity: 1.7,
    // Low over the sea (-Z), on the walking route's right (+X), with forward reach.
    sunDirection: new Vector3(0.8, Math.tan(3.5 * Math.PI / 180), -0.6).normalize(),
    hemiSky: SKY_HORIZON.clone().lerp(new Color(PALETTE.indigo), 0.12), hemiGround: new Color(PALETTE.grassDry).lerp(new Color(PALETTE.indigo), 0.35).multiplyScalar(0.88), hemiIntensity: 0.57,
    fogColor: COAST_FOG.clone(),
    skyTop: COAST_TOP.clone(),
    skyHorizon: COAST_HORIZON.clone(),
    shadowTint: SKY_TOP.clone().lerp(new Color(PALETTE.indigo), 0.65),
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
  const alpha = u * u * (3 - 2 * u);
  const grade = blendGrade(cloneGrade(a), a, b, alpha);
  // Interpolate elevation separately: normalizing a chord between opposing azimuths
  // used to swing the sun overhead and cause a sharp ground-brightness change.
  const elevation = Math.asin(a.sunDirection.y) + (Math.asin(b.sunDirection.y) - Math.asin(a.sunDirection.y)) * alpha;
  const azimuth = Math.atan2(a.sunDirection.z, a.sunDirection.x);
  const turn = Math.atan2(b.sunDirection.z, b.sunDirection.x) - azimuth;
  const angle = azimuth + Math.atan2(Math.sin(turn), Math.cos(turn)) * alpha;
  grade.sunDirection.set(Math.cos(angle) * Math.cos(elevation), Math.sin(elevation), Math.sin(angle) * Math.cos(elevation));
  return grade;
}
