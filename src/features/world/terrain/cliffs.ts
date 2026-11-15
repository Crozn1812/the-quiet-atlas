import { Box3, BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Group, Matrix3, Mesh, MeshStandardMaterial,
  TubeGeometry, Vector3, type Object3D, type Texture, type WebGLRenderer } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createHrPropsBatch, type HrPropSite } from "../props/hr-props";
import { setBakedPropQuality } from "../props/batched";
import { cliffRandom, createTerrainCliffRelief, springCliffRelief } from "./cliff-relief";
import { surfaceHeight, waterLevelAt } from "./height";
import { nearestPath } from "./samples";
import { createCliffCoverMaterial } from "../materials/cliff";

interface Column { x: number; z: number; topX: number; topZ: number; low: number; high: number; nx: number; nz: number }

/** Sample exposed wall columns, never the playable heightfield/collider. */
export function cliffColumns(mesh: Mesh, spring = false): Column[] {
  const geometry = mesh.geometry, p = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
  if (!p || !normals) return [];
  mesh.updateWorldMatrix(true, false);
  const normalMatrix = new Matrix3().getNormalMatrix(mesh.matrixWorld);
  const columns = new Map<string, Column>(), point = new Vector3(), normal = new Vector3();
  const count = geometry.index?.count ?? p.count;
  for (let i = 0; i < count; i += spring ? 9 : 1) {
    const vertex = geometry.index?.getX(i) ?? i;
    normal.fromBufferAttribute(normals, vertex).applyMatrix3(normalMatrix).normalize();
    if (normal.y > .8 || normal.y < -.4) continue;
    point.fromBufferAttribute(p, vertex).applyMatrix4(mesh.matrixWorld);
    if (nearestPath(point.x, point.z).distance < 6) continue;
    const key = `${Math.floor(point.x / 4)}:${Math.floor(point.z / 4)}`;
    const existing = columns.get(key);
    if (existing) {
      if (point.y < existing.low) { existing.low = point.y; existing.x = point.x; existing.z = point.z; }
      if (point.y > existing.high) { existing.high = point.y; existing.topX = point.x; existing.topZ = point.z; }
    } else columns.set(key, { x: point.x, z: point.z, topX: point.x, topZ: point.z,
      low: point.y, high: point.y, nx: normal.x, nz: normal.z });
  }
  return [...columns.values()];
}

