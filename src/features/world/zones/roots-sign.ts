import {
  BoxGeometry, CanvasTexture, Color, Float32BufferAttribute, Mesh, MeshBasicMaterial, PlaneGeometry,
  SRGBColorSpace, type BufferGeometry, type Material,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const WIDTH = 3.4, HEIGHT = 4.2, ROWS = 6;
const RESOLUTION = [1536, 1920] as const;
const FONT = '700 96px "Noto Serif"';

/** Six separately hewn boards: narrow open joints, rounded edges and unequal ends.
 * Coordinates belong to the plank rather than world space, so the sawn grain
 * survives terrain placement, reflection and quality changes without an image.
 */
export function createRootsBoardGeometry(): BufferGeometry {
  const pieces = Array.from({ length: ROWS }, (_, row) => {
    const part = new RoundedBoxGeometry(WIDTH - 0.016 - (row % 3) * 0.014, HEIGHT / ROWS - 0.012,
      0.16, 3, 0.018);
    const centerY = HEIGHT / 2 - (row + 0.5) * HEIGHT / ROWS;
    part.translate(Math.sin(row * 2.4) * 0.006, centerY, 0);
    const count = part.getAttribute("position").count;
    const positions = part.getAttribute("position"), grain: number[] = [];
    for (let i = 0; i < count; i++) {
      const x = positions.getX(i), y = positions.getY(i) - centerY;
      const chip = Math.max(0, 1 - Math.abs(y - (row % 2 ? -0.29 : 0.29)) / 0.085);
      if (Math.abs(x) > 1.6) positions.setX(i, x - Math.sign(x) * chip * 0.045);
      grain.push(positions.getX(i), positions.getY(i), 1);
    }
    part.setAttribute("signGrain", new Float32BufferAttribute(grain, 3));
    const color = new Color("#a58c68").multiplyScalar(0.94 + row % 3 * 0.025);
    part.setAttribute("color", new Float32BufferAttribute(Array.from({ length: count }, () => color.toArray()).flat(), 3));
    return part;
  });
  const board = mergeGeometries(pieces, false)!;
  pieces.forEach(part => part.dispose());
  return board;
}

export function createRootsPostGeometry(): BufferGeometry {
  const post = new BoxGeometry(0.18, 4.9, 0.18).toNonIndexed();
  const p = post.getAttribute("position"), grain: number[] = [];
  for (let i = 0; i < p.count; i++) grain.push(p.getY(i), p.getX(i) + p.getZ(i), 2);
  post.setAttribute("signGrain", new Float32BufferAttribute(grain, 3));
  return post;
}

// Project-authored sawn timber, not the bark atlas. Long fibres, growth rings
// around knots, small end checks and oxidized pins share the existing wood draw.
const grainShader = `
varying vec3 vSignGrain;
vec3 rootsTimber(vec2 p) {
  float row = floor((2.1 - p.y) / 0.7);
  float y = mod(2.1 - p.y, 0.7);
  float bend = sin(p.x * 1.8 + row * 2.7) * 0.017;
  vec2 knot = vec2((p.x - sin(row * 7.1) * 1.1) * 0.24, (y - 0.19) * 1.8);
  float ring = length(knot);
  float knots = exp(-ring * 18.0);
  float phase = (y + bend + exp(-ring * 7.0) * 0.07) * 110.0;
  float fibres = sin(phase + sin(phase * 0.31 + p.x * 1.1) * 1.4);
  float fine = sin(phase * 3.3 + p.x * 7.0);
  vec3 timber = vec3(0.48, 0.42, 0.335) *
    (0.97 + fibres * 0.10 + fine * 0.025 + sin(row * 3.1) * 0.055);
  timber *= 1.0 - knots * 0.38;
  // Hairline end splits and chipped, bleached edges stay outside the lettering.
  float ends = smoothstep(1.42, 1.7, abs(p.x));
  float split = 1.0 - smoothstep(0.002, 0.008, abs(y - 0.15 - bend));
  timber *= 1.0 - ends * split * 0.4;
  timber += vec3(0.035) * smoothstep(0.31, 0.35, abs(y - 0.35));
  vec2 pin = vec2(abs(p.x) - 1.27, y - 0.12);
  float radius = length(pin);
  float head = 1.0 - smoothstep(0.027, 0.033, radius);
  vec3 iron = vec3(0.055, 0.048, 0.04) + vec3(0.08) *
    (1.0 - smoothstep(0.002, 0.007, abs(radius - 0.023))) * step(0.0, pin.y);
  return mix(timber, iron, head);
}
`;

/** Decorate every replacement, including Low, once. Unmarked root vertices keep
 * their original shader and photographic samples. No extra texture or draw call.
 */
export function bindRootsBoardGrain(mesh: Mesh) {
  let current: Material | undefined;
  const decorated = new WeakSet<Material>();
  mesh.onBeforeRender = () => {
    const material = mesh.material;
    if (Array.isArray(material) || current === material) return;
    current = material;
    if (decorated.has(material)) return;
    decorated.add(material);
    const compile = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      compile(shader, renderer);
      // The Low/512 photo adapters inherit the original vertex hook. It may
      // already carry these attributes if it rendered before a quality change.
      if (!shader.vertexShader.includes("attribute vec3 signGrain;")) {
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nattribute vec3 signGrain; varying vec3 vSignGrain;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSignGrain = signGrain;");
      }
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
          if (vSignGrain.z > 0.5) roughnessFactor = 0.96;`)
        .replace("normal = normalize(normal + mat3(viewMatrix) * detailWorld * faceDirection);", `
          if (vSignGrain.z < 0.5) normal = normalize(normal + mat3(viewMatrix) * detailWorld * faceDirection);`);
      // Run after photo/color tint, before lighting; works with physical, toon
      // and the Basic Low shader.
      const anchor = "#include <alphamap_fragment>";
      if (!shader.fragmentShader.includes("vec3 rootsTimber(")) {
        shader.fragmentShader = grainShader + shader.fragmentShader.replace(anchor, `${anchor}
        if (vSignGrain.z > 0.5) {
          diffuseColor.rgb = rootsTimber(vSignGrain.xy);
          if (vSignGrain.z > 1.5) {
            float moss = (1.0 - smoothstep(-2.4, -1.75, vSignGrain.x)) *
              (0.65 + 0.2 * sin(vSignGrain.y * 95.0 + vSignGrain.x * 23.0));
            diffuseColor.rgb = mix(diffuseColor.rgb * 0.65, vec3(0.065, 0.10, 0.038), moss);
          }
        }`);
      }
    };
    material.customProgramCacheKey = () => key + "|roots-sawn-timber-v2";
    material.needsUpdate = true;
  };
}

/** Only pigment occupies the transparent canvas; the real wood stays visible.
 * Row baselines fall at the centres of the six physical planks, away from joints.
 */
export function paintRootsSign(ctx: CanvasRenderingContext2D, titles: readonly string[]) {
  const [width, height] = RESOLUTION;
  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ["Skills", ...titles].forEach((title, row) => {
    const x = width / 2 + Math.sin(row * 1.7) * 3;
    const y = (row + 0.5) * height / ROWS;
    ctx.font = row === 0 ? '700 104px "Noto Serif"' : FONT;
    // Opaque dark incision with a thin lower bevel. Keep the glyph interior
    // solid: grain scratches in the former translucent paint destroyed contrast.
    ctx.fillStyle = "#ded5c4";
    ctx.fillText(title, x, y + 2.5, width - 220);
    ctx.fillStyle = "#100f0d";
    ctx.fillText(title, x, y, width - 220);
  });
  ctx.globalAlpha = 1;
}

export function createRootsSign() {
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = RESOLUTION;
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return undefined;
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({
    map, transparent: true, alphaTest: 0.04, toneMapped: false, fog: false,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  });
  const mesh = new Mesh(new PlaneGeometry(WIDTH, HEIGHT), material);
  mesh.raycast = () => {};
  let disposed = false;
  const controller = new AbortController();
  // The existing static JSON route is generated from src/content. Fetch it only
  // when Roots mounts; never bundle the content validator or embed font bytes.
  const ready = Promise.all([
    fetch("/en/world-content.json", { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error("Roots content unavailable");
      return response.json() as Promise<{ skills: { title: string }[] }>;
    }),
    document.fonts?.load(FONT, "Skills Ti\u1ebfng Vi\u1ec7t AWS Azure"),
  ]).then(([content]) => {
    if (disposed) return false;
    const titles = content.skills.map(skill => skill.title);
    paintRootsSign(ctx, titles);
    map.needsUpdate = true;
    return true;
  }).catch(() => false);
  return {
    mesh, ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      mesh.geometry.dispose(); material.dispose(); map.dispose();
    },
  };
}
