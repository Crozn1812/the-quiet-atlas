import { createHash } from "node:crypto";
import { Box3, BufferGeometry, Color, Group, Mesh, MeshToonMaterial, Raycaster, Scene, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../../src/features/world/art/palette";
import * as rockKit from "../../../../src/features/world/props/rocks";
import * as woodKit from "../../../../src/features/world/props/wood";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { createWorldScene, surfaceHeight } from "../../../../src/features/world/scene/compose";
import { createMeshPhysics } from "../../../../src/features/world/scene/mesh-physics";
import { placeZoneScenes, zoneFoliageBounds } from "../../../../src/features/world/zones";
import { createWorkshopScene } from "../../../../src/features/world/zones/workshop";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneScene, type ZoneSceneContext } from "../../../../src/features/world/zones/types";

const flat: ZoneSceneContext = {
  seed: 103, heightAt: () => 0,
  onPath: x => Math.abs(x) <= 2.6, underWater: () => false,
};
const scenes: ZoneScene[] = [];
function create(overrides: Partial<ZoneSceneContext> = {}) {
  const scene = createWorkshopScene({ ...flat, ...overrides });
  scenes.push(scene);
  scene.group.updateMatrixWorld(true);
  return scene;
}
function meshes(scene: ZoneScene): Mesh<BufferGeometry, MeshToonMaterial>[] {
  const result: Mesh<BufferGeometry, MeshToonMaterial>[] = [];
  scene.group.traverse(object => { if (object instanceof Mesh) result.push(object); });
  return result;
}
function vertices(mesh: Mesh): Vector3[] {
  const positions = mesh.geometry.getAttribute("position");
  return Array.from({ length: positions.count }, (_, i) => new Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld));
}
function snapshot(scene: ZoneScene) {
  return {
    meshes: meshes(scene).map(mesh => ({
      name: mesh.name, matrix: mesh.matrixWorld.toArray(), color: mesh.material.color.toArray(),
      attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attr]) => [name, Array.from(attr.array)])),
      index: mesh.geometry.index && Array.from(mesh.geometry.index.array), groups: mesh.geometry.groups,
    })),
    colliders: scene.colliders, interactable: scene.interactable,
  };
}
function transforms(scene: ZoneScene) {
  const result: number[][] = [];
  scene.group.updateMatrixWorld(true);
  scene.group.traverse(object => result.push(object.matrixWorld.toArray()));
  return result;
}

afterEach(() => {
  scenes.splice(0).forEach(scene => scene.dispose());
  vi.restoreAllMocks();
  disposeRampGradients();
});

