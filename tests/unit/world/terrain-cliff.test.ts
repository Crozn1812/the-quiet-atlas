import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Int8BufferAttribute, Uint16BufferAttribute, Group, Mesh, MeshStandardMaterial, MeshToonMaterial,
  ShaderLib, Texture, Vector3, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { expect, it } from "vitest";
import { cliffRelief, createTerrainCliffRelief, erodeSpringCliffPlants, sculptSpringCliff, springCliffRelief } from "../../../src/features/world/terrain/cliff-relief";
import { createPhotoMaterial } from "../../../src/features/world/materials/cc0";
import { weatherSpringCliff } from "../../../src/features/world/materials/cliff";
import { prepareCliffMaterial } from "../../../src/features/world/zones/first-light-cliff-detail";

function plane(protectedSurface = false) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 10, 0, 0, 10, 2, 2, 14, 0, 2, 14, 2], 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(Array.from({ length: 4 }, () => [-2 / Math.sqrt(5), 1 / Math.sqrt(5), 0]).flat(), 3));
  geometry.setAttribute("color", new Float32BufferAttribute(new Array(12).fill(.4), 3));
  geometry.setAttribute("cc0Surface", new Float32BufferAttribute(new Array(16).fill(0), 4));
  geometry.setAttribute("cliffSurface", new Float32BufferAttribute(Array.from({ length: 4 }, () => [.8, protectedSurface ? 0 : 1]).flat(), 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  return new Mesh(geometry, new MeshToonMaterial());
}

it("adds continuous fine visual relief while retaining original heightfield vertices and masks", () => {
  const mesh = plane(), before = mesh.geometry.clone(); mesh.position.set(128, 0, -64);
  const skin = createTerrainCliffRelief(mesh)!;
  try {
    expect(skin.index!.count / 3).toBe(32);
    expect(mesh.geometry.getAttribute("position").array).toEqual(before.getAttribute("position").array);
    expect(mesh.geometry.index!.array).toEqual(before.index!.array);
    const p = skin.getAttribute("position"), mask = skin.getAttribute("cliffSurface");
    for (let i = 0; i < p.count; i++) {
      // Every interpolated Y remains on the original plane (multiples of half a metre).
      expect(p.getY(i) * 2).toBeCloseTo(Math.round(p.getY(i) * 2), 5);
      expect(mask.getX(i)).toBeCloseTo(.8); expect(mask.getY(i)).toBe(1);
    }
    expect(p.getX(0)).toBeLessThan(0);
    expect(skin.getAttribute("normal").array.every(Number.isFinite)).toBe(true);
    // World-space function agrees from both sides of a tile seam.
    expect(cliffRelief(64 - 1e-7, 12, -40)).toBeCloseTo(cliffRelief(64 + 1e-7, 12, -40), 5);
  } finally { skin.dispose(); before.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); }
});

it("does not decorate protected route/water vertices or flat ground", () => {
  const mesh = plane(true);
  expect(createTerrainCliffRelief(mesh)).toBeUndefined();
  mesh.geometry.getAttribute("cliffSurface").setY(0, 1);
  for (let i = 0; i < 4; i++) mesh.geometry.getAttribute("normal").setXYZ(i, 0, 1, 0);
  expect(createTerrainCliffRelief(mesh)).toBeUndefined();
  mesh.geometry.dispose(); mesh.material.dispose();
});

it("erodes only the normalized decorative GLB crest in metres and is idempotent", () => {
  const mesh = plane(), parent = new Group(); mesh.scale.setScalar(40); mesh.position.x = 128; parent.add(mesh);
  const source = mesh.geometry.getAttribute("position"), heights = Array.from({ length: source.count }, (_, i) => source.getY(i));
  const first = new Vector3().fromBufferAttribute(source, 0);
  sculptSpringCliff(mesh);
  expect(source.getX(0)).not.toBe(first.x);
  for (let i = 0; i < source.count; i++) {
    expect(source.getY(i)).toBeLessThan(heights[i]!);
    expect((heights[i]! - source.getY(i)) * 40).toBeLessThan(2.21);
  }
  const sculpted = source.array.slice(); sculptSpringCliff(mesh); expect(source.array).toEqual(sculpted);
  mesh.geometry.dispose(); mesh.material.dispose();
});

it("lifts quantized GLB normals into Float32 without zero-vector PBR lighting", () => {
  const mesh = plane(); mesh.geometry.scale(.001, .001, .001); mesh.scale.setScalar(1000);
  mesh.geometry.setAttribute("normal", new Int8BufferAttribute([-113, 57, 0, -113, 57, 0, -113, 57, 0, -113, 57, 0], 3, true));
  sculptSpringCliff(mesh);
  const normal = mesh.geometry.getAttribute("normal");
  expect(normal.array).toBeInstanceOf(Float32Array);
  for (let i = 0; i < normal.count; i++) expect(new Vector3().fromBufferAttribute(normal, i).length()).toBeCloseTo(1, 4);
  mesh.geometry.dispose(); mesh.material.dispose();
});

