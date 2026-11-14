import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute,
  Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Raycaster, SkinnedMesh, SRGBColorSpace, Vector2, Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { certificateSlots, cutCertificateSockets, type CertificateSlot } from "./milestones-statue-geometry";
import type { MilestoneCertificatePiece } from "./milestones";

export const MILESTONES_STATUE_URL = "/world/milestones/character-milestones-walk.glb";
const atlases = new Map<string, { texture: CanvasTexture; references: number }>();
function inscriptionAtlas(certificates: readonly MilestoneCertificatePiece[]) {
  if (typeof document === "undefined") return undefined;
  const key = JSON.stringify(certificates.map(piece => piece.inscription));
  let entry = atlases.get(key);
  if (!entry) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024; canvas.height = 256 * Math.max(1, certificates.length);
    if (typeof canvas.getContext !== "function") return undefined;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.textAlign = "center"; context.textBaseline = "middle";
    certificates.forEach((piece, i) => {
      const words = piece.inscription.split(" ");
      const lines = words.length > 1 ? [words[0]!, words.slice(1).join(" ")] : words;
      context.font = `600 ${lines.length > 1 ? 126 : 164}px Georgia, serif`;
      lines.forEach((line, row) => {
        const y = i * 256 + 128 + (row - (lines.length - 1) / 2) * 118;
        context.fillStyle = "#ffffff"; context.fillText(line, 513, y + 2, 860);
        context.fillStyle = "#3a433d"; context.fillText(line, 512, y, 860);
      });
    });
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    entry = { texture, references: 0 }; atlases.set(key, entry);
  }
  entry.references++;
  const current = entry;
  return { texture: entry.texture, release() {
    if (--current.references === 0) { current.texture.dispose(); atlases.delete(key); }
  } };
}

