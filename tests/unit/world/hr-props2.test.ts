import { BoxGeometry, CylinderGeometry, DataTexture, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from "three";
import { expect, it, vi } from "vitest";
import { createGrassField } from "../../../src/features/world/foliage/grass-field";
import { createForestFloor, forestFloorGeometry } from "../../../src/features/world/foliage/ground-litter";
import { createGroundDetails } from "../../../src/features/world/foliage/ground";
import { ZONES } from "../../../src/features/world/layout/zones";
import { hrStructureGeometry, bindHrStructure } from "../../../src/features/world/props/hr-structures";
import { fitHrProp } from "../../../src/features/world/props/hr-props";
import * as hrProps from "../../../src/features/world/props/hr-props";
import { setBakedPropQuality } from "../../../src/features/world/props/batched";
import { createSurfaceSampler } from "../../../src/features/world/terrain/height";
import { createCoastalTree, coastalSprayTexture } from "../../../src/features/world/foliage/hr-coastal";

it("leaves High grass to HR-LIGHT without querying or drawing the retired torus", () => {
  const field = createGrassField("High");
  const now = vi.spyOn(performance, "now");
  try {
    expect(field.update(10, -200, 1)).toEqual({ sampled: 0, pending: 0 });
    expect(field.mesh.count).toBe(0); expect(field.mesh.visible).toBe(false);
    expect(now).not.toHaveBeenCalled();
    const geometry = forestFloorGeometry("grass");
    expect(geometry.getAttribute("position").count).toBe(7 * 6 * 2);
    expect(geometry.index!.count / 3).toBe(7 * 5 * 2);
    geometry.dispose();
  } finally { now.mockRestore(); field.dispose(); }
});

it("scatters 5–15 cm fallen leaves with mixed widths, curl depths and pigments at First Light", () => {
  const floor = createForestFloor(), camera = new PerspectiveCamera();
  camera.position.copy(ZONES[0]!.position).add(new Vector3(12, 5.5, 13));
  camera.lookAt(ZONES[0]!.position);
  const now = vi.spyOn(performance, "now").mockReturnValue(0);
  try {
    for (let i = 0; i < 120; i++) floor.update(camera, "High", 1 / 60);
    const leaves = floor.group.getObjectByName("hr-floor-leaf") as InstancedMesh;
    const matrix = new Matrix4(), scale = new Vector3(), sizes = new Set(), curls = new Set(), pigments = new Set();
    expect(leaves.count).toBeGreaterThan(500);
    const p = leaves.geometry.getAttribute("position");
    leaves.geometry.computeBoundingBox();
    const length = leaves.geometry.boundingBox!.getSize(new Vector3()).z;
    for (let i = 0; i < leaves.count; i++) {
      leaves.getMatrixAt(i, matrix); scale.setFromMatrixScale(matrix);
      expect(length * scale.z).toBeGreaterThanOrEqual(0.05 - 1e-7);
      expect(length * scale.z).toBeLessThanOrEqual(0.15 + 1e-7);
      sizes.add(Math.floor(length * scale.z * 1000)); curls.add(Math.floor(scale.y / scale.z * 20));
      pigments.add(leaves.instanceColor!.getX(i).toFixed(3));
    }
    expect(sizes.size).toBeGreaterThan(80); expect(curls.size).toBeGreaterThan(20); expect(pigments.size).toBeGreaterThan(40);
    expect(p.getY(p.count - 2) - p.getY(1)).toBeGreaterThan(0.003);
    expect(p.getY(9) - p.getY(10)).toBeGreaterThan(0.002);
  } finally { now.mockRestore(); floor.dispose(); }
});

it("drapes all fallen-leaf vertices within 1 cm of rendered triangles, including lattice seams, and shares their contact shadows", () => {
  const floor = createForestFloor(), camera = new PerspectiveCamera(90, 16/9), surface = createSurfaceSampler();
  camera.position.set(6, 8.00437, 15.75); camera.lookAt(6, 7.53487, 15);
  const now = vi.spyOn(performance, "now").mockReturnValue(0);
  try {
    for (let i = 0; i < 120; i++) floor.update(camera, "High", 1/60);
    const leaves = floor.group.getObjectByName("hr-floor-leaf") as InstancedMesh;
    const contacts = floor.group.getObjectByName("hr-floor-leaf-contact") as InstancedMesh;
    expect(leaves.count).toBeGreaterThan(500); expect(contacts.count).toBe(leaves.count); expect(contacts.instanceMatrix).toBe(leaves.instanceMatrix);
    const matrix = new Matrix4(), point = new Vector3(), scale = new Vector3(), p = leaves.geometry.getAttribute("position");
    let seams = 0;
    for (let i = 0; i < leaves.count; i++) {
      leaves.getMatrixAt(i, matrix); scale.setFromMatrixScale(matrix);
      const x0 = Math.round(matrix.elements[12]!/2)*2-2, z0 = Math.round(matrix.elements[14]!/2)*2-2;
      expect(matrix.elements[13]!-surface(matrix.elements[12]!,matrix.elements[14]!)).toBeCloseTo(0.002, 4);
      for (let vertex = 0; vertex < p.count; vertex++) {
        point.fromBufferAttribute(p, vertex).applyMatrix4(matrix);
        const cx = Math.min(1, Math.max(0, Math.floor((point.x-x0)/2))), cz = Math.min(1, Math.max(0, Math.floor((point.z-z0)/2)));
        const u = (point.x-x0)/2-cx, v = (point.z-z0)/2-cz;
        const top = leaves.geometry.getAttribute(`floorPatch${cz}`), bottom = leaves.geometry.getAttribute(`floorPatch${cz+1}`);
        const a = top.array[i*3+cx]!, b = top.array[i*3+cx+1]!, c = bottom.array[i*3+cx]!, d = bottom.array[i*3+cx+1]!;
        const height = u+v <= 1 ? a+(b-a)*u+(c-a)*v : d+(c-d)*(1-u)+(b-d)*(1-v);
        const renderedY = height+0.002+p.getY(vertex)*scale.y, gap = renderedY-surface(point.x,point.z);
        expect(gap).toBeGreaterThan(0); expect(gap).toBeLessThan(0.01);
        if (Math.floor(point.x/2) !== Math.floor(matrix.elements[12]!/2) || Math.floor(point.z/2) !== Math.floor(matrix.elements[14]!/2)) seams++;
      }
    }
    expect(seams).toBeGreaterThan(0);
  } finally { now.mockRestore(); floor.dispose(); }
});

it.each(["hr-coast-casuarina", "hr-coast-casuarina-wind", "hr-coast-acacia"] as const)("keeps %s rooted with a dense hanging crown at both mesh LODs", id => {
  const bark = new MeshStandardMaterial();
  for (const level of [0,1]) {
    const tree = createCoastalTree(id,bark,level);
    try {
      expect(tree.parts).toHaveLength(2); expect(tree.bounds.min.y).toBeLessThanOrEqual(0); expect(tree.bounds.min.y).toBeGreaterThan(-0.02);
      expect(tree.parts[1]!.geometry.boundingBox!.getSize(new Vector3()).y).toBeGreaterThan(tree.bounds.max.y*0.5);
      expect(tree.parts.reduce((total,part) => total+part.geometry.index!.count/3,0)).toBeLessThan(5000);
      const material = tree.parts[1]!.material as MeshStandardMaterial, texture = material.map!;
      const pixels = (texture as DataTexture).image.data as Uint8Array;
      let filled = 0;
      for (let y = 64; y < 192; y++) for (let x = 64; x < 192; x++) if (pixels[(y*256+x)*4+3]! > 128) filled++;
      expect(filled/(128*128)).toBeGreaterThan(0.55);
    } finally { tree.dispose(); }
  }
  const texture = coastalSprayTexture(id.endsWith("acacia"));
  expect(texture.image.width).toBe(256); texture.dispose(); bark.dispose();
});

it("occludes the sky through coastal crowns from four directions at both LODs", () => {
  const bark = new MeshStandardMaterial(), resolution = 96;
  for (const id of ["hr-coast-casuarina", "hr-coast-casuarina-wind", "hr-coast-acacia"] as const) for (const level of [0, 1]) {
    const tree = createCoastalTree(id, bark, level);
    try {
      const crown = tree.parts[1]!, p = crown.geometry.getAttribute("position"), uv = crown.geometry.getAttribute("uv"), indices = crown.geometry.index!;
      const texture = (crown.material as MeshStandardMaterial).map as DataTexture;
      const pixels = texture.image.data as Uint8Array, bounds = crown.geometry.boundingBox!;
      for (let view = 0; view < 4; view++) {
        const angle = view * Math.PI / 4, c = Math.cos(angle), s = Math.sin(angle), mask = new Uint8Array(resolution * resolution);
        const width = bounds.getSize(new Vector3()).length();
        const screen = Array.from({ length: p.count }, (_, i) => [
          ((p.getX(i) * c + p.getZ(i) * s) / width + 0.5) * resolution,
          (p.getY(i) - bounds.min.y) / (bounds.max.y - bounds.min.y) * resolution,
        ]);
        for (let i = 0; i < indices.count; i += 3) {
          const ia = indices.getX(i), ib = indices.getX(i + 1), ic = indices.getX(i + 2);
          const [a, b, d] = [screen[ia]!, screen[ib]!, screen[ic]!];
          const area = (b[1]! - d[1]!) * (a[0]! - d[0]!) + (d[0]! - b[0]!) * (a[1]! - d[1]!);
          if (Math.abs(area) < 1e-8) continue;
          for (let y = Math.max(0, Math.floor(Math.min(a[1]!, b[1]!, d[1]!))); y <= Math.min(resolution - 1, Math.ceil(Math.max(a[1]!, b[1]!, d[1]!))); y++) {
            for (let x = Math.max(0, Math.floor(Math.min(a[0]!, b[0]!, d[0]!))); x <= Math.min(resolution - 1, Math.ceil(Math.max(a[0]!, b[0]!, d[0]!))); x++) {
              const u = ((b[1]! - d[1]!) * (x + 0.5 - d[0]!) + (d[0]! - b[0]!) * (y + 0.5 - d[1]!)) / area;
              const v = ((d[1]! - a[1]!) * (x + 0.5 - d[0]!) + (a[0]! - d[0]!) * (y + 0.5 - d[1]!)) / area, w = 1 - u - v;
              if (u < 0 || v < 0 || w < 0) continue;
              const tx = Math.min(255, Math.floor((u * uv.getX(ia) + v * uv.getX(ib) + w * uv.getX(ic)) * 256));
              const ty = Math.min(255, Math.floor((u * uv.getY(ia) + v * uv.getY(ib) + w * uv.getY(ic)) * 256));
              if (pixels[(ty * 256 + tx) * 4 + 3]! / 255 >= (crown.material as MeshStandardMaterial).alphaTest) mask[y * resolution + x] = 1;
            }
          }
        }
        // The central half-height of the crown must read as foliage, not wires.
        let covered = 0, samples = 0;
        for (let y = 24; y < 72; y++) for (let x = 40; x < 56; x++) { covered += mask[y * resolution + x]!; samples++; }
        expect(covered / samples, `${id} LOD${level} view${view}`).toBeGreaterThan(0.8);
      }
    } finally { tree.dispose(); }
  }
  bark.dispose();
});

it("retires the flattened leaf fallback on High and restores it on Low", () => {
  const ground = createGroundDetails(8);
  try {
    ground.setTiles(Array.from({ length: 8 }, (_, i) => ({ kind: "leaf", variant: 0, x: 20 + i, y: 5, z: -80, scale: 1, rotation: 0 })));
    const mesh = ground.group.getObjectByName("ground-grass-litter") as InstancedMesh;
    expect(mesh.geometry.getAttribute("groundVariant").getX(0)).toBe(4);
    ground.setQuality("Low");
    expect(mesh.count).toBeGreaterThan(0);
    expect(mesh.geometry.getAttribute("groundVariant").getX(0)).toBe(0);
  } finally { ground.dispose(); }
});

it.each([false, true])("preserves every structural contact vertex while adding HR normals/UVs (wood=%s)", wood => {
  const original = new BoxGeometry(1, 0.3, 2).toNonIndexed().translate(12, 4, -9);
  original.computeBoundingBox();
  const before = original.getAttribute("position").array.slice(), result = hrStructureGeometry(original, wood);
  try {
    expect(result.boundingBox).toEqual(original.boundingBox);
    expect(result.getAttribute("position").array).toEqual(before);
    expect(original.getAttribute("position").array).toEqual(before);
    expect([...result.getAttribute("normal").array].every(Number.isFinite)).toBe(true);
    const uv = result.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThan(wood ? 0.5 : 0);
      expect(uv.getX(i)).toBeLessThan(wood ? 1 : 0.5);
      expect(uv.getY(i)).toBeGreaterThan(0); expect(uv.getY(i)).toBeLessThan(0.5);
    }
  } finally { original.dispose(); result.dispose(); }
});

