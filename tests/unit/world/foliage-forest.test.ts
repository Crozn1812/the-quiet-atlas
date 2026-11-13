import { Color, Matrix3, Matrix4, Ray, ShaderLib, SRGBColorSpace, Vector2, Vector3, type InstancedMesh, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";
import { paletteColor, WORLD_DIRECTION } from "../../../src/features/world/art/direction";
import { PALETTE } from "../../../src/features/world/art/palette";
import { createFoliage, foliageVariantAt } from "../../../src/features/world/foliage/instances";
import { foliageBiomeAt, forestHillDistanceAt, isFoliageExcluded, MIN_TREE_DISTANCE, scatterTile } from "../../../src/features/world/foliage/scatter";
import { BROADLEAF_VARIANT_SEEDS, createBroadleafCrown } from "../../../src/features/world/foliage/shapes";
import { pathLength, pathPointAt } from "../../../src/features/world/layout/path";
import { WORLD_SCALE } from "../../../src/features/world/layout/scale";
import { ZONES } from "../../../src/features/world/layout/zones";
import { worldHeight } from "../../../src/features/world/terrain/height";
import { nearestPath } from "../../../src/features/world/terrain/samples";
import { TILE_SIZE, tilesAlongPath } from "../../../src/features/world/terrain/tiles";
import { createForestSunShafts } from "../../../src/features/world/zones/first-light";

const tiles = tilesAlongPath(240);
const populations = tiles.map(scatterTile);
const trees = populations.flat();
const forest = trees.filter(tree => foliageBiomeAt(tree.x, tree.z) === "forest-dawn");
const firstHill = ZONES.findIndex(zone => zone.biome === "hill");
const edge = (ZONES[firstHill - 1]!.t + ZONES[firstHill]!.t) / 2;

describe("broadleaf forest corridor (B2-170)", () => {
  it("has >=75% broadleaf deep in the forest and >=60% pine within 40 m of the hill biome", () => {
    const deep = forest.filter(tree => (edge - nearestPath(tree.x, tree.z).t) * pathLength() > 40);
    const rim = forest.filter(tree => (edge - nearestPath(tree.x, tree.z).t) * pathLength() <= 40);
    expect(deep.length).toBeGreaterThan(300);
    expect(rim.length).toBeGreaterThan(30 * WORLD_SCALE);
    const broadleaf = deep.filter(tree => tree.kind === "broadleaf").length / deep.length;
    const pine = rim.filter(tree => tree.kind === "pine").length / rim.length;
    expect(broadleaf).toBeGreaterThanOrEqual(0.75);
    expect(pine).toBeGreaterThanOrEqual(0.6);
    for (const distance of [0, 20, 39, 41, 60]) {
      const point = pathPointAt(edge - distance / pathLength());
      expect(forestHillDistanceAt(point.x, point.z)).toBeCloseTo(distance, 1);
    }
    process.stdout.write(`B2-170 species: deep broadleaf=${(broadleaf * 100).toFixed(2)}% (${deep.length}); rim pine=${(pine * 100).toFixed(2)}% (${rim.length})\n`);
  });

  it("at least doubles broadleaf crown density in the 4–25 m band versus 60–120 m on both sides", () => {
    // Equal-area quadrature over the same forest footprint, including clearings.
    // Separate sides prevent one bank from hiding a sparse opposite bank.
    const area = [[0, 0], [0, 0]], count = [[0, 0], [0, 0]];
    const bin = (x: number, z: number) => {
      const path = nearestPath(x, z);
      if (foliageBiomeAt(x, z) !== "forest-dawn") return;
      const band = path.distance >= 4 && path.distance <= 25 ? 0 : path.distance >= 60 && path.distance <= 120 ? 1 : -1;
      if (band < 0) return;
      const before = pathPointAt(Math.max(0, path.t - 0.00001));
      const after = pathPointAt(Math.min(1, path.t + 0.00001));
      const side = (x - path.x) * (after.z - before.z) - (z - path.z) * (after.x - before.x) >= 0 ? 0 : 1;
      return { side, band };
    };
    for (const tile of tiles) for (let x = 1; x < TILE_SIZE; x += 2) for (let z = 1; z < TILE_SIZE; z += 2) {
      const cell = bin(tile.ix * TILE_SIZE + x, tile.iz * TILE_SIZE + z);
      if (cell) area[cell.side]![cell.band]! += 4;
    }
    for (const tree of forest.filter(tree => tree.kind === "broadleaf")) {
      const cell = bin(tree.x, tree.z);
      if (cell) count[cell.side]![cell.band]!++;
    }
    for (const side of [0, 1]) {
      const near = count[side]![0]! / area[side]![0]!;
      const far = count[side]![1]! / area[side]![1]!;
      expect(far).toBeGreaterThan(0);
      expect(near / far).toBeGreaterThanOrEqual(2);
      process.stdout.write(`B2-170 canopy density side=${side}: ${(near / far).toFixed(2)}x; near=${count[side]![0]}, far=${count[side]![1]}\n`);
    }
  });

  it("reaches overhead across many trail segments while retaining real zone and sun-shaft openings", () => {
    const foliage = createFoliage(trees.length);
    const shapes = BROADLEAF_VARIANT_SEEDS.map(seed => createBroadleafCrown(seed));
    const shafts = createForestSunShafts(worldHeight);
    const triangles: Vector3[][] = [];
    try {
      foliage.setTiles(trees);
      const material = foliage.species.broadleaf.crowns.material;
      const shader = { vertexShader: ShaderLib.toon!.vertexShader, fragmentShader: ShaderLib.toon!.fragmentShader, uniforms: {} } as WebGLProgramParametersWithUniforms;
      material.onBeforeCompile(shader, {} as WebGLRenderer);
      expect(shader.vertexShader).toContain("cross(forestAxes[1], forestAxes[2])");
      expect(shader.vertexShader).toContain("transformedNormal = normalMatrix * forestNormal * objectNormal");
      const counters = new Map<object, number>(), matrix = new Matrix4();
      for (const tree of trees) {
        const species = foliage.species[tree.kind];
        const variant = species.variants[foliageVariantAt(tree.x, tree.z, species.variants.length)]!;
        const instance = counters.get(variant) ?? 0;
        counters.set(variant, instance + 1);
        if (tree.kind !== "broadleaf" || foliageBiomeAt(tree.x, tree.z) !== "forest-dawn") continue;
        variant.crowns.getMatrixAt(instance, matrix);
        if (tree.trailCanopy) {
          const path = nearestPath(tree.x, tree.z);
          const limb = new Vector3(1, 0, 0).transformDirection(matrix);
          expect(limb.dot(new Vector3(path.x - tree.x, 0, path.z - tree.z).normalize())).toBeGreaterThan(0.99);
          const scale = new Vector3().setFromMatrixScale(matrix);
          expect(scale.x / tree.scale).toBeCloseTo(3, 5);
          expect(scale.z / scale.x).toBeCloseTo(1, 5);
          // B2-196 keeps the rooted matrix upright; only canopy vertices reach.
          expect(scale.y / scale.x).toBeCloseTo(1, 5);
          const x = new Vector3().setFromMatrixColumn(matrix, 0), y = new Vector3().setFromMatrixColumn(matrix, 1), z = new Vector3().setFromMatrixColumn(matrix, 2);
          const cofactors = new Matrix3().setFromMatrix4(new Matrix4().makeBasis(
            new Vector3().crossVectors(y, z), new Vector3().crossVectors(z, x), new Vector3().crossVectors(x, y)));
          const normal = new Vector3(0.3, 0.8, -0.4).normalize();
          expect(normal.clone().applyMatrix3(cofactors).normalize().distanceTo(
            normal.clone().applyMatrix3(new Matrix3().getNormalMatrix(matrix)).normalize())).toBeLessThan(1e-6);
        }
        // CPU raycasting on the batch misses GPU-selected shapes. Reconstruct
        // the actual selected leaf triangles instead of testing bounding disks.
        const shape = tree.trailCanopy ? createBroadleafCrown(BROADLEAF_VARIANT_SEEDS[0], true) : shapes[foliageVariantAt(tree.x, tree.z, shapes.length)]!;
        const positions = shape.getAttribute("position"), surface = shape.getAttribute("surface");
        const vertexAt = (id: number) => {
          const vertex = new Vector3().fromBufferAttribute(positions, id);

          return vertex.applyMatrix4(matrix);
        };
        if (tree.trailCanopy) for (let i = 0; i < positions.count; i++) {
          const vertex = vertexAt(i);
          expect(variant.crowns.boundingBox!.containsPoint(vertex)).toBe(true);
          expect(variant.crowns.boundingSphere!.containsPoint(vertex)).toBe(true);
        }
        const indices = shape.index!;
        for (let i = 0; i < indices.count; i += 3) {
          const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
          if (surface.getX(ids[0]!) !== 0) continue;
          triangles.push(ids.map(vertexAt));
        }
        if (tree.trailCanopy) shape.dispose();
      }
      const hit = new Vector3();
      const overhead = (point: Vector3) => {
        const ray = new Ray(new Vector3(point.x, worldHeight(point.x, point.z) + 2, point.z), new Vector3(0, 1, 0));
        return triangles.some(([a, b, c]) => ray.intersectTriangle(a!, b!, c!, false, hit));
      };
      let covered = 0, samples = 0;
      const coveredSegments = new Set<number>();
      // Include the mixed-species rim and use the actual clearing footprints:
      // fixed camera margins consume most gaps on ADR 0017's shorter route.
      for (let metres = 5; metres < edge * pathLength(); metres += 2) {
        const point = pathPointAt(metres / pathLength());
        if (ZONES.some(zone => point.distanceTo(zone.position) < zone.radius + 1)
          || shafts.sites.some(site => point.distanceTo(site.position) < 9)) continue;
        samples++;
        if (overhead(point)) { covered++; coveredSegments.add(Math.floor(metres / 10)); }
      }
      process.stdout.write(`B2-170 overhead: ${covered}/${samples} path samples; ${coveredSegments.size} distinct 10 m segments; shoulder trees=${forest.filter(tree => tree.trailCanopy).length}\n`);
      expect(samples).toBeGreaterThan(30 * WORLD_SCALE);
      // B2-198 restores centre-line closure with authored limbs and leaf masses.
      expect(covered).toBeGreaterThanOrEqual(Math.floor(25 * WORLD_SCALE));
      // HEAD measured with this same domain: 33/136, versus 26/72 with the
      // old camera margins. Preserve coverage proportion, not a new domain's denominator.
      expect(covered / samples).toBeGreaterThanOrEqual(33 / 136);
      expect(coveredSegments.size).toBeGreaterThanOrEqual(Math.floor(8 * WORLD_SCALE));
      for (const zone of ZONES.filter(zone => zone.biome === "forest-dawn")) {
        for (let x = -zone.radius; x <= zone.radius; x += 3) for (let z = -zone.radius; z <= zone.radius; z += 3) {
          if (Math.hypot(x, z) > zone.radius) continue;
          expect(overhead(zone.position.clone().add(new Vector3(x, 0, z))), `zone=${zone.id}, offset=${x},${z}`).toBe(false);
        }
      }
      expect(shafts.sites).toHaveLength(3);
      for (const site of shafts.sites) {
        expect(overhead(site.position)).toBe(false);
        expect(forest.every(tree => Math.hypot(tree.x - site.position.x, tree.z - site.position.z) >= 9)).toBe(true);
        // Include the upper end of the slanted six-metre veil, toward the sun.
        const veil = shafts.group.children[0] as InstancedMesh;
        veil.getMatrixAt(shafts.sites.indexOf(site), matrix);
        const vertices = veil.geometry.getAttribute("position");
        for (let i = 0; i < vertices.count; i++) {
          expect(overhead(new Vector3().fromBufferAttribute(vertices, i).applyMatrix4(matrix))).toBe(false);
        }
      }
    } finally { foliage.dispose(); shapes.forEach(shape => shape.dispose()); shafts.dispose(); }
  });

  it("stays below the existing 240 m cap and +25% of the measured population without adding draws", () => {
    // HEAD before B2-170: 1676 trees, 1186 active tiled draws, old cap 3551.
    expect(trees.length).toBeLessThanOrEqual(Math.floor(1676 * 1.25));
    expect(trees.length).toBeLessThanOrEqual(3551);
    const foliage = createFoliage(trees.length);
    try {
      foliage.setTiles(trees);
      expect(foliage.group.children).toHaveLength(10);
      const variants = Object.values(foliage.species).flatMap(species => species.variants);
      expect(variants.reduce((sum, variant) => sum + variant.trunks.count + variant.crowns.count, 0)).toBe(trees.length * 2);
      for (const variant of variants) expect((variant.trunks.geometry.index!.count + variant.crowns.geometry.index!.count) / 3).toBeLessThanOrEqual(600);
      const draws = populations.reduce((sum, population) => sum + 2 * new Set(population.map(tree =>
        `${tree.kind}:${foliageVariantAt(tree.x, tree.z, foliage.species[tree.kind].variants.length)}`)).size, 0);
      expect(draws).toBeLessThanOrEqual(1186);
      process.stdout.write(`B2-170 240 m / High: trees=1676 -> ${trees.length}; mesh instances=${trees.length * 2}; draws=1186 -> ${draws}; slots=10\n`);
    } finally { foliage.dispose(); }
  });

  it("remains deterministic across tile ordering and seams, including canopy metadata", () => {
    for (let i = tiles.length - 1; i >= 0; i--) expect(scatterTile(tiles[i]!)).toEqual(populations[i]);
    const shoulders = forest.filter(tree => tree.trailCanopy);
    expect(shoulders.length).toBeGreaterThan(30 * WORLD_SCALE);
    for (const tree of shoulders) {
      expect(isFoliageExcluded(tree.x, tree.z)).toBe(false);
      for (const other of forest) {
        if (other === tree) continue;
        expect(Math.hypot(tree.x - other.x, tree.z - other.z)).toBeGreaterThanOrEqual(MIN_TREE_DISTANCE - 1e-10);
      }
    }
  });
});

// Same ACES fit/matrices as three.js, exposure=1, followed by sRGB output.
function displayLuma(color: Color): number {
  const input = new Matrix3().set(0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777);
  const output = new Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);
  const rgb = new Vector3(color.r, color.g, color.b).multiplyScalar(1 / 0.6).applyMatrix3(input);
  const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  rgb.set(fit(rgb.x), fit(rgb.y), fit(rgb.z)).applyMatrix3(output).clampScalar(0, 1);
  const display = new Color().setRGB(rgb.x, rgb.y, rgb.z).getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace);
  return display.r * 0.2126 + display.g * 0.7152 + display.b * 0.0722;
}