it("decodes quantized positions before metre-scale cuts without Uint16 wraparound strips", () => {
  const mesh = plane(); mesh.geometry.scale(.02, .02, .02); mesh.scale.setScalar(50); mesh.position.x = 128;
  const original = mesh.geometry.getAttribute("position");
  mesh.geometry.setAttribute("position", new Uint16BufferAttribute(Array.from(original.array, value => Math.round(value * 65535)), 3, true));
  sculptSpringCliff(mesh);
  const position = mesh.geometry.getAttribute("position");
  expect(position.array).toBeInstanceOf(Float32Array);
  expect(mesh.geometry.boundingBox!.max.x).toBeLessThan(.1);
  for (let i = 0; i < position.count; i++) {
    expect(Math.abs(position.getX(i) - original.getX(i)) * 50).toBeLessThan(2.21);
    expect(position.getY(i)).toBeLessThanOrEqual(original.getY(i) + .00002);
    expect(Math.abs(position.getY(i) - original.getY(i)) * 50).toBeLessThan(2.21);
  }
  mesh.geometry.dispose(); mesh.material.dispose();
});

it("adds weathering only to physical terrain and retains the spring CC0 maps", () => {
  const original = new MeshToonMaterial(), textures = [new Texture(), new Texture()];
  for (const size of [512, 2048]) {
    const material = createPhotoMaterial("terrain", original, textures, size);
    const shader = { ...ShaderLib[size === 512 ? "toon" : "standard"], uniforms: {} } as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    expect(shader.fragmentShader.includes("vec4 terrainWeather")).toBe(size === 2048);
    expect(shader.fragmentShader).toContain("photoProjection"); material.dispose();
  }
  const material = new MeshStandardMaterial({ map: textures[0], roughnessMap: textures[1] });
  prepareCliffMaterial(material); weatherSpringCliff(material);
  const key = material.customProgramCacheKey(); weatherSpringCliff(material); expect(material.customProgramCacheKey()).toBe(key);
  const shader = { ...ShaderLib.standard, uniforms: {} } as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  expect(shader.fragmentShader).toContain("cliffRead(map, (cliffP + warp) / 2.6)");
  expect(shader.fragmentShader).toContain("cliffPigment(cliffColor * vec3(0.8, 0.87, 0.88) * mineral, weather)");
  expect(shader.fragmentShader).toContain("cliffPacked.b");
  weatherSpringCliff(material, textures, 2048);
  expect(shader.uniforms.cliffAtlas!.value).toBe(textures[0]);
  expect(shader.uniforms.cliffAtlasSize!.value).toBe(2048);
  weatherSpringCliff(material);
  expect(shader.uniforms.cliffAtlas!.value).toBeNull();
  expect(shader.uniforms.cliffAtlasSize!.value).toBe(0);
  material.dispose(); original.dispose(); textures.forEach(texture => texture.dispose());
});

it("breaks up shelves within a half-metre envelope without metre-wide corrugation", () => {
  const offsets: number[] = [];
  for (let x = -60; x <= 30; x += 3) for (let y = 10; y <= 45; y += .1) {
    offsets.push(springCliffRelief(x, y, -30));
    expect(cliffRelief(x, y, -30)).toBeLessThanOrEqual(.5);
  }
  expect(Math.max(...offsets)).toBeLessThanOrEqual(.5);
  expect(Math.min(...offsets)).toBeGreaterThanOrEqual(-.5);
  expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(.15);
  expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThan(.6);
  // There are both ledges and recesses throughout a vertical section, not a translated slab.
  const section = Array.from({ length: 100 }, (_, i) => springCliffRelief(-15, 15 + i * .1, -30));
  expect(Math.max(...section) - Math.min(...section)).toBeGreaterThan(.1);
  expect(section.filter(value => value < -.1).length).toBeGreaterThan(5);
});

it("keeps duplicated cap/face vertices closed across hard normals and UV seams", () => {
  const geometry = new BoxGeometry(6, 8, 2, 4, 8, 2), original = geometry.getAttribute("position").clone();
  const mesh = new Mesh(geometry, new MeshStandardMaterial()); mesh.position.set(-30, 20, -30);
  const triangles = geometry.index!.count, vertices = original.count;
  sculptSpringCliff(mesh);
  const moved = geometry.getAttribute("position"), byOriginal = new Map<string, Vector3>();
  let duplicates = 0;
  for (let i = 0; i < moved.count; i++) {
    const key = new Vector3().fromBufferAttribute(original, i).toArray().join(":"), point = new Vector3().fromBufferAttribute(moved, i);
    const previous = byOriginal.get(key);
    if (previous) { expect(previous.distanceTo(point)).toBeLessThan(.00001); duplicates++; }
    else byOriginal.set(key, point);
  }
  expect(duplicates).toBeGreaterThan(20);
  expect(moved.count).toBe(vertices); expect(geometry.index!.count).toBe(triangles);
  geometry.dispose(); mesh.material.dispose();
});

it("keeps cliff-asset plants at the same eroded height as their rock attachment", () => {
  const rock = plane(), plants = plane(); rock.position.set(100, 20, -30); plants.position.copy(rock.position);
  sculptSpringCliff(rock); erodeSpringCliffPlants(plants);
  const a = rock.geometry.getAttribute("position"), b = plants.geometry.getAttribute("position");
  for (let i = 0; i < a.count; i++) expect(a.getY(i)).toBeCloseTo(b.getY(i), 5);
  const once = b.array.slice(); erodeSpringCliffPlants(plants); expect(b.array).toEqual(once);
  rock.geometry.dispose(); rock.material.dispose(); plants.geometry.dispose(); plants.material.dispose();
});
