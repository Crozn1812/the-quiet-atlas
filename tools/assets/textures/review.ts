import { BoxGeometry, Color, DirectionalLight, Float32BufferAttribute, HemisphereLight, InstancedMesh, Matrix4, Mesh, MeshToonMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer } from "three";
import { createPhotoSurfaces } from "../../../src/features/world/materials/cc0";
import { createGroundDetails } from "../../../src/features/world/foliage/ground";

const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(1200, 700); document.body.append(renderer.domElement);
const scene = new Scene(); scene.background = new Color(0xeee8d8);
const camera = new PerspectiveCamera(50, 1200 / 700, 0.1, 200);
camera.position.set(8, 7, 10); camera.lookAt(0, 0, 0);
scene.add(new HemisphereLight(0xeef4ff, 0x77755b, 2));
const sun = new DirectionalLight(0xffe6bb, 3); sun.position.set(3, 8, 2); scene.add(sun);
const material = new MeshToonMaterial({ color: 0x9caa78, vertexColors: true });
const plane = new PlaneGeometry(18, 18, 4, 4); plane.rotateX(-Math.PI / 2);
const count = plane.getAttribute("position").count;
plane.setAttribute("color", new Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
const masks = new Float32Array(count * 4);
for (let i = 0; i < count; i++) masks[i * 4] = plane.getAttribute("position").getX(i) < 0 ? 1 : 0;
plane.setAttribute("cc0Surface", new Float32BufferAttribute(masks, 4));
const terrain = new Mesh(plane, material); terrain.name = "terrain-tile"; scene.add(terrain);
const box = new BoxGeometry(3, 4, 3); box.setAttribute("color", new Float32BufferAttribute(new Float32Array(24 * 3).fill(0.8), 3));
const rock = new Mesh(box, material); rock.position.y = 2; rock.name = "spring-mossy-cliff"; scene.add(rock);
const ground = createGroundDetails(3); scene.add(ground.group);
const stone = ground.group.getObjectByName("ground-wood-stone") as InstancedMesh;
stone.visible = true;
stone.count = 1; stone.setMatrixAt(0, new Matrix4().makeTranslation(3, 0.1, 1));
stone.geometry.getAttribute("groundVariant").setX(0, 1);
stone.frustumCulled = false;
// Deferred variant meshes pad the first silhouette with zero-area triangles.
// A later log silhouette can draw there with a zero shared normal attribute.
const originalNormals = stone.geometry.getAttribute("normal");
const zeroNormals = originalNormals.clone(); zeroNormals.array.fill(0);
const controller = createPhotoSurfaces(scene, renderer);
for (const quality of ["Low", "Balanced", "High"] as const) {
  await controller.setQuality(quality);
  if (/swiftshader/i.test(String(renderer.getContext().getParameter(renderer.getContext().getExtension("WEBGL_debug_renderer_info")?.UNMASKED_RENDERER_WEBGL ?? renderer.getContext().RENDERER)))
    && terrain.material.type !== "MeshBasicMaterial") throw new Error("Software rasterizer did not retain flat shading");
  stone.visible = true; stone.count = 1;
  stone.geometry.setAttribute("normal", zeroNormals);
  terrain.visible = rock.visible = false; scene.background = new Color(0);
  renderer.render(scene, camera);
  const gl = renderer.getContext(), pixels = new Uint8Array(1200 * 700 * 4);
  gl.readPixels(0, 0, 1200, 700, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let lit = 0;
  for (let pixel = 0; pixel < pixels.length; pixel += 4) {
    if (Math.max(pixels[pixel]!, pixels[pixel + 1]!, pixels[pixel + 2]!) > 32) lit++;
  }
  if (lit < 100) throw new Error(`${quality}: ground variant with zero shared normals rendered black (${lit} lit pixels)`);
  console.info(`PHOTO_GPU_${quality}_ZERO_NORMAL_OK`, lit);
  stone.geometry.setAttribute("normal", originalNormals);
  terrain.visible = rock.visible = true; scene.background = new Color(0xeee8d8);
  renderer.render(scene, camera);
  console.info(`PHOTO_GPU_${quality}_OK`, renderer.info.render);
}
document.body.dataset.ready = "true";
