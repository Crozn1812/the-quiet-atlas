// Lead (batch 25): world-space set dressing that is not a zone: rocky shore (B2-164), the coast road (B2-163)
// and path bridges (B2-168). Each module reports oriented box colliders; they join the zone boxes so Rapier and the
// raycast fallback treat them the same way.
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, Vector3, type MeshToonMaterial } from "three";
import { createBridges, type BridgeCollider } from "./bridges";
import { createShore } from "./shore";
import { createCoastRoad, ROAD_BANDS, ROAD_SEGMENTS } from "./road/road";
import { hex, PALETTE } from "./art/palette";
import { createRampMaterial } from "./materials/ramp";
import { pathPointAt } from "./layout/path";
import { roadBaseHeight, waterLevelAt, worldHeight } from "./terrain/height";
import { nearestPath } from "./terrain/samples";
import { sampleShoreContour, shoreGroundHeight, shoreNormal, type ShorePoint } from "./shore/contour";
import { SHORE_SEED, shorePlacementClear, type ShoreLayout, type ShoreStone, type Pebble, type Boulder, type Cairn, type SandPatch } from "./shore/layout";
import { createShoreRockGeometry } from "./shore/geometry";
import { createRoadLayout, ROAD_START, ROAD_END, ROAD_LIFT, roadFrameAt } from "./road/layout";
import { createRoadInstances, createRoadWires } from "./road/posts";
import { roadGeometryBuilder } from "./road/geometry";
import { roadBandOffsetAt, roadSurfaceColorAt } from "./road/surface";

/** B2-163: guard posts and utility poles report circles; stand them up as boxes over their own height. */
function coastRoadDressing(): DressingModule {
  const road = createCoastRoad();
  const solids = [...road.layout.posts, ...road.layout.poles];
  return {
    group: road.group,
    colliders: road.colliders.map(({ x, z, r }, i) => ({
      center: new Vector3(x, solids[i]!.y + solids[i]!.height / 2, z),
      size: new Vector3(2 * r, solids[i]!.height, 2 * r),
    })),
    dispose: () => road.dispose(),
  };
}

export interface DressingCollider {
  readonly center: Readonly<Vector3>;
  readonly size: Readonly<Vector3>;
  readonly yaw?: number;
}

interface DressingModule {
  readonly group: Group;
  readonly colliders: readonly DressingCollider[];
  /** Walkable decks and rails (B2-168): Rapier trimeshes; the raycast fallback uses matching meshes. */
  readonly trimeshes?: readonly BridgeCollider[];
  update?(dt: number, reducedMotion: boolean): void;
  dispose(): void;
}

export function placeDressing({ deferred = false } = {}) {
  const modules: DressingModule[] = [];
  const boxes: Mesh<BoxGeometry, MeshBasicMaterial>[] = [];
  const surfaces: Mesh<BufferGeometry, MeshBasicMaterial>[] = [];
  const pending: Generator<void>[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let frame: number | undefined;
  let disposed = false;
  let started = false;
  try {
    const bridges = createBridges();
    // Register ownership before building the next piece, including the exception path.
    const bridgeModule = { group: bridges.group, colliders: [], trimeshes: bridges.colliders, dispose: () => bridges.dispose() };
    modules.push(bridgeModule);
    const shore = deferred ? deferredShore() : createShore();
    modules.unshift(shore);
    if ("build" in shore) pending.push(shore.build);
    const road = deferred ? deferredRoad() : coastRoadDressing();
    modules.splice(1, 0, road);
    if ("build" in road) pending.push(road.build);
    for (const piece of modules) for (const collider of piece.colliders) {
      const box = new Mesh(new BoxGeometry(collider.size.x, collider.size.y, collider.size.z), new MeshBasicMaterial());
      box.position.copy(collider.center);
      box.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), collider.yaw ?? 0);
      box.updateMatrixWorld(true);
      boxes.push(box);
    }
    for (const piece of modules) for (const trimesh of piece.trimeshes ?? []) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(trimesh.vertices, 3));
      geometry.setIndex(new BufferAttribute(trimesh.indices, 1));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const surface = new Mesh(geometry, new MeshBasicMaterial());
      surface.name = `bridge-${trimesh.bridgeIndex}-${trimesh.kind}-collider`;
      surface.updateMatrixWorld(true);
      surfaces.push(surface);
    }
  } catch (error) {
    modules.forEach(piece => piece.dispose());
    [...boxes, ...surfaces].forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
    throw error;
  }
  return {
    /** Append visual work before startDeferred; each iterator step must be a small bounded operation. */
    defer(build: Generator<void>) { pending.push(build); },
    /** Wait for control hand-off and a paint before doing any optional work. One cancellable timer/frame. */
    startDeferred(ready: () => boolean) {
      if (started || disposed) return;
      started = true;
      const slice = () => {
        timer = undefined;
        if (disposed) return;
        if (!ready()) { timer = setTimeout(slice, 16); return; }
        const until = performance.now() + 4;
        // Round-robin prevents the distant shore from starving the nearby sun shafts.
        do {
          const work = pending.shift();
          if (!work) return;
          if (!work.next().done) pending.push(work);
        } while (pending.length && performance.now() < until);
        if (pending.length) timer = setTimeout(slice, 16);
      };
      const waitForControl = () => {
        timer = undefined;
        if (disposed) return;
        if (!ready()) { timer = setTimeout(waitForControl, 16); return; }
        frame = requestAnimationFrame(() => {
          frame = undefined;
          if (!disposed) timer = setTimeout(slice, 16);
        });
      };
      timer = setTimeout(waitForControl, 16);
    },
    groups: modules.map(piece => piece.group),
    boxes,
    /** Raycast-backend obstacles/ground for decks and rails; never cuboids. */
    surfaces,
    trimeshes: modules.flatMap(piece => piece.trimeshes ?? []),
    update(dt: number, reducedMotion: boolean) {
      for (const piece of modules) piece.update?.(dt, reducedMotion);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      if (frame !== undefined) cancelAnimationFrame(frame);
      for (const work of pending) work.return(undefined);
      pending.length = 0;
      for (const piece of modules) { piece.dispose(); piece.group.removeFromParent(); }
      for (const mesh of [...boxes, ...surfaces]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    },
  };
}

