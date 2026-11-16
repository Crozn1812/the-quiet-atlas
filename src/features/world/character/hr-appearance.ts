import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Material, MeshPhysicalMaterial, MeshStandardMaterial,
  SkinnedMesh, Texture, type WebGLRenderer,
} from "three";

/** HR-CHAR photoreal close-up skins (ADR 0019). LOD0 for High, LOD1 for Balanced. */
export const HR_CHARACTER_URLS = {
  High: "/world/character/character-hr.glb",
  Balanced: "/world/character/character-hr-lod1.glb",
} as const;

export interface HrCharacterSkin {
  geometry: BufferGeometry;
  materials: Material[];
  textures: Texture[];
  dispose(): void;
}

function texturesOf(material: Material): Texture[] {
  return Object.values(material).filter((value): value is Texture => value instanceof Texture);
}

/** Per-surface tuning that glTF cannot express: clear cornea/lens reflections, skin sheen, hair coverage. */
export function tuneHrMaterial(material: MeshStandardMaterial, antialias: boolean): Material {
  material.envMapIntensity = .75;
  switch (material.name) {
    case "cornea": case "lens": {
      // Additive and black: only the specular/environment reflection is added on top of eye/face.
      material.color.setRGB(0, 0, 0);
      material.opacity = 1;
      material.transparent = true;
      material.blending = AdditiveBlending;
      material.depthWrite = false;
      material.envMapIntensity = material.name === "lens" ? .45 : .6;
      return material;
    }
    case "skin": {
      // Soft warm sheen stands in for subsurface scattering at grazing angles.
      const skin = new MeshPhysicalMaterial();
      MeshStandardMaterial.prototype.copy.call(skin, material);
      skin.sheen = .35;
      skin.sheenRoughness = .55;
      skin.sheenColor = new Color(.62, .26, .2);
      skin.specularIntensity = .55;
      skin.name = "skin";
      material.dispose();
      return skin;
    }
    case "hair_card": case "hair_cap": {
      const hair = new MeshPhysicalMaterial();
      MeshStandardMaterial.prototype.copy.call(hair, material);
      hair.defines = { STANDARD: "", PHYSICAL: "" };
      // Object-space hashed coverage avoids overlapping MSAA masks exposing
      // the scalp through an otherwise dense groom. Opaque depth writes make
      // card order independent, including the non-MSAA production target.
      hair.alphaToCoverage = false;
      hair.alphaHash = true;
      hair.alphaTest = 0;
      hair.transparent = false;
      hair.depthWrite = true;
      hair.roughness = material.name === "hair_card" ? .78 : .96;
      hair.anisotropy = material.name === "hair_card" ? .8 : .35;
      // Card V runs root to tip. Three derives the tangent frame from UVs.
      hair.anisotropyRotation = Math.PI / 2;
      hair.specularIntensity = material.name === "hair_card" ? .24 : .08;
      hair.envMapIntensity = .12;
      material.dispose();
      return hair;
    }
    case "brow": case "lash":
      // Hair is lit mostly by direct light; a strong room reflection turns thin cards grey.
      material.alphaToCoverage = antialias;
      material.envMapIntensity = .3;
      material.transparent = false;
      material.depthWrite = true;
      return material;
    default:
      return material;
  }
}

/** Meshopt keeps per-primitive quantisation (Int16/Uint8, normalised, interleaved); merging needs one layout. */
export function plainAttributes(geometry: BufferGeometry): BufferGeometry {
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const { count, itemSize } = attribute;
    const array = name === "skinIndex" ? new Uint16Array(count * itemSize) : new Float32Array(count * itemSize);
    for (let i = 0; i < count; i++) for (let c = 0; c < itemSize; c++) array[i * itemSize + c] = attribute.getComponent(i, c);
    geometry.setAttribute(name, new BufferAttribute(array, itemSize));
  }
  // Morph accessors may also be quantised/interleaved after meshopt encoding.
  for (const [name, attributes] of Object.entries(geometry.morphAttributes)) {
    geometry.morphAttributes[name as keyof typeof geometry.morphAttributes] = attributes!.map(attribute => {
      const array = new Float32Array(attribute.count * attribute.itemSize);
      for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++) {
        array[i * attribute.itemSize + c] = attribute.getComponent(i, c);
      }
      return new BufferAttribute(array, attribute.itemSize);
    });
  }
  return geometry;
}

/** Merge every primitive of the HR skin into one geometry with groups: one swap, same skeleton. */
export async function loadHrCharacterSkin(renderer: WebGLRenderer, url: string): Promise<HrCharacterSkin & { bones: string[] }> {
  const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }, { mergeGeometries }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"), import("three/examples/jsm/loaders/KTX2Loader.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js"), import("three/examples/jsm/utils/BufferGeometryUtils.js"),
  ]);
  const ktx = new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  try {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx).loadAsync(url);
    const skins: SkinnedMesh[] = [];
    gltf.scene.traverse(node => { if (node instanceof SkinnedMesh) skins.push(node); });
    if (!skins.length || skins.some(skin => skin.skeleton.bones.length !== 19)) throw new Error("Invalid HR character skin");
    const bones = skins[0]!.skeleton.bones.map(bone => bone.name);
    const antialias = Boolean(renderer.getContextAttributes?.()?.antialias);
    for (const skin of skins) {
      geometries.push(plainAttributes(skin.geometry));
      const source = Array.isArray(skin.material) ? skin.material[0]! : skin.material;
      materials.push(source instanceof MeshStandardMaterial ? tuneHrMaterial(source, antialias) : source);
    }
    const merged = mergeGeometries(geometries, true);
    if (!merged) throw new Error("HR character primitives are not mergeable");
    geometries.forEach(geometry => geometry.dispose());
    geometries.length = 0;
    merged.computeBoundingSphere();
    const textures = [...new Set(materials.flatMap(texturesOf))];
    for (const texture of textures) texture.anisotropy = Math.min(8, renderer.capabilities?.getMaxAnisotropy?.() ?? 1);
    let disposed = false;
    return {
      geometry: merged, materials, textures, bones,
      dispose() {
        if (disposed) return;
        disposed = true;
        merged.dispose();
        materials.forEach(material => material.dispose());
        textures.forEach(texture => texture.dispose());
      },
    };
  } catch (error) {
    geometries.forEach(geometry => geometry.dispose());
    for (const material of materials) { texturesOf(material).forEach(texture => texture.dispose()); material.dispose(); }
    throw error;
  } finally { ktx.dispose(); }
}
