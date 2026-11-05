import {
  BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh,
  Shape, Vector3, type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paletteColor, WORLD_DIRECTION } from "../art/direction";
import { CROWN_BASE, createPineCrown, createTreeTrunk } from "../foliage/shapes";
import { createRampMaterial } from "../materials/ramp";
import {
  PATH_CLEARANCE, ZONE_BUDGET, type ZoneCollider, type ZoneSceneContext, type ZoneSceneFactory,
} from "./types";

type Surface = "weathered" | "future" | "bark" | "needles";
interface Part {
  geometry: BufferGeometry;
  surface: Surface;
  x: number;
  z: number;
  solid: boolean;
}

function randomFor(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** A squat, uninscribed slab with hand-cut shoulders and a single soft chamfer. */
function stone(width: number, height: number, yaw: number, lean: number): BufferGeometry {
  const outline = new Shape();
  outline.moveTo(-width * 0.5, 0);
  outline.lineTo(width * 0.48, 0);
  outline.lineTo(width * 0.47, height * 0.83);
  outline.lineTo(width * 0.31, height);
  outline.lineTo(-width * 0.33, height * 0.97);
  outline.lineTo(-width * 0.49, height * 0.79);
  outline.closePath();
  const geometry = new ExtrudeGeometry(outline, {
    depth: 0.38, steps: 1, bevelEnabled: true, bevelSegments: 1,
    bevelThickness: 0.045, bevelSize: 0.055, curveSegments: 1,
  });
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox!.min.y, -0.19);
  const vertices = geometry.getAttribute("position");
  for (let i = 0; i < vertices.count; i++) {
    vertices.setX(i, vertices.getX(i) + vertices.getY(i) * lean);
  }
  return geometry.rotateY(yaw);
}

/** Neutral pigment multiplies the palette material, as in the existing procedural props. */
function wash(geometry: BufferGeometry) {
  const vertices = geometry.getAttribute("position");
  const colors: number[] = [];
  for (let i = 0; i < vertices.count; i++) {
    const value = 0.95 + 0.035 * Math.sin(vertices.getX(i) * 4 + vertices.getY(i) * 3 + vertices.getZ(i));
    colors.push(value, value, value);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

function materials(): Record<Surface, MeshToonMaterial> {
  const ramp = WORLD_DIRECTION.foliage.ramp;
  const result = {
    weathered: createRampMaterial(paletteColor({
      base: "mist", mix: "paper", amount: 0.35, saturation: 1, brightness: 1,
    }), ramp),
    future: createRampMaterial(paletteColor({
      base: "mist", mix: "paper", amount: 0.88, saturation: 1, brightness: 1,
    }), ramp),
    bark: createRampMaterial(paletteColor(WORLD_DIRECTION.foliage.trunk), ramp),
    needles: createRampMaterial(paletteColor(WORLD_DIRECTION.foliage.crown), ramp),
  };
  for (const material of Object.values(result)) material.vertexColors = true;
  return result;
}

/** Check whole bounding footprints, including their edges, rather than just prop centres. */
function fits(parts: readonly Part[], context: ZoneSceneContext, side: number, offsetZ: number) {
  return parts.every(part => {
    part.geometry.computeBoundingBox();
    const bounds = part.geometry.boundingBox!;
    const size = bounds.getSize(new Vector3());
    const stepsX = Math.ceil(size.x / 0.05), stepsZ = Math.ceil(size.z / 0.05);
    for (let ix = 0; ix <= stepsX; ix++) {
      for (let iz = 0; iz <= stepsZ; iz++) {
        const x = side * part.x + bounds.min.x + size.x * ix / Math.max(1, stepsX);
        const z = part.z + offsetZ + bounds.min.z + size.z * iz / Math.max(1, stepsZ);
        const y = context.heightAt(x, z);
        if (Math.abs(x) <= PATH_CLEARANCE || context.onPath(x, z) || context.underWater(x, z)
          || !Number.isFinite(y) || Math.hypot(x, y + bounds.max.y, z) > ZONE_BUDGET.radius) return false;
      }
    }
    return true;
  });
}

export const createMilestonesScene: ZoneSceneFactory = context => {
  const random = randomFor(context.seed);
  const parts: Part[] = [];
  for (let i = -3; i <= 3; i++) {
    const central = i === 0;
    parts.push({
      geometry: stone(central ? 1.45 : 1.02 + random() * 0.16,
        central ? 1.25 : 0.71 + random() * 0.19, Math.PI / 2 - i * 0.12, (random() - 0.5) * 0.07),
      // Only the two end stones are fresh, empty future slots; no achievement symbols anywhere.
      surface: Math.abs(i) === 3 ? "future" : "weathered",
      x: 4.7 + i * i * 0.3, z: i * 1.85, solid: true,
    });
  }
  parts.push({
    geometry: createTreeTrunk().scale(1, 4.2, 1).translate(0, 2.1, 0),
    surface: "bark", x: 10.3, z: 2.7, solid: true,
  }, {
    geometry: createPineCrown(context.seed).translate(0, 2.1 - CROWN_BASE, 0),
    surface: "needles", x: 10.3, z: 2.7, solid: false,
  });

  // Keep the complete composition on dry ground, trying the opposite bank and then along the path.
  const placement = [0, -8, 8, -16, 16].flatMap(offsetZ => [1, -1].map(side => ({ side, offsetZ })))
    .find(({ side, offsetZ }) => fits(parts, context, side, offsetZ));
  if (!placement) {
    parts.forEach(part => part.geometry.dispose());
    throw new RangeError("Milestones needs a dry, clear hillside within the zone radius.");
  }
  const { side, offsetZ } = placement;
  const group = new Group();
  group.name = "milestones-hillside";
  const colliders: ZoneCollider[] = [];
  const batches: Record<Surface, BufferGeometry[]> = { weathered: [], future: [], bark: [], needles: [] };
  const surfaces = materials();
  let middle = new Vector3();
  for (const [index, part] of parts.entries()) {
    const geometry = part.geometry;
    geometry.translate(side * part.x, 0, part.z + offsetZ);
    const vertices = geometry.getAttribute("position");
    // Drape the base onto the sampled slope; a flat anchor would leave uphill corners buried.
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), z = vertices.getZ(i);
      vertices.setY(i, vertices.getY(i) + context.heightAt(x, z));
    }
    if (!geometry.hasAttribute("color")) wash(geometry);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    if (part.solid) colliders.push({ center: bounds.getCenter(new Vector3()), size: bounds.getSize(new Vector3()) });
    if (index === 3) middle = bounds.getCenter(new Vector3());
    // A consistent nonindexed layout allows the existing indexed pine shapes to share the batch path.
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flat.deleteAttribute("uv");
    batches[part.surface].push(flat);
    if (flat !== geometry) geometry.dispose();
  }
  for (const surface of Object.keys(batches) as Surface[]) {
    const geometry = mergeGeometries(batches[surface], false)!;
    batches[surface].forEach(part => part.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, surfaces[surface]);
    mesh.name = `milestones-${surface}`;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  let disposed = false;
  return {
    zoneId: "milestones", group, colliders,
    interactable: { position: middle, label: { vi: "Những bia mốc", en: "Milestone stones" } },
    // Stone and the solitary pine are deliberately still, including in reduced-motion mode.
    update() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      group.traverse(object => {
        if (object instanceof Mesh) object.geometry.dispose();
      });
      Object.values(surfaces).forEach(material => material.dispose());
      group.clear();
    },
  };
};