/** Reuse approved HR stones; short roots/vines are original curve geometry. */
function createAccents(columns: readonly Column[], spring: boolean) {
  const group = new Group(); group.name = "terrain-cliff-accents";
  const stones: HrPropSite[] = [], roots: BufferGeometry[] = [], vines: BufferGeometry[] = [];
  const cover: number[] = [], coverColors: number[] = [], coverMasks: number[] = [];
  const triangle = (a: Vector3, b: Vector3, c: Vector3, color: readonly number[], soil = false) => {
    for (const [i, point] of [a, b, c].entries()) {
      cover.push(point.x, point.y, point.z); coverColors.push(...color); coverMasks.push(soil ? 1 : 0, i ? 0 : 1);
    }
  };
  for (const column of columns) {
    const random = cliffRandom(column.x, column.z);
    const length = Math.hypot(column.nx, column.nz);
    if (length < .1) continue;
    const nx = column.nx / length, nz = column.nz / length;
    // Follow the downhill side until the slope eases, then bury talus in the ground.
    let fx = column.x + nx * .6, fz = column.z + nz * .6;
    if (!spring) for (let distance = 1; distance < 12; distance += 1) {
      const x = column.x + nx * distance, z = column.z + nz * distance;
      const y = surfaceHeight(x, z);
      fx = x; fz = z;
      if (surfaceHeight(x + nx, z + nz) - y > -.45) break;
    }
    for (let j = 0; j < 7; j++) {
      const seed = cliffRandom(fx + j * 2.17, fz - j * 1.31);
      const size = j === 0 ? .65 + seed * .9 : .09 + seed * .46;
      const x = fx + nz * (seed - .5) * 3 + nx * j * .25;
      const z = fz - nx * (seed - .5) * 3 + nz * j * .25;
      if (nearestPath(x, z).distance < 4.5 + size || surfaceHeight(x, z) < waterLevelAt(z) + .1) continue;
      stones.push({ asset: j % 4 ? "hr-rock-slate" : "hr-rock-moss-boulder", x, z,
        size: [size * (1.2 + seed * .6), size * (.55 + seed * .45), size], yaw: seed * Math.PI * 2, tint: .75 + seed * .25 });
      // Broken soil fans bury the stones; small folded leaves and grass emerge between sizes.
      const ground = (dx: number, dz: number) => new Vector3(x + dx, surfaceHeight(x + dx, z + dz) + .025, z + dz);
      for (let k = 0; k < 7; k++) {
        const angle = k * Math.PI * 2 / 7, next = (k + 1) * Math.PI * 2 / 7;
        const radius = (.45 + size * .85) * (.65 + cliffRandom(x + k, z) * .4);
        triangle(ground(0, 0), ground(Math.cos(angle) * radius, Math.sin(angle) * radius),
          ground(Math.cos(next) * radius, Math.sin(next) * radius), [.22 + seed * .03, .21 + seed * .025, .1], true);
        const leaf = ground(Math.cos(angle) * radius * .7, Math.sin(angle) * radius * .7);
        triangle(leaf.clone().add(new Vector3(-.09, 0, -.035)), leaf.clone().add(new Vector3(.01, .035, .04)),
          leaf.clone().add(new Vector3(.14, 0, .015)), [.23 + seed * .12, .15 + seed * .06, .055]);
        if (k % 2) continue;
        const tip = leaf.clone().add(new Vector3(nx * .12, .18 + seed * .3, nz * .12));
        triangle(leaf.clone().add(new Vector3(nz * .035, 0, -nx * .035)), tip,
          leaf.clone().add(new Vector3(-nz * .035, 0, nx * .035)), [.11 + seed * .06, .18 + seed * .05, .035]);
      }
    }
    const forest = nearestPath(column.x, column.z).t < .38;
    if (!forest || random < .35 || column.high - column.low < (spring ? 2 : .6)) continue;
    const drop = Math.min(spring ? 4 + random * 6 : .7 + random * 1.7, column.high - column.low);
    const origin = new Vector3(column.topX + nx * .12, column.high - .1, column.topZ + nz * .12);
    for (let strand = 0; strand < 2; strand++) {
      const points = Array.from({ length: 7 }, (_, j) => {
        const t = j / 6;
        const rock = spring ? springCliffRelief(origin.x, origin.y - drop * t, origin.z)
          - springCliffRelief(origin.x, origin.y, origin.z) : 0;
        return origin.clone().add(new Vector3(nx * (.08 + rock) + nz * strand * .18,
          -drop * t, nz * (.08 + rock) - nx * strand * .18));
      });
      const tube = new TubeGeometry(new CatmullRomCurve3(points), 18, strand ? .016 : .035 + random * .025, 5, false);
      (strand ? vines : roots).push(tube);
    }
  }
  const materials: MeshStandardMaterial[] = [], merged: BufferGeometry[] = [];
  const coverSurface = cover.length ? createCliffCoverMaterial() : undefined;
  if (cover.length) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(cover, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(coverColors, 3)); geometry.computeVertexNormals();
    geometry.setAttribute("cliffCover", new Float32BufferAttribute(coverMasks, 2));
    const material = coverSurface!.material;
    const mesh = new Mesh(geometry, material); mesh.name = "terrain-cliff-soil-leaves-grass";
    mesh.receiveShadow = true; mesh.raycast = () => {}; group.add(mesh); merged.push(geometry); materials.push(material);
  }
  for (const [pieces, color, name] of [[roots, 0x403525, "terrain-cliff-roots"], [vines, 0x354a24, "terrain-cliff-vines"]] as const) {
    if (!pieces.length) continue;
    const geometry = mergeGeometries(pieces)!; pieces.forEach(piece => piece.dispose());
    const material = new MeshStandardMaterial({ color, roughness: .96 });
    const mesh = new Mesh(geometry, material); mesh.name = name; mesh.receiveShadow = true; mesh.raycast = () => {};
    group.add(mesh); merged.push(geometry); materials.push(material);
  }
  // The library owner shares HR meshes/decoders and handles LOD, distance culling and late disposal.
  const fallback = new BufferGeometry();
  fallback.setAttribute("position", new Float32BufferAttribute([], 3));
  // This is a streaming owner, not a proxy surface: arbitrary site triples must
  // never be rendered as giant triangles while the HR asset is decoding.
  fallback.boundingBox = new Box3();
  for (const site of stones) fallback.boundingBox.expandByPoint(new Vector3(site.x, surfaceHeight(site.x, site.z), site.z));
  const batch = stones.length ? createHrPropsBatch(fallback, [], (x, z) => surfaceHeight(x, z) - .12,
    undefined, undefined, stones) : undefined;
  if (batch) { group.add(batch.mesh); batch.mesh.name = "terrain-cliff-talus"; }
  return { group, batch, setTextures(textures: readonly Texture[], size: number) { coverSurface?.setTextures(textures, size); }, dispose() {
    batch?.dispose(); if (!batch) fallback.dispose();
    merged.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); group.removeFromParent();
  } };
}