/** Shared time deforms vertices only. No scene-object transform changes during playback. */
export function createMilestonesStatue(certificates: readonly MilestoneCertificatePiece[], load = loadBody) {
  const group = new Group(); group.name = "milestones-walking-statue";
  const time = { value: 0 }, low = { value: 0 }, high = { value: 0 };
  const atlas = inscriptionAtlas(certificates);
  const bodyMaterial = new MeshStandardMaterial({ color: 0xe4e1d7, roughness: .88, metalness: .015, side: DoubleSide });
  bodyMaterial.name = "milestones-matte-porcelain";
  bodyMaterial.onBeforeCompile = shader => {
    // Soft wrapped fill approximates light entering matte porcelain, without an extra pass.
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
      reflectedLight.indirectDiffuse += diffuseColor.rgb * 0.10 * (0.5 + 0.5 * normal.y);`);
  };
  bodyMaterial.customProgramCacheKey = () => "milestones-porcelain-wrap";
  const glassMaterial = new MeshStandardMaterial({ color: 0xf0ead3, roughness: .2, metalness: .22,
    envMapIntensity: .8, transparent: true, depthWrite: false, side: DoubleSide });
  glassMaterial.name = "milestones-fresnel-glass-kintsugi";
  glassMaterial.forceSinglePass = true;
  glassMaterial.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { msTime: time, msLow: low, msHigh: high, msAtlas: { value: atlas?.texture ?? null } });
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      uniform float msTime; attribute vec3 msPivot; attribute float msMoving;
      attribute float msKind; attribute vec2 msUV; varying float vMsKind; varying vec2 vMsUV;
      mat3 msRotation() { float a = sin(msTime * .23 + msPivot.x) * .16 * msMoving;
        float c = cos(a), s = sin(a); return mat3(c,0.,-s,0.,1.,0.,s,0.,c); }`)
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n objectNormal = msRotation() * objectNormal;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        transformed = msRotation() * (transformed - msPivot) + msPivot;
        transformed.x += sin(msTime * .19) * .09 * msMoving;
        transformed.y += sin(msTime * .31) * .07 * msMoving;
        vMsKind = msKind; vMsUV = msUV;`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      uniform float msLow; uniform float msHigh; uniform sampler2D msAtlas;
      varying float vMsKind; varying vec2 vMsUV;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        if (vMsKind > 1.5) { vec4 engraving = texture2D(msAtlas, vMsUV);
          if (engraving.a < .08) discard;
          diffuseColor.rgb = engraving.rgb; diffuseColor.a = engraving.a; }
        else if (vMsKind > .5) { diffuseColor.rgb = vec3(.88,.55,.16); }
        else { float vein = pow(abs(sin(vMsUV.x * 37. + sin(vMsUV.y * 29.) * 2.)), 22.);
          diffuseColor.rgb *= 1. - .13 * vein; }
        `)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, .8, msLow);")
      .replace("#include <opaque_fragment>", `
        float fresnel = pow(1. - abs(dot(normalize(vViewPosition), normal)), 3.);
        if (vMsKind < .5) diffuseColor.a = mix(.43 + .36 * fresnel, 1., msLow);
        if (vMsKind > .5 && vMsKind < 1.5) outgoingLight += vec3(.48,.24,.045) * (1. + msHigh * .5);
        if (vMsKind > 1.5) outgoingLight = diffuseColor.rgb * .7;
        #include <opaque_fragment>`);
  };
  glassMaterial.customProgramCacheKey = () => "milestones-glass-vertex-motion-v1";
  const ribbonMaterial = new MeshBasicMaterial({ color: 0xe9b961, transparent: true, opacity: .38,
    blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });
  ribbonMaterial.forceSinglePass = true;
  ribbonMaterial.onBeforeCompile = shader => {
    shader.uniforms.msTime = time; shader.uniforms.msHigh = high;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\n uniform float msTime; varying vec2 vMsRibbonUV;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        float a = msTime * .075; float c = cos(a), s = sin(a);
        transformed.xz = mat2(c,-s,s,c) * transformed.xz; vMsRibbonUV = uv;`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\n uniform float msTime; uniform float msHigh; varying vec2 vMsRibbonUV;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        diffuseColor.a *= sin(vMsRibbonUV.y * 3.141593) * (.23 + .77 * pow(.5 + .5 * sin(vMsRibbonUV.x * 26. - msTime * .6), 6.));
        diffuseColor.rgb *= 1. + msHigh * .45;`);
  };
  ribbonMaterial.customProgramCacheKey = () => "milestones-three-ribbons";
  // One renderable placeholder defers loading until this zone first enters the view.
  const body = new Mesh<BufferGeometry, MeshStandardMaterial>(new BoxGeometry(.001, .001, .001), bodyMaterial);
  body.frustumCulled = false;
  body.name = "milestones-static-walk-white"; body.castShadow = body.receiveShadow = true;
  const empty = new BufferGeometry(); empty.setAttribute("position", new Float32BufferAttribute([], 3));
  const glass = new Mesh(empty, glassMaterial); glass.name = "milestones-certificate-shards-cream";
  const ribbons = new Mesh(ribbonGeometry(), ribbonMaterial); ribbons.name = "milestones-golden-ribbons";
  ribbons.visible = false; ribbons.frustumCulled = false;
  group.add(body, glass, ribbons);
  let disposed = false, pending: Promise<void> | undefined, ready = false, near = false;
  let player: Object3D | undefined, searched = false;
  const origin = new Vector3(), viewer = new Vector3();
  const slots = certificateSlots(certificates);
  group.userData.certificates = slots;
  const loadDetail = () => pending ??= load().then(source => {
    if (disposed) { source.dispose(); return; }
    try {
      const prepared = prepareShards(source, slots);
      body.geometry.dispose(); glass.geometry.dispose();
      body.geometry = cutCertificateSockets(source, slots); glass.geometry = prepared;
      group.userData.ready = ready = true;
      group.userData.triangles = (body.geometry.getAttribute("position").count + prepared.getAttribute("position").count
        + ribbons.geometry.getAttribute("position").count) / 3;
    } finally { source.dispose(); }
  }).catch(() => { group.userData.assetError = true; });
  body.onBeforeRender = (renderer, scene, camera) => {
    const container = renderer.domElement?.closest?.("[data-world-quality]");
    const quality = container?.getAttribute("data-world-quality") ?? "high";
    low.value = quality === "low" ? 1 : 0; high.value = quality === "high" ? 1 : 0;
    group.getWorldPosition(origin);
    // Resolve the existing player once; the static statue contains no SkinnedMesh.
    // This keeps the 12 m gate tied to the player even when the camera is far away.
    if (!searched) {
      searched = true;
      scene.traverse(node => {
        if (node instanceof SkinnedMesh && node.skeleton.bones.length === 19) {
          player = node; while (player.parent && player.parent !== scene) player = player.parent;
        } else if (node instanceof Mesh && node.geometry.type === "CapsuleGeometry" && node.parent === scene) player = node;
      });
    }
    if (player) player.getWorldPosition(viewer);
    else {
      // Isolated reviewers without a player use the camera's ground-plane target.
      camera.getWorldPosition(viewer); camera.getWorldDirection(direction);
      if (Math.abs(direction.y) > .05) viewer.addScaledVector(direction, Math.max(0, (origin.y + .38 - viewer.y) / direction.y));
    }
    near = Math.hypot(viewer.x - origin.x, viewer.z - origin.z) <= 12;
    ribbons.visible = ready && low.value === 0;
    void loadDetail();
  };
  const direction = new Vector3();
  return { group, slots, loadDetail,
    update(dt: number, reducedMotion: boolean) {
      if (!disposed && !reducedMotion && near && low.value === 0 && Number.isFinite(dt) && dt > 0) time.value += Math.min(dt, .1);
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const mesh of [body, glass, ribbons]) { mesh.geometry.dispose(); mesh.material.dispose(); }
      atlas?.release(); group.clear();
    },
  };
}

