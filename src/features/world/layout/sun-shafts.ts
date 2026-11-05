/** Path progress of the forest sun shafts. Lives in layout so foliage scatter and the
 * First Light zone can both read it without an import cycle (scatter → zone → ground → scatter). */
export const FOREST_SUN_SHAFT_PROGRESS = Object.freeze([0.065, 0.105, 0.29]);
