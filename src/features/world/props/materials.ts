import { Color, type MeshToonMaterial } from "three";
import { WORLD_DIRECTION } from "../art/direction";
import { PALETTE } from "../art/palette";
import { createRampMaterial } from "../materials/ramp";

export type PropMaterialKind = "wood" | "paper";

/** Warm diluted ink: ink -> dusk (38%) -> paper (12%), blended in linear space. */
export function createPropMaterial(kind: PropMaterialKind): MeshToonMaterial {
  const color = kind === "paper" ? new Color(PALETTE.paper)
    : new Color(PALETTE.ink).lerp(new Color(PALETTE.dusk), 0.38).lerp(new Color(PALETTE.paper), 0.12);
  const material = createRampMaterial(color.getHex(), WORLD_DIRECTION.foliage.ramp);
  material.vertexColors = true;
  return material;
}