describe("workshop bank set-piece", () => {
  it("merges by pigment, stays inside all budgets and has finite nondegenerate faces", () => {
    const scene = create();
    let triangles = 0;
    const parts = meshes(scene);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.length).toBeLessThanOrEqual(ZONE_BUDGET.drawCalls);
    for (const mesh of parts) {
      const geometry = mesh.geometry;
      triangles += (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
      expect(geometry.groups).toHaveLength(0);
      expect(geometry.boundingBox).not.toBeNull();
      expect(geometry.boundingSphere).not.toBeNull();
      const points = vertices(mesh);
      for (const v of points) {
        expect(v.toArray().every(Number.isFinite)).toBe(true);
        expect(v.length()).toBeLessThanOrEqual(ZONE_BUDGET.radius);
      }
      for (let i = 0; i < points.length; i += 3) {
        const a = points[i]!, b = points[i + 1]!, c = points[i + 2]!;
        expect(b.clone().sub(a).cross(c.clone().sub(a)).length()).toBeGreaterThan(1e-9);
      }
    }
    expect(triangles).toBeLessThanOrEqual(ZONE_BUDGET.triangles);
    expect(triangles).toBeLessThanOrEqual(3680 * 1.5); // B2-203: round-4 growth ceiling.
    const pigments = parts.map(mesh => mesh.material);
    expect(new Set(pigments).size).toBe(7); // The animated sprig shares moss with the roof.
    console.info(`Workshop budget: ${triangles} triangles, ${parts.length} draw calls`);
  });

  it("is exactly deterministic for a seed, including colliders, labels and vertex washes", () => {
    expect(snapshot(create())).toEqual(snapshot(create()));
    const first = create({ seed: 5 }), second = create({ seed: 1000000005 });
    expect(meshes(first)[0]!.geometry.getAttribute("position").array)
      .toEqual(meshes(second)[0]!.geometry.getAttribute("position").array);
    expect(meshes(first)[0]!.geometry.getAttribute("color").array)
      .not.toEqual(meshes(second)[0]!.geometry.getAttribute("color").array);
  });

  const masks = [
    { name: "flat dry ground", context: flat },
    { name: "sloped stream bank", context: { ...flat, heightAt: (x: number, z: number) => x * 0.035 + z * 0.02, underWater: (x: number) => x >= 4 } },
    { name: "path bending into the first site", context: { ...flat, onPath: (x: number, z: number) => Math.abs(x) <= 2.6 || (x < -3 && Math.abs(z) < 1) } },
    { name: "wet landward bank", context: { ...flat, underWater: (x: number) => x < -3 } },
    { name: "water pocket between the corners", context: { ...flat, underWater: (x: number, z: number) => Math.hypot(x + 6, z) < 0.7 } },
  ];
  it.each(masks)("keeps complete faces and collider footprints dry and clear on $name", ({ context }) => {
    const scene = create(context);
    for (const mesh of meshes(scene)) {
      const points = vertices(mesh);
      // Vertices and triangle interiors, rather than only merged mesh centres.
      for (let i = 0; i < points.length; i += 3) {
        const a = points[i]!, b = points[i + 1]!, c = points[i + 2]!;
        for (let u = 0; u <= 4; u++) for (let v = 0; v <= 4 - u; v++) {
          const p = a.clone().multiplyScalar(u / 4).addScaledVector(b, v / 4).addScaledVector(c, 1 - (u + v) / 4);
          expect(Math.abs(p.x)).toBeGreaterThan(PATH_CLEARANCE);
          expect(context.onPath(p.x, p.z)).toBe(false);
          expect(context.underWater(p.x, p.z)).toBe(false);
          expect(p.length()).toBeLessThanOrEqual(ZONE_BUDGET.radius);
        }
      }
    }
    expect(scene.colliders.length).toBeGreaterThan(5);
    for (const collider of scene.colliders) {
      expect(collider.yaw ?? 0).toBe(0);
      expect(collider.size.toArray().every(n => n > 0 && Number.isFinite(n))).toBe(true);
      for (let u = 0; u <= 20; u++) for (let v = 0; v <= 20; v++) {
        const x = collider.center.x + (u / 20 - 0.5) * collider.size.x;
        const z = collider.center.z + (v / 20 - 0.5) * collider.size.z;
        expect(Math.abs(x)).toBeGreaterThan(PATH_CLEARANCE);
        expect(context.onPath(x, z)).toBe(false);
        expect(context.underWater(x, z)).toBe(false);
        expect(Math.hypot(x, z, Math.abs(collider.center.y) + collider.size.y / 2)).toBeLessThanOrEqual(ZONE_BUDGET.radius);
      }
    }
    const p = scene.interactable.position;
    expect(context.underWater(p.x, p.z)).toBe(false);
    expect(context.onPath(p.x, p.z)).toBe(false);
    const gap = Math.abs(p.x) - PATH_CLEARANCE;
    expect(gap).toBeGreaterThanOrEqual(2);
    expect(gap).toBeLessThanOrEqual(6);
    const edge = new Vector3(Math.sign(p.x) * PATH_CLEARANCE, context.heightAt(Math.sign(p.x) * PATH_CLEARANCE, p.z), p.z);
    expect(edge.distanceTo(p)).toBeLessThanOrEqual(2.5);
    // A standing player can see the working surface on either bank and after relocation.
    const eye = edge.clone().add(new Vector3(0, 1.6, 0));
    const target = p.clone().add(new Vector3(0, 0.075, 0));
    const sightline = new Raycaster(eye, target.clone().sub(eye).normalize(), 0, eye.distanceTo(target));
    expect(sightline.intersectObjects(meshes(scene))).toHaveLength(0);
  });

  it("grounds separate bench legs and shed posts on a gentle slope while keeping the roof straight", () => {
    const context = { ...flat, heightAt: (x: number, z: number) => x * 0.035 + z * 0.02 };
    const scene = create(context);
    const wood = meshes(scene).filter(mesh => mesh.name === "workshop-wood");
    for (const x of [-5.08, -4.42, -3.65]) {
      const zs = x === -3.65 ? [-2.95, 2.95] : [-1.5, 1.5];
      for (const z of zs) {
        const foot = context.heightAt(x, z);
        const hit = new Raycaster(new Vector3(x, foot - 0.5, z), new Vector3(0, 1, 0)).intersectObjects(wood)[0];
        expect(hit?.point.y).toBeCloseTo(foot - 0.04, 5);
      }
    }
    const roof = meshes(scene).find(mesh => mesh.name === "workshop-roof")!;
    const heights = [-7, -6, -5, -4].map(x => new Raycaster(new Vector3(x, 8, 0), new Vector3(0, -1, 0)).intersectObject(roof)[0]!.point.y);
    for (let i = 1; i < heights.length; i++) {
      const degrees = Math.atan(heights[i]! - heights[i - 1]!) * 180 / Math.PI;
      expect(degrees).toBeGreaterThanOrEqual(15);
      expect(degrees).toBeLessThanOrEqual(20);
      // Shared weathered boards bow slightly; the overall mono-pitch stays straight.
      expect(Math.abs((heights[i]! - heights[i - 1]!) - (heights[1]! - heights[0]!))).toBeLessThan(0.02);
    }
    const moss = meshes(scene).find(mesh => mesh.name === "workshop-moss")!;
    expect(moss.material.color.getHex()).toBe(new Color(PALETTE.forestDeep).getHex());
    for (const [x, z] of [[-6.9, 1.65], [-6.3, -2.1]]) {
      const ray = new Raycaster(new Vector3(x!, 8, z!), new Vector3(0, -1, 0));
      const roofTop = ray.intersectObject(roof)[0]!.point.y;
      const mossTop = ray.intersectObject(moss)[0]!.point.y;
      expect(mossTop - roofTop).toBeGreaterThan(0.02);
      expect(mossTop - roofTop).toBeLessThan(0.1);
    }
  });

  it("exposes forestDeep moss above at least a quarter of the roof", () => {
    const parts = meshes(create());
    const roof = parts.find(mesh => mesh.name === "workshop-roof")!;
    const moss = parts.find(mesh => mesh.name === "workshop-moss")!;
    expect(moss.material.color.getHex()).toBe(new Color(PALETTE.forestDeep).getHex());
    const bounds = new Box3().setFromObject(roof);
    let roofSamples = 0, visibleMossSamples = 0;
    // Count actual visible coverage, including board gaps and the mats' uneven edges.
    for (let ix = 0; ix < 48; ix++) for (let iz = 0; iz < 72; iz++) {
      const x = bounds.min.x + (ix + 0.5) / 48 * (bounds.max.x - bounds.min.x);
      const z = bounds.min.z + (iz + 0.5) / 72 * (bounds.max.z - bounds.min.z);
      const ray = new Raycaster(new Vector3(x, 8, z), new Vector3(0, -1, 0));
      const roofHit = ray.intersectObject(roof)[0];
      const mossHit = ray.intersectObject(moss)[0];
      if (!roofHit) continue;
      roofSamples++;
      if (mossHit && mossHit.point.y > roofHit.point.y + 0.015) visibleMossSamples++;
    }
    expect(roofSamples).toBeGreaterThan(3000);
    expect(visibleMossSamples / roofSamples).toBeGreaterThanOrEqual(0.25);
    console.info(`Workshop visible roof moss: ${(100 * visibleMossSamples / roofSamples).toFixed(1)}%`);
  });

  it("has one broad ink inner wall visible through the open front behind the tools", () => {
    const parts = meshes(create());
    const ink = parts.find(mesh => mesh.name === "workshop-ink")!;
    expect(ink.material.color.getHex()).toBe(new Color(PALETTE.rockDark).lerp(new Color(PALETTE.indigo), 0.3).getHex());
    // Several rays across the upper rear wall must see ink before wood or the bank.
    for (const z of [-2.4, -1.2, 0, 1.2, 2.4]) {
      const hit = new Raycaster(new Vector3(-2.8, 2.05, z), new Vector3(-1, 0, 0)).intersectObjects(parts)[0];
      expect(hit?.object).toBe(ink);
      expect(hit!.point.x).toBeCloseTo(-7.5225, 4);
    }
  });

  it("places the workshop through the real terrain composer without throwing", () => {
    const placed = placeZoneScenes(surfaceHeight);
    try {
      expect(placed).toHaveLength(8);
      const workshop = placed.find(zone => zone.zoneId === "workshop")!;
      expect(workshop).toBeDefined();
      expect(workshop.group.position.y).toBe(surfaceHeight(workshop.layout.position.x, workshop.layout.position.z));
      expect(workshop.target.position.toArray().every(Number.isFinite)).toBe(true);
      expect(meshes(workshop).length).toBeLessThanOrEqual(ZONE_BUDGET.drawCalls);
    } finally {
      placed.forEach(zone => zone.dispose());
    }
  });

  it("places two grounded wooden crates and a hollow rope coil outside the side wall", () => {
    const heightAt = (x: number, z: number) => x * 0.035 + z * 0.02;
    const scene = create({ heightAt });
    const wood = meshes(scene).find(mesh => mesh.name === "workshop-wood")!;
    expect(wood.material.color.getHex()).toBe(0xffffff); // Preserve the kit's vertex pigments.
    const outdoor = scene.colliders.filter(collider => collider.center.x < 0 && collider.center.z > 3.35);
    expect(outdoor).toHaveLength(3);
    const [first, second, coil] = outdoor;
    for (const crate of [first!, second!]) {
      const { center, size } = crate;
      expect(center.z - size.z / 2).toBeGreaterThan(3.35);
      const foot = heightAt(center.x + (size.x - 0.025) / 2, center.z + size.z / 2);
      expect(center.y - size.y / 2).toBeCloseTo(foot, 5);
      const hit = new Raycaster(new Vector3(center.x, 4, center.z), new Vector3(0, -1, 0)).intersectObjects(meshes(scene))[0];
      expect(hit?.object).toBe(wood);
      expect(Math.abs(hit!.point.y - (foot + size.z))).toBeLessThan(0.055);
    }
    const { center, size } = coil!;
    const foot = heightAt(center.x + size.x / 2, center.z + size.z / 2);
    expect(center.y - size.y / 2).toBeCloseTo(foot, 5);
    const down = new Vector3(0, -1, 0);
    expect(new Raycaster(new Vector3(center.x, 4, center.z), down).intersectObject(wood)).toHaveLength(0);
    const rim = new Raycaster(new Vector3(center.x + 0.28, 4, center.z), down).intersectObject(wood)[0];
    expect(rim!.point.y).toBeCloseTo(foot + size.y, 5);
  });

  it("shows a small tool box, wound roll and blank paper on the bench", () => {
    const scene = create();
    const wood = meshes(scene).find(mesh => mesh.name === "workshop-wood")!;
    const paper = meshes(scene).find(mesh => mesh.name === "workshop-paper")!;
    const down = new Vector3(0, -1, 0);
    const top = (mesh: Mesh, x: number, z: number) => new Raycaster(new Vector3(x, 2, z), down).intersectObject(mesh)[0]!.point.y;
    expect(Math.abs(top(wood, -4.62, 1.25) - 1.25)).toBeLessThan(0.05);
    expect(top(wood, -4.75, -1.1)).toBeCloseTo(1.26, 5);
    expect(top(paper, -4.75, -0.4)).toBeCloseTo(1.022, 5);
  });

  it("uses broad ink accents and exactly two tiny flower-coloured details", () => {
    const scene = create();
    const area = (mesh: Mesh) => {
      const points = vertices(mesh);
      let total = 0;
      for (let i = 0; i < points.length; i += 3) {
        total += points[i + 1]!.clone().sub(points[i]!).cross(points[i + 2]!.clone().sub(points[i]!)).length() / 2;
      }
      return total;
    };
    const parts = meshes(scene);
    const ink = parts.find(mesh => mesh.name === "workshop-ink")!;
    const inkFraction = area(ink) / parts.reduce((total, mesh) => total + area(mesh), 0);
    expect(inkFraction).toBeGreaterThan(0.07);
    expect(inkFraction).toBeLessThan(0.16); // Open slatted crates expose more of the dark backing.
    const flower = parts.find(mesh => mesh.name === "workshop-flower")!;
    expect(flower.material.color.getHex()).toBe(new Color(PALETTE.flower).getHex());
    // Each low-poly accent is a separate eight-face octahedron, 12 cm across.
    const points = vertices(flower);
    expect(points).toHaveLength(2 * 8 * 3);
    for (let i = 0; i < points.length; i += 24) {
      const size = new Box3().setFromPoints(points.slice(i, i + 24)).getSize(new Vector3());
      for (const dimension of size.toArray()) {
        expect(dimension).toBeGreaterThanOrEqual(0.1);
        expect(dimension).toBeLessThanOrEqual(0.15);
      }
    }
    expect(area(flower) / parts.reduce((total, mesh) => total + area(mesh), 0)).toBeLessThan(0.001);
  });

  it("reads as three walls, an open front, a usable bench and a paper sketch on an easel", () => {
    const scene = create();
    const wood = meshes(scene).filter(mesh => mesh.name === "workshop-wood");
    const ray = (origin: Vector3, direction: Vector3) => new Raycaster(origin, direction).intersectObjects(wood)[0];
    expect(Math.abs(ray(new Vector3(-2.8, 2.1, 0.3), new Vector3(-1, 0, 0))!.point.x + 7.59)).toBeLessThan(0.06);
    for (const sign of [-1, 1]) expect(Math.abs(ray(new Vector3(-6, 1.7, 0), new Vector3(0, 0, sign))!.point.z - sign * 2.89)).toBeLessThan(0.06);
    expect(Math.abs(ray(new Vector3(-4.75, 2, 0), new Vector3(0, -1, 0))!.point.y - 1.005)).toBeLessThan(0.035);
    const paper = meshes(scene).find(mesh => mesh.name === "workshop-paper")!;
    expect(new Raycaster(new Vector3(-3, 1.43, -4.25), new Vector3(-1, 0, 0)).intersectObject(paper)[0]).toBeDefined();
  });

  it("stops the descending stone steps before water and does not place submerged props", () => {
    const scene = create({ underWater: x => x > 3.55 });
    const stone = meshes(scene).find(mesh => mesh.name === "workshop-stone")!;
    const bounds = new Box3().setFromObject(stone);
    expect(bounds.min.x).toBeCloseTo(2.84, 5);
    expect(bounds.max.x).toBeCloseTo(3.46, 5);
    expect(bounds.max.y).toBeCloseTo(0.36, 5);
    expect(meshes(create({ underWater: x => x > 2.7 })).some(mesh => mesh.name === "workshop-stone")).toBe(false);
    const dry = create();
    const allSteps = meshes(dry).find(mesh => mesh.name === "workshop-stone")!;
    const top = (x: number) => new Raycaster(new Vector3(x, 2, 4.7), new Vector3(0, -1, 0)).intersectObject(allSteps)[0]!.point.y;
    expect([3.15, 3.82, 4.49].map(top)).toEqual(expect.arrayContaining([expect.closeTo(0.36), expect.closeTo(0.26), expect.closeTo(0.16)]));
  });

  it("preserves kit palette pigments and uses neutral washes on other surfaces, without lettering", () => {
    const colors = {
      wood: new Color(0xffffff),
      roof: new Color(PALETTE.rockDark),
      moss: new Color(PALETTE.forestDeep),
      paper: new Color(PALETTE.cloud), ink: new Color(PALETTE.rockDark).lerp(new Color(PALETTE.indigo), 0.3),
      stone: new Color(0xffffff),
      flower: new Color(PALETTE.flower),
    };
    for (const mesh of meshes(create())) {
      expect(mesh.name).not.toMatch(/text|logo/i);
      expect(mesh.material).toBeInstanceOf(MeshToonMaterial);
      const pigment = mesh.material.name.replace("workshop-", "") as keyof typeof colors;
      expect(mesh.material.color.getHex()).toBe(colors[pigment].getHex());
      if (pigment === "wood" || pigment === "stone") {
        const vector = (color: Color) => new Vector3(...color.toArray());
        const rock = new Color(PALETTE.rock), dark = new Color(PALETTE.rockDark);
        const endpoints = [rock.clone().lerp(new Color(PALETTE.dusk), 0.08),
          dark.clone().lerp(new Color(PALETTE.dusk), 0.08)].map(vector);
        const rope = rock.clone().lerp(new Color(PALETTE.dusk), 0.12);
        const stoneColors = [dark, rock, dark.clone().lerp(rock, 0.72),
          rock.clone().lerp(new Color(PALETTE.sand), 0.16),
          rock.clone().lerp(new Color(PALETTE.grass), 0.42)].map(vector);
        const distanceToSegment = (p: Vector3, a: Vector3, b: Vector3) => {
          const ab = b.clone().sub(a);
          return p.distanceTo(a.clone().addScaledVector(ab, Math.max(0, Math.min(1,
            p.clone().sub(a).dot(ab) / ab.lengthSq()))));
        };
        const attribute = mesh.geometry.getAttribute("color");
        for (let i = 0; i < attribute.count; i++) {
          const p = new Vector3().fromBufferAttribute(attribute, i);
          const distance = pigment === "stone" ? Math.min(...stoneColors.map(c => c.distanceTo(p)))
            : Math.min(distanceToSegment(p, endpoints[0]!, endpoints[1]!),
              distanceToSegment(p, vector(rope.clone().multiplyScalar(0.91)), vector(rope)));
          expect(distance).toBeLessThan(1e-6);
          expect(p.dot(new Vector3(0.2126, 0.7152, 0.0722))).toBeGreaterThanOrEqual(0.06);
        }
        continue;
      }
      const paper = new Vector3(...new Color(PALETTE.paper).toArray());
      if (pigment !== "paper") {
        expect(new Vector3(...mesh.material.color.toArray()).distanceTo(paper)).toBeGreaterThan(0.08);
      }
      expect(mesh.material.vertexColors).toBe(true);
      expect(mesh.material.gradientMap).not.toBeNull();
      const wash = mesh.geometry.getAttribute("color");
      const shades = new Set<number>();
      for (let i = 0; i < wash.count; i++) {
        expect(wash.getX(i)).toBe(wash.getY(i));
        expect(wash.getX(i)).toBe(wash.getZ(i));
        expect(wash.getX(i)).toBeGreaterThanOrEqual(0.91);
        expect(wash.getX(i)).toBeLessThanOrEqual(1);
        shades.add(wash.getX(i));
        if (pigment !== "paper") {
          const color = mesh.material.color.clone().multiplyScalar(wash.getX(i));
          expect(new Vector3(...color.toArray()).distanceTo(paper)).toBeGreaterThan(0.08);
        }
      }
      expect(shades.size).toBeGreaterThan(3);
    }
  });

  it("keeps the low moss and fern details grounded inside the shed footprint", () => {
    const scene = create();
    const moss = meshes(scene).find(mesh => mesh.name === "workshop-moss")!;
    const positions = moss.geometry.getAttribute("position");
    const details = Array.from({ length: positions.count }, (_, i) =>
      new Vector3().fromBufferAttribute(positions, i)).filter(p => p.y < 0.4 && p.x > -7.5);
    expect(details.length).toBeGreaterThan(0);
    for (const p of details) {
      expect(p.x).toBeGreaterThan(-8.05);
      expect(p.x).toBeLessThan(-3.15);
      expect(Math.abs(p.z)).toBeLessThan(2.95);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(0.4 + 1e-6);
    }
    const total = meshes(scene).reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3, 0);
    expect(total).toBeLessThanOrEqual(3680 * 1.5);
  });

  it("exports the workshop target with the exact EN/VI labels and a reachable bench centre", () => {
    const scene = create();
    expect(scene.zoneId).toBe("workshop");
    expect(scene.interactable.position.toArray()).toEqual([-4.75, 0.94, 0]);
    expect(scene.interactable.label).toEqual({ en: "Workbench by the stream", vi: "Bàn thợ cạnh suối" });
  });

  it("moves only the small sprig slowly and freezes every transform in reduced motion", () => {
    const scene = create();
    const before = transforms(scene);
    const staticTransforms = meshes(scene).filter(mesh => mesh.parent === scene.group).map(mesh => ({ mesh, matrix: mesh.matrixWorld.toArray() }));
    for (let i = 0; i < 100; i++) scene.update!(1 / 60, true);
    expect(transforms(scene)).toEqual(before);
    scene.update!(1 / 60, false);
    const moved = transforms(scene);
    expect(moved).not.toEqual(before);
    const sprig = scene.group.getObjectByName("workshop-hanging-sprig")!;
    expect(Math.abs(sprig.rotation.z)).toBeLessThan(0.001);
    staticTransforms.forEach(({ mesh, matrix }) => expect(mesh.matrixWorld.toArray()).toEqual(matrix));
    for (let i = 0; i < 100; i++) scene.update!(1, true);
    expect(transforms(scene)).toEqual(moved);
    for (const dt of [NaN, Infinity, -1, 0]) scene.update!(dt, false);
    expect(transforms(scene)).toEqual(moved);
  });

  it("releases temporary and merged geometry plus every owned material exactly once", () => {
    const released = new Set<BufferGeometry>();
    const original = BufferGeometry.prototype.dispose;
    const spy = vi.spyOn(BufferGeometry.prototype, "dispose").mockImplementation(function (this: BufferGeometry) {
      expect(released.has(this)).toBe(false);
      released.add(this);
      original.call(this);
    });
    const scene = create();
    const parts = meshes(scene), ownedMaterials = [...new Set(parts.map(mesh => mesh.material))];
    const callbacks = ownedMaterials.map(material => { const fn = vi.fn(); material.addEventListener("dispose", fn); return fn; });
    const rampDisposed = vi.fn();
    ownedMaterials[0]!.gradientMap!.addEventListener("dispose", rampDisposed);
    expect(spy.mock.calls.length).toBeGreaterThan(80);
    const holder = new Group(); holder.add(scene.group);
    scene.dispose(); scene.dispose(); scene.update!(1, false);
    parts.forEach(mesh => expect(released.has(mesh.geometry)).toBe(true));
    callbacks.forEach(fn => expect(fn).toHaveBeenCalledTimes(1));
    expect(rampDisposed).not.toHaveBeenCalled();
    expect(holder.children).toHaveLength(0);
    expect(scene.group.children).toHaveLength(0);
  });

  it("rejects a fully flooded context before allocating any geometry or material", () => {
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    expect(() => createWorkshopScene({ ...flat, underWater: () => true })).toThrow(/dry bank/);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("locks the round-4 kit geometry fingerprint", () => {
    const scene = create();
    scene.group.updateMatrixWorld(true);
    const triangles: string[] = [];
    for (const mesh of meshes(scene)) {
      if (mesh.name.includes("moss")) continue; // Shared fern topology can evolve independently.
      const positions = mesh.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i += 3) {
        triangles.push([0, 1, 2].flatMap(offset => new Vector3().fromBufferAttribute(positions, i + offset)
          .applyMatrix4(mesh.matrixWorld).toArray().map(value => value.toFixed(5))).join(","));
      }
    }
    const fingerprint = createHash("sha256").update(JSON.stringify({
      triangles: triangles.sort(), colliders: scene.colliders, interactable: scene.interactable,
    })).digest("hex");
    // B2-203 replaces box wood/steps with shared grain/bevel/slab assets and adds bench tools.
    // RC-02 replaces abstract ink strokes with the readable skills board.
    expect(fingerprint).toBe("bb17023b75b3f04a6c2a6ad567843563f721efff559ac93c2eb5687e16a542c7");
  });

  it("uses shared wood and slab assets and keeps every prop cluster below 2000 triangles", () => {
    const planks = vi.spyOn(woodKit, "createPlankGeometry");
    const posts = vi.spyOn(woodKit, "createPostGeometry");
    const rocks = vi.spyOn(rockKit, "createRockGeometry");
    for (const seed of [0, 1, 2, 103, 0xffffffff]) {
      const scene = create({ seed });
      const counts = scene.group.userData.trianglesByCluster as Record<string, number>;
      for (const count of Object.values(counts)) expect(count).toBeLessThanOrEqual(2000);
      const total = meshes(scene).reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3, 0);
      expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(total);
      expect(total).toBeLessThanOrEqual(3680 * 1.5);
    }
    expect(planks).toHaveBeenCalled();
    expect(posts).toHaveBeenCalled();
    expect(rocks.mock.calls.every(([kind]) => kind === "slab")).toBe(true);
    expect(rocks).toHaveBeenCalledTimes(15);
  });

  it("preserves the pre-ticket collider and interaction contract exactly", () => {
    const scene = create();
    expect(createHash("sha256").update(JSON.stringify({
      colliders: scene.colliders, interactable: scene.interactable,
    })).digest("hex")).toBe("949882038074a11ecd256330f42779ba06759b51411ab2d445d8f3bf1e693d0a");
  });

  it("exposes real joints between crate boards and embeds the slabs on sloping ground", () => {
    const scene = create();
    const wood = meshes(scene).find(mesh => mesh.name === "workshop-wood")!;
    const front = (y: number) => new Raycaster(new Vector3(-6.05, y, 4.05), new Vector3(-1, 0, 0))
      .intersectObject(wood)[0]!.point.x;
    expect(front(0.16)).toBeGreaterThan(-6.4);
    expect(front(0.34)).toBeLessThan(-6.85); // Joint opens onto the rear panel.
    const heightAt = (x: number, z: number) => x * 0.035 + z * 0.02;
    const sloped = create({ heightAt });
    const stone = meshes(sloped).find(mesh => mesh.name === "workshop-stone")!;
    const up = new Vector3(0, 1, 0);
    for (const x of [3.15, 3.82, 4.49]) {
      const foot = heightAt(x, 4.7);
      const hit = new Raycaster(new Vector3(x, foot - 0.5, 4.7), up).intersectObject(stone)[0]!;
      expect(hit.point.y - foot).toBeLessThanOrEqual(0.05);
      expect(hit.point.y - foot).toBeGreaterThanOrEqual(-0.1);
    }
  });

  it("reports Node review metrics", () => {
    const durations: number[] = [];
    for (let i = 0; i < 7; i++) {
      const start = performance.now();
      const zone = createWorkshopScene(flat);
      durations.push(performance.now() - start);
      if (i === 0) console.info("Workshop contract:", createHash("sha256").update(JSON.stringify({
        colliders: zone.colliders, interactable: zone.interactable,
      })).digest("hex"), "clusters:", zone.group.userData.trianglesByCluster);
      zone.dispose();
    }
    console.info("Workshop construction median ms:", durations.slice(2).sort((a, b) => a - b)[2]);
    const zones = placeZoneScenes(surfaceHeight);
    const scene = new Scene();
    zones.forEach(zone => scene.add(zone.group));
    const backend = createMeshPhysics();
    const world = createWorldScene({ ...backend, scene, quality: "High",
      zoneBounds: zoneFoliageBounds(zones), zoneBoxes: zones.flatMap(zone => zone.boxes) });
    try {
      world.update(zones.find(zone => zone.zoneId === "workshop")!.group.position, 0);
      let triangles = 0;
      scene.traverse(object => {
        if (!(object instanceof Mesh) || !object.visible) return;
        const count = object.geometry.index?.count ?? object.geometry.getAttribute("position").count;
        const instances = "isInstancedMesh" in object ? (object as import("three").InstancedMesh).count : 1;
        triangles += count / 3 * instances;
      });
      console.info("World High at workshop, visible geometry triangles:", triangles);
      expect(triangles).toBeLessThanOrEqual(153796 * 1.25); // Same Node High composition before B2-203.
    } finally { world.dispose(); zones.forEach(zone => zone.dispose()); }
  }, 30000);

});
