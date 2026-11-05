import { Box3, BoxGeometry, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from "three";
import { ZONE_IDS, type ZoneId } from "../../interaction/targets";
import { ZONES } from "../layout/zones";
import { PATH_WIDTH, TERRAIN_SEED, waterLevelAt } from "../terrain/height";
import { nearestPath } from "../terrain/samples";
import { PATH_CLEARANCE, type ZoneSceneFactory } from "./types";
import { createFirstLightScene } from "./first-light";
import { createRootsScene } from "./roots";
import { createWorkshopScene } from "./workshop";
import { createMilestonesScene } from "./milestones";
import { createOldTrailScene } from "./old-trail";
import { createHorizonScene } from "./horizon";
import { createQuietShoreScene } from "./quiet-shore";
import { createLastPostcardScene } from "./last-postcard";

export const ZONE_FACTORIES: Readonly<Record<ZoneId, ZoneSceneFactory>> = {
  "first-light": createFirstLightScene,
  roots: createRootsScene,
  workshop: createWorkshopScene,
  milestones: createMilestonesScene,
  "old-trail": createOldTrailScene,
  horizon: createHorizonScene,
  "quiet-shore": createQuietShoreScene,
  "last-postcard": createLastPostcardScene,
};

/** One transform for terrain queries, interaction, fixed boxes and foliage exclusion. */
export function placeZoneScenes(height: (x: number, z: number) => number) {
  const placed: ReturnType<typeof place>[] = [];
  function place(layout: typeof ZONES[number], side = 1) {
    const yaw = Math.atan2(layout.lookDirection.x, layout.lookDirection.z);
    const anchor = new Vector3(layout.position.x, height(layout.position.x, layout.position.z), layout.position.z);
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    const transform = new Matrix4().compose(anchor, rotation, new Vector3(side, 1, 1));
    const worldPoint = (x: number, z: number) => new Vector3(x, 0, z).applyMatrix4(transform);
    const zone = ZONE_FACTORIES[layout.id]({
      heightAt(x, z) { const p = worldPoint(x, z); return height(p.x, p.z) - anchor.y; },
      onPath(x, z) { const p = worldPoint(x, z); return Math.abs(x) <= PATH_CLEARANCE || nearestPath(p.x, p.z).distance <= PATH_WIDTH / 2; },
      underWater(x, z) { const p = worldPoint(x, z); return height(p.x, p.z) <= waterLevelAt(p.z); },
      seed: TERRAIN_SEED + ZONE_IDS.indexOf(layout.id),
    });
    zone.group.position.copy(anchor);
    zone.group.quaternion.copy(rotation);
    zone.group.scale.x = side;
    zone.group.updateMatrixWorld(true);
    const boxes = zone.colliders.map(collider => {
      const mesh = new Mesh(new BoxGeometry(collider.size.x, collider.size.y, collider.size.z), new MeshBasicMaterial());
      mesh.position.copy(collider.center).applyMatrix4(transform);
      mesh.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), yaw + side * (collider.yaw ?? 0));
      mesh.updateMatrixWorld(true);
      return mesh;
    });
    return {
      ...zone, layout, boxes,
      target: { id: `content-${zone.zoneId}`, kind: "content" as const, zoneId: zone.zoneId,
        position: new Vector3().copy(zone.interactable.position).applyMatrix4(transform), label: zone.interactable.label, root: zone.group },
      dispose() {
        zone.dispose();
        zone.group.removeFromParent();
        for (const box of boxes) { box.geometry.dispose(); box.material.dispose(); }
      },
    };
  }
  try {
    for (const layout of ZONES) {
      try { placed.push(place(layout)); }
      catch (error) {
        if (!(error instanceof RangeError)) throw error;
        // Some authored scenes only offer +X sites. Try the other bank without changing the
        // anchor or forward (+Z) direction; terrain queries and boxes use the same reflection.
        placed.push(place(layout, -1));
      }
    }
  }
  catch (error) { placed.forEach(zone => zone.dispose()); throw error; }
  return placed;
}

/** Re-entry requires leaving the outer hysteresis ring. Cinematics leave membership untouched. */
export function createZoneEntryTracker() {
  const inside = new Set<ZoneId>();
  return (position: { x: number; z: number }, enabled: boolean): ZoneId[] => {
    if (!enabled) return [];
    const entered: ZoneId[] = [];
    for (const zone of ZONES) {
      const distance = Math.hypot(position.x - zone.position.x, position.z - zone.position.z);
      if (inside.has(zone.id)) { if (distance > zone.radius + 4) inside.delete(zone.id); }
      else if (distance <= zone.radius) { inside.add(zone.id); entered.push(zone.id); }
    }
    return entered;
  };
}

export const zoneFoliageBounds = (zones: ReturnType<typeof placeZoneScenes>) => zones.flatMap(zone =>
  zone.boxes.map(box => new Box3().setFromObject(box).expandByScalar(1)));
