import { BufferGeometry, Float32BufferAttribute, Group, Mesh, TorusGeometry } from "three";
import { hex } from "../world/art/palette";
import { createRampMaterial } from "../world/materials/ramp";

function geometry(positions: number[], indices: number[]): BufferGeometry {
  const result = new BufferGeometry();
  result.setAttribute("position", new Float32BufferAttribute(positions, 3));
  result.setIndex(indices);
  result.computeVertexNormals();
  return result;
}

/** Closed teardrop: four eight-sided rings and two tips, 64 triangles. */
function droplet(): BufferGeometry {
  const positions = [0, -0.14, 0];
  const indices: number[] = [];
  for (const [y, radius] of [[-0.115, 0.06], [-0.06, 0.085], [0.02, 0.065], [0.085, 0.025]]) {
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      positions.push(Math.cos(angle) * radius!, y!, Math.sin(angle) * radius!);
    }
  }
  const tip = positions.length / 3;
  positions.push(0, 0.13, 0);
  for (let i = 0; i < 8; i++) {
    const a = 1 + i, b = 1 + (i + 1) % 8;
    indices.push(0, a, b, a + 24, tip, b + 24);
    for (let ring = 0; ring < 3; ring++) {
      const c = a + ring * 8, d = b + ring * 8;
      indices.push(c, c + 8, d, d, c + 8, d + 8);
    }
  }
  return geometry(positions, indices);
}

/** A folded seedling leaf, with volume rather than double-sided planes. */
function leaf(side: number): BufferGeometry {
  return geometry([
    0, 0.115, 0,
    side * 0.014, 0.17, -0.022,
    side * 0.06, 0.21, 0,
    side * 0.045, 0.158, 0.022,
    side * 0.028, 0.166, 0.014,
    side * 0.028, 0.166, -0.014,
  ], Array.from({ length: 4 }, (_, i) => {
    const next = (i + 1) % 4;
    return side > 0 ? [i, next, 4, next, i, 5] : [next, i, 4, i, next, 5];
  }).flat());
}

/** 0.35 m tall, 224 triangles. Owns geometry/materials; the ramp texture is world-shared. */
export function createMascotMesh(): Group & { dispose(): void } {
  const root = new Group();
  root.name = "mascot";
  // Mist in the light, diluted water in shadow: all hues come from PALETTE.
  const bodyMaterial = createRampMaterial(hex("mist"), { shadowTint: hex("water") });
  const leafMaterial = createRampMaterial(hex("forestLight"), { shadowTint: hex("forestDeep") });
  const ringMaterial = createRampMaterial(hex("dusk"), { shadowTint: hex("dusk") });
  ringMaterial.emissive.setHex(hex("dusk"));
  ringMaterial.emissiveIntensity = 0.25;
  const body = new Mesh(droplet(), bodyMaterial);
  body.name = "droplet";
  const leaves = [-1, 1].map(side => new Mesh(leaf(side), leafMaterial));
  leaves.forEach((mesh, i) => { mesh.name = `leaf-${i}`; });
  const ring = new Mesh(new TorusGeometry(0.112, 0.0025, 3, 24), ringMaterial);
  ring.name = "halo";
  ring.rotation.x = Math.PI / 2;
  root.add(body, ...leaves, ring);
  let disposed = false;
  return Object.assign(root, {
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of [body, ...leaves, ring]) mesh.geometry.dispose();
      for (const material of [bodyMaterial, leafMaterial, ringMaterial]) material.dispose();
      root.removeFromParent();
    },
  });
}
