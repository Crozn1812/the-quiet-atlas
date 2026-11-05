import type { Group, Vector3 } from "three";
import type { ZoneId } from "../../interaction/targets";
import type { WorldLocale } from "../copy";

/**
 * Lead contract for the eight zone set-pieces (batch 21, spec §2.1). Every zone module exports one
 * `ZoneSceneFactory`; the world places the group at the zone anchor (a point on the walking path), rotated
 * so local +Z points along the path direction (ZoneLayout.lookDirection) and local +X to its right.
 *
 * Local frame: metres, origin = zone anchor at path height, y up. The walking corridor is the local Z axis,
 * |x| <= PATH_CLEARANCE: nothing solid may stand there (a low paving/edge stone is fine).
 */
export const PATH_CLEARANCE = 2.6;

export interface ZoneSceneContext {
  /** Terrain height in the local frame (already relative to the anchor's path height), for grounding props. */
  heightAt(localX: number, localZ: number): number;
  /** True where the local point lies on the walking path (keep clear) — includes PATH_CLEARANCE. */
  onPath(localX: number, localZ: number): boolean;
  /** True where the local point is under water (river or sea); do not place solid props there. */
  underWater(localX: number, localZ: number): boolean;
  /** Deterministic per-zone seed. */
  seed: number;
}

export interface ZoneCollider {
  /** Local box centre (m), full size (m) and yaw (rad) about local Y. */
  center: Readonly<Vector3>;
  size: Readonly<Vector3>;
  yaw?: number;
}

export interface ZoneScene {
  zoneId: ZoneId;
  /** Everything visible, in the local frame; meshes merged per material (draw-call budget). */
  group: Group;
  /** The one object the player presses E at to open this zone's content overlay. */
  interactable: {
    /** Local position (m) of the object's centre; E range is 2.5 m from here. */
    position: Readonly<Vector3>;
    /** Accessible / hint names, e.g. "Workbench by the stream" / "Bàn thợ cạnh suối". No "(placeholder)". */
    label: Readonly<Record<WorldLocale, string>>;
  };
  /** Simple boxes for physics/camera; never inside the path corridor. */
  colliders: readonly ZoneCollider[];
  /** Optional ambient motion (turbine blades, lantern sway). Must be a no-op when reducedMotion is true. */
  update?(dt: number, reducedMotion: boolean): void;
  dispose(): void;
}

export type ZoneSceneFactory = (context: ZoneSceneContext) => ZoneScene;

/** Shared budgets, enforced by each zone's tests. */
export const ZONE_BUDGET = {
  triangles: 6000,
  drawCalls: 8,
  /** Furthest any object may stand from the anchor (m), so streaming tiles always contain the zone. */
  radius: 30,
} as const;
