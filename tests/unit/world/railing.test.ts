import { InstancedMesh, Matrix4, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { createCoastRailing, createRailingLayout, RAIL_DEPTH } from "../../../src/features/world/road/railing";
import { roadFrameAt } from "../../../src/features/world/road/layout";
import { ZONES } from "../../../src/features/world/layout/zones";
import { SECRETS } from "../../../src/features/story/secrets";
import { waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";

describe("RD-01 coastal railing", () => {
  it("covers the whole end shoulder with continuous thin colliders, leaving access gaps along the sea side", () => {
    const rail = createCoastRailing();
    const bays = rail.layout.filter(bay => bay.terminal);
    expect(bays).toHaveLength(3);
    expect(bays[0]!.a.distanceTo(bays[2]!.b)).toBeGreaterThanOrEqual(7.2);
    for (let i = 1; i < bays.length; i++) expect(bays[i - 1]!.b.distanceTo(bays[i]!.a)).toBeLessThan(1e-8);
    expect(rail.layout.filter(bay => !bay.terminal).length).toBeGreaterThan(5);
    for (const bay of rail.layout.filter(bay => !bay.terminal)) {
      const mid = bay.a.clone().lerp(bay.b, .5);
      expect(worldHeight(mid.x, mid.z)).toBeGreaterThan(waterLevelAt(mid.z));
      // RC-02 closes the last 28 m shoulder; earlier bays retain zone access gaps.
      if (mid.distanceTo(roadFrameAt(1).point) > 28) for (const zone of ZONES) expect(Math.hypot(mid.x - zone.position.x, mid.z - zone.position.z)).toBeGreaterThanOrEqual(zone.radius + 3);
    }
    expect(rail.colliders.every(box => box.size.z === RAIL_DEPTH)).toBe(true);
    expect(createRailingLayout()).toEqual(rail.layout);
    rail.dispose();
  });

  it("keeps lookout reach outside the mailbox and unwritten-page reach, including a mirrored mailbox", () => {
    const { point, right } = roadFrameAt(1);
    for (const sign of [-1, 1]) {
      const mailbox = point.clone().addScaledVector(right, sign * 4.75);
      mailbox.y = worldHeight(mailbox.x, mailbox.z) + 2.1;
      const targets = [{ id: "mailbox", zoneId: "last-postcard" as const, position: mailbox, reach: 6.5 },
        ...SECRETS.map(secret => ({ id: secret.id, zoneId: "quiet-shore" as const, position: secret.position, reach: secret.radius }))];
      const rail = createCoastRailing(targets);
      expect(rail.target).toBeDefined();
      const stand = rail.target!.position;
      for (const target of targets) expect(new Vector3(stand.x, stand.y, stand.z).distanceTo(new Vector3(target.position.x, target.position.y, target.position.z)))
        .toBeGreaterThan(target.reach + rail.target!.reach!);
      rail.dispose();
    }
  });

  it("uses three instanced draws, 48 triangles per bay, finite matrices and idempotent cleanup", () => {
    const rail = createCoastRailing();
    let triangles = 0;
    const matrix = new Matrix4();
    rail.group.traverse(object => {
      if (!(object instanceof InstancedMesh)) return;
      triangles += object.geometry.getAttribute("position").count / 3 * object.count;
      for (let i = 0; i < object.count; i++) { object.getMatrixAt(i, matrix); expect(matrix.elements.every(Number.isFinite)).toBe(true); }
    });
    expect(rail.group.children).toHaveLength(4);
    expect(rail.budget.trianglesPerBay).toBeLessThan(600);
    expect(triangles + 120).toBe(rail.budget.triangles);
    console.info(`RD-01 railing: ${rail.layout.length} bays, ${rail.budget.triangles} triangles, ${rail.budget.drawCalls} draws, ${rail.budget.assetBytes} asset bytes`);
    const spy = vi.spyOn(rail.cameraObstacles[0]!.geometry, "dispose");
    rail.dispose(); rail.dispose();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(rail.group.children).toHaveLength(0);
  });
});
