import { Color } from "three";
import { PALETTE } from "../art/palette";

/** Draw-scoped settings, carried by sampled frames; no clock or renderer state. */
export interface CinematicPresentation {
  kind: "intro" | "ending";
  strength: number;
  /** Axial distance to the shot's look-at subject, in world metres. */
  focus: number;
}

export function cinematicLook(kind: CinematicPresentation["kind"]) {
  const dawn = kind === "intro";
  return {
    shadowTint: new Color(PALETTE.indigo).lerp(new Color(dawn ? PALETTE.mist : PALETTE.skyLow), dawn ? 0.65 : 0.45),
    highlightTint: new Color(PALETTE.cloud).lerp(new Color(PALETTE.sunGold), dawn ? 0.18 : 0.28),
    sunTint: new Color(PALETTE.cloud).lerp(new Color(PALETTE.sunGold), dawn ? 0.55 : 0.8),
    sunGain: dawn ? 1.04 : 0.96,
    fillGain: dawn ? 1.1 : 1.06,
    saturation: dawn ? 0.92 : 0.9,
    aperture: dawn ? 0.000018 : 0.000022,
    maxblur: dawn ? 0.0025 : 0.003,
  };
}
