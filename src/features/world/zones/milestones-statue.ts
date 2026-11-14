import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute, FrontSide,
  Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Points, Raycaster, ShaderMaterial, SkinnedMesh, SRGBColorSpace, Texture, TextureLoader, UniformsLib, UniformsUtils, Vector2, Vector3,
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
    canvas.width = 512; canvas.height = 256 * Math.max(1, certificates.length);
    if (typeof canvas.getContext !== "function") return undefined;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.textAlign = "center"; context.textBaseline = "middle";
    certificates.forEach((piece, i) => {
      const words = piece.inscription.split(" ");
      const lines = words.length > 1 ? [words[0]!, words.slice(1).join(" ")] : words;
      context.font = `400 ${lines.length > 1 ? 118 : 136}px Georgia, serif`;
      lines.forEach((line, row) => {
        const y = i * 256 + 128 + (row - (lines.length - 1) / 2) * 110;
        context.shadowColor = "rgba(73,52,24,.9)"; context.shadowBlur = 3;
        context.fillStyle = "rgba(105,76,31,.9)"; context.fillText(line, 259, y + 3, 480);
        context.shadowBlur = 0;
        context.fillStyle = "rgba(255,235,171,1)"; context.fillText(line, 256, y, 480);
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
  const crackMap = { value: null as Texture | null };
  const atlas = inscriptionAtlas(certificates);
  const bodyMaterial = new MeshStandardMaterial({ color: 0xf2e8d6, roughness: .83, metalness: .015, vertexColors: true, side: FrontSide });
  bodyMaterial.name = "milestones-matte-porcelain";
  bodyMaterial.onBeforeCompile = shader => {
    shader.uniforms.msHigh = high;
    shader.uniforms.msCrackMap = crackMap;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\n varying vec3 vMsStone;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n vMsStone = position;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vMsStone; uniform float msHigh; uniform sampler2D msCrackMap;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec2 stoneUV = vec2(vMsStone.x + vMsStone.z * .63, vMsStone.y) * 2.15;
        float crack = texture2D(msCrackMap, stoneUV / 16. + vec2(.5, 0.)).r;
        // Fine veins in the warm stone remain quieter than the repaired gold.
        float marble = sin(vMsStone.y * 19. + sin(vMsStone.x * 11.) + vMsStone.z * 13.);
        diffuseColor.rgb *= .97 + .03 * marble;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.72,.40,.095), crack * .85);`)
      .replace("#include <opaque_fragment>", `outgoingLight += crack * vec3(.34,.15,.025) * (1. + msHigh * .65);
        #include <opaque_fragment>`);
    // Soft wrapped fill approximates light entering matte porcelain, without an extra pass.
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
      reflectedLight.indirectDiffuse += diffuseColor.rgb * 0.10 * (0.5 + 0.5 * normal.y);`);
  };
  bodyMaterial.customProgramCacheKey = () => "milestones-sculpted-porcelain-baked-kintsugi-v3";
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
        if (vMsKind < .5) diffuseColor.a = mix(.22 + .55 * fresnel, 1., msLow);
        if (vMsKind > .5 && vMsKind < 1.5) outgoingLight += vec3(.48,.24,.045) * (1. + msHigh * .5);
        if (vMsKind > 1.5) outgoingLight = diffuseColor.rgb * 1.3;
        #include <opaque_fragment>`);
  };
  glassMaterial.customProgramCacheKey = () => "milestones-beveled-glass-vertex-motion-v2";
  const pointScale = { value: 500 };
  const ribbonColor = new Color(0xffc66b);
  // Two primitives, one shader/material: the adjacent additive draws reuse
  // their program, fog, colors and shared time instead of uploading them twice.
  const lightMaterial = Object.assign(new ShaderMaterial({ transparent: true, blending: AdditiveBlending,
    depthWrite: false, side: DoubleSide, toneMapped: false, fog: true,
    uniforms: { ...UniformsUtils.clone(UniformsLib.fog), msTime: time, msHigh: high, msPointScale: pointScale,
      msRibbonColor: { value: ribbonColor }, msSparkleColor: { value: new Color(0xffe0a2) } },
    vertexShader: `#include <common>
      #include <fog_pars_vertex>
      uniform float msTime; uniform float msPointScale; attribute float msSparkle;
      varying float vMsSparkle; varying float vMsTwinkle; varying vec2 vMsRibbonUV;
      void main() {
        float a=msTime*.075,c=cos(a),s=sin(a); vec3 transformed=position;
        transformed.xz=mat2(c,-s,s,c)*transformed.xz;
        vec4 mvPosition=modelViewMatrix*vec4(transformed,1.);
        gl_Position=projectionMatrix*mvPosition;
        gl_PointSize=.065*msPointScale/max(.1,-mvPosition.z);
        vMsSparkle=msSparkle;vMsRibbonUV=uv;
        vMsTwinkle=.25+.75*pow(.5+.5*sin(msTime*1.7+position.y*12.),4.);
        #include <fog_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <fog_pars_fragment>
      uniform float msTime; uniform float msHigh; uniform vec3 msRibbonColor; uniform vec3 msSparkleColor;
      varying float vMsSparkle; varying float vMsTwinkle; varying vec2 vMsRibbonUV;
      void main() {
        if(vMsSparkle>.5) {
          float r=length(gl_PointCoord-.5)*2.;
          gl_FragColor=vec4(msSparkleColor,(1.-smoothstep(.15,1.,r))*vMsTwinkle);
        } else {
          float alpha=.66*sin(vMsRibbonUV.y*3.141593)*(.23+.77*pow(.5+.5*sin(vMsRibbonUV.x*26.-msTime*.6),6.));
          gl_FragColor=vec4(msRibbonColor*(1.+msHigh*.45),alpha);
        }
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  }), { color: ribbonColor });
  lightMaterial.name = "milestones-ribbons-and-sparkles"; lightMaterial.forceSinglePass = true;
  // One renderable placeholder defers loading until this zone first enters the view.
  const body = new Mesh<BufferGeometry, MeshStandardMaterial>(new BoxGeometry(.001, .001, .001), bodyMaterial);
  body.frustumCulled = false;
  body.name = "milestones-static-walk-white"; body.castShadow = body.receiveShadow = true;
  const empty = new BufferGeometry(); empty.setAttribute("position", new Float32BufferAttribute([], 3));
  const glass = new Mesh(empty, glassMaterial); glass.name = "milestones-certificate-shards-cream";
  const ribbons = new Mesh(ribbonGeometry(), lightMaterial); ribbons.name = "milestones-golden-ribbons";
  ribbons.visible = false; ribbons.frustumCulled = false;
  // Light carries no solid surface: skip its 960 triangles in camera/click rays.
  ribbons.raycast = () => {};
  const sparkles = new Points(sparkleGeometry(), lightMaterial); sparkles.name = "milestones-ribbon-sparkles";
  sparkles.visible = false; sparkles.frustumCulled = false;
  // Additive decoration must not intercept the reserved E/click target.
  sparkles.raycast = () => {};
  group.add(body, glass, ribbons, sparkles);
  // Every local transform is static; motion lives exclusively in the vertex shaders.
  for (const node of group.children) { node.updateMatrix(); node.matrixAutoUpdate = false; }
  let disposed = false, pending: Promise<void> | undefined, ready = false, near = false;
  let player: Object3D | undefined, searched = false;
  let qualityContainer: Pick<Element, "getAttribute"> | null | undefined, frozen = false;
  const origin = new Vector3(), viewer = new Vector3();
  const slots = certificateSlots(certificates);
  group.userData.certificates = slots;
  const loadDetail = () => pending ??= load().then(source => {
    if (disposed) { source.dispose(); source.userData.normalMap?.dispose(); source.userData.crackMap?.dispose(); return; }
    try {
      const prepared = prepareShards(source, slots);
      if (source.userData.normalMap instanceof Texture) {
        bodyMaterial.normalMap = source.userData.normalMap;
        bodyMaterial.normalScale.set(.3, .3); bodyMaterial.needsUpdate = true;
      }
      if (source.userData.crackMap instanceof Texture) crackMap.value = source.userData.crackMap;
      body.geometry.dispose(); glass.geometry.dispose();
      body.geometry = cutCertificateSockets(source, slots); glass.geometry = prepared;
      group.userData.ready = ready = true;
      group.userData.triangles = (body.geometry.getAttribute("position").count + prepared.getAttribute("position").count
        + ribbons.geometry.getAttribute("position").count) / 3;
    } finally { source.dispose(); }
  }).catch(() => { group.userData.assetError = true; });
  body.onBeforeRender = (renderer, scene, camera) => {
    if (qualityContainer === undefined) qualityContainer = renderer.domElement?.closest?.("[data-world-quality]") ?? null;
    const quality = qualityContainer?.getAttribute("data-world-quality") ?? "high";
    low.value = quality === "low" ? 1 : 0; high.value = quality === "high" ? 1 : 0;
    pointScale.value = (renderer.domElement?.height ?? 1000) * .5;
    if (!frozen) {
      // Zone placement is final by its first draw. Freeze world matrices too;
      // scene.updateMatrixWorld(force) otherwise recomputes these static meshes.
      group.updateMatrixWorld(true); group.updateMatrix(); group.matrixAutoUpdate = false; group.matrixWorldAutoUpdate = false;
      for (const node of group.children) node.matrixWorldAutoUpdate = false;
      frozen = true;
    }
    origin.setFromMatrixPosition(group.matrixWorld);
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
    if (player) viewer.setFromMatrixPosition(player.matrixWorld);
    else {
      // Isolated reviewers without a player use the camera's ground-plane target.
      viewer.setFromMatrixPosition(camera.matrixWorld); direction.set(0, 0, -1).transformDirection(camera.matrixWorld);
      if (Math.abs(direction.y) > .05) viewer.addScaledVector(direction, Math.max(0, (origin.y + .38 - viewer.y) / direction.y));
    }
    const distanceSquared = (viewer.x - origin.x) ** 2 + (viewer.z - origin.z) ** 2;
    near = distanceSquared <= 144;
    ribbons.visible = sparkles.visible = ready && low.value === 0 && distanceSquared <= 900;
    if (!pending) void loadDetail();
  };
  const direction = new Vector3();
  return { group, slots, loadDetail,
    update(dt: number, reducedMotion: boolean) {
      if (!disposed && !reducedMotion && near && low.value === 0 && !(typeof document !== "undefined" && document.hidden)
        && Number.isFinite(dt) && dt > 0) time.value += Math.min(dt, .1);
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const mesh of [body, glass, ribbons, sparkles]) mesh.geometry.dispose();
      for (const material of [bodyMaterial, glassMaterial, lightMaterial]) material.dispose();
      bodyMaterial.normalMap?.dispose();
      crackMap.value?.dispose();
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
  if (typeof document !== "undefined" && typeof document.createElementNS === "function") {
    try {
      const loader = new TextureLoader();
      const textures = await Promise.allSettled([loader.loadAsync("/world/milestones/cloth-normal.png"), loader.loadAsync("/world/milestones/kintsugi-mask.png")]);
      const failed = textures.find(result => result.status === "rejected");
      if (failed?.status === "rejected") {
        for (const result of textures) if (result.status === "fulfilled") result.value.dispose();
        throw failed.reason;
      }
      const [normal, cracks] = textures as [PromiseFulfilledResult<Texture>, PromiseFulfilledResult<Texture>];
      normal.value.flipY = cracks.value.flipY = false;
      geometry.userData.normalMap = normal.value; geometry.userData.crackMap = cracks.value;
    } catch (error) { geometry.dispose(); throw error; }
  }
  return geometry;
}

function prepareShards(source: BufferGeometry, slots: CertificateSlot[]) {
  const positions: number[] = [], normals: number[] = [], kinds: number[] = [], pivots: number[] = [], moving: number[] = [], uvs: number[] = [];
  const probeMaterial = new MeshBasicMaterial({ side: DoubleSide }), probe = new Mesh(source, probeMaterial);
  probe.updateMatrixWorld(true);
  const ray = new Raycaster();
  const depths = new Map<string, number>();
  const front = (x: number, y: number) => {
    const key = `${x}/${y}`, cached = depths.get(key);
    if (cached !== undefined) return cached;
    ray.set(new Vector3(x, y, 3), new Vector3(0, 0, -1));
    const z = (ray.intersectObject(probe)[0]?.point.z ?? .35) + .018;
    depths.set(key, z); return z;
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
    // A single front-facing glass plane avoids stretching the engraving over
    // individual cloth folds. Mount its back just beyond the shirt's surface.
    let mount = front(slot.center.x, slot.center.y);
    for (const p of slot.outline) mount = Math.max(mount, front(p.x, p.y));
    slot.center.z = mount + .14;
    const point = (p: Vector2, target = false) => target
      ? new Vector3(p.x, p.y, front(p.x, p.y))
      : achieved ? new Vector3(p.x, p.y, slot.center.z)
        : new Vector3(p.x - slot.center.x + slot.floating.x, p.y - slot.center.y + slot.floating.y, slot.floating.z);
    const face = slot.outline.map(p => point(p));
    const center = achieved ? slot.center : slot.floating;
    for (let j = 0; j < face.length; j++) {
      const a = face[j]!, b = face[(j + 1) % face.length]!;
      const uvFor = (p: Vector3) => new Vector2((p.x - center.x) / slot.width + .5, (p.y - center.y) / slot.height + .5);
      triangle(center, a, b, slot, 0, [uvFor(center), uvFor(a), uvFor(b)]);
      // Thick glass with a bevel that rolls its normal into the rim. All faces,
      // both golden perimeters and the engraving remain in this same draw.
      const edgeA = a.clone().lerp(center, -.035).add(new Vector3(0, 0, -.035));
      const edgeB = b.clone().lerp(center, -.035).add(new Vector3(0, 0, -.035));
      const backA = a.clone().add(new Vector3(0, 0, -.115)), backB = b.clone().add(new Vector3(0, 0, -.115));
      const backCenter = center.clone().add(new Vector3(0, 0, -.115));
      triangle(a, edgeA, edgeB, slot, 0, [uvFor(a), uvFor(edgeA), uvFor(edgeB)]);
      triangle(a, edgeB, b, slot, 0, [uvFor(a), uvFor(edgeB), uvFor(b)]);
      triangle(edgeA, backA, backB, slot, 0, zero);
      triangle(edgeA, backB, edgeB, slot, 0, zero);
      triangle(backCenter, backB, backA, slot, 0, [uvFor(center), uvFor(b), uvFor(a)]);
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
    const w = slot.width * .46, h = slot.height * .41;
    const textPoint = (u: number, v: number) => {
      const x = center.x + (u * 2 - 1) * w, y = center.y + (v * 2 - 1) * h;
      return new Vector3(x, y, center.z + .003);
    };
    const v0 = 1 - (index + 1) / Math.max(1, slots.length), v1 = 1 - index / Math.max(1, slots.length);
    const textUV = (u: number, v: number) => new Vector2(u, v0 + v * (v1 - v0));
    triangle(textPoint(0, 0), textPoint(1, 0), textPoint(1, 1), slot, 2, [textUV(0,0), textUV(1,0), textUV(1,1)]);
    triangle(textPoint(0, 0), textPoint(1, 1), textPoint(0, 1), slot, 2, [textUV(0,0), textUV(1,1), textUV(0,1)]);
  });
  probeMaterial.dispose();
  const geometry = new BufferGeometry();
  for (const [name, array, size] of [["position", positions, 3], ["normal", normals, 3], ["msPivot", pivots, 3], ["msMoving", moving, 1], ["msKind", kinds, 1], ["msUV", uvs, 2]] as const)
    geometry.setAttribute(name, new Float32BufferAttribute(array, size));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
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
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.setAttribute("msSparkle", new Float32BufferAttribute(new Float32Array(positions.length / 3), 1)); return geometry;
}

function sparkleGeometry() {
  const positions: number[] = [];
  for (let band = 0; band < 3; band++) for (let i = 0; i < 18; i++) {
    const t = (i + .37 * band) / 18, angle = t * Math.PI * 3.4 + band * Math.PI * 2 / 3;
    const radius = 1.46 + .12 * Math.sin(t * Math.PI * 2);
    positions.push(Math.cos(angle) * radius, .7 + t * 4.8, Math.sin(angle) * radius);
  }
  const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("msSparkle", new Float32BufferAttribute(new Float32Array(positions.length / 3).fill(1), 1));
  return geometry;
}