/** Owned by the existing deferred photo controller: no new index.ts integration. */
export function createTerrainCliffs(root: Object3D, renderer: WebGLRenderer) {
  const residents = new Map<Mesh, { skin?: Mesh; accents: ReturnType<typeof createAccents> }>();
  let disposed = false;
  const release = (mesh: Mesh) => {
    const entry = residents.get(mesh)!;
    entry.skin?.removeFromParent(); entry.skin?.geometry.dispose(); entry.accents.dispose(); residents.delete(mesh);
  };
  return {
    refresh(enabled: boolean, textures: readonly Texture[] = [], size = 0) {
      if (disposed) return;
      const sources: Mesh[] = [];
      // Collect before adding children: traversal never discovers its own decorations.
      root.traverse(object => {
        if (object instanceof Mesh && (object.name === "terrain-tile"
          || object.name === "first-light-sculpted-rock")) sources.push(object);
      });
      const resident = new Set(sources);
      for (const mesh of residents.keys()) if (!resident.has(mesh)) release(mesh);
      for (const mesh of sources) {
        if (mesh.name === "terrain-tile" && mesh.material instanceof MeshStandardMaterial
          && mesh.material.name === "cc0-terrain" && !mesh.material.userData.backdropTransition) {
          const material = mesh.material, before = material.onBeforeCompile, key = material.customProgramCacheKey();
          material.userData.backdropTransition = true;
          material.onBeforeCompile = (shader, gpu) => {
            before.call(material, shader, gpu);
            // Whole detail tiles extend past the route corridor. Their distant
            // coastal faces must meet the forest backdrop in pigment and air,
            // rather than revealing a diagonal boundary between two materials.
            shader.fragmentShader = shader.fragmentShader
              .replace("#include <roughnessmap_fragment>", `
                float backdropBlend = smoothstep(20.0, 55.0, -photoWorld.x)
                  * smoothstep(45.0, 85.0, distance(cameraPosition, photoWorld));
                backdropBlend *= 1.0 - clamp(max(photoMask.y, max(photoMask.z, photoMask.w)), 0.0, 1.0);
                diffuseColor.rgb *= mix(vec3(1.0), vec3(0.24, 0.60, 0.18), backdropBlend);
                #include <roughnessmap_fragment>`)
              .replace("#include <fog_fragment>", `
                vec3 terrainUnfogged = gl_FragColor.rgb;
                #include <fog_fragment>
                #ifdef USE_FOG
                float backdropRange = distance(cameraPosition, photoWorld);
                float backdropAir = 1.0 - exp(-max(0.0, backdropRange - 130.0) * 0.0011);
                float backdropMist = (1.0 - smoothstep(4.0, 40.0, photoWorld.y)) * smoothstep(130.0, 300.0, backdropRange);
                vec3 backdropColor = mix(terrainUnfogged, vec3(0.12, 0.22, 0.30), backdropAir);
                backdropColor = mix(backdropColor, fogColor, backdropMist);
                gl_FragColor.rgb = mix(gl_FragColor.rgb, backdropColor, backdropBlend);
                #endif`);
          };
          material.customProgramCacheKey = () => `${key}:backdrop-transition-v1`;
          material.needsUpdate = true;
        }
        if (mesh.name.startsWith("first-light-sculpted-rock") && mesh.material instanceof MeshStandardMaterial
          && !mesh.material.userData.mineralScale) {
          const material = mesh.material, before = material.onBeforeCompile, key = material.customProgramCacheKey();
          material.userData.mineralScale = true;
          // Runs after the shared weather shader has attached the resident CC0
          // atlas. The close face needs sub-metre mineral grain, not 4.7 m stains.
          material.onBeforeCompile = (shader, gpu) => {
            before.call(material, shader, gpu);
            shader.fragmentShader = shader.fragmentShader
              .replaceAll("cliffUV / 4.7 + warp.xy * 0.17", "cliffUV / 0.95 + warp.xy * 0.04")
              .replaceAll("cliffUV / 1.9 + vec2(0.43, 0.71)", "cliffUV / 0.61 + vec2(0.43, 0.71)")
              .replace("vec4 weather = cliffWeather(cliffP, normalize(cliffN), 0.85);",
                "vec4 weather = cliffWeather(cliffP, normalize(cliffN), 0.85) * vec4(0.25, 0.8, 0.65, 1.0);")
              .replace("normal = normalize(normal + mat3(viewMatrix) * cliffBump * 0.35 * faceDirection);", `
                normal = normalize(normal + mat3(viewMatrix) * cliffBump * 0.35 * faceDirection);
                if (cliffAtlasSize > 0.0) {
                  vec2 mineralN = cliffPacked.rg * 2.0 - 1.0;
                  vec3 mineralBump = abs(cliffN.x) > abs(cliffN.z)
                    ? vec3(0.0, mineralN.y, mineralN.x) : vec3(mineralN.x, mineralN.y, 0.0);
                  normal = normalize(normal + mat3(viewMatrix) * mineralBump * 0.55 * faceDirection);
                }`);
          };
          material.customProgramCacheKey = () => `${key}:mineral-metres-v1`;
          material.needsUpdate = true;
        }
        let entry = residents.get(mesh);
        if (!entry && enabled) {
          const spring = mesh.name !== "terrain-tile";
          const skinGeometry = spring ? undefined : createTerrainCliffRelief(mesh);
          const skin = skinGeometry ? new Mesh(skinGeometry, mesh.material) : undefined;
          if (skin) { skin.name = "terrain-cliff-relief"; skin.receiveShadow = true; skin.raycast = () => {}; mesh.add(skin); }
          const columns = new Map<string, Column>();
          const collect = (part: Mesh) => {
            for (const column of cliffColumns(part, spring)) {
              const key = `${Math.floor(column.x / 4)}:${Math.floor(column.z / 4)}`;
              const previous = columns.get(key);
              if (previous) {
                if (column.low < previous.low) { previous.low = column.low; previous.x = column.x; previous.z = column.z; }
                if (column.high > previous.high) { previous.high = column.high; previous.topX = column.topX; previous.topZ = column.topZ; }
              }
              else columns.set(key, column);
            }
          };
          if (spring) mesh.parent?.traverse(object => {
            if (object instanceof Mesh && object.name.startsWith("first-light-sculpted-rock")) collect(object);
          });
          else collect(mesh);
          // One instanced talus batch for the complete spring, not one per cull section.
          const accents = createAccents([...columns.values()], spring);
          // World-space accents stay independent of normalized GLB node transforms.
          mesh.updateWorldMatrix(true, false);
          // Inverse non-uniform GLB scale + rotation can contain shear. Keep the
          // full matrix; decomposing it into TRS turns hanging roots into beams.
          accents.group.matrixAutoUpdate = false;
          accents.group.matrix.copy(mesh.matrixWorld).invert(); mesh.add(accents.group);
          entry = { skin, accents }; residents.set(mesh, entry);
          // This controller is reached only after the playable/deferred photo gate.
          if (accents.batch) void accents.batch.loadDetail(renderer);
        }
        if (!entry) continue;
        entry.accents.setTextures(textures, size);
        if (entry.skin) { entry.skin.visible = enabled; entry.skin.material = mesh.material; }
        entry.accents.group.visible = enabled;
        setBakedPropQuality(entry.accents.group, enabled ? "High" : "Low");
      }
    },
    dispose() { if (disposed) return; disposed = true; for (const mesh of residents.keys()) release(mesh); },
  };
}