// B2-179: scoped adapters reuse the original layout/geometry rules. The standalone shore/road
// factories stay synchronous; parity tests below guard these incremental versions against drift.
function random(x: number, z: number, salt: number): number {
  let hash = Math.imul(Math.round(x * 100), 374761393)
    ^ Math.imul(Math.round(z * 100), 668265263) ^ Math.imul(salt, 1274126177) ^ SHORE_SEED;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function stone(x: number, z: number, diameter: number, salt: number): ShoreStone {
  const height = diameter * (0.55 + random(x, z, salt + 1) * 0.25);
  return {
    x, z, y: shoreGroundHeight(x, z) - height * 0.16,
    size: [diameter, height, diameter * (0.72 + random(x, z, salt + 2) * 0.28)],
    yaw: random(x, z, salt + 3) * Math.PI * 2,
    pigment: random(x, z, salt + 4),
  };
}

function dressingShoreLayout() {
  const contour = sampleShoreContour();
  const cumulative: number[] = [];
  let total = 0;
  for (const segment of contour) { total += segment.length; cumulative.push(total); }
  function at(distance: number): ShorePoint {
    let first = 0, last = cumulative.length - 1;
    while (first < last) {
      const middle = (first + last) >>> 1;
      if (cumulative[middle]! < distance) first = middle + 1;
      else last = middle;
    }
    const segment = contour[first]!;
    const u = (distance - (cumulative[first]! - segment.length)) / segment.length;
    const x = segment.a.x + (segment.b.x - segment.a.x) * u;
    const z = segment.a.z + (segment.b.z - segment.a.z) * u;
    // Bisect across the chord: unlike Newton steps this also handles sharp bay corners.
    const normal = shoreNormal({ x, z });
    const height = (offset: number) => worldHeight(x + normal.x * offset, z + normal.z * offset);
    let low = -0.25, high = 0.25;
    while ((height(low) > 0) === (height(high) > 0) && high < 4) { low *= 2; high *= 2; }
    if ((height(low) > 0) === (height(high) > 0)) return u < 0.5 ? segment.a : segment.b;
    const lowIsDry = height(low) > 0;
    for (let i = 0; i < 24; i++) {
      const middle = (low + high) / 2;
      if ((height(middle) > 0) === lowIsDry) low = middle;
      else high = middle;
    }
    const offset = (low + high) / 2;
    return { x: x + normal.x * offset, z: z + normal.z * offset };
  }
  const boulders: Boulder[] = [];
  function cluster(anchor: ShorePoint, id: number, site: Boulder["site"]) {
    const count = 2 + Math.floor(random(anchor.x, anchor.z, 20) * 4);
    for (let attempt = 0; attempt < 12; attempt++) {
      const rocks: Boulder[] = [];
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count + attempt * 0.39;
        const x = anchor.x + Math.cos(angle) * 2.8 + attempt * 0.4;
        const z = anchor.z + Math.sin(angle) * 2.8;
        const rock = stone(x, z, 0.8 + random(x, z, 21) * 1.7, 30);
        const radius = Math.hypot(rock.size[0], rock.size[2]) / 2;
        if (!shorePlacementClear(x, z, radius) || worldHeight(x, z) < (site === "shore" ? -0.3 : waterLevelAt(z) + 0.1)) break;
        rocks.push({ ...rock, cluster: id, site });
      }
      if (rocks.length === count) { boulders.push(...rocks); return; }
    }
  }
  for (let i = 0; i < 10; i++) cluster(at(total * (i + 0.5) / 10), i, "shore");
  for (let i = 0; i < 6; i++) {
    const t = 0.835 + i * 0.026;
    const p = pathPointAt(t), f = pathPointAt(t + 0.001).sub(pathPointAt(t - 0.001)).normalize();
    cluster({ x: p.x + f.z * 33, z: p.z - f.x * 33 }, 10 + i, "mountain");
  }

  const cairns: Cairn[] = [];
  for (const target of [0.864, 0.881]) {
    for (const offset of [8, 11, 15, 20, 24, 28, 32]) {
      const p = pathPointAt(target);
      const f = pathPointAt(target + 0.001).sub(pathPointAt(target - 0.001)).normalize();
      const x = p.x + f.z * offset, z = p.z - f.x * offset;
      const t = nearestPath(x, z).t, y = shoreGroundHeight(x, z) - 0.03;
      if (t < 0.86 || t > 0.9 || !shorePlacementClear(x, z, 0.75)
        // Match terrain/mesh.ts: above 1.6 m the sand pigment has faded to grass.
        || y <= Math.max(1.65, waterLevelAt(z) + 0.15)) continue;
      const count = 5 + Math.floor(random(x, z, 40) * 3);
      const height = 1 + random(x, z, 41) * 0.4;
      const stones: ShoreStone[] = [];
      // Deliberately flatter, progressively smaller stones; centred contact faces.
      for (let i = 0; i < count; i++) {
        const width = 0.76 - 0.45 * i / (count - 1);
        stones.push({ x, z, y: y + height * i / count, size: [width, height / count, width * 0.8],
          yaw: random(x, z, 50 + i) * 0.4, pigment: random(x, z, 60 + i) });
      }
      cairns.push({ x, z, y, t, height, stones });
      break;
    }
  }

  const pebbles: Pebble[] = [];
  const sand: SandPatch[] = [];
  const layout: ShoreLayout = { pebbles, boulders, cairns, sand };
  function* build() {
    for (let i = 0; i < 1000; i++) {
      yield;
      const shore = at(total * (i + 0.5) / 1000);
      const normal = shoreNormal(shore);
      const r = random(shore.x, shore.z, 1);
      // 84% occupy the 8 m core; only 16% occupy the 5 m dry shoulder.
      const offset = r < 0.84 ? -3 + 7 * random(shore.x, shore.z, 2)
        : 4 + 5 * (1 - Math.sqrt(1 - random(shore.x, shore.z, 2)));
      const x = shore.x + normal.x * offset, z = shore.z + normal.z * offset;
      if (!shorePlacementClear(x, z, 0.3) || worldHeight(x, z) < -0.28) continue;
      const diameter = 0.1 + random(x, z, 3) * 0.3;
      const rock = stone(x, z, diameter, 10);
      pebbles.push({ ...rock, size: [diameter, rock.size[1] * 0.6, rock.size[2]], shore, offset });
    }
    // B2-193: no separate sand overlay (its 2 m grid had hard edges and crossed the coast road);
    // terrain/mesh.ts already paints sand along real water.
  }
  return { layout, build: build() };
}

