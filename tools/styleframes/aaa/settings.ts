import { Color, Vector3 } from 'three';
import { PALETTE } from '../../../src/features/world/art/palette';

export type Variant = 'A' | 'B' | 'C';
export type Quality = 'Low' | 'High';
export const SCENES = ['first-light', 'horizon', 'last-postcard'] as const;
export type SceneId = typeof SCENES[number];
export interface Selection { scene: SceneId; variant: Variant; quality: Quality }
export const INITIAL: Selection = { scene: 'first-light', variant: 'A', quality: 'High' };
export const mix = (a: keyof typeof PALETTE, b: keyof typeof PALETTE, weight: number) => new Color(PALETTE[a]).lerp(new Color(PALETTE[b]), weight);
export const SETTINGS = {
  'first-light': { camera: [17, 7, 29], target: [0, 4, -26], sun: [-36, 19, -52], sky: mix('skyLow', 'mist', 0.38), horizon: mix('mist', 'sunGold', 0.22), light: mix('cloud', 'sunGold', 0.65), exposure: 1.04, sunPower: 2.6, fog: 0.0045, focus: 42 },
  horizon: { camera: [23, 13, 31], target: [-7, 2, -55], sun: [-46, 56, -48], sky: mix('skyHigh', 'skyLow', 0.35), horizon: mix('skyLow', 'cloud', 0.3), light: mix('cloud', 'sunGold', 0.14), exposure: 1.0, sunPower: 3.0, fog: 0.0023, focus: 53 },
  'last-postcard': { camera: [20, 8.5, 29], target: [-7, 2, -65], sun: [-58, 12, -100], sky: mix('skyHigh', 'indigo', 0.62), horizon: mix('sunGold', 'flower', 0.2), light: mix('sunGold', 'flower', 0.22), exposure: 1.05, sunPower: 3.1, fog: 0.003, focus: 48 },
} satisfies Record<SceneId, object>;
export const vector = (xyz: number[]) => new Vector3(xyz[0], xyz[1], xyz[2]);
// Integer noise supplies nested, repeatable placement; no runtime Math.random.
export function seeded(seed: number) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
