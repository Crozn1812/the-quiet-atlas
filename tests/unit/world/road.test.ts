import { Color, InstancedMesh, LineSegments, Matrix4, Mesh, MeshToonMaterial, Vector3 } from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { PATH_CLEARANCE, ZONE_CLEARANCE } from "../../../src/features/world/foliage/scatter";
import { pathLength, pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import {
  createRoadLayout, POLE_OFFSET, POLE_RADIUS, POLE_SPACING, POST_OFFSET, POST_RADIUS,
  POST_SPACING, ROAD_END, ROAD_LIFT, ROAD_START, ROAD_TAPER_LENGTH, ROAD_WIDTH,
  roadFrameAt, roadPostAllowed, roadWidthAt,
} from "../../../src/features/world/road/layout";
import {
  WIRE_HEIGHT, WIRE_OFFSETS, WIRE_SAG, WIRE_SEGMENTS, wireAnchor,
} from "../../../src/features/world/road/posts";
import { createCoastRoad, ROAD_BANDS, ROAD_SEGMENTS } from "../../../src/features/world/road/road";
import { waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";
import { nearestPath } from "../../../src/features/world/terrain/samples";

describe("coastal asphalt, roadside bollards and utility poles", () => {
  let road: ReturnType<typeof createCoastRoad>;
  let surface: Mesh;
  let posts: InstancedMesh;
  let poles: InstancedMesh;
  let wires: LineSegments;
  beforeAll(() => {
    road = createCoastRoad();
    [surface, posts, poles, wires] = road.group.children as [Mesh, InstancedMesh, InstancedMesh, LineSegments];
  });
  afterAll(() => road.dispose());

  it("follows pathPointAt only on t=0.80–1, is 5 m wide and tapers smoothly into dirt at both ends", () => {
    const position = surface.geometry.getAttribute("position");
    const bands = ROAD_BANDS.length - 1;
    const point = (row: number, band: number) => new Vector3().fromBufferAttribute(position, row * bands * 6 + band * 6);
    for (let row = 0; row < ROAD_SEGMENTS; row++) {
      const t = ROAD_START + (ROAD_END - ROAD_START) * row / ROAD_SEGMENTS;
      const center = pathPointAt(t);
      const first = point(row, 0);
      const last = new Vector3().fromBufferAttribute(position, row * bands * 6 + (bands - 1) * 6 + 1);
      const midpoint = first.clone().add(last).multiplyScalar(0.5);
      expect(Math.hypot(midpoint.x - center.x, midpoint.z - center.z)).toBeLessThan(0.0001);
      const width = Math.hypot(first.x - last.x, first.z - last.z);
      const fromEnd = Math.min(t - ROAD_START, ROAD_END - t) * pathLength();
      if (fromEnd >= ROAD_TAPER_LENGTH) expect(width).toBeCloseTo(5, 3);
      else expect(width).toBeLessThan(5.0001);
      for (let band = 0; band < bands; band++) {
        const vertex = point(row, band);
        const radius = Math.hypot(vertex.x - center.x, vertex.z - center.z);
        expect(radius).toBeLessThanOrEqual(ROAD_WIDTH / 2 + 0.0001);
      }
    }
    const end = pathPointAt(1);
    for (let band = 0; band < bands; band++) {
      const vertex = new Vector3().fromBufferAttribute(position, (ROAD_SEGMENTS - 1) * bands * 6 + band * 6 + 2);
      expect(Math.hypot(vertex.x - end.x, vertex.z - end.z)).toBeLessThan(0.0001);
    }
    expect(roadWidthAt(0.79)).toBe(0);
    expect(roadWidthAt(1.01)).toBe(0);
    for (const t of [ROAD_START, ROAD_END]) expect(roadWidthAt(t)).toBe(0);
    for (const distance of [0.01, 0.1, 1, 3, 6, 9, 12]) {
      const start = roadWidthAt(ROAD_START + distance / pathLength());
      const endWidth = roadWidthAt(ROAD_END - distance / pathLength());
      expect(start).toBeCloseTo(endWidth, 10);
      expect(start).toBeGreaterThan(0);
      expect(start).toBeLessThanOrEqual(5);
      if (distance === 0.01) expect(start).toBeLessThan(0.00002);
    }
  });

  it("keeps all three continuous paint bands inside the asphalt, using palette pigments and subtle asphalt grain", () => {
    const material = surface.material as MeshToonMaterial;
    expect(material).toBeInstanceOf(MeshToonMaterial);
    expect(material.color.getHexString()).toBe(PALETTE.laneWhite.slice(1).toLowerCase());
    expect(material.vertexColors).toBe(true);
    expect(material.gradientMap!.magFilter).toBe(material.gradientMap!.minFilter);
    const color = surface.geometry.getAttribute("color");
    const shades = new Set<number>();
    const pigments = { asphalt: new Color(PALETTE.asphalt), laneWhite: new Color(PALETTE.laneWhite), laneYellow: new Color(PALETTE.laneYellow) };
    for (let row = 0; row < ROAD_SEGMENTS; row++) {
      let yellow = 0, white = 0;
      for (let band = 0; band < ROAD_BANDS.length - 1; band++) {
        const middle = Math.abs((ROAD_BANDS[band]! + ROAD_BANDS[band + 1]!) / 2);
        const kind = middle < 0.1 ? "laneYellow" : middle > 2.05 && middle < 2.2 ? "laneWhite" : "asphalt";
        if (kind === "laneYellow") yellow++;
        if (kind === "laneWhite") white++;
        const pigment = pigments[kind];
        const start = (row * (ROAD_BANDS.length - 1) + band) * 6;
        for (let j = 0; j < 6; j++) {
          const actual = new Color().fromBufferAttribute(color, start + j).multiply(material.color);
          const shade = actual.r / pigment.r;
          expect(actual.g / pigment.g).toBeCloseTo(shade, 6);
          expect(actual.b / pigment.b).toBeCloseTo(shade, 6);
          if (kind === "asphalt") {
            expect(shade).toBeGreaterThanOrEqual(0.97 - 1e-6);
            expect(shade).toBeLessThanOrEqual(1 + 1e-6);
            shades.add(shade);
          } else expect(shade).toBeCloseTo(1, 6);
        }
      }
      expect(yellow).toBe(1);
      expect(white).toBe(2);
    }
    expect(shades.size).toBeGreaterThan(100);
  });

  it("grounds vertices at terrain +2 cm and keeps triangle interiors above the terrain", () => {
    const position = surface.geometry.getAttribute("position");
    let maximumVertexError = 0;
    let minimumClearance = Infinity;
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), point = new Vector3();
    for (let i = 0; i < position.count; i += 3) {
      a.fromBufferAttribute(position, i);
      b.fromBufferAttribute(position, i + 1);
      c.fromBufferAttribute(position, i + 2);
      for (const vertex of [a, b, c]) {
        maximumVertexError = Math.max(maximumVertexError, Math.abs(vertex.y - worldHeight(vertex.x, vertex.z) - ROAD_LIFT));
      }
      // Include every vertex, edge, diagonal and interior on an eighth-triangle lattice.
      for (let u = 0; u <= 8; u++) for (let v = 0; v <= 8 - u; v++) {
        point.copy(a).multiplyScalar(u / 8).addScaledVector(b, v / 8).addScaledVector(c, 1 - (u + v) / 8);
        minimumClearance = Math.min(minimumClearance, point.y - worldHeight(point.x, point.z));
      }
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      if (normal.lengthSq() > 1e-10) expect(normal.y).toBeGreaterThan(0);
    }
    expect(maximumVertexError).toBeLessThan(0.0001); // Float32 world-coordinate rounding.
    expect(minimumClearance).toBeGreaterThan(0.005);
  });

  it("places bollards on walking-right and wooden poles on walking-left, outside the corridor, pads and water", () => {
    expect(road.layout.posts.length).toBeGreaterThan(10);
    expect(road.layout.poles.length).toBeGreaterThanOrEqual(3);
    for (const [items, offset, radius] of [
      [road.layout.posts, POST_OFFSET, POST_RADIUS], [road.layout.poles, POLE_OFFSET, POLE_RADIUS],
    ] as const) {
      for (const item of items) {
        const center = pathPointAt(item.t);
        const forward = pathPointAt(item.t + 0.00001).sub(pathPointAt(item.t - 0.00001)).normalize();
        const side = (item.x - center.x) * -forward.z + (item.z - center.z) * forward.x;
        expect(side).toBeCloseTo(offset, 8);
        expect(item.t).toBeGreaterThanOrEqual(0.8);
        expect(item.t).toBeLessThanOrEqual(1);
        expect(nearestPath(item.x, item.z).distance - radius).toBeGreaterThanOrEqual(PATH_CLEARANCE);
        expect(item.y).toBe(worldHeight(item.x, item.z));
        expect(item.y).toBeGreaterThanOrEqual(waterLevelAt(item.z) + 0.05);
        for (const zone of ZONES) {
          expect(Math.hypot(item.x - zone.position.x, item.z - zone.position.z) - radius)
            .toBeGreaterThanOrEqual(zone.radius + ZONE_CLEARANCE);
        }
      }
    }
    expect(POST_OFFSET - POST_RADIUS - PATH_CLEARANCE).toBeCloseTo(0.03, 10);
    expect(road.colliders).toEqual([
      ...road.layout.posts.map(({ x, z }) => ({ x, z, r: POST_RADIUS })),
      ...road.layout.poles.map(({ x, z }) => ({ x, z, r: POLE_RADIUS })),
    ]);
    expect(Object.isFrozen(road.colliders)).toBe(true);
  });

  it("spaces consecutive bollards 10–12 m and poles 40–50 m; only protected pads interrupt the bollard lattice", () => {
    for (const [items, spacing, minimum, maximum] of [
      [road.layout.posts, POST_SPACING, 10, 12], [road.layout.poles, POLE_SPACING, 40, 50],
    ] as const) {
      for (let i = 1; i < items.length; i++) {
        const a = items[i - 1]!, b = items[i]!;
        const skipped = Math.round((b.station - a.station) / spacing) - 1;
        expect((b.station - a.station) / spacing).toBeCloseTo(skipped + 1, 10);
        if (skipped === 0) {
          const distance = Math.hypot(b.x - a.x, b.z - a.z);
          expect(distance).toBeGreaterThanOrEqual(minimum);
          expect(distance).toBeLessThanOrEqual(maximum);
        } else {
          expect(items).toBe(road.layout.posts);
          // Every missing lattice station is necessary: it is inside a zone exclusion.
          for (let step = 1; step <= skipped; step++) {
            const t = a.t + (b.t - a.t) * step / (skipped + 1);
            const frame = roadFrameAt(t);
            const p = frame.point.addScaledVector(frame.right, POST_OFFSET);
            expect(roadPostAllowed(p.x, p.z, POST_RADIUS)).toBe(false);
            expect(ZONES.some(zone => Math.hypot(p.x - zone.position.x, p.z - zone.position.z)
              < zone.radius + ZONE_CLEARANCE + POST_RADIUS)).toBe(true);
          }
        }
      }
    }
  });

  it("instances 0.9 m white/red bevelled bollards with seeded ±2° lean and bounds inside their collider circles", () => {
    expect(posts).toBeInstanceOf(InstancedMesh);
    expect(posts.count).toBe(road.layout.posts.length);
    const local = posts.geometry.getAttribute("position");
    expect(posts.geometry.boundingBox!.max.y - posts.geometry.boundingBox!.min.y).toBeCloseTo(0.9, 6);
    const colors = posts.geometry.getAttribute("color");
    const base = (posts.material as MeshToonMaterial).color;
    for (let i = 0; i < colors.count; i++) {
      const actual = new Color().fromBufferAttribute(colors, i).multiply(base);
      const error = (pigment: Color) => Math.hypot(actual.r - pigment.r, actual.g - pigment.g, actual.b - pigment.b);
      expect(Math.min(error(new Color(PALETTE.laneWhite)), error(new Color(PALETTE.vermilion)))).toBeLessThan(1e-6);
    }
    const matrix = new Matrix4(), point = new Vector3();
    for (let i = 0; i < posts.count; i++) {
      const item = road.layout.posts[i]!;
      expect(Math.abs(item.lean)).toBeLessThanOrEqual(2 * Math.PI / 180);
      posts.getMatrixAt(i, matrix);
      for (let vertex = 0; vertex < local.count; vertex++) {
        point.fromBufferAttribute(local, vertex).applyMatrix4(matrix);
        expect(Math.hypot(point.x - item.x, point.z - item.z)).toBeLessThan(POST_RADIUS);
        expect(nearestPath(point.x, point.z).distance).toBeGreaterThan(PATH_CLEARANCE);
      }
    }
    expect(new Set(road.layout.posts.map(post => post.lean)).size).toBe(posts.count);
    expect(road.layout.posts.some(post => post.lean < 0)).toBe(true);
    expect(road.layout.posts.some(post => post.lean > 0)).toBe(true);
  });

  it("builds 7–8 m wooden poles with transverse crossarms and three attached, gently sagging wires", () => {
    expect(poles).toBeInstanceOf(InstancedMesh);
    expect(poles.geometry.boundingBox!.max.x - poles.geometry.boundingBox!.min.x).toBeCloseTo(2.4, 6);
    expect(poles.geometry.boundingBox!.max.y).toBeCloseTo(1, 6);
    for (const pole of road.layout.poles) {
      expect(pole.height).toBeGreaterThanOrEqual(7);
      expect(pole.height).toBeLessThanOrEqual(8);
    }
    const positions = wires.geometry.getAttribute("position");
    expect(positions.count).toBe((poles.count - 1) * 3 * WIRE_SEGMENTS * 2);
    let cursor = 0;
    for (let span = 1; span < poles.count; span++) for (const offset of WIRE_OFFSETS) {
      const a = wireAnchor(road.layout.poles[span - 1]!, offset);
      const b = wireAnchor(road.layout.poles[span]!, offset);
      expect(a.y).toBeCloseTo(road.layout.poles[span - 1]!.y + road.layout.poles[span - 1]!.height * WIRE_HEIGHT, 8);
      for (let segment = 0; segment < WIRE_SEGMENTS; segment++) for (let endpoint = 0; endpoint <= 1; endpoint++) {
        const t = (segment + endpoint) / WIRE_SEGMENTS;
        const point = new Vector3().fromBufferAttribute(positions, cursor++);
        const straight = a.clone().lerp(b, t);
        expect(point.x).toBeCloseTo(straight.x, 4);
        expect(point.z).toBeCloseTo(straight.z, 4);
        expect(straight.y - point.y).toBeCloseTo(4 * WIRE_SAG * t * (1 - t), 5);
        expect(point.y - worldHeight(point.x, point.z)).toBeGreaterThan(5);
        expect(nearestPath(point.x, point.z).distance).toBeGreaterThan(PATH_CLEARANCE);
      }
    }
  });

  it("stays within four draw calls and 12,000 submitted triangles, counting every instance", () => {
    let drawCalls = 0, triangles = 0;
    road.group.traverse(object => {
      if (!(object instanceof Mesh || object instanceof LineSegments)) return;
      expect(object.visible).toBe(true);
      expect(Array.isArray(object.material)).toBe(false);
      expect(object.geometry.groups).toHaveLength(0);
      expect(object.castShadow).toBe(false);
      expect(object.geometry.boundingSphere!.radius).toBeGreaterThan(0);
      expect(Array.from(object.geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
      drawCalls++;
      if (object instanceof Mesh) {
        triangles += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3
          * (object instanceof InstancedMesh ? object.count : 1);
      }
    });
    expect(drawCalls).toBeLessThanOrEqual(4);
    expect(triangles).toBeLessThanOrEqual(12000);
    expect(road.budget).toEqual({ drawCalls, triangles });
  });

  it("repeats placements, collider circles, geometry colours and instance transforms exactly", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.123);
    const second = createCoastRoad();
    try {
      expect(createRoadLayout()).toEqual(road.layout);
      expect(second.layout).toEqual(road.layout);
      expect(second.colliders).toEqual(road.colliders);
      expect(second.budget).toEqual(road.budget);
      road.group.children.forEach((child, i) => {
        const a = child as Mesh, b = second.group.children[i] as Mesh;
        for (const attribute of Object.keys(a.geometry.attributes)) {
          expect(b.geometry.getAttribute(attribute).array).toEqual(a.geometry.getAttribute(attribute).array);
        }
        if (a instanceof InstancedMesh && b instanceof InstancedMesh) expect(b.instanceMatrix.array).toEqual(a.instanceMatrix.array);
      });
    } finally { second.dispose(); random.mockRestore(); }
  });

  it("disposes owned buffers and materials exactly once, detaches its group and preserves the shared ramp", () => {
    const instance = createCoastRoad();
    const parent = new Mesh();
    parent.add(instance.group);
    const children = [...instance.group.children] as Mesh[];
    const geometrySpies = children.map(child => vi.spyOn(child.geometry, "dispose"));
    const material = children[0]!.material as MeshToonMaterial;
    const materialSpy = vi.spyOn(material, "dispose");
    const wireSpy = vi.spyOn(children[3]!.material as MeshToonMaterial, "dispose");
    const rampSpy = vi.spyOn(material.gradientMap!, "dispose");
    const instanceSpies = children.filter(child => child instanceof InstancedMesh).map(child => vi.spyOn(child, "dispose"));
    instance.dispose();
    instance.dispose();
    expect(parent.children).toHaveLength(0);
    expect(instance.group.children).toHaveLength(0);
    for (const spy of [...geometrySpies, ...instanceSpies, materialSpy, wireSpy]) expect(spy).toHaveBeenCalledTimes(1);
    expect(rampSpy).not.toHaveBeenCalled();
    rampSpy.mockRestore();
    parent.geometry.dispose();
    (parent.material as MeshToonMaterial).dispose();
  });
});
