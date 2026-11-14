import { describe, expect, it, vi } from "vitest";
import { InstancedMesh, Matrix4, PerspectiveCamera, Scene, Vector3 } from "three";
import { createBirdAgent, stepBird } from "../../../src/features/world/fauna/flight";
import { createBirdGeometry } from "../../../src/features/world/fauna/geometry";
import { birdGeometryLod, createBirds } from "../../../src/features/world/fauna/birds";
import { ZONES } from "../../../src/features/world/layout/zones";
import { createBirdPerches } from "../../../src/features/world/fauna/perches";
import { createFirstLightGrove } from "../../../src/features/world/foliage/first-light-grove";
import { surfaceHeight } from "../../../src/features/world/scene/compose";
import { nearestPath } from "../../../src/features/world/terrain/samples";

describe("birds in the world", () => {
  it("keeps detailed nearby birds and uses hysteresis for distant High/Balanced flocks", () => {
    expect(birdGeometryLod(10, "High", false)).toBe(false);
    expect(birdGeometryLod(49, "High", false)).toBe(true);
    expect(birdGeometryLod(44, "High", true)).toBe(true);
    expect(birdGeometryLod(39, "High", true)).toBe(false);
    expect(birdGeometryLod(41, "Balanced", false)).toBe(true);
    expect(birdGeometryLod(31, "Balanced", true)).toBe(false);
    expect(birdGeometryLod(0, "Low", false)).toBe(true);
  });
  it("flushes only nearby perched birds, climbs continuously and lands after the player leaves", () => {
    const bird = createBirdAgent(new Vector3(0, 3, 0), 0.8, true);
    const far = new Vector3(40, 1, 40), near = new Vector3(1, 1, 1);
    stepBird(bird, 1, 0.1, far);
    expect(bird.flight).toBe(0);
    const previous = bird.position.clone();
    stepBird(bird, 1.1, 0.1, near);
    expect(bird.flight).toBeGreaterThan(0);
    expect(bird.position.distanceTo(previous)).toBeLessThan(0.1);
    for (let i = 0; i < 35; i++) stepBird(bird, 1.2 + i * 0.1, 0.1, near);
    expect(bird.flight).toBe(1);
    expect(bird.position.y).toBeGreaterThan(6);
    for (let i = 0; i < 60; i++) stepBird(bird, 5 + i * 0.1, 0.1, far);
    expect(bird.flight).toBe(0);
    expect(bird.position).toEqual(bird.home);
  });

  it("freezes takeoff and the flight path for pause/invalid deltas", () => {
    const bird = createBirdAgent(new Vector3(), 1, true);
    for (const dt of [0, -1, NaN, Infinity]) stepBird(bird, 10, dt, new Vector3());
    expect(bird.flight).toBe(0);
    expect(bird.position).toEqual(bird.home);
  });

  it("has smooth detailed anatomy, independent wing attributes, and a cheaper Low mesh", () => {
    for (const gull of [false, true]) {
      const high = createBirdGeometry(gull), low = createBirdGeometry(gull, true);
      expect(low.index!.count).toBeLessThan(high.index!.count / 2);
      expect(high.getAttribute("position").count).toBe(high.getAttribute("wing").count);
      expect(new Set(high.getAttribute("wing").array)).toEqual(new Set([-1, 0, 1]));
      expect(Array.from(high.getAttribute("normal").array).every(Number.isFinite)).toBe(true);
      high.dispose(); low.dispose();
    }
  });

  it("folds wings along the tail without lowering the flight feathers below the feet", () => {
    const g = createBirdGeometry(false);
    const folded = g.getAttribute("foldedPosition"), wing = g.getAttribute("wing");
    let foldedSpan = 0, flyingSpan = 0;
    for (let i = 0; i < wing.count; i++) {
      if (!wing.getX(i)) continue;
      expect(folded.getY(i)).toBeGreaterThan(-0.20);
      foldedSpan = Math.max(foldedSpan, Math.abs(folded.getX(i)));
      flyingSpan = Math.max(flyingSpan, Math.abs(g.getAttribute("position").getX(i)));
    }
    expect(foldedSpan).toBeLessThan(flyingSpan * 0.65);
    const variants = [0, 1, 2].map(species => createBirdGeometry(false, true, species));
    expect(variants[0]!.getAttribute("color").array).not.toEqual(variants[1]!.getAttribute("color").array);
    expect(variants[1]!.getAttribute("color").array).not.toEqual(variants[2]!.getAttribute("color").array);
    variants.forEach(variant => variant.dispose()); g.dispose();
  });

  it("defers construction, seats birds on actual trunks, culls, keeps perches on Low and disposes once", () => {
    const scene = new Scene(), camera = new PerspectiveCamera();
    const grove = new InstancedMesh(createBirdGeometry(false), undefined, 3);
    grove.name = "first-light-grove-trees-0";
    const anchor = ZONES[0]!.position;
    for (let i = 0; i < 3; i++) grove.setMatrixAt(i, new Matrix4().makeTranslation(anchor.x + 9, anchor.y, anchor.z + i * 3));
    scene.add(grove);
    const birds = createBirds(scene);
    expect(birds.group.children).toHaveLength(0);
    for (const _ of birds.build) void _;
    const first = birds.batches[0]!;
    const perchBatches = birds.batches.filter(batch => batch.agents.some(bird => bird.perched));
    const perched = perchBatches.flatMap(batch => batch.agents);
    expect(perched).toHaveLength(3);
    expect(perched.every(bird => bird.home.distanceTo(anchor) < 12)).toBe(true);
    birds.update(0.05, false, anchor, "High");
    expect(first.mesh.visible).toBe(true);
    expect(first.mesh.count).toBe(9);
    expect(perchBatches.map(batch => batch.mesh.count)).toEqual([1, 1, 1]);
    const snapshot = first.mesh.instanceMatrix.array.slice();
    birds.update(0, false, anchor, "High");
    expect(first.mesh.instanceMatrix.array).toEqual(snapshot);
    const highTriangles = first.high.index!.count / 3 * first.mesh.count;
    birds.update(0.05, false, anchor, "Low");
    expect(first.mesh.count).toBe(3);
    expect(perchBatches.map(batch => batch.mesh.count)).toEqual([1, 1, 1]);
    expect(first.mesh.geometry).toBe(first.low);
    expect(first.low.index!.count / 3 * first.mesh.count).toBeLessThan(highTriangles / 3);
    const sample = birds.listener(perched[0]!.home, camera);
    expect(sample.distance).toBe(0);
    expect(sample.pan).toBeGreaterThanOrEqual(-1);
    birds.update(0.05, false, new Vector3(1e6, 1e6, 1e6), "High");
    expect(birds.batches.every(batch => !batch.mesh.visible)).toBe(true);
    const dispose = vi.spyOn(first.high, "dispose");
    birds.dispose(); birds.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(scene.getObjectByName("hr-birds")).toBeUndefined();
    grove.geometry.dispose(); grove.dispose();
  });

  it("uses all three HR grove variants and keeps low limbs in view from the route on both qualities", () => {
    const scene = new Scene(), anchor = ZONES[0]!.position;
    const grove = createFirstLightGrove(surfaceHeight, [], true); scene.add(grove.group);
    const { perches, branch } = createBirdPerches(scene, anchor);
    expect(perches).toHaveLength(3);
    expect(perches.map(perch => perch.species)).toEqual([0, 1, 2]);
    expect(Math.min(...perches.map(({ home }) => Math.hypot(home.x - anchor.x, home.z - anchor.z)))).toBeLessThan(12);
    for (const { home } of perches) {
      const path = nearestPath(home.x, home.z);
      expect(path.distance).toBeLessThan(18);
      expect(home.y - surfaceHeight(path.x, path.z)).toBeGreaterThan(1);
      expect(home.y - surfaceHeight(path.x, path.z)).toBeLessThan(5);
    }
    grove.setQuality("Low");
    const low = createBirdPerches(scene, anchor);
    expect(low.perches).toEqual(perches);
    // Branch construction creates neither extra scene nodes nor detached roots.
    expect(branch!.geometry.getAttribute("position").array.every(Number.isFinite)).toBe(true);
    for (const mesh of [branch!, low.branch!]) { mesh.geometry.dispose(); (mesh.material as import("three").Material).dispose(); }
    grove.dispose();
  });

  it.runIf(process.env.TQA_BIRDS_ABBA === "1")("records isolated CPU ABBA and local geometry counts", () => {
    const scene = new Scene(), player = ZONES[0]!.position;
    const grove = createFirstLightGrove(surfaceHeight, [], true); scene.add(grove.group);
    const birds = createBirds(scene);
    for (const _ of birds.build) void _;
    for (let i = 0; i < 100; i++) birds.update(1 / 60, false, player, "High");
    let baseline = 0;
    const measure = (enabled: boolean) => {
      const start = performance.now();
      for (let i = 0; i < 2000; i++) {
        if (enabled) birds.update(1 / 60, false, player, "High");
        else baseline += 1 / 60;
      }
      return (performance.now() - start) / 2000;
    };
    const abba = [false, true, true, false].map(enabled => ({ enabled, ms: measure(enabled) }));
    console.log("HR-BIRDS CPU ABBA ms/update", JSON.stringify(abba), "baseline", baseline);
    console.log("HR-BIRDS geometry", JSON.stringify(birds.batches.map(({ mesh, high, low }) => ({ flock: mesh.name, highTrianglesPerBird: high.index!.count / 3, lowTrianglesPerBird: low.index!.count / 3, count: mesh.count }))));
    birds.dispose(); grove.dispose();
  });
});
