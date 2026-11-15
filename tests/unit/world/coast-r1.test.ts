import { expect, it, vi } from "vitest";
import { Matrix4, ShaderLib, Vector3, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { bindCoastR1Ground, coastR1Weight, createCoastR1Tree, createCoastR1Trees, isCoastR1Tree } from "../../../src/features/world/foliage/coast-r1";
import { bindFirstLightGround } from "../../../src/features/world/foliage/first-light-grove";
import { ZONES } from "../../../src/features/world/layout/zones";
import { createRampMaterial } from "../../../src/features/world/materials/ramp";
import { createTileMesh } from "../../../src/features/world/terrain/mesh";
import { buildTile, TILE_SIZE } from "../../../src/features/world/terrain/tiles";
import { nearestPath } from "../../../src/features/world/terrain/samples";
import { waterLevelAt } from "../../../src/features/world/terrain/height";

it("leaves all forest/hill landmarks alone and feathers into both coastal landmarks without travel state", () => {
  for (const zone of ZONES) expect(isCoastR1Tree(zone.position)).toBe(zone.biome === "coast-dusk");
  expect(coastR1Weight(0.82)).toBe(0); expect(coastR1Weight(0.86)).toBe(1);
  const route = Array.from({ length: 41 }, (_, i) => 0.82 + i * 0.001);
  const weights = route.map(coastR1Weight);
  expect(weights).toEqual(route.toReversed().map(coastR1Weight).reverse());
  weights.slice(1).forEach((weight, i) => {
    expect(weight).toBeGreaterThanOrEqual(weights[i]!);
    expect(weight - weights[i]!).toBeLessThan(0.04);
  });
});

it("keeps three distinct narrow Casuarina Low silhouettes with finite rooted bounds", () => {
  const geometries = [0, 1, 2].map(createCoastR1Tree);
  try {
    expect(new Set(geometries.map(g => Array.from(g.getAttribute("position").array).join(","))).size).toBe(3);
    for (const g of geometries) {
      expect(g.index).toBeNull();
      expect(g.getAttribute("position").count / 3).toBeLessThan(1200);
      // Slanted cylinder end caps sink a few centimetres into the ground, as in First Light.
      expect(g.boundingBox!.min.y).toBeGreaterThan(-0.1);
      expect(g.boundingBox!.min.y).toBeLessThanOrEqual(0);
      expect(g.boundingBox!.max.y).toBeGreaterThanOrEqual(8);
      expect(g.boundingBox!.max.y).toBeLessThanOrEqual(15);
      expect(g.boundingBox!.getSize(new Vector3()).x).toBeLessThan(g.boundingBox!.max.y * 0.6);
      expect(Array.from(g.getAttribute("normal").array).every(Number.isFinite)).toBe(true);
    }
  } finally { geometries.forEach(g => g.dispose()); }
});

it("keeps shrub roots fixed, restores High deterministically and releases every resource once", () => {
  const grove = createCoastR1Trees(Array.from({ length: 24 }, (_, i) => ({
    x: i * 4, y: 2, z: -700 - i * 5, scale: 0.2, lean: 0,
    kind: "broadleaf" as const, growth: "shrub" as const,
  })));
  const original = grove.meshes.map(m => m.instanceMatrix.array.slice());
  const disposals = grove.meshes.flatMap(m => [vi.spyOn(m.geometry, "dispose"), vi.spyOn(m.material, "dispose"), vi.spyOn(m, "dispose")]);
  try {
    expect(grove.group.children).toHaveLength(3);
    grove.setQuality("Low"); grove.setQuality("Balanced"); grove.setQuality("High");
    for (const [i, mesh] of grove.meshes.entries()) {
      expect(mesh.instanceMatrix.array).toEqual(original[i]);
      for (let j = 0; j < mesh.count; j++) {
        const matrix = new Matrix4(); mesh.getMatrixAt(j, matrix);
        expect(new Vector3().setFromMatrixPosition(matrix).y).toBe(2);
        const scale = new Vector3().setFromMatrixScale(matrix);
        expect(scale.y).toBeLessThan(scale.x / 2);
      }
    }
  } finally { grove.dispose(); grove.dispose(); }
  disposals.forEach(spy => expect(spy).toHaveBeenCalledOnce());
});

it("preserves the coastal and First Light fallback shader before deferred photos arrive", () => {
  const material = createRampMaterial(0xffffff);
  bindFirstLightGround(material); bindCoastR1Ground(material);
  try {
    {
      const shader = { ...ShaderLib.toon, uniforms: {} } as WebGLProgramParametersWithUniforms;
      material.onBeforeCompile(shader, {} as WebGLRenderer);
      expect(shader.fragmentShader).toContain("firstLightPigment");
      expect(shader.vertexShader).toContain("vHillSurface = hillSurface");
      expect(shader.fragmentShader).toContain("hillPigment, vHillSurface * 0.85");
      expect(shader.vertexShader).toContain("vCoastSurface = coastSurface");
      expect(shader.fragmentShader).toContain("coastClean, vCoastSurface * 0.85");
    }
  } finally { material.dispose(); }
});

it("bakes the clean coastal surface only on dry land beyond the road, leaving hill/forest vertices alone", () => {
  const material = createRampMaterial(0xffffff);
  try {
    for (const id of ["roots", "horizon", "quiet-shore"] as const) {
      const zone = ZONES.find(z => z.id === id)!;
      const tile = buildTile(Math.floor(zone.position.x / TILE_SIZE), Math.floor(zone.position.z / TILE_SIZE));
      const mesh = createTileMesh(tile, material);
      try {
        const positions = mesh.geometry.getAttribute("position"), mask = mesh.geometry.getAttribute("coastSurface");
        expect(mask.count).toBe(positions.count);
        let coastalVertices = 0;
        for (let i = 0; i < mask.count; i++) {
          const x = positions.getX(i) + tile.origin.x, z = positions.getZ(i) + tile.origin.z;
          const y = positions.getY(i) + tile.origin.y;
          const path = nearestPath(x, z), value = mask.getX(i);
          expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(1);
          if (path.t <= 0.82 || y <= waterLevelAt(z) || path.distance <= 4) expect(value).toBe(0);
          if (value > 0) coastalVertices++;
        }
        // The Horizon tile straddles the biome boundary; its coastal vertices may opt in.
        if (id === "quiet-shore") expect(coastalVertices).toBeGreaterThan(0);
        if (id === "roots") expect(coastalVertices).toBe(0);
      } finally { mesh.geometry.dispose(); }
    }
  } finally { material.dispose(); }
});