it("keeps normal-map UVs non-singular and explicit tangents orthogonal on curved structural surfaces", () => {
  const source = new CylinderGeometry(0.4, 0.6, 4, 12, 3).toNonIndexed();
  const result = hrStructureGeometry(source, true);
  try {
    const uv = result.getAttribute("uv"), n = result.getAttribute("normal"), t = result.getAttribute("tangent");
    expect([...t.array].every(Number.isFinite)).toBe(true);
    for (let i = 0; i < uv.count; i += 3) {
      const area = (uv.getX(i + 1) - uv.getX(i)) * (uv.getY(i + 2) - uv.getY(i)) - (uv.getX(i + 2) - uv.getX(i)) * (uv.getY(i + 1) - uv.getY(i));
      expect(Math.abs(area)).toBeGreaterThan(1e-8);
    }
    for (let i = 0; i < t.count; i++) {
      const normal = new Vector3().fromBufferAttribute(n, i), tangent = new Vector3().fromBufferAttribute(t, i);
      expect(tangent.length()).toBeCloseTo(1, 6); expect(normal.dot(tangent)).toBeCloseTo(0, 6);
      expect(Math.abs(t.getW(i))).toBe(1);
    }
  } finally { source.dispose(); result.dispose(); }
});

it("keeps the absolute interaction/step base and root scale when fitting a streamed prop", () => {
  const source = new BoxGeometry(2, 3, 4); source.computeBoundingBox();
  const site = { asset: "hr-rock-slate", x: 8, z: -17, baseY: 4.75, size: [0.62, 0.36, 1.6], yaw: 0, tint: 1 } as const;
  const fit = fitHrProp(source.boundingBox!, site, () => -100);
  expect(new Vector3(0, -1.5, 0).applyMatrix4(fit).toArray()).toEqual([8, 4.75, -17]);
  expect(new Vector3().setFromMatrixScale(fit).toArray()).toEqual([0.31, 0.12, 0.4]);
  source.dispose();
});