it("uses natural palette wood/moss and keeps shaded/sunlit bark below the leaf shade floor (B2-182b)", () => {
  const foliage = createFoliage(1);
  try {
    const { trunks } = foliage.species.broadleaf;
    expect(trunks.material.color).toEqual(new Color(paletteColor(WORLD_DIRECTION.foliage.trunk)));
    const shader = { vertexShader: ShaderLib.toon!.vertexShader, fragmentShader: ShaderLib.toon!.fragmentShader, uniforms: {} } as WebGLProgramParametersWithUniforms;
    trunks.material.onBeforeCompile(shader, {} as WebGLRenderer);
    expect(shader.fragmentShader).toContain("rampShadowTint");
    const floor = shader.fragmentShader.match(/outgoingLight = max\(outgoingLight, diffuseColor.rgb \* ([\d.]+)\)/);
    expect(floor).not.toBeNull();
    const colors = trunks.geometry.getAttribute("color");
    const pigments = Array.from({ length: colors.count }, (_, i) =>
      new Color().fromBufferAttribute(colors, i).multiply(trunks.material.color));
    const min = Math.min(...pigments.map(color => displayLuma(color.clone().multiplyScalar(Number(floor![1])))));
    // Lead 2026-11-06 (render check): the old 0.85 floor kept shaded bark ≥0.18 and read as cream posts; 0.25 keeps it ≥0.12 but dark.
    expect(min).toBeGreaterThanOrEqual(0.12);
    // R's recipe remains a rock/rockDark mix; the vertex wash adds forestDeep/grass.
    expect(["rock", "rockDark"]).toContain(WORLD_DIRECTION.foliage.trunk.base);
    expect(["rock", "rockDark", "forestDeep"]).toContain(WORLD_DIRECTION.foliage.trunk.mix);
    expect(pigments.some(color => color.g > color.r && color.g > color.b)).toBe(true);
    expect(new Set(pigments.map(color => color.getHex())).size).toBeGreaterThan(5);
    expect(pigments.every(color => color.r > new Color(PALETTE.ink).r)).toBe(true);
    const wood = new Color(PALETTE.rock).lerp(new Color(PALETTE.rockDark), 0.48).lerp(new Color(PALETTE.forestDeep), 0.05);
    const positions = trunks.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) if (positions.getY(i) === 0.5) {
      expect(pigments[i]!.r).toBeCloseTo(wood.r, 6);
      expect(pigments[i]!.g).toBeCloseTo(wood.g, 6);
      expect(pigments[i]!.b).toBeCloseTo(wood.b, 6);
    }
    expect(shader.fragmentShader).toContain("clamp(barkLuma, forestBarkLuma.x, forestBarkLuma.y)");
    const limits = shader.uniforms.forestBarkLuma!.value as Vector2;
    const shadowTint = shader.uniforms.rampShadowTint!.value as Color;
    const highlightTint = shader.uniforms.rampHighlightTint!.value as Color;
    const luma = (color: Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
    const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
    let darkest = Infinity, brightest = 0;
    // Exercise every pigment through the shared R ramp: opposite normals,
    // no direct light, soft-ramp endpoints and strong direct/ambient light.
    for (const pigment of pigments) for (const irradiance of [0, 0.25, 0.5, 1, 4, 20]) {
      const lit = pigment.clone().multiplyScalar(irradiance), rampLight = luma(lit);
      lit.multiply(new Color(1, 1, 1).lerp(highlightTint, smooth((rampLight - 0.5) / 0.5) * 0.12));
      const shadow = pigment.clone().multiply(new Color(0.25, 0.25, 0.25).lerp(shadowTint, 0.6));
      lit.copy(shadow.lerp(lit, smooth(rampLight / 0.5)));
      lit.setRGB(Math.max(lit.r, pigment.r * Number(floor![1])), Math.max(lit.g, pigment.g * Number(floor![1])), Math.max(lit.b, pigment.b * Number(floor![1])));
      lit.multiplyScalar(Math.max(limits.x, Math.min(limits.y, luma(lit))) / luma(lit));
      // B2-182b darkens lighting rather than lifting bark above shaded leaves.
      // Lead 2026-11-06: bounds come from the shader (0.02–0.05 after the render check; 0.055–0.10 read as cream posts).
      expect(luma(lit)).toBeGreaterThanOrEqual(limits.x - 1e-7);
      expect(luma(lit)).toBeLessThanOrEqual(limits.y + 1e-7);
      const display = displayLuma(lit);
      expect(display).toBeGreaterThanOrEqual(0.05);
      expect(display).toBeLessThanOrEqual(0.26);
      darkest = Math.min(darkest, display); brightest = Math.max(brightest, display);
    }
    const crownMaterial = foliage.species.broadleaf.crowns.material;
    const crownShader = { vertexShader: ShaderLib.toon!.vertexShader, fragmentShader: ShaderLib.toon!.fragmentShader, uniforms: {} } as WebGLProgramParametersWithUniforms;
    crownMaterial.onBeforeCompile(crownShader, {} as WebGLRenderer);
    expect(crownShader.uniforms.forestBarkLuma!.value).toEqual(limits);
    expect(crownShader.fragmentShader).toContain("if (vForestWood > 0.5)");
    expect(crownShader.vertexShader).toContain("vColor.xyz /= instanceColor");
    expect(crownShader.fragmentShader.indexOf("clamp(barkLuma")).toBeGreaterThan(crownShader.fragmentShader.indexOf("outgoingLight = mix( rampShadow"));
    process.stdout.write(`B2-182b bark: ramp linear luma=${limits.x}–${limits.y}; ACES+sRGB=${darkest.toFixed(3)}–${brightest.toFixed(3)} (exposure=1)\n`);
  } finally { foliage.dispose(); }
  const recipe = WORLD_DIRECTION.foliage.trunk;
  const brightness = recipe.brightness;
  try {
    recipe.brightness = brightness * 0.95;
    const changed = createFoliage(0);
    try { expect(changed.species.pine.trunks.material.color).toEqual(new Color(paletteColor(recipe))); }
    finally { changed.dispose(); }
  } finally { recipe.brightness = brightness; }
});