async function loadBody(): Promise<BufferGeometry> {
  const gltf = await new GLTFLoader().loadAsync(MILESTONES_STATUE_URL);
  let geometry: BufferGeometry | undefined;
  gltf.scene.traverse(node => {
    if (!(node instanceof Mesh)) return;
    geometry = node.geometry.clone();
    node.geometry.dispose();
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
  });
  if (!geometry) throw new Error("Missing Milestones static bake");
  return geometry;
}

function prepareShards(source: BufferGeometry, slots: CertificateSlot[]) {
  const positions: number[] = [], normals: number[] = [], kinds: number[] = [], pivots: number[] = [], moving: number[] = [], uvs: number[] = [];
  const probeMaterial = new MeshBasicMaterial({ side: DoubleSide }), probe = new Mesh(source, probeMaterial);
  probe.updateMatrixWorld(true);
  const ray = new Raycaster();
  const front = (x: number, y: number) => {
    ray.set(new Vector3(x, y, 3), new Vector3(0, 0, -1));
    return (ray.intersectObject(probe)[0]?.point.z ?? .35) + .018;
  };
  const triangle = (a: Vector3, b: Vector3, c: Vector3, slot: CertificateSlot, kind: number, uv: Vector2[]) => {
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    [a, b, c].forEach((p, i) => {
      positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z); kinds.push(kind);
      const pivot = slot.certificate.achieved ? slot.center : slot.floating;
      pivots.push(pivot.x, pivot.y, pivot.z); moving.push(slot.certificate.achieved || kind === 3 ? 0 : 1);
      uvs.push(uv[i]!.x, uv[i]!.y);
    });
  };
  const zero = [new Vector2(), new Vector2(), new Vector2()];
  slots.forEach((slot, index) => {
    const achieved = slot.certificate.achieved;
    slot.center.z = front(slot.center.x, slot.center.y);
    const point = (p: Vector2, target = false) => new Vector3(p.x, p.y, front(p.x, p.y))
      .add(target || achieved ? new Vector3() : slot.floating.clone().sub(slot.center));
    const face = slot.outline.map(p => point(p));
    const center = achieved ? slot.center : slot.floating;
    for (let j = 0; j < face.length; j++) {
      const a = face[j]!, b = face[(j + 1) % face.length]!;
      const uvFor = (p: Vector3) => new Vector2((p.x - center.x) / slot.width + .5, (p.y - center.y) / slot.height + .5);
      triangle(center, a, b, slot, 0, [uvFor(center), uvFor(a), uvFor(b)]);
      // Golden seam follows the exact five cut edges; the planned socket has the same outline.
      for (const socket of achieved ? [false] : [false, true]) {
        const pa = socket ? point(slot.outline[j]!, true) : a;
        const pb = socket ? point(slot.outline[(j + 1) % face.length]!, true) : b;
        const mid = socket ? slot.center : center;
        const ia = pa.clone().lerp(mid, .035), ib = pb.clone().lerp(mid, .035);
        triangle(pa, pb, ib, socket ? { ...slot, certificate: { ...slot.certificate, achieved: true } } : slot, 1, zero);
        triangle(pa, ib, ia, socket ? { ...slot, certificate: { ...slot.certificate, achieved: true } } : slot, 1, zero);
      }
    }
    // Tessellate engraving over the curved shirt: one large quad would sink into its bulge.
    const w = slot.width * .40, h = slot.height * .31;
    const textPoint = (u: number, v: number) => {
      const x = center.x + (u * 2 - 1) * w, y = center.y + (v * 2 - 1) * h;
      return new Vector3(x, y, (achieved ? front(x, y) : center.z) + .04);
    };
    const v0 = 1 - (index + 1) / Math.max(1, slots.length), v1 = 1 - index / Math.max(1, slots.length);
    const textUV = (u: number, v: number) => new Vector2(u, v0 + v * (v1 - v0));
    for (let col = 0; col < 16; col++) for (let row = 0; row < 8; row++) {
      const u = col / 16, v = row / 8, nextU = (col + 1) / 16, nextV = (row + 1) / 8;
      triangle(textPoint(u, v), textPoint(nextU, v), textPoint(nextU, nextV), slot, 2, [textUV(u,v), textUV(nextU,v), textUV(nextU,nextV)]);
      triangle(textPoint(u, v), textPoint(nextU, nextV), textPoint(u, nextV), slot, 2, [textUV(u,v), textUV(nextU,nextV), textUV(u,nextV)]);
    }
  });
  probeMaterial.dispose();
  const geometry = new BufferGeometry();
  for (const [name, array, size] of [["position", positions, 3], ["normal", normals, 3], ["msPivot", pivots, 3], ["msMoving", moving, 1], ["msKind", kinds, 1], ["msUV", uvs, 2]] as const)
    geometry.setAttribute(name, new Float32BufferAttribute(array, size));
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) geometry.boundingSphere.radius += .3;
  return geometry;
}

function ribbonGeometry() {
  const positions: number[] = [], uv: number[] = [];
  for (let band = 0; band < 3; band++) for (let i = 0; i < 160; i++) {
    const point = (step: number, edge: number) => {
      const t = step / 160, angle = t * Math.PI * 3.4 + band * Math.PI * 2 / 3;
      const radius = 1.46 + .12 * Math.sin(t * Math.PI * 2);
      return [Math.cos(angle) * radius, .7 + t * 4.8 + edge * .018, Math.sin(angle) * radius];
    };
    for (const [step, edge] of [[i, -1], [i + 1, -1], [i + 1, 1], [i, -1], [i + 1, 1], [i, 1]]) {
      positions.push(...point(step!, edge!)); uv.push(step! / 160, edge! * .5 + .5);
    }
  }
  const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2)); return geometry;
}
