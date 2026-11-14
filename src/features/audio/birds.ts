/** Listener-relative source samples, in metres; no world runtime dependency. */
export interface BirdListener {
  readonly distance: number;
  readonly pan: number;
  readonly species: number;
  readonly evening: number;
  /** Camera-space metres, matching Web Audio's default forward direction (-Z). */
  readonly position?: readonly [number, number, number];
}

export function birdLevel(sample: BirdListener): number {
  if (![sample.distance, sample.pan, sample.evening].every(Number.isFinite)) return 0;
  const t = Math.max(0, Math.min(1, 1 - Math.max(0, sample.distance - 2) / 32));
  return t * t * (3 - 2 * t);
}

/** Original synthesized call contours: short whistles, warbling phrases, gull cries. */
export function birdPhrase(species: number, random: () => number) {
  const kind = ((Math.floor(species) % 3) + 3) % 3;
  const pitch = [2700, 1900, 850][kind]! * (0.92 + random() * 0.16);
  const duration = [0.28, 0.55, 0.7][kind]!;
  const contour = kind === 0 ? [1, 1.35, 0.92] : kind === 1 ? [1, 1.22, 0.97, 1.3, 0.94] : [1, 1.6, 1.25, 0.8];
  return { pitch, duration, contour };
}