it("keeps Low/software structural geometry and materials intact and restores callbacks on teardown", () => {
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial()), geometry = mesh.geometry, material = mesh.material;
  const before = mesh.onBeforeRender, dispose = bindHrStructure(mesh, true);
  setBakedPropQuality(mesh, "Low");
  const renderer = { getContext: () => ({ getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }), getParameter: () => "Google SwiftShader" }) };
  const invoke = () => mesh.onBeforeRender(renderer as never, null!, null!, mesh.geometry, mesh.material, null!);
  invoke(); setBakedPropQuality(mesh, "High"); invoke();
  expect(mesh.geometry).toBe(geometry); expect(mesh.material).toBe(material); expect(mesh.matrix).toEqual(new Matrix4());
  dispose(); dispose(); expect(mesh.onBeforeRender).toBe(before);
  geometry.dispose(); material.dispose();
});

it("pairs HR material/UV/tangents on a separate draw when deferred structural geometry changes", async () => {
  const assetGeometry = new BoxGeometry(), assetMaterial = new MeshStandardMaterial(), release = vi.fn();
  assetGeometry.computeBoundingBox();
  const acquire = vi.spyOn(hrProps, "acquireHrProp").mockReturnValue({ ready: Promise.resolve({
    lods: [[{ geometry: assetGeometry, material: assetMaterial, matrix: new Matrix4() }]],
    bounds: assetGeometry.boundingBox!, dispose() {},
  }), release });
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial()), original = mesh.geometry, material = mesh.material;
  const dispose = bindHrStructure(mesh, true), replacement = new BoxGeometry(2, 3, 4);
  const renderer = { domElement: { closest: () => ({}) }, getContext: () => ({ getExtension: () => null }) };
  const invoke = () => mesh.onBeforeRender(renderer as never, null!, null!, mesh.geometry, mesh.material, null!);
  try {
    invoke(); await Promise.resolve(); invoke();
    const render = mesh.getObjectByName("hr-structural-render") as Mesh;
    expect(render.visible).toBe(true); expect(render.geometry.hasAttribute("uv")).toBe(true);
    expect(render.geometry.hasAttribute("tangent")).toBe(true); expect(mesh.geometry).toBe(original); expect(mesh.material).toBe(material);
    const first = render.geometry;
    mesh.geometry = replacement; invoke();
    expect(mesh.geometry).toBe(replacement); expect(mesh.material).toBe(material);
    expect(render.geometry).not.toBe(first);
    expect(render.geometry.getAttribute("position").array).toEqual(replacement.toNonIndexed().getAttribute("position").array);
    setBakedPropQuality(mesh, "Low"); invoke(); expect(render.visible).toBe(false);
    dispose(); expect(mesh.children).toHaveLength(0); expect(mesh.geometry).toBe(replacement); expect(release).toHaveBeenCalledOnce();
  } finally { dispose(); acquire.mockRestore(); original.dispose(); replacement.dispose(); material.dispose(); assetGeometry.dispose(); assetMaterial.dispose(); }
});
