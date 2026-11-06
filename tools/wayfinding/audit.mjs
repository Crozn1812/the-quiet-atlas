import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// Node only; Vite reads the live TS sources without generated files or a listener.
const server = await createServer({ root: fileURLToPath(new URL("../../", import.meta.url)),
  configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, ws: false } });
try {
  const load = path => server.ssrLoadModule(`/src/features/${path}.ts`);
  const { Vector3, Quaternion } = await import("three");
  const { pathLength, pathPointAt } = await load("world/layout/path");
  const { riverPointAt, riverLength } = await load("world/layout/river");
  const { ZONES } = await load("world/layout/zones");
  const { worldHeight } = await load("world/terrain/height");
  const { TILE_SIZE } = await load("world/terrain/tiles");
  const { scatterTile } = await load("world/foliage/scatter");
  const { createFoliageColliders } = await load("world/foliage/colliders");
  const { SIGNPOSTS } = await load("navigation/signposts");
  const { createBridgeProfiles, BRIDGE_RAIL_HEIGHT } = await load("world/bridges/profile");
  const { placeZoneScenes } = await load("world/zones/index");
  const { SEA_SIZE, SEA_INLAND_OVERLAP } = await load("world/water/sea");
  const { createWaymarkLayout } = await load("world/waymarks");
  const waymarks = createWaymarkLayout();
  const length = pathLength(), bridges = createBridgeProfiles(), tiles = new Map();
  const surface = (p, t) => {
    const bridge = bridges.find(b => t >= b.tStart && t <= b.tEnd);
    return bridge ? bridge.sample(t).centre.y : worldHeight(p.x, p.z);
  };
  const groundTarget = (p, height) => new Vector3(p.x, worldHeight(p.x, p.z) + height, p.z);
  const landmarks = SIGNPOSTS.map(p => ({ p: groundTarget(p.position, 1.33),
    t: ZONES.find(z => z.id === p.zoneId).t, kind: "sign" }));
  for (const mark of waymarks) landmarks.push({ p: groundTarget(mark, mark.height), t: mark.t, kind: "waymark" });
  for (const b of bridges) landmarks.push({ p: b.sample(b.source.t).centre.clone().add(new Vector3(0, BRIDGE_RAIL_HEIGHT, 0)), t: b.source.t, kind: "bridge" });
  const horizon = placeZoneScenes(worldHeight, ["horizon"])[0];
  for (let i = 0; i < 2; i++) {
    landmarks.push({ p: horizon.group.getObjectByName(`horizon-rotor-${i}`).getWorldPosition(new Vector3()), t: 0.76, kind: "turbine" });
  }
  horizon.dispose();
  // Exact finite cylinder intersection in collider-local coordinates (including lean).
  function trunkBlocks(a, b, c) {
    const inverse = new Quaternion(c.rotation.x, c.rotation.y, c.rotation.z, c.rotation.w).invert();
    const origin = a.clone().sub(new Vector3(c.x, c.y, c.z)).applyQuaternion(inverse);
    const d = b.clone().sub(a).applyQuaternion(inverse);
    let low = 0, high = 1;
    if (Math.abs(d.y) < 1e-12) { if (Math.abs(origin.y) > c.halfHeight) return false; }
    else {
      const ends = [(-c.halfHeight - origin.y) / d.y, (c.halfHeight - origin.y) / d.y].sort((x, y) => x - y);
      low = Math.max(low, ends[0]); high = Math.min(high, ends[1]);
    }
    const aa = d.x ** 2 + d.z ** 2, bb = 2 * (origin.x * d.x + origin.z * d.z);
    const cc = origin.x ** 2 + origin.z ** 2 - c.radius ** 2;
    if (aa < 1e-12) return cc <= 0 && low <= high;
    const disc = bb * bb - 4 * aa * cc;
    if (disc < 0) return false;
    low = Math.max(low, (-bb - Math.sqrt(disc)) / (2 * aa));
    high = Math.min(high, (-bb + Math.sqrt(disc)) / (2 * aa));
    return low <= high && high > 0 && low < 1;
  }
  function visible(a, b) {
    const distance = a.distanceTo(b);
    if (distance > 80) return false;
    // Height-field CPU ray march, <= 0.25 m between probes, endpoints excluded.
    const steps = Math.ceil(distance / 0.25);
    for (let i = 1; i < steps; i++) {
      const p = a.clone().lerp(b, i / steps);
      if (worldHeight(p.x, p.z) >= p.y) return false;
    }
    for (let ix = Math.floor((Math.min(a.x, b.x) - 1) / TILE_SIZE); ix <= Math.floor((Math.max(a.x, b.x) + 1) / TILE_SIZE); ix++) {
      for (let iz = Math.floor((Math.min(a.z, b.z) - 1) / TILE_SIZE); iz <= Math.floor((Math.max(a.z, b.z) + 1) / TILE_SIZE); iz++) {
        const key = `${ix},${iz}`;
        if (!tiles.has(key)) tiles.set(key, createFoliageColliders(scatterTile({ ix, iz })));
        if (tiles.get(key).some(c => trunkBlocks(a, b, c))) return false;
      }
    }
    return true;
  }
  const links = waymarks.slice(1).filter((mark) => mark.segment === waymarks[waymarks.indexOf(mark) - 1].segment).map(mark => {
    const previous = waymarks[waymarks.indexOf(mark) - 1];
    return { from: previous.t, to: mark.t, visible: visible(groundTarget(previous, 1.7), groundTarget(mark, mark.height)) };
  });
  console.log("Waymark links (observer eye 1.7 m at previous mark):"); console.table(links);
  if (links.some(link => !link.visible)) process.exitCode = 1;
  const mouth = riverPointAt(1);
  const samples = Array.from({ length: Math.ceil(length / 5) + 1 }, (_, i) => {
    const s = Math.min(i * 5, length), t = s / length, p = pathPointAt(t);
    const eye = p.clone(); eye.y = surface(p, t) + 1.7;
    const tangent = pathPointAt(Math.min(1, t + 0.001)).sub(pathPointAt(Math.max(0, t - 0.001)));
    const forward = target => target.clone().sub(eye).dot(tangent) > 0;
    const next = ZONES.find(z => z.t > t);
    const candidates = landmarks.filter(m => m.t >= t).map(m => m.p);
    if (next) candidates.push(groundTarget(next.position, 2));
    // Sea surface probes, never grant automatic visibility merely for reaching t=.76.
    if (t > 0.76) for (let angle = -180; angle < 180; angle += 10) {
      for (const radius of [20, 40, 60, 79]) {
        const q = new Vector3(p.x + Math.cos(angle * Math.PI / 180) * radius, 0, p.z + Math.sin(angle * Math.PI / 180) * radius);
        if (Math.abs(q.x - mouth.x) <= SEA_SIZE / 2 && q.z >= mouth.z - SEA_SIZE
          && q.z <= mouth.z + SEA_INLAND_OVERLAP && worldHeight(q.x, q.z) < 0) candidates.push(q);
      }
    }
    return { s, t, p, blind: !candidates.some(q => forward(q) && visible(eye, q)) };
  });
  const fmt = p => `${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;
  function runs(rows, predicate) {
    const result = []; let start;
    rows.forEach((row, i) => {
      if (predicate(row) && start === undefined) start = i;
      if (start !== undefined && (!predicate(row) || i === rows.length - 1)) {
        const end = predicate(row) ? i : i - 1;
        result.push([rows[start], rows[end]]); start = undefined;
      }
    });
    return result;
  }
  const allBlind = runs(samples, r => r.blind);
  console.log(`Longest blind span: ${Math.max(0, ...allBlind.map(([a, b]) => b.s - a.s)).toFixed(2)} m`);
  const blind = allBlind.filter(([a, b]) => b.s - a.s > 60);
  console.log(`Route ${length.toFixed(2)} m; ${samples.length} probes; eye 1.7 m; range 80 m; step 5 m.`);
  console.log("Blind spans >60 m (length between first/last blind probes; boundary uncertainty <=5 m per end):");
  console.table(blind.map(([a, b]) => ({ severity: b.s - a.s > 120 ? "FAIL" : "WARN", metres: +(b.s - a.s).toFixed(2),
    tStart: +a.t.toFixed(5), tEnd: +b.t.toFixed(5), fromXYZ: fmt(groundTarget(a.p, 0)), toXYZ: fmt(groundTarget(b.p, 0)) })));
  // Exclude the adjacent 30 m of the same branch; retain ordinary river proximity.
  const river = Array.from({ length: Math.ceil(riverLength()) + 1 }, (_, i) => riverPointAt(i / Math.ceil(riverLength())));
  for (const kind of ["path/path", "path/river"]) {
    const rows = samples.map(a => {
      const others = kind === "path/path" ? samples.filter(b => Math.abs(b.s - a.s) > 30).map(b => b.p) : river;
      return { ...a, distance: Math.min(...others.map(b => Math.hypot(a.p.x - b.x, a.p.z - b.z))) };
    });
    console.log(`Potential wrong turns ${kind}: <25 m, grouped along route (river banks are candidates, not proven mistakes).`);
    console.table(runs(rows, a => a.distance < 25).map(([a, b]) => ({ tStart: +a.t.toFixed(5), tEnd: +b.t.toFixed(5),
      fromXZ: `${a.p.x.toFixed(2)}, ${a.p.z.toFixed(2)}`, toXZ: `${b.p.x.toFixed(2)}, ${b.p.z.toFixed(2)}`,
      minMetres: +Math.min(...rows.filter(r => r.s >= a.s && r.s <= b.s).map(r => r.distance)).toFixed(2) })));
  }
  console.log("Limits: terrain march 0.25 m; point landmarks; no crowns, props, fog, screen size or player recognition. Final endpoint is sampled but has no forward destination. Human playtest required.");
  if (blind.some(([a, b]) => b.s - a.s > 60)) process.exitCode = 1;
} finally {
  await server.close();
}