function deferredShore() {
  // Only the contour and solid layout are needed up front; pebble/sand placement is deferred.
  const { layout, build: placement } = dressingShoreLayout();
  const group = new Group();
  group.name = "rocky-shore";
  const colliders: DressingCollider[] = layout.boulders.map(rock => ({
    center: new Vector3(rock.x, rock.y + rock.size[1] / 2, rock.z), size: new Vector3(...rock.size), yaw: rock.yaw,
  }));
  for (const cairn of layout.cairns) colliders.push({
    center: new Vector3(cairn.x, cairn.y + cairn.height / 2, cairn.z), size: new Vector3(1.05, cairn.height, 1.05), yaw: 0,
  });
  const geometries: BufferGeometry[] = [];
  const materials: MeshToonMaterial[] = [];
  const instances: InstancedMesh[] = [];
  function* stones(name: string, items: readonly ShoreStone[], sides: 4 | 6, material: MeshToonMaterial) {
    const geometry = createShoreRockGeometry(sides);
    geometries.push(geometry);
    const mesh = new InstancedMesh(geometry, material, items.length);
    instances.push(mesh);
    mesh.name = name;
    mesh.receiveShadow = true;
    const transform = new Object3D();
    for (const [i, stone] of items.entries()) {
      transform.position.set(stone.x, stone.y, stone.z);
      transform.rotation.set(0, stone.yaw, 0);
      transform.scale.set(...stone.size);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
      const middle = new Color(PALETTE.rock);
      const pigment = stone.pigment < 0.5 ? new Color(PALETTE.rockDark).lerp(middle, stone.pigment * 2)
        : middle.lerp(new Color(PALETTE.sand), (stone.pigment - 0.5) * 2);
      mesh.setColorAt(i, pigment);
      yield;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    yield;
    mesh.computeBoundingSphere();
    return mesh;
  }
  function* construct() {
    yield* placement;
    const material = createRampMaterial(0xffffff, { steps: 4, soft: true });
    materials.push(material);
    material.vertexColors = true;
    const pebbles = yield* stones("shore-pebbles", layout.pebbles, 4, material);
    const rocks = yield* stones("shore-boulders-and-cairns", [...layout.boulders, ...layout.cairns.flatMap(cairn => cairn.stones)], 6, material);
    group.add(pebbles, rocks);
  }
  const build = construct();
  return { group, colliders, build, dispose() {
    build.return(); placement.return();
    instances.forEach(mesh => mesh.dispose());
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    group.clear();
  } };
}

function* dressingRoadSurface() {
  const builder = roadGeometryBuilder();
  const rows: Vector3[][] = [];
  for (let i = 0; i <= ROAD_SEGMENTS; i++) {
    yield;
    const t = ROAD_START + (ROAD_END - ROAD_START) * i / ROAD_SEGMENTS;
    const { point, right } = roadFrameAt(t);
    rows.push(ROAD_BANDS.map(offset => {
      const vertex = point.clone().addScaledVector(right, roadBandOffsetAt(offset, t));
      vertex.y = roadBaseHeight(vertex.x, vertex.z) + ROAD_LIFT; // B2-195: same pre-cut ground as road.ts
      return vertex;
    }));
  }
  for (let row = 0; row < ROAD_SEGMENTS; row++) {
    yield;
    for (let band = 0; band < ROAD_BANDS.length - 1; band++) {
      const left = ROAD_BANDS[band]!, right = ROAD_BANDS[band + 1]!;
      const middle = (left + right) / 2;
      const a = rows[row]![band]!, b = rows[row]![band + 1]!;
      const c = rows[row + 1]![band]!, d = rows[row + 1]![band + 1]!;
      const ca = roadSurfaceColorAt(a.x, a.z, left, middle), cb = roadSurfaceColorAt(b.x, b.z, right, middle);
      const cc = roadSurfaceColorAt(c.x, c.z, left, middle), cd = roadSurfaceColorAt(d.x, d.z, right, middle);
      builder.triangle(a, b, c, [ca, cb, cc]);
      builder.triangle(b, d, c, [cb, cd, cc]);
    }
  }
  return builder.finish();
}

function deferredRoad() {
  const layout = createRoadLayout();
  const group = new Group();
  group.name = "coast-road";
  const solids = [...layout.posts, ...layout.poles];
  const colliders = layout.colliders.map(({ x, z, r }, i) => ({
    center: new Vector3(x, solids[i]!.y + solids[i]!.height / 2, z),
    size: new Vector3(2 * r, solids[i]!.height, 2 * r),
  }));
  const resources: { dispose(): void }[] = [];
  function* construct() {
    const geometry = yield* dressingRoadSurface();
    resources.push(geometry);
    const material = createRampMaterial(hex("laneWhite"));
    resources.push(material);
    material.vertexColors = true;
    const surface = new Mesh(geometry, material);
    surface.name = "coast-asphalt-and-markings";
    surface.receiveShadow = true;
    group.add(surface);
    yield;
    const posts = createRoadInstances(layout.posts, false, material);
    resources.push(posts, posts.geometry);
    group.add(posts);
    yield;
    const poles = createRoadInstances(layout.poles, true, material);
    resources.push(poles, poles.geometry);
    group.add(poles);
    yield;
    const wires = createRoadWires(layout.poles);
    resources.push(wires.geometry, wires.material);
    group.add(wires);
  }
  const build = construct();
  return { group, colliders, build, dispose() {
    build.return();
    resources.forEach(resource => resource.dispose());
    group.clear();
  } };
}
