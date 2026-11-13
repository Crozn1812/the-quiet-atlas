import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, DirectionalLight, Float32BufferAttribute,
  FogExp2, Group, HemisphereLight, InstancedMesh, Mesh, Object3D, PerspectiveCamera,
  PlaneGeometry, Scene, type Material, type WebGLRenderer,
} from 'three';
import { createPineCrown, createBroadleafCrown, createTreeTrunk } from '../../../src/features/world/foliage/shapes';
import { createRock, createGrassTuft, createFern } from '../../../src/features/world/foliage/ground';
import { PALETTE } from '../../../src/features/world/art/palette';
import { createMaterials, uvFor } from './materials';
import { createMist, createSky, createWater } from './atmosphere';
import { mix, seeded, SETTINGS, vector, type Selection } from './settings';

export async function createStudy(renderer: WebGLRenderer, selection: Selection) {
  const { scene: id, variant, quality } = selection, low = quality === 'Low';
  const settings = SETTINGS[id], scene = new Scene();
  const camera = new PerspectiveCamera(48, 16 / 9, 0.3, 1400);
  camera.layers.enable(1);
  camera.position.copy(vector(settings.camera)); camera.lookAt(vector(settings.target));
  scene.fog = new FogExp2(settings.horizon, settings.fog);
  const materials = await createMaterials(renderer, selection);
  scene.environment = materials.environment ?? null;
  scene.environmentRotation.y = id === 'last-postcard' ? 0.5 : -0.4;
  const sun = new DirectionalLight(settings.light, settings.sunPower);
  sun.position.copy(vector(settings.sun)); sun.castShadow = true;
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, near: 0.5, far: 250 });
  sun.shadow.bias = -0.0014; sun.shadow.normalBias = 0.22;
  sun.shadow.radius = 1.5;
  sun.target.position.set(0, 0, -25);
  const hemi = new HemisphereLight(mix('skyLow', 'indigo', 0.08), mix('grassDry', 'forestDeep', 0.4), id === 'horizon' ? 1.5 : 1.1);
  scene.add(sun, sun.target, hemi, createSky(id));
  scene.add(...createMist(id, camera.position, low));

  const riverX = (z: number) => -5 + Math.sin(z * 0.045) * 10 + Math.sin(z * 0.013) * 5;
  const roadX = (z: number) => -7 + Math.sin(z * 0.026) * 13 + z * 0.07;
  const height = (x: number, z: number) => {
    if (id === 'first-light') return 1.7 + Math.sin(x * 0.075) * 0.45 + Math.cos(z * 0.052) * 0.3 - Math.exp(-(((x - riverX(z)) / 3.9) ** 2)) * 2.5 + Math.max(0, Math.abs(x) - 45) * 0.18;
    if (id === 'horizon') return 4 + Math.sin(x * 0.029 + z * 0.018) * 3.8 + Math.cos(z * 0.045) * 1.6 - Math.max(0, -z - 35) * 0.12;
    const road = roadX(z), cliff = 8 / (1 + Math.exp((x - road + 12) * 0.1));
    return 1.8 + cliff + Math.sin(z * 0.035) * 0.65 - Math.max(0, x - road - 10) * 0.27 - Math.max(0, -z - 100) * 0.05;
  };
  const pigment = new Color();
  // Same sculpted plane and R1 tree/rock silhouettes in A/B. Only C adds leaf cards.
  const terrain = new PlaneGeometry(420, 460, 150, 164); terrain.rotateX(-Math.PI / 2); terrain.translate(0, 0, -140);
  const positions = terrain.getAttribute('position'), colors: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i), y = height(x, z);
    positions.setY(i, y);
    const patch = (Math.sin(x * 0.18 + Math.sin(z * 0.09) * 2) * Math.sin(z * 0.15) + 1) / 2;
    pigment.copy(id === 'first-light' ? mix('forestLight', 'grass', 0.35) : mix('grass', 'grassDry', 0.27)).lerp(new Color(PALETTE.grassDry), patch * 0.22);
    if (id === 'first-light') pigment.lerp(mix('rockDark', 'sand', 0.6), Math.exp(-(((x - riverX(z)) / 5.7) ** 2)) * 0.85);
    if (y < 1.2 && id !== 'first-light') pigment.lerp(new Color(PALETTE.sand), Math.min(1, (1.2 - y) * 1.3));
    colors.push(pigment.r, pigment.g, pigment.b);
  }
  terrain.setAttribute('color', new Float32BufferAttribute(colors, 3)); terrain.computeVertexNormals();
  const ground = new Mesh(uvFor(terrain, 'ground'), materials.ground); ground.receiveShadow = true; scene.add(ground);
  const water = createWater(id, variant !== 'A');
  if (id === 'first-light') {
    const points: number[] = [], indices: number[] = [];
    for (let i = 0; i <= 200; i++) {
      const z = 75 - i * 1.8, x = riverX(z), width = 2.1 + Math.sin(z * 0.09) * 0.3;
      points.push(x - width, -0.35, z, x + width, -0.35, z);
      if (i < 200) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    water.geometry.dispose(); water.geometry = new BufferGeometry();
    water.geometry.setAttribute('position', new Float32BufferAttribute(points, 3)); water.geometry.setIndex(indices);
    water.rotation.set(0, 0, 0); water.position.set(0, 0, 0);
  }
  scene.add(water);

  const dummy = new Object3D(), random = seeded(7401);
  function instances(geometry: BufferGeometry, material: Material, items: { x: number; y: number; z: number; scale: number; yaw: number }[], shadows = true) {
    const mesh = new InstancedMesh(geometry, material, items.length);
    items.forEach((item, index) => {
      dummy.position.set(item.x, item.y, item.z); dummy.rotation.set(0, item.yaw, 0); dummy.scale.setScalar(item.scale); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.castShadow = shadows; mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true; scene.add(mesh);
    return mesh;
  }
  const trees: { x: number; y: number; z: number; scale: number; yaw: number; pine: boolean }[] = [];
  for (let i = 0; i < 270; i++) {
    const x = (random() - 0.5) * 170, z = 50 - random() * 220;
    const scale = 0.78 + random() * 0.6, yaw = random() * Math.PI * 2, y = height(x, z), pine = i % 4 !== 0;
    if (low && i % 3 === 0) continue;
    if (Math.hypot(x - camera.position.x, z - camera.position.z) < 9 || y < 0.7) continue;
    if (id === 'first-light' && Math.abs(x - riverX(z)) < 6.5) continue;
    if (id === 'horizon' && (x > -30 || z < -65 || i % 3 !== 0)) continue;
    if (id === 'last-postcard' && (x > roadX(z) - 7 || z < -100)) continue;
    trees.push({ x, y, z, scale, yaw, pine });
  }
  for (let shape = 0; shape < 3; shape++) {
    const subset = trees.filter((_, i) => i % 3 === shape);
    const pines = subset.filter(tree => tree.pine), broadleaf = subset.filter(tree => !tree.pine);
    const pine = createPineCrown(300 + shape); pine.translate(0, 5, 0);
    const broad = createBroadleafCrown([600, 602, 604][shape]); broad.translate(0, 5, 0);
    instances(pine, materials.crown, pines);
    instances(broad, materials.crown, broadleaf);
    for (const [height, items] of [[(15 + shape) * (2 / 3 + 0.05), pines], [5, broadleaf]] as const) {
      const trunk = createTreeTrunk(); trunk.scale(1, height, 1); trunk.translate(0, height / 2, 0); trunk.deleteAttribute('color');
      instances(uvFor(trunk, 'bark'), materials.bark, items);
    }
  }
  if (materials.leaves) {
    const random = seeded(8103);
    const leaves = [];
    for (const tree of trees) for (let i = 0; i < (low ? 8 : 30); i++) {
      const angle = random() * Math.PI * 2, radius = tree.pine ? 1.8 : 4.3;
      leaves.push({ x: tree.x + Math.cos(angle) * radius * tree.scale, y: tree.y + (tree.pine ? 7.5 : 6.8) * tree.scale + (random() - 0.5) * 3, z: tree.z + Math.sin(angle) * radius * tree.scale, scale: tree.scale * (0.85 + random() * 0.7), yaw: angle });
    }
    const cards = instances(new PlaneGeometry(2.1, 2.8), materials.leaves, leaves);
    cards.layers.set(1); cards.name = 'thin-leaf-cards';
  }
  for (let shape = 0; shape < 3; shape++) {
    const random = seeded(9103 + shape);
    const rocks = [];
    for (let i = 0; i < 52; i++) {
      let x = (random() - 0.5) * 120; const z = 40 - random() * 160;
      if (id === 'first-light') x = riverX(z) + (i % 2 ? 1 : -1) * (3 + random() * 6);
      if (id === 'last-postcard') x = roadX(z) + 6 + random() * 14;
      const y = height(x, z), scale = 0.6 + random() * 2.3, yaw = random() * 6.28;
      if (y < -0.2 || (low && i % 2)) continue;
      rocks.push({ x, y: y + 0.15, z, scale, yaw });
    }
    const geometry = createRock(1200 + shape); geometry.deleteAttribute('color');
    instances(uvFor(geometry, 'rock'), materials.rock, rocks);
  }
  for (let shape = 0; shape < 3; shape++) {
    const random = seeded(10103 + shape);
    const plants = [], ferns = [];
    for (let i = 0; i < 1600; i++) {
      const x = (random() - 0.5) * 110, z = 45 - random() * 140, y = height(x, z), s = 0.7 + random() * 1.6, yaw = random() * 6.28;
      if (low && i % 4) continue;
      if (y < 0.6 || (id === 'last-postcard' && Math.abs(x - roadX(z)) < 4)) continue;
      const item = { x, y, z, scale: s, yaw };
      plants.push(item); if (id === 'first-light' && i % 12 === 0) ferns.push({ ...item, scale: 1.5 });
    }
    instances(createGrassTuft(901 + shape * 2), materials.grass, plants, false);
    instances(createFern(1400 + shape, { detail: 'high' }), materials.crown, ferns, false);
  }

  if (id !== 'first-light') {
    // Distant green headlands leave the sea's horizon open.
    for (let i = 0; i < 5; i++) {
      const ridge = new Mesh(new PlaneGeometry(240, 160, 28, 18), materials.ground);
      ridge.geometry.rotateX(-Math.PI / 2);
      const p = ridge.geometry.getAttribute('position'), c = [];
      for (let j = 0; j < p.count; j++) {
        const x = p.getX(j), z = p.getZ(j);
        const y = Math.exp(-((x / 95) ** 2 + (z / 58) ** 2)) * (30 + i * 7) - 4;
        p.setY(j, y); const color = mix('forestDeep', 'mist', 0.12 + i * 0.12); c.push(color.r, color.g, color.b);
      }
      ridge.geometry.setAttribute('color', new Float32BufferAttribute(c, 3)); ridge.geometry.computeVertexNormals(); uvFor(ridge.geometry, 'ground');
      ridge.position.set(-160 - i * 110, 0, -160 - i * 95); scene.add(ridge);
    }
  }
  const props = new Group(); scene.add(props);
  function box(x: number, y: number, z: number, w: number, h: number, d: number, material: Material) {
    const mesh = new Mesh(new BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; props.add(mesh); return mesh;
  }
  if (id === 'horizon') {
    // Quiet overlook with two distant turbines; no signage or branding.
    for (let i = 0; i < 3; i++) {
      const x = -22 - i * 20, z = -45 - i * 18, y = height(x, z);
      const tower = new Mesh(new CylinderGeometry(0.16, 0.5, 16, 7), materials.stripe); tower.position.set(x, y + 8, z); props.add(tower);
      for (let arm = 0; arm < 3; arm++) { const blade = box(x, y + 16, z, 0.2, 6, 0.13, materials.stripe); blade.geometry.translate(0, 2.8, 0); blade.rotation.z = arm * Math.PI * 2 / 3 + 0.3; }
    }
    const y = height(6, -6); box(6, y + 0.8, -6, 4.3, 0.18, 1.2, materials.wood); box(6, y + 1.5, -6.5, 4.3, 0.8, 0.15, materials.wood);
    for (const x of [4.3, 7.7]) box(x, y + 0.4, -6, 0.2, 0.8, 1.1, materials.wood);
  }
  if (id === 'last-postcard') {
    const road = new PlaneGeometry(7.4, 270, 1, 180); road.rotateX(-Math.PI / 2); road.translate(0, 0, -90);
    const p = road.getAttribute('position');
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i), x = p.getX(i) + roadX(z); p.setXYZ(i, x, height(x, z) + 0.09, z); }
    road.computeVertexNormals(); scene.add(new Mesh(road, materials.road));
    for (let z = 35; z > -170; z -= 8) {
      const x = roadX(z), y = height(x, z), dx = roadX(z + 0.1) - x;
      const stripe = box(x, y + 0.12, z, 0.12, 0.015, 3, materials.stripe); stripe.rotation.y = Math.atan2(dx, 0.1);
      const edge = roadX(z) + 5.4;
      box(edge, height(edge, z) + 0.8, z, 0.18, 1.6, 0.18, materials.wood);
      if (z > -160) { const beam = box(edge, height(edge, z) + 1.25, z - 4, 0.12, 0.17, 8.2, materials.wood); beam.rotation.y = Math.atan2(roadX(z) - roadX(z - 8), 8); }
    }
  }
  scene.updateMatrixWorld(true);
  return {
    scene, camera, exposure: settings.exposure, focus: settings.focus,
    dispose() {
      const geometries = new Set<BufferGeometry>(), ownMaterials = new Set<Material>();
      scene.traverse(object => { if (object instanceof Mesh) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) ownMaterials.add(material); if (object instanceof InstancedMesh) object.dispose(); } });
      geometries.forEach(geometry => geometry.dispose()); ownMaterials.forEach(material => material.dispose()); materials.dispose(); sun.dispose();
      scene.clear();
    },
  };
}
