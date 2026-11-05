import { Color, Group, Material, Mesh, MeshToonMaterial } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { createRampMaterial } from "../materials/ramp";
import { HEIGHT } from "../scene";
import { createFallbackCharacter } from "./fallback";
import { createCharacter, disposeCharacterMaterials, disposeCharacterTree, type Character } from "./runtime";

export type { Character } from "./runtime";

/** Only call from the lazy world entry. Missing/invalid assets resolve to the capsule. */
export async function loadCharacter(url?: string): Promise<Character> {
  if (!url?.trim()) return createFallbackCharacter();
  const root = new Group();
  try {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    root.add(gltf.scene);
    // B2-045a exports metres, feet at zero; physics.position is the capsule centre.
    gltf.scene.position.y -= HEIGHT;
    const replacements = new Map<Material, MeshToonMaterial>();
    gltf.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      function replace(original: Material) {
        const cached = replacements.get(original);
        if (cached) return cached;
        const color = "color" in original && original.color instanceof Color ? original.color : new Color(0xffffff);
        const material = createRampMaterial(color.getHex());
        // Copy the linear colour directly: getHex alone introduces 8-bit rounding.
        material.color.copy(color);
        material.opacity = original.opacity;
        material.transparent = original.transparent;
        material.alphaTest = original.alphaTest;
        material.side = original.side;
        material.vertexColors = original.vertexColors;
        replacements.set(original, material);
        return material;
      }
      object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material);
    });
    // B2-045a is flat-coloured; the replaced PBR textures are no longer used.
    disposeCharacterMaterials(replacements.keys());
    return createCharacter(root, gltf.animations);
  } catch (error) {
    disposeCharacterTree(root);
    return createFallbackCharacter(error);
  }
}
