import {
  Box3, BufferGeometry, Color, Float32BufferAttribute, Group, IcosahedronGeometry, Mesh,
  TorusGeometry, Vector3, type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import certificates from "../../../content/certificates.json";
import { paletteColor, WORLD_DIRECTION } from "../art/direction";
import { PALETTE } from "../art/palette";
import { TRUNK_HEIGHT } from "../foliage/colliders";
import { createPineCrownV2 } from "../foliage/pine";
import { createTreeTrunk } from "../foliage/shapes";
import { createRampMaterial, RAMP_PRESETS } from "../materials/ramp";
import { createRockGeometry } from "../props/rocks";
import {
  PATH_CLEARANCE, ZONE_BUDGET, type ZoneCollider, type ZoneSceneContext, type ZoneSceneFactory,
} from "./types";

// The server validates this shared JSON through content; keep runtime schemas out of the world chunk.
const content = { profiles: [{ locale: "en", certificates: certificates.en }] };

type Surface = "weathered" | "future" | "ink" | "needles" | "flower";
interface Part {
  geometry: BufferGeometry;
  surface: Surface;
  x: number;
  z: number;
  solid: boolean;
  collisionGeometry?: BufferGeometry;
  yaw?: number;
}

export interface MilestoneCertificatePiece {
  readonly slot: number;
  readonly title: string;
  readonly inscription: string;
  readonly achieved: boolean;
  readonly charHeight: number;
  readonly carveDepth: number;
}

export interface MilestoneStatueMetadata {
  readonly totalHeight: number;
  readonly certificates: readonly MilestoneCertificatePiece[];
  readonly fittedPieces: readonly {
    readonly slot: number;
    readonly inscription: string;
    readonly title: string;
    readonly charHeight: number;
    readonly carveDepth: number;
    readonly bounds: Box3;
  }[];
  readonly plannedPieces: readonly {
    readonly slot: number;
    readonly inscription: string;
    readonly title: string;
    readonly charHeight: number;
    readonly carveDepth: number;
    readonly bounds: Box3;
  }[];
  readonly hollowGaps: readonly {
    readonly slot: number;
    readonly plannedTitle: string;
    readonly inscription: string;
    readonly throughPoint: Vector3;
    readonly bounds: Box3;
  }[];
  readonly floatingFragments: readonly {
    readonly kind: "certificate-piece" | "crown-lock" | "stone-shard";
    readonly slot?: number;
    readonly targetPoint: Vector3;
    readonly bounds: Box3;
  }[];
  readonly portrait: {
    readonly pedestal: Box3;
    readonly legs: Box3;
    readonly shoulders: Box3;
    readonly torso: Box3;
    readonly neck: Box3;
    readonly head: Box3;
    readonly glasses: Box3;
    readonly hair: Box3;
  };
  readonly weatheredStatueVertexCount: number;
  readonly inscribedStrokeCount: number;
}

// Monumental 7.0 m portrait bust anchored at x = 4.7 m so its plinth, interactable prompt and silhouette align with the trail.
const STATUE_X = 4.7;
const STATUE_Z = 0;
// Rotated 25° towards Roots (decreasing t, -Z) so the front of the bust directly faces approaching travelers.
export const STATUE_YAW = 25 * Math.PI / 180;
const COS_YAW = Math.cos(STATUE_YAW);
const SIN_YAW = Math.sin(STATUE_YAW);

function randomFor(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function toEnglishInscription(title: string): string {
  if (/\bccna\b/i.test(title)) return "CCNA";
  if (/\bdevops\b/i.test(title) && /\bvti\b/i.test(title)) return "VTI DEVOPS";
  if (/\baws\b/i.test(title) && /\barchitect\b/i.test(title)) return "AWS SAA";
  if (/\blinux\b/i.test(title) && /\bceh\b/i.test(title)) return "LINUX CEH";
  const cleaned = title
    .replace(/^(?:certificate of completion|planned|dự định|chứng nhận[^:]*)\s*[:\-–]?\s*/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return cleaned.slice(0, 12).trim() || "MILESTONE";
}

/**
 * Derive statue certificate pieces from `src/content` only; nothing is added here.
 * Achieved certificates lock into the bust with deep >= 0.35 m carved English inscriptions;
 * planned ones leave open see-through hollow gaps with lighter, shallowly marked blocks hovering nearby.
 */
export function milestoneCertificates(
  source: { readonly profiles: readonly { readonly locale: string; readonly certificates: readonly { readonly title: string; readonly description: string }[] }[] } = content,
): MilestoneCertificatePiece[] {
  const profile = source.profiles.find(entry => entry.locale === "en") ?? source.profiles[0];
  const raw = [...(profile?.certificates ?? [])];
  return raw.map((item, slot) => {
    const planned = /^(?:planned|dự định)\b/i.test(item.title.trim())
      || /\b(?:not taken yet|still blank|chưa thi)\b/i.test(item.description);
    const inscription = toEnglishInscription(item.title);
    const multiLine = inscription.trim().split(/\s+/).length >= 2;
    return {
      slot,
      title: item.title,
      inscription,
      achieved: !planned,
      charHeight: multiLine ? 0.27 : 0.30,
      carveDepth: planned ? 0.012 : 0.065,
    };
  });
}

type Stroke = readonly [number, number, number, number];
const GLYPH_STROKES: Readonly<Record<string, readonly Stroke[]>> = {
  A: [[0, 0, 0.5, 1], [0.5, 1, 1, 0], [0.2, 0.42, 0.8, 0.42]],
  B: [[0, 0, 0, 1], [0, 1, 0.76, 1], [0.76, 1, 0.96, 0.76], [0.96, 0.76, 0.76, 0.52], [0, 0.52, 0.76, 0.52], [0.76, 0.52, 0.96, 0.26], [0.96, 0.26, 0.76, 0], [0, 0, 0.76, 0]],
  C: [[0.95, 0.82, 0.65, 1], [0.65, 1, 0.22, 1], [0.22, 1, 0, 0.72], [0, 0.72, 0, 0.28], [0, 0.28, 0.22, 0], [0.22, 0, 0.65, 0], [0.65, 0, 0.95, 0.18]],
  D: [[0, 0, 0, 1], [0, 1, 0.68, 1], [0.68, 1, 1, 0.72], [1, 0.72, 1, 0.28], [1, 0.28, 0.68, 0], [0, 0, 0.68, 0]],
  E: [[0, 0, 0, 1], [0, 1, 0.95, 1], [0, 0.52, 0.78, 0.52], [0, 0, 0.95, 0]],
  F: [[0, 0, 0, 1], [0, 1, 0.95, 1], [0, 0.52, 0.78, 0.52]],
  G: [[0.95, 0.82, 0.65, 1], [0.65, 1, 0.22, 1], [0.22, 1, 0, 0.72], [0, 0.72, 0, 0.28], [0, 0.28, 0.22, 0], [0.22, 0, 0.88, 0], [0.88, 0, 0.88, 0.46], [0.52, 0.46, 0.95, 0.46]],
  H: [[0, 0, 0, 1], [1, 0, 1, 1], [0, 0.52, 1, 0.52]],
  I: [[0.15, 1, 0.85, 1], [0.5, 0, 0.5, 1], [0.15, 0, 0.85, 0]],
  J: [[0.2, 1, 0.95, 1], [0.65, 1, 0.65, 0.22], [0.65, 0.22, 0.35, 0], [0.35, 0, 0.05, 0.22]],
  K: [[0, 0, 0, 1], [0, 0.5, 0.95, 1], [0.25, 0.62, 0.95, 0]],
  L: [[0, 1, 0, 0], [0, 0, 0.92, 0]],
  M: [[0, 0, 0, 1], [0, 1, 0.5, 0.38], [0.5, 0.38, 1, 1], [1, 1, 1, 0]],
  N: [[0, 0, 0, 1], [0, 1, 1, 0], [1, 0, 1, 1]],
  O: [[0.22, 1, 0.78, 1], [0.78, 1, 1, 0.72], [1, 0.72, 1, 0.28], [1, 0.28, 0.78, 0], [0.78, 0, 0.22, 0], [0.22, 0, 0, 0.28], [0, 0.28, 0, 0.72], [0, 0.72, 0.22, 1]],
  P: [[0, 0, 0, 1], [0, 1, 0.78, 1], [0.78, 1, 1, 0.76], [1, 0.76, 0.78, 0.5], [0, 0.5, 0.78, 0.5]],
  Q: [[0.22, 1, 0.78, 1], [0.78, 1, 1, 0.72], [1, 0.72, 1, 0.28], [1, 0.28, 0.78, 0], [0.78, 0, 0.22, 0], [0.22, 0, 0, 0.28], [0, 0.28, 0, 0.72], [0, 0.72, 0.22, 1], [0.55, 0.32, 1, 0]],
  R: [[0, 0, 0, 1], [0, 1, 0.78, 1], [0.78, 1, 1, 0.76], [1, 0.76, 0.78, 0.5], [0, 0.5, 0.78, 0.5], [0.48, 0.5, 1, 0]],
  S: [[0.92, 0.84, 0.62, 1], [0.62, 1, 0.18, 1], [0.18, 1, 0, 0.76], [0, 0.76, 0.22, 0.54], [0.22, 0.54, 0.78, 0.44], [0.78, 0.44, 1, 0.22], [1, 0.22, 0.78, 0], [0.78, 0, 0.22, 0], [0.22, 0, 0.04, 0.16]],
  T: [[0, 1, 1, 1], [0.5, 0, 0.5, 1]],
  U: [[0, 1, 0, 0.24], [0, 0.24, 0.24, 0], [0.24, 0, 0.76, 0], [0.76, 0, 1, 0.24], [1, 0.24, 1, 1]],
  V: [[0, 1, 0.5, 0], [0.5, 0, 1, 1]],
  W: [[0, 1, 0.24, 0], [0.24, 0, 0.5, 0.62], [0.5, 0.62, 0.76, 0], [0.76, 0, 1, 1]],
  X: [[0, 1, 1, 0], [0, 0, 1, 1]],
  Y: [[0, 1, 0.5, 0.48], [1, 1, 0.5, 0.48], [0.5, 0.48, 0.5, 0]],
  Z: [[0, 1, 1, 1], [1, 1, 0, 0], [0, 0, 1, 0]],
  0: [[0.2, 1, 0.8, 1], [0.8, 1, 1, 0.2], [1, 0.2, 0.8, 0], [0.8, 0, 0.2, 0], [0.2, 0, 0, 0.8], [0, 0.8, 0.2, 1]],
  1: [[0.25, 0.8, 0.5, 1], [0.5, 1, 0.5, 0], [0.2, 0, 0.8, 0]],
  2: [[0.1, 0.8, 0.5, 1], [0.5, 1, 0.9, 0.8], [0.9, 0.8, 0.1, 0], [0.1, 0, 0.95, 0]],
  3: [[0.1, 1, 0.9, 1], [0.9, 1, 0.5, 0.52], [0.5, 0.52, 0.9, 0.24], [0.9, 0.24, 0.5, 0], [0.5, 0, 0.1, 0.16]],
  4: [[0.75, 0, 0.75, 1], [0.75, 1, 0.1, 0.35], [0.1, 0.35, 0.95, 0.35]],
  5: [[0.9, 1, 0.15, 1], [0.15, 1, 0.1, 0.55], [0.1, 0.55, 0.85, 0.45], [0.85, 0.45, 0.85, 0], [0.85, 0, 0.1, 0]],
  6: [[0.85, 1, 0.15, 0.65], [0.15, 0.65, 0.15, 0], [0.15, 0, 0.85, 0], [0.85, 0, 0.85, 0.48], [0.85, 0.48, 0.15, 0.48]],
  7: [[0.1, 1, 0.9, 1], [0.9, 1, 0.35, 0]],
  8: [[0.15, 0, 0.15, 1], [0.85, 0, 0.85, 1], [0.15, 1, 0.85, 1], [0.15, 0.52, 0.85, 0.52], [0.15, 0, 0.85, 0]],
  9: [[0.85, 0, 0.85, 1], [0.85, 1, 0.15, 1], [0.15, 1, 0.15, 0.52], [0.15, 0.52, 0.85, 0.52]],
  "/": [[0.15, 0, 0.85, 1]],
  "-": [[0.15, 0.5, 0.85, 0.5]],
};

function statuePoint(u: number, y: number, v: number): Vector3 {
  return new Vector3(
    u * COS_YAW - v * SIN_YAW,
    y,
    u * SIN_YAW + v * COS_YAW,
  );
}

interface MeshAccumulator {
  positions: number[];
  colors: number[];
  base: Color;
}

function makeAccumulator(base: Color): MeshAccumulator {
  return { positions: [], colors: [], base };
}

function pushTriangle(acc: MeshAccumulator, a: Vector3, b: Vector3, c: Vector3, pigment: Color) {
  const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  // Keep lit R1 planes bright (0.94..1.0) so warm grey stone reads at 0.45..0.60 luma against the forest.
  const shade = normal.y > 0.35 ? 1.0 : normal.x < -0.35 ? 0.98 : normal.y < -0.35 ? 0.88 : 0.94;
  const r = Math.min(1, pigment.r * shade / acc.base.r);
  const g = Math.min(1, pigment.g * shade / acc.base.g);
  const bl = Math.min(1, pigment.b * shade / acc.base.b);
  for (const p of [a, b, c]) {
    acc.positions.push(p.x, p.y, p.z);
    acc.colors.push(r, g, bl);
  }
}

function pushOutwardQuad(
  acc: MeshAccumulator,
  a: Vector3,
  b: Vector3,
  c: Vector3,
  d: Vector3,
  outward: Vector3,
  pigment: Color,
) {
  const normal = b.clone().sub(a).cross(c.clone().sub(a));
  if (normal.dot(outward) < 0) {
    pushTriangle(acc, a, d, c, pigment);
    pushTriangle(acc, a, c, b, pigment);
  } else {
    pushTriangle(acc, a, b, c, pigment);
    pushTriangle(acc, a, c, d, pigment);
  }
}

function emitBox(
  acc: MeshAccumulator,
  center: readonly [number, number, number],
  size: readonly [number, number, number],
  pigment: Color,
  offset: readonly [number, number, number] = [0, 0, 0],
  tilt = 0,
  bounds?: Box3,
) {
  const [cu, cy, cv] = center;
  const [su, sy, sv] = size;
  const [du, dy, dv] = offset;
  const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
  const boxCenter = statuePoint(cu + du, cy + dy, cv + dv);
  const corner = (iu: number, iy: number, iv: number) => {
    const lu = iu * su / 2;
    const ly = iy * sy / 2;
    const lv = iv * sv / 2;
    const ry = ly * cosT - lv * sinT;
    const rv = ly * sinT + lv * cosT;
    const p = statuePoint(cu + du + lu, cy + dy + ry, cv + dv + rv);
    bounds?.expandByPoint(p);
    return p;
  };
  const c000 = corner(-1, -1, -1), c100 = corner(1, -1, -1);
  const c110 = corner(1, 1, -1), c010 = corner(-1, 1, -1);
  const c001 = corner(-1, -1, 1), c101 = corner(1, -1, 1);
  const c111 = corner(1, 1, 1), c011 = corner(-1, 1, 1);
  const faceQuad = (a: Vector3, b: Vector3, c: Vector3, d: Vector3) => {
    const mid = a.clone().add(b).add(c).add(d).multiplyScalar(0.25).sub(boxCenter);
    pushOutwardQuad(acc, a, b, c, d, mid, pigment);
  };
  // Front (-u), Back (+u), Left (-v), Right (+v), Top (+y), Bottom (-y) — all verified outward-facing.
  faceQuad(c000, c001, c011, c010);
  faceQuad(c101, c100, c110, c111);
  faceQuad(c100, c000, c010, c110);
  faceQuad(c001, c101, c111, c011);
  faceQuad(c010, c011, c111, c110);
  faceQuad(c001, c000, c100, c101);
}

function emitPrism(
  acc: MeshAccumulator,
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  rStart: number,
  rEnd: number,
  sides: number,
  pigment: Color,
  offset: readonly [number, number, number] = [0, 0, 0],
  bounds?: Box3,
  caps = true,
) {
  const a = statuePoint(start[0] + offset[0], start[1] + offset[1], start[2] + offset[2]);
  const b = statuePoint(end[0] + offset[0], end[1] + offset[1], end[2] + offset[2]);
  const axis = b.clone().sub(a).normalize();
  const ref = Math.abs(axis.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const t1 = ref.clone().cross(axis).normalize();
  const t2 = axis.clone().cross(t1).normalize();
  const ringA: Vector3[] = [], ringB: Vector3[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = i * Math.PI * 2 / sides;
    const dir = t1.clone().multiplyScalar(Math.cos(angle)).addScaledVector(t2, Math.sin(angle));
    const pa = a.clone().addScaledVector(dir, rStart);
    const pb = b.clone().addScaledVector(dir, rEnd);
    bounds?.expandByPoint(pa);
    bounds?.expandByPoint(pb);
    ringA.push(pa);
    ringB.push(pb);
  }
  const midAxis = a.clone().add(b).multiplyScalar(0.5);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const outward = ringA[i]!.clone().add(ringB[j]!).multiplyScalar(0.5).sub(midAxis);
    pushOutwardQuad(acc, ringA[i]!, ringA[j]!, ringB[j]!, ringB[i]!, outward, pigment);
  }
  if (caps) {
    for (let i = 1; i < sides - 1; i++) {
      const nA = ringA[i]!.clone().sub(ringA[0]!).cross(ringA[i + 1]!.clone().sub(ringA[0]!));
      if (nA.dot(axis) > 0) pushTriangle(acc, ringA[0]!, ringA[i + 1]!, ringA[i]!, pigment);
      else pushTriangle(acc, ringA[0]!, ringA[i]!, ringA[i + 1]!, pigment);
      const nB = ringB[i]!.clone().sub(ringB[0]!).cross(ringB[i + 1]!.clone().sub(ringB[0]!));
      if (nB.dot(axis) < 0) pushTriangle(acc, ringB[0]!, ringB[i + 1]!, ringB[i]!, pigment);
      else pushTriangle(acc, ringB[0]!, ringB[i]!, ringB[i + 1]!, pigment);
    }
  }
}


function emitCarvedInscription(
  acc: MeshAccumulator,
  inscription: string,
  tabletCenter: readonly [number, number, number],
  tabletWidth: number,
  charHeight: number,
  strokeDepth: number,
  pigment: Color,
  textDir = 1,
  offset: readonly [number, number, number] = [0, 0, 0],
): number {
  const words = inscription.trim().split(/\s+/).filter(Boolean);
  const lines = words.length >= 2
    ? [words[0]!, words.slice(1).join(" ")]
    : [inscription.trim()];
  const [cu, cy, cv] = [
    tabletCenter[0] + offset[0],
    tabletCenter[1] + offset[1],
    tabletCenter[2] + offset[2],
  ];
  let strokesEmitted = 0;
  const lineCount = lines.length;
  const lineGap = lineCount > 1 ? 0.035 : 0;
  const lineSpacing = charHeight + lineGap;
  const halfThick = 0.020; // 0.040 m total stroke thickness (within 0.035–0.05 m requirement)
  const frontOutward = statuePoint(-1, 0, 0);

  lines.forEach((line, lineIndex) => {
    const chars = [...line];
    const charSpacing = Math.max(0.20 * charHeight, 0.05); // >= 18% of charHeight
    const availableWidth = tabletWidth - 2 * 0.085; // guarantees >= 0.08 m margin on each side
    const maxCharWidth = Math.min(
      charHeight * 0.48,
      (availableWidth - (chars.length - 1) * charSpacing) / Math.max(1, chars.length),
    );
    const stepV = maxCharWidth + charSpacing;
    const totalV = (chars.length - 1) * stepV + maxCharWidth;
    const startV = -totalV / 2;
    const baseY = cy + ((lineCount - 1) / 2 - lineIndex) * lineSpacing - charHeight / 2;

    chars.forEach((ch, charIdx) => {
      const strokes = GLYPH_STROKES[ch];
      if (!strokes) return;
      const charV0 = startV + charIdx * stepV;
      for (const [x1, y1, x2, y2] of strokes) {
        const v1 = cv + textDir * (charV0 + x1 * maxCharWidth);
        const vy1 = baseY + y1 * charHeight;
        const v2 = cv + textDir * (charV0 + x2 * maxCharWidth);
        const vy2 = baseY + y2 * charHeight;
        const dv = v2 - v1, dy = vy2 - vy1;
        const len = Math.hypot(dv, dy) || 1;
        const nv = -dy / len * halfThick;
        const ny = dv / len * halfThick;
        const ex = dv / len * halfThick * 0.35;
        const ey = dy / len * halfThick * 0.35;
        const p1L = statuePoint(cu, vy1 - ey + ny, v1 - ex + nv);
        const p1R = statuePoint(cu, vy1 - ey - ny, v1 - ex - nv);
        const p2L = statuePoint(cu, vy2 + ey + ny, v2 + ex + nv);
        const p2R = statuePoint(cu, vy2 + ey - ny, v2 + ex - nv);
        const crest1 = statuePoint(cu - strokeDepth, vy1 - ey, v1 - ex);
        const crest2 = statuePoint(cu - strokeDepth, vy2 + ey, v2 + ex);
        pushOutwardQuad(acc, p1L, crest1, crest2, p2L, frontOutward, pigment);
        pushOutwardQuad(acc, crest1, p1R, p2R, crest2, frontOutward, pigment);
        strokesEmitted++;
      }
    });
  });
  return strokesEmitted;
}

export const WEATHERED_BASE_HEX = 0xb5ada0;
export const FUTURE_BASE_HEX = 0xc5bdad;
export const INK_BASE_HEX = 0x7d776f;

/** Stand the kit's layered slab on edge: its broad cut faces the road (-X).
 * Used for the monumental statue plinth and the orbiting fractured stone shards.
 */
function stone(width: number, depth: number, height: number, lean: number, seed: number, future = false, rough = true) {
  const source = createRockGeometry("slab", seed);
  if (!future && rough) {
    const vertices = source.getAttribute("position");
    source.computeBoundingBox();
    const ringY = source.boundingBox!.max.y * 0.13;
    const corners = [...new Set(Array.from({ length: vertices.count }, (_, i) => i)
      .filter(i => Math.abs(vertices.getY(i) - ringY) < 1e-6)
      .map(i => Math.atan2(vertices.getZ(i), vertices.getX(i))))]
      .sort((a, b) => a - b);
    const scales = [0.72, 1.08, 0.91, 1.03, 0.78, 1.12];
    for (let i = 0; i < vertices.count; i++) {
      const angle = Math.atan2(vertices.getZ(i), vertices.getX(i));
      const corner = corners.findIndex(direction => Math.abs(Math.atan2(Math.sin(angle - direction), Math.cos(angle - direction))) < 1e-5);
      const scale = scales[corner] ?? 1;
      vertices.setXYZ(i, vertices.getX(i) * scale, vertices.getY(i), vertices.getZ(i) * scale);
    }
  }
  if (!future) source.rotateZ(Math.PI / 2);
  source.computeBoundingBox();
  const bounds = source.boundingBox!, size = bounds.getSize(new Vector3());
  source.translate(-bounds.min.x - size.x / 2, -bounds.min.y, -bounds.min.z - size.z / 2);
  source.scale(depth * 0.9 / size.x, (height + 0.05) / size.y, width * 0.86 / size.z);
  const p = source.getAttribute("position"), c = source.getAttribute("color");
  const positions: number[] = [], pigments: number[] = [];
  const append = (a: Vector3, b: Vector3, d: Vector3, color: Color) => {
    for (const point of [a, b, d]) {
      const swell = !future && rough ? depth * 0.09 * Math.sin(Math.PI * point.y / (height + 0.05))
        * Math.cos((point.z / width + 0.13) * Math.PI) * Math.sign(point.x) : 0;
      positions.push(point.x + swell + (point.y - height / 2) * Math.tan(lean) * 0.35,
        point.y - 0.05, point.z + (point.y - height / 2) * Math.tan(lean));
      pigments.push(color.r, color.g, color.b);
    }
  };
  for (let i = 0; i < p.count; i += 3) {
    const a = new Vector3().fromBufferAttribute(p, i), b = new Vector3().fromBufferAttribute(p, i + 1);
    const d = new Vector3().fromBufferAttribute(p, i + 2), pigment = new Color().fromBufferAttribute(c, i);
    const normal = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
    if (!future && rough && Math.abs(normal.x) > 0.99) {
      const ab = a.clone().lerp(b, 0.5), bd = b.clone().lerp(d, 0.5), da = d.clone().lerp(a, 0.5);
      append(a, ab, da, pigment); append(ab, b, bd, pigment);
      append(da, bd, d, pigment); append(ab, bd, da, pigment);
    } else append(a, b, d, pigment);
  }
  source.dispose();
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(pigments, 3));
  geometry.computeBoundingBox();
  const center = geometry.boundingBox!.getCenter(new Vector3());
  geometry.translate(-center.x, 0, -center.z);
  return geometry;
}

/** Author warm light-grey stone pigment (luma 0.45..0.60 on lit faces) before terrain draping. */
function weatherStone(geometry: BufferGeometry, height: number, width: number, seed: number, future = false, grounded = true) {
  const p = geometry.getAttribute("position"), c = geometry.getAttribute("color");
  const base = new Color(future ? FUTURE_BASE_HEX : WEATHERED_BASE_HEX);
  const warmStone = new Color(PALETTE.sand).lerp(new Color(PALETTE.paper), future ? 0.22 : 0.08);
  const moss = new Color(PALETTE.grass).lerp(new Color(PALETTE.forestDeep), 0.25);
  const lichen = new Color(PALETTE.paper);
  const random = randomFor(seed);
  const islands = Array.from({ length: 5 }, () => ({
    y: height * (0.28 + random() * 0.62), z: width * (random() - 0.5) * 0.7,
    ry: height * (0.08 + random() * 0.1), rz: width * (0.08 + random() * 0.1),
  }));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const pigment = new Color().fromBufferAttribute(c, i).lerp(warmStone, 0.72);
    if (grounded) {
      const edge = 0.22 + 0.06 * Math.sin(z * 13 + seed) + 0.03 * Math.cos(x * 17);
      const mossAmount = Math.max(0, Math.min(1, (edge - y) / 0.18)) * (future ? 0.2 : 0.78);
      pigment.lerp(moss, mossAmount);
    }
    if (!future && y > 0.22) {
      const spread = Math.min(...islands.map(patch => ((y - patch.y) / patch.ry) ** 2 + ((z - patch.z) / patch.rz) ** 2));
      const ragged = 0.18 * Math.sin(y * 31 + z * 23 + seed);
      pigment.lerp(lichen, Math.max(0, Math.min(0.85, (1.25 + ragged - spread) * 0.8)));
    }
    c.setXYZ(
      i,
      Math.min(1, pigment.r / base.r),
      Math.min(1, pigment.g / base.g),
      Math.min(1, pigment.b / base.b),
    );
  }
}

function buildDuyPortraitSculpture(
  seed: number,
  certificates: readonly MilestoneCertificatePiece[],
  textDir = 1,
): {
  weatheredStatue: BufferGeometry;
  futureTabletsAndPieces: { geometry: BufferGeometry; x: number; z: number; solid: boolean }[];
  inkDetails: BufferGeometry;
  metadata: MilestoneStatueMetadata;
} {
  const weatheredBase = new Color(WEATHERED_BASE_HEX);
  const futureBase = new Color(FUTURE_BASE_HEX);
  const inkBase = new Color(INK_BASE_HEX);

  // Warm light-grey stone pigments
  const stoneMain = weatheredBase.clone();
  const stoneLight = weatheredBase.clone().multiplyScalar(0.98);
  const stoneWarm = new Color(PALETTE.sand).lerp(weatheredBase, 0.45);
  const tabletTone = futureBase.clone();
  const plannedBlockTone = futureBase.clone().multiplyScalar(0.97);
  const shallowCarveTone = new Color(PALETTE.rock).lerp(futureBase, 0.42);
  const inkTone = inkBase.clone();

  const weatheredAcc = makeAccumulator(weatheredBase);
  const inkAcc = makeAccumulator(inkBase);
  const futureParts: { geometry: BufferGeometry; x: number; z: number; solid: boolean }[] = [];

  const pedestalBounds = new Box3();
  const shouldersBounds = new Box3();
  const torsoBounds = new Box3();
  const neckBounds = new Box3();
  const headBounds = new Box3();
  const glassesBounds = new Box3();
  const hairBounds = new Box3();

  // 1. Rough Stone Plinth (Point 1): width 2.8 x depth 2.2 x height 1.0 (-0.05..1.00 m)
  const lean = (2 + randomFor(seed)() * 3) * Math.PI / 180;
  const mainSeed = (seed + Math.imul(1, 2654435761)) >>> 0;
  const pedestalRock = stone(2.8, 2.2, 1.0, lean, mainSeed, false, true);
  weatherStone(pedestalRock, 1.0, 2.8, mainSeed, false, true);
  const pedPos = pedestalRock.getAttribute("position");
  const pedCol = pedestalRock.getAttribute("color");
  const mossTint = new Color(PALETTE.grass).lerp(new Color(PALETTE.forestDeep), 0.28);
  const lichenTint = new Color(PALETTE.paper);
  for (let i = 0; i < pedPos.count; i++) {
    const px = pedPos.getX(i), py = pedPos.getY(i), pz = pedPos.getZ(i);
    const sp = statuePoint(px, py, pz);
    pedestalBounds.expandByPoint(sp);
    weatheredAcc.positions.push(sp.x, sp.y, sp.z);
    const col = new Color(pedCol.getX(i) * weatheredBase.r, pedCol.getY(i) * weatheredBase.g, pedCol.getZ(i) * weatheredBase.b);
    if (py < 0.16) col.lerp(mossTint, 0.68);
    else if (py > 0.36 && Math.abs(pz) < 1.0) col.lerp(lichenTint, 0.45);
    weatheredAcc.colors.push(
      col.r / weatheredBase.r,
      col.g / weatheredBase.g,
      col.b / weatheredBase.b,
    );
  }
  pedestalRock.dispose();

  // 2. Torso + Shoulders (Points 2 & 8): Flattened hexagonal cross-section, 6° backward slope, trapezius slope (3.2m peak to 2.9m outer), right shoulder diagonal cut (~22% volume removed) with dark cut face.
  const tan6 = Math.tan(6 * Math.PI / 180);
  const Ny = 7;
  const rings: Vector3[][] = [];
  for (let k = 0; k < Ny; k++) {
    const y = 1.0 + k * (1.9 / (Ny - 1));
    const t = (y - 1.0) / 1.9;
    const W = 2.4 + 1.2 * t;
    const D = 1.3 + 0.2 * t;
    const uf = -0.65 + (y - 1.0) * tan6;
    const ub = uf + D;
    const um = (uf + ub) / 2;
    const Wf = W * 0.68;
    const Wb = W * 0.60;
    rings.push([
      new Vector3(uf, y, -Wf / 2),
      new Vector3(uf, y, +Wf / 2),
      new Vector3(um, y, +W / 2),
      new Vector3(ub, y, +Wb / 2),
      new Vector3(ub, y, -Wb / 2),
      new Vector3(um, y, -W / 2),
    ]);
  }
  const topNeck = [
    new Vector3(0.15 - 0.45, 3.2, 0),
    new Vector3(0.15, 3.2, 0.45),
    new Vector3(0.15 + 0.45, 3.2, 0),
    new Vector3(0.15, 3.2, -0.45),
  ];

  const rawTriangles: [Vector3, Vector3, Vector3][] = [];
  // Bottom cap
  const b = rings[0]!;
  const bCenter = new Vector3(0, 1.0, 0);
  for (let i = 0; i < 6; i++) {
    rawTriangles.push([bCenter, b[(i + 1) % 6]!, b[i]!]);
  }
  // Side quads between rings
  for (let k = 0; k < Ny - 1; k++) {
    const r0 = rings[k]!, r1 = rings[k + 1]!;
    for (let i = 0; i < 6; i++) {
      const next = (i + 1) % 6;
      rawTriangles.push([r0[i]!, r0[next]!, r1[next]!]);
      rawTriangles.push([r0[i]!, r1[next]!, r1[i]!]);
    }
  }
  // Trapezius shoulder slope connecting ring 6 (at y = 2.9) to neck base (at y = 3.2)
  const rTop = rings[Ny - 1]!;
  rawTriangles.push([rTop[0]!, rTop[1]!, topNeck[0]!]);
  rawTriangles.push([rTop[1]!, rTop[2]!, topNeck[1]!]);
  rawTriangles.push([rTop[1]!, topNeck[1]!, topNeck[0]!]);
  rawTriangles.push([rTop[2]!, rTop[3]!, topNeck[1]!]);
  rawTriangles.push([rTop[3]!, topNeck[2]!, topNeck[1]!]);
  rawTriangles.push([rTop[3]!, rTop[4]!, topNeck[2]!]);
  rawTriangles.push([rTop[4]!, rTop[5]!, topNeck[3]!]);
  rawTriangles.push([rTop[4]!, topNeck[3]!, topNeck[2]!]);
  rawTriangles.push([rTop[5]!, rTop[0]!, topNeck[3]!]);
  rawTriangles.push([rTop[0]!, topNeck[0]!, topNeck[3]!]);

  // Diagonal plane cutting the right shoulder (Point 8): removes ~22% right shoulder volume
  const cutPlane = (p: Vector3) => 0.20 * p.x + 0.85 * (p.y - 1.8) + p.z - 1.70;
  const cutEdges: [Vector3, Vector3][] = [];

  for (const [p1, p2, p3] of rawTriangles) {
    const f1 = cutPlane(p1), f2 = cutPlane(p2), f3 = cutPlane(p3);
    const pts = [p1, p2, p3];
    const fs = [f1, f2, f3];
    const inside: number[] = [];
    const outside: number[] = [];
    for (let i = 0; i < 3; i++) {
      if (fs[i]! <= 0) inside.push(i);
      else outside.push(i);
    }
    if (inside.length === 3) {
      const s1 = statuePoint(p1.x, p1.y, p1.z);
      const s2 = statuePoint(p2.x, p2.y, p2.z);
      const s3 = statuePoint(p3.x, p3.y, p3.z);
      torsoBounds.expandByPoint(s1);
      torsoBounds.expandByPoint(s2);
      torsoBounds.expandByPoint(s3);
      shouldersBounds.expandByPoint(s1);
      shouldersBounds.expandByPoint(s2);
      shouldersBounds.expandByPoint(s3);
      pushTriangle(weatheredAcc, s1, s2, s3, stoneMain);
    } else if (inside.length === 0) {
      // Omit (missing right shoulder volume)
    } else if (inside.length === 1) {
      const i0 = inside[0]!;
      const o1 = (i0 + 1) % 3, o2 = (i0 + 2) % 3;
      const pIn = pts[i0]!, pOut1 = pts[o1]!, pOut2 = pts[o2]!;
      const fIn = fs[i0]!, fOut1 = fs[o1]!, fOut2 = fs[o2]!;
      const i1 = pIn.clone().lerp(pOut1, -fIn / (fOut1 - fIn));
      const i2 = pIn.clone().lerp(pOut2, -fIn / (fOut2 - fIn));
      const sIn = statuePoint(pIn.x, pIn.y, pIn.z);
      const s1 = statuePoint(i1.x, i1.y, i1.z);
      const s2 = statuePoint(i2.x, i2.y, i2.z);
      torsoBounds.expandByPoint(sIn);
      torsoBounds.expandByPoint(s1);
      torsoBounds.expandByPoint(s2);
      shouldersBounds.expandByPoint(sIn);
      shouldersBounds.expandByPoint(s1);
      shouldersBounds.expandByPoint(s2);
      pushTriangle(weatheredAcc, sIn, s1, s2, stoneMain);
      cutEdges.push([i1, i2]);
    } else {
      const o0 = outside[0]!;
      const i1 = (o0 + 1) % 3, i2 = (o0 + 2) % 3;
      const pOut = pts[o0]!, pIn1 = pts[i1]!, pIn2 = pts[i2]!;
      const fOut = fs[o0]!, fIn1 = fs[i1]!, fIn2 = fs[i2]!;
      const inter1 = pIn1.clone().lerp(pOut, -fIn1 / (fOut - fIn1));
      const inter2 = pIn2.clone().lerp(pOut, -fIn2 / (fOut - fIn2));
      const sIn1 = statuePoint(pIn1.x, pIn1.y, pIn1.z);
      const sIn2 = statuePoint(pIn2.x, pIn2.y, pIn2.z);
      const sInter1 = statuePoint(inter1.x, inter1.y, inter1.z);
      const sInter2 = statuePoint(inter2.x, inter2.y, inter2.z);
      torsoBounds.expandByPoint(sIn1);
      torsoBounds.expandByPoint(sIn2);
      torsoBounds.expandByPoint(sInter1);
      torsoBounds.expandByPoint(sInter2);
      shouldersBounds.expandByPoint(sIn1);
      shouldersBounds.expandByPoint(sIn2);
      shouldersBounds.expandByPoint(sInter1);
      shouldersBounds.expandByPoint(sInter2);
      pushTriangle(weatheredAcc, sIn1, sIn2, sInter2, stoneMain);
      pushTriangle(weatheredAcc, sIn1, sInter2, sInter1, stoneMain);
      cutEdges.push([inter2, inter1]);
    }
  }

  // Triangulate right shoulder cut face with dark stone pigment (inkTone)
  if (cutEdges.length > 0) {
    const cutCenter = new Vector3();
    for (const [a, b] of cutEdges) cutCenter.add(a).add(b);
    cutCenter.divideScalar(cutEdges.length * 2);
    const sCenter = statuePoint(cutCenter.x, cutCenter.y, cutCenter.z);
    for (const [a, b] of cutEdges) {
      const sA = statuePoint(a.x, a.y, a.z);
      const sB = statuePoint(b.x, b.y, b.z);
      shouldersBounds.expandByPoint(sA);
      shouldersBounds.expandByPoint(sB);
      pushTriangle(inkAcc, sCenter, sB, sA, inkTone);
    }
  }

  const floatingFragments: MilestoneStatueMetadata["floatingFragments"][number][] = [];

  // 4 stone shards hovering 0.4–1.6 m away along an arc pointing into the missing right shoulder (Point 8)
  const shoulderTarget = statuePoint(0.15, 2.67, 0.93).add(new Vector3(STATUE_X, 0, STATUE_Z));
  const shardSpecs = [
    { size: [0.60, 0.45, 0.50] as const, center: [0.22, 2.96, 1.28] as const, tilt: 0.15 },
    { size: [0.48, 0.36, 0.42] as const, center: [0.31, 3.16, 1.54] as const, tilt: 0.22 },
    { size: [0.36, 0.28, 0.32] as const, center: [0.45, 3.34, 1.86] as const, tilt: 0.30 },
    { size: [0.26, 0.20, 0.22] as const, center: [0.62, 3.48, 2.22] as const, tilt: 0.38 },
  ] as const;
  for (const [idx, spec] of shardSpecs.entries()) {
    const shardSeed = (seed + 101 + idx * 37) >>> 0;
    const shardRock = stone(spec.size[0], spec.size[1], spec.size[2], spec.tilt, shardSeed, false, true);
    weatherStone(shardRock, spec.size[2], spec.size[0], shardSeed, false, false);
    const rPos = shardRock.getAttribute("position");
    const rCol = shardRock.getAttribute("color");
    const shardBounds = new Box3();
    for (let i = 0; i < rPos.count; i++) {
      const sp = statuePoint(
        spec.center[0] + rPos.getX(i),
        spec.center[1] + rPos.getY(i),
        spec.center[2] + rPos.getZ(i),
      );
      shardBounds.expandByPoint(sp);
      weatheredAcc.positions.push(sp.x, sp.y, sp.z);
      weatheredAcc.colors.push(rCol.getX(i), rCol.getY(i), rCol.getZ(i));
    }
    shardRock.dispose();
    shouldersBounds.union(shardBounds);
    floatingFragments.push({
      kind: "stone-shard",
      targetPoint: shoulderTarget.clone(),
      bounds: shardBounds.translate(new Vector3(STATUE_X, 0, STATUE_Z)),
    });
  }

  // 3. Neck (Point 3): 8-sided cylinder, radius 0.45, y from 3.1 to 3.7
  emitPrism(weatheredAcc, [0.15, 3.10, 0], [0.15, 3.70, 0], 0.45, 0.45, 8, stoneLight, [0, 0, 0], neckBounds, true);

  // 4. Head (Points 4 & 9): IcosahedronGeometry(1, 1) scale (0.85, 1.05, 0.95), center y = 4.6. Chin pulled forward 0.12, x narrowed 70%.
  // 9. Corner cut: vertices with (v > 0.25 and y > 0.25 and u > -0.1) projected onto diagonal plane.
  const rawHeadGeo = new IcosahedronGeometry(1, 1);
  const headGeo = rawHeadGeo.index ? rawHeadGeo.toNonIndexed() : rawHeadGeo;
  const headPos = headGeo.getAttribute("position");
  for (let i = 0; i < headPos.count; i++) {
    let vx = headPos.getX(i) * 0.85; // lateral (v)
    let vy = headPos.getY(i) * 1.05; // height (y)
    let vz = headPos.getZ(i) * 0.95; // depth (u)
    if (vy < -0.6) {
      vx *= 0.70;
      vz -= 0.12;
    }
    if (vx > 0.25 && vy > 0.25 && vz > -0.1) {
      const planeVal = (vx + vy + vz) - 0.92;
      if (planeVal > 0) {
        vx -= planeVal / 3;
        vy -= planeVal / 3;
        vz -= planeVal / 3;
      }
    }
    headPos.setXYZ(i, vx, vy, vz);
  }
  for (let i = 0; i < headPos.count; i += 3) {
    const a = new Vector3(headPos.getX(i), headPos.getY(i), headPos.getZ(i));
    const b = new Vector3(headPos.getX(i + 1), headPos.getY(i + 1), headPos.getZ(i + 1));
    const c = new Vector3(headPos.getX(i + 2), headPos.getY(i + 2), headPos.getZ(i + 2));
    const isCutFace = a.x > 0.24 && b.x > 0.24 && c.x > 0.24 &&
      Math.abs((a.x + a.y + a.z) - 0.92) < 0.05 &&
      Math.abs((b.x + b.y + b.z) - 0.92) < 0.05 &&
      Math.abs((c.x + c.y + c.z) - 0.92) < 0.05;
    const sa = statuePoint(0.15 + a.z, 4.6 + a.y, a.x);
    const sb = statuePoint(0.15 + b.z, 4.6 + b.y, b.x);
    const sc = statuePoint(0.15 + c.z, 4.6 + c.y, c.x);
    headBounds.expandByPoint(sa);
    headBounds.expandByPoint(sb);
    headBounds.expandByPoint(sc);
    if (isCutFace) {
      pushTriangle(inkAcc, sa, sb, sc, inkTone);
    } else {
      pushTriangle(weatheredAcc, sa, sb, sc, stoneLight);
    }
  }
  if (headGeo !== rawHeadGeo) rawHeadGeo.dispose();
  headGeo.dispose();

  // 2 small stone shards hovering 0.4 m and 0.8 m next to head cut (Point 9)
  const headCutTarget = statuePoint(0.45, 5.20, 0.65).add(new Vector3(STATUE_X, 0, STATUE_Z));
  for (const [idx, spec] of [
    { size: [0.22, 0.18, 0.20] as const, center: [0.42, 5.45, 0.92] as const, tilt: 0.25 },
    { size: [0.16, 0.13, 0.15] as const, center: [0.62, 5.75, 1.30] as const, tilt: 0.35 },
  ].entries()) {
    const shardSeed = (seed + 201 + idx * 43) >>> 0;
    const shardRock = stone(spec.size[0], spec.size[1], spec.size[2], spec.tilt, shardSeed, false, true);
    weatherStone(shardRock, spec.size[2], spec.size[0], shardSeed, false, false);
    const rPos = shardRock.getAttribute("position");
    const rCol = shardRock.getAttribute("color");
    const shardBounds = new Box3();
    for (let i = 0; i < rPos.count; i++) {
      const sp = statuePoint(
        spec.center[0] + rPos.getX(i),
        spec.center[1] + rPos.getY(i),
        spec.center[2] + rPos.getZ(i),
      );
      shardBounds.expandByPoint(sp);
      weatheredAcc.positions.push(sp.x, sp.y, sp.z);
      weatheredAcc.colors.push(rCol.getX(i), rCol.getY(i), rCol.getZ(i));
    }
    shardRock.dispose();
    headBounds.union(shardBounds);
    floatingFragments.push({
      kind: "crown-lock",
      targetPoint: headCutTarget.clone(),
      bounds: shardBounds.translate(new Vector3(STATUE_X, 0, STATUE_Z)),
    });
  }

  // 5. Hair (Point 5 & Point 9): IcosahedronGeometry(1, 1) scale (0.95, 0.62, 1.05), center y = 5.12, u = 0.23, v = 0. Dark stone color.
  const rawHairGeo = new IcosahedronGeometry(1, 1);
  const hairGeo = rawHairGeo.index ? rawHairGeo.toNonIndexed() : rawHairGeo;
  const hairPos = hairGeo.getAttribute("position");
  for (let i = 0; i < hairPos.count; i++) {
    let vx = hairPos.getX(i) * 0.95;
    let vy = hairPos.getY(i) * 0.62;
    let vz = hairPos.getZ(i) * 1.05;
    if (vx > 0.25 && vy > 0.15 && vz > -0.1) {
      const planeVal = (vx + vy + vz) - 0.88;
      if (planeVal > 0) {
        vx -= planeVal / 3;
        vy -= planeVal / 3;
        vz -= planeVal / 3;
      }
    }
    hairPos.setXYZ(i, vx, vy, vz);
  }
  for (let i = 0; i < hairPos.count; i += 3) {
    const sa = statuePoint(0.23 + hairPos.getZ(i), 5.12 + hairPos.getY(i), hairPos.getX(i));
    const sb = statuePoint(0.23 + hairPos.getZ(i + 1), 5.12 + hairPos.getY(i + 1), hairPos.getX(i + 1));
    const sc = statuePoint(0.23 + hairPos.getZ(i + 2), 5.12 + hairPos.getY(i + 2), hairPos.getX(i + 2));
    hairBounds.expandByPoint(sa);
    hairBounds.expandByPoint(sb);
    hairBounds.expandByPoint(sc);
    pushTriangle(inkAcc, sa, sb, sc, inkTone);
  }
  if (hairGeo !== rawHairGeo) rawHairGeo.dispose();
  hairGeo.dispose();

  // Forehead fringe wedge covering part of forehead, offset to one side (Point 5)
  emitBox(inkAcc, [-0.70, 4.88, -0.15], [0.18, 0.32, 0.58], inkTone, [0, 0, 0], -0.18, hairBounds);

  // 6. Round glasses (Point 6): two TorusGeometry(0.26, 0.035, 6, 12) at y = 4.65, center-to-center 0.62, bridge bar; dark stone color
  const rawTorusL = new TorusGeometry(0.26, 0.035, 6, 12);
  const torusLeft = rawTorusL.index ? rawTorusL.toNonIndexed() : rawTorusL;
  const tPosL = torusLeft.getAttribute("position");
  for (let i = 0; i < tPosL.count; i += 3) {
    const sa = statuePoint(-0.72 + tPosL.getZ(i), 4.65 + tPosL.getY(i), -0.31 + tPosL.getX(i));
    const sb = statuePoint(-0.72 + tPosL.getZ(i + 1), 4.65 + tPosL.getY(i + 1), -0.31 + tPosL.getX(i + 1));
    const sc = statuePoint(-0.72 + tPosL.getZ(i + 2), 4.65 + tPosL.getY(i + 2), -0.31 + tPosL.getX(i + 2));
    glassesBounds.expandByPoint(sa);
    glassesBounds.expandByPoint(sb);
    glassesBounds.expandByPoint(sc);
    pushTriangle(inkAcc, sa, sb, sc, inkTone);
  }
  if (torusLeft !== rawTorusL) rawTorusL.dispose();
  torusLeft.dispose();

  const rawTorusR = new TorusGeometry(0.26, 0.035, 6, 12);
  const torusRight = rawTorusR.index ? rawTorusR.toNonIndexed() : rawTorusR;
  const tPosR = torusRight.getAttribute("position");
  for (let i = 0; i < tPosR.count; i += 3) {
    const sa = statuePoint(-0.72 + tPosR.getZ(i), 4.65 + tPosR.getY(i), 0.31 + tPosR.getX(i));
    const sb = statuePoint(-0.72 + tPosR.getZ(i + 1), 4.65 + tPosR.getY(i + 1), 0.31 + tPosR.getX(i + 1));
    const sc = statuePoint(-0.72 + tPosR.getZ(i + 2), 4.65 + tPosR.getY(i + 2), 0.31 + tPosR.getX(i + 2));
    glassesBounds.expandByPoint(sa);
    glassesBounds.expandByPoint(sb);
    glassesBounds.expandByPoint(sc);
    pushTriangle(inkAcc, sa, sb, sc, inkTone);
  }
  if (torusRight !== rawTorusR) rawTorusR.dispose();
  torusRight.dispose();

  // Bridge connecting glasses frames
  emitBox(inkAcc, [-0.72, 4.65, 0], [0.04, 0.04, 0.24], inkTone, [0, 0, 0], 0, glassesBounds);

  // 7. Nose (Point 7): small tetrahedron wedge, height 0.3 m below glasses bridge. No mouth, no ears.
  const noseTip = statuePoint(-0.88, 4.45, 0);
  const noseBaseTop = statuePoint(-0.72, 4.60, 0);
  const noseBaseLeft = statuePoint(-0.72, 4.35, -0.09);
  const noseBaseRight = statuePoint(-0.72, 4.35, 0.09);
  headBounds.expandByPoint(noseTip);
  headBounds.expandByPoint(noseBaseTop);
  headBounds.expandByPoint(noseBaseLeft);
  headBounds.expandByPoint(noseBaseRight);
  pushTriangle(weatheredAcc, noseTip, noseBaseTop, noseBaseLeft, stoneWarm);
  pushTriangle(weatheredAcc, noseTip, noseBaseRight, noseBaseTop, stoneWarm);
  pushTriangle(weatheredAcc, noseTip, noseBaseLeft, noseBaseRight, stoneWarm);

  // 10. Certificates (Point 10): 2x2 grid on chest front, each cell 1.0 x 0.62, spacing 0.12.
  // Col 0: v = -0.56 (achieved: flat fitted tablet, deep carved inscription >= 0.3 m)
  // Col 1: v = +0.56 (planned: dark recessed socket deep 0.25 m; hovering tablet 0.9–1.2 m in front tilted 15°, faint inscription)
  const tabletAcc = makeAccumulator(futureBase);
  const fittedPieces: MilestoneStatueMetadata["fittedPieces"][number][] = [];
  const plannedPieces: MilestoneStatueMetadata["plannedPieces"][number][] = [];
  const hollowGaps: MilestoneStatueMetadata["hollowGaps"][number][] = [];
  let inscribedStrokeCount = 0;

  const slotGrid = [
    { slot: 0, y: 2.68, v: -0.56, uChest: -0.48 },
    { slot: 1, y: 1.88, v: -0.56, uChest: -0.55 },
    { slot: 2, y: 2.68, v: +0.56, uChest: -0.48 },
    { slot: 3, y: 1.88, v: +0.56, uChest: -0.55 },
  ] as const;

  const tabletSize: [number, number, number] = [0.08, 0.74, 1.04];

  for (const [idx, cert] of certificates.entries()) {
    const grid = slotGrid[idx % slotGrid.length]!;
    if (cert.achieved) {
      const pieceBounds = new Box3();
      const tabletCenter: [number, number, number] = [grid.uChest - 0.04, grid.y, grid.v];
      emitBox(tabletAcc, tabletCenter, tabletSize, tabletTone, [0, 0, 0], 0, pieceBounds);
      torsoBounds.union(pieceBounds);
      shouldersBounds.union(pieceBounds);
      inscribedStrokeCount += emitCarvedInscription(
        inkAcc,
        cert.inscription,
        [tabletCenter[0] - tabletSize[0] / 2, tabletCenter[1], tabletCenter[2]],
        tabletSize[2],
        cert.charHeight,
        cert.carveDepth,
        inkTone,
        textDir,
      );
      fittedPieces.push({
        slot: cert.slot,
        inscription: cert.inscription,
        title: cert.title,
        charHeight: cert.charHeight,
        carveDepth: cert.carveDepth,
        bounds: pieceBounds.clone().translate(new Vector3(STATUE_X, 0, STATUE_Z)),
      });
    } else {
      // Dark recessed socket 0.25 m deep into the chest
      const socketCenter: [number, number, number] = [grid.uChest + 0.125, grid.y, grid.v];
      const socketSize: [number, number, number] = [0.25, tabletSize[1], tabletSize[2]];
      const gapBounds = new Box3();
      emitBox(inkAcc, socketCenter, socketSize, inkTone, [0, 0, 0], 0, gapBounds);
      const throughLocal = statuePoint(grid.uChest, grid.y, grid.v).add(new Vector3(STATUE_X, 0, STATUE_Z));
      hollowGaps.push({
        slot: cert.slot,
        plannedTitle: cert.title,
        inscription: cert.inscription,
        throughPoint: throughLocal,
        bounds: gapBounds.translate(new Vector3(STATUE_X, 0, STATUE_Z)),
      });

      // Hovering tablets separated horizontally by >= 0.5 m, facing same direction as statue face
      const floatAcc = makeAccumulator(futureBase);
      const floatBounds = new Box3();
      // Slot 2 (AWS SAA): upper tablet at v = +0.25
      // Slot 3 (LINUX CEH): lower tablet at v = +1.00 (separated by 0.75 m horizontally)
      const floatCenter: [number, number, number] = cert.slot === 2
        ? [grid.uChest - 0.95, grid.y + 0.05, 0.25]
        : [grid.uChest - 0.90, grid.y, 1.00];
      const floatTilt = 0; // faces same direction as statue face
      emitBox(floatAcc, floatCenter, tabletSize, plannedBlockTone, [0, 0, 0], floatTilt, floatBounds);
      emitCarvedInscription(
        floatAcc,
        cert.inscription,
        [floatCenter[0] - tabletSize[0] / 2, floatCenter[1], floatCenter[2]],
        tabletSize[2],
        cert.charHeight,
        cert.carveDepth,
        shallowCarveTone,
        textDir,
      );
      const floatGeo = new BufferGeometry();
      floatGeo.setAttribute("position", new Float32BufferAttribute(floatAcc.positions, 3));
      floatGeo.setAttribute("color", new Float32BufferAttribute(floatAcc.colors, 3));
      floatGeo.computeBoundingBox();
      const fc = floatGeo.boundingBox!.getCenter(new Vector3());
      floatGeo.translate(-fc.x, 0, -fc.z);
      futureParts.push({
        geometry: floatGeo,
        x: STATUE_X + fc.x,
        z: STATUE_Z + fc.z,
        solid: false,
      });
      const worldBounds = floatBounds.translate(new Vector3(STATUE_X, 0, STATUE_Z));
      plannedPieces.push({
        slot: cert.slot,
        inscription: cert.inscription,
        title: cert.title,
        charHeight: cert.charHeight,
        carveDepth: cert.carveDepth,
        bounds: worldBounds.clone(),
      });
      floatingFragments.push({
        kind: "certificate-piece",
        slot: cert.slot,
        targetPoint: throughLocal.clone(),
        bounds: worldBounds,
      });
    }
  }

  if (tabletAcc.positions.length > 0) {
    const tabletGeo = new BufferGeometry();
    tabletGeo.setAttribute("position", new Float32BufferAttribute(tabletAcc.positions, 3));
    tabletGeo.setAttribute("color", new Float32BufferAttribute(tabletAcc.colors, 3));
    futureParts.unshift({
      geometry: tabletGeo,
      x: STATUE_X,
      z: STATUE_Z,
      solid: false,
    });
  }

  const weatheredStatue = new BufferGeometry();
  weatheredStatue.setAttribute("position", new Float32BufferAttribute(weatheredAcc.positions, 3));
  weatheredStatue.setAttribute("color", new Float32BufferAttribute(weatheredAcc.colors, 3));
  weatheredStatue.computeBoundingBox();

  const inkDetails = new BufferGeometry();
  inkDetails.setAttribute("position", new Float32BufferAttribute(inkAcc.positions, 3));
  inkDetails.setAttribute("color", new Float32BufferAttribute(inkAcc.colors, 3));
  inkDetails.computeBoundingBox();

  const shift = new Vector3(STATUE_X, 0, STATUE_Z);
  const shiftedPedestal = pedestalBounds.translate(shift);
  const totalMaxY = Math.max(weatheredStatue.boundingBox!.max.y, inkDetails.boundingBox!.max.y);
  return {
    weatheredStatue,
    futureTabletsAndPieces: futureParts,
    inkDetails,
    metadata: {
      totalHeight: totalMaxY,
      certificates,
      fittedPieces,
      plannedPieces,
      hollowGaps,
      floatingFragments,
      portrait: {
        pedestal: shiftedPedestal,
        legs: shiftedPedestal.clone(),
        shoulders: shouldersBounds.translate(shift),
        torso: torsoBounds.translate(shift),
        neck: neckBounds.translate(shift),
        head: headBounds.translate(shift),
        glasses: glassesBounds.translate(shift),
        hair: hairBounds.translate(shift),
      },
      weatheredStatueVertexCount: weatheredAcc.positions.length / 3,
      inscribedStrokeCount,
    },
  };
}

function wash(geometry: BufferGeometry) {
  const vertices = geometry.getAttribute("position"), colors: number[] = [];
  for (let i = 0; i < vertices.count; i++) {
    const value = 0.95 + 0.035 * Math.sin(vertices.getX(i) * 4 + vertices.getY(i) * 3 + vertices.getZ(i));
    colors.push(value, value, value);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

function materials(): Record<Surface, MeshToonMaterial> {
  const ramp = WORLD_DIRECTION.foliage.ramp;
  // The world ramp keeps blue-violet shadows; a paler custom tint washed the statue out to blue-white in the dim forest.
  const stoneRamp = { ...ramp };
  const result = {
    weathered: createRampMaterial(WEATHERED_BASE_HEX, stoneRamp),
    future: createRampMaterial(FUTURE_BASE_HEX, stoneRamp),
    ink: createRampMaterial(INK_BASE_HEX, stoneRamp),
    needles: createRampMaterial(paletteColor({
      base: "grass", mix: "forestDeep", amount: 0.42, saturation: 1, brightness: 1,
    }), ramp),
    flower: createRampMaterial(paletteColor({
      base: "flower", mix: "flower", amount: 0, saturation: 1, brightness: 1,
    }), ramp),
  };
  for (const material of Object.values(result)) material.vertexColors = true;
  return result;
}

/** Check whole bounding footprints, including their edges, rather than just prop centres. */
function fits(parts: readonly Part[], context: ZoneSceneContext, side: number, offsetZ: number) {
  const footprints = parts.map(part => {
    part.geometry.computeBoundingBox();
    return { bounds: part.geometry.boundingBox!, x: part.x, z: part.z };
  });
  footprints.push({ bounds: new Box3(new Vector3(3.6, 0, -1.2), new Vector3(5.3, 0, 1.2)), x: 0, z: 0 });
  return footprints.every(({ bounds, x: originX, z: originZ }) => {
    const size = bounds.getSize(new Vector3());
    const stepsX = Math.ceil(size.x / 0.2), stepsZ = Math.ceil(size.z / 0.2);
    for (let ix = 0; ix <= stepsX; ix++) {
      for (let iz = 0; iz <= stepsZ; iz++) {
        const x = side * (originX + bounds.min.x + size.x * ix / Math.max(1, stepsX));
        const z = originZ + offsetZ + bounds.min.z + size.z * iz / Math.max(1, stepsZ);
        const y = context.heightAt(x, z);
        if (Math.abs(x) <= PATH_CLEARANCE || context.onPath(x, z) || context.underWater(x, z)
          || !Number.isFinite(y) || Math.hypot(x, y + bounds.max.y, z) > ZONE_BUDGET.radius) return false;
      }
    }
    return true;
  });
}

/** Prefer a level shoulder behind the road's lip, rather than draping rocks down its steep face. */
function slopeAtSite(context: ZoneSceneContext, side: number, offsetZ: number) {
  let steepest = 0;
  for (let x = PATH_CLEARANCE; x <= 16; x += 2) {
    for (let z = -9; z <= 9; z += 3) {
      const y = context.heightAt(side * x, z + offsetZ);
      const across = context.heightAt(side * (x + 1), z + offsetZ) - y;
      const along = context.heightAt(side * x, z + offsetZ + 1) - y;
      const slope = Math.hypot(across, along);
      if (!Number.isFinite(slope)) return Infinity;
      steepest = Math.max(steepest, slope);
    }
  }
  return Math.round(steepest * 1e6) / 1e6;
}

export const createMilestonesScene: ZoneSceneFactory = context => {
  const parts: Part[] = [];
  const certificates = milestoneCertificates();
  const initialSculpture = buildDuyPortraitSculpture(context.seed, certificates, 1);

  // Collider 0: The plinth supporting the monumental portrait bust of Duy.
  const plinthCollider = new BufferGeometry();
  plinthCollider.setAttribute("position", new Float32BufferAttribute([
    -1.1, 0, -1.4, 1.1, 0, -1.4, 1.1, 1.0, -1.4,
    -1.1, 0,  1.4, 1.1, 1.0,  1.4, -1.1, 1.0, -1.4,
  ], 3));
  parts.push({
    geometry: initialSculpture.weatheredStatue,
    surface: "weathered",
    collisionGeometry: plinthCollider,
    x: STATUE_X,
    z: STATUE_Z,
    solid: true,
    yaw: STATUE_YAW,
  });

  // Dressed certificate tablets on the chest + 2 hovering paler planned certificate blocks (`future` stone).
  for (const piece of initialSculpture.futureTabletsAndPieces) {
    parts.push({
      geometry: piece.geometry,
      surface: "future",
      x: piece.x,
      z: piece.z,
      solid: piece.solid,
    });
  }

  // Four loose stone chips settle into the pedestal's foot beside the two small wildflowers.
  for (const [index, [x, z]] of ([[4.45, -1.35], [4.52, 1.28], [5.15, -1.85], [5.22, 1.78]] as const).entries()) {
    const seed = (context.seed + index * 97) >>> 0;
    const geometry = createRockGeometry("pebble", seed, true).translate(0, -0.04, 0);
    weatherStone(geometry, 0.15, 0.25, seed);
    parts.push({ geometry, surface: "weathered", x, z, solid: false });
  }

  const inkPartIndex = parts.length;
  // Sculpted dark stone details: round glasses, smile, and >= 0.35 m carved English certificate names.
  parts.push({
    geometry: initialSculpture.inkDetails,
    surface: "ink",
    x: STATUE_X,
    z: STATUE_Z,
    solid: false,
  });

  const crown = createPineCrownV2(context.seed).translate(0, TRUNK_HEIGHT, 0);
  const crownColors = crown.getAttribute("color");
  const crownBase = new Color(RAMP_PRESETS.crown);
  const needleBase = new Color(paletteColor({ base: "grass", mix: "forestDeep", amount: 0.42, saturation: 1, brightness: 1 }));
  for (let i = 0; i < crownColors.count; i++) {
    crownColors.setXYZ(i, crownColors.getX(i) * crownBase.r / needleBase.r,
      crownColors.getY(i) * crownBase.g / needleBase.g, crownColors.getZ(i) * crownBase.b / needleBase.b);
  }
  crown.deleteAttribute("surface");
  parts.push({
    geometry: createTreeTrunk().scale(1, 4.2, 1).translate(0, 2.1, 0),
    surface: "ink", x: 15, z: 2.7, solid: true,
  }, {
    geometry: crown,
    surface: "needles", x: 15, z: 2.7, solid: false,
  });
  for (const [x, z] of [[4.35, -1.6], [4.45, 1.65]] as const) parts.push({
    geometry: new IcosahedronGeometry(0.065, 0).translate(0, 0.065, 0),
    surface: "flower", x, z, solid: false,
  });

  const placement = [0, -4, 4, -8, 8, -12, 12, -16, 16]
    .flatMap(offsetZ => [1, -1].map(side => ({ side, offsetZ, slope: slopeAtSite(context, side, offsetZ) })))
    .sort((a, b) => Number(a.slope > 0.5) - Number(b.slope > 0.5)
      || Number(a.offsetZ < 0) - Number(b.offsetZ < 0) || a.slope - b.slope)
    .find(({ side, offsetZ }) => fits(parts, context, side, offsetZ));
  if (!placement) {
    parts.forEach(part => { part.geometry.dispose(); part.collisionGeometry?.dispose(); });
    throw new RangeError("Milestones needs a dry, clear hillside within the zone radius.");
  }
  const { side, offsetZ } = placement;
  let sculpture = initialSculpture;
  if (side < 0) {
    // Re-orient carved English glyphs so they read left-to-right after X-mirroring onto the opposite bank.
    sculpture = buildDuyPortraitSculpture(context.seed, certificates, -1);
    parts[inkPartIndex]!.geometry.dispose();
    parts[inkPartIndex]!.geometry = sculpture.inkDetails;
    sculpture.weatheredStatue.dispose();
    for (const [idx, piece] of sculpture.futureTabletsAndPieces.entries()) {
      parts[1 + idx]!.geometry.dispose();
      parts[1 + idx]!.geometry = piece.geometry;
    }
  }
  const group = new Group();
  group.name = "milestones-hillside";
  const colliders: ZoneCollider[] = [];
  const batches: Record<Surface, BufferGeometry[]> = { weathered: [], future: [], ink: [], needles: [], flower: [] };
  const surfaces = materials();
  const groundSamples = new Map<number, Map<number, number>>();
  const groundAt = (x: number, z: number) => {
    let row = groundSamples.get(x);
    if (!row) { row = new Map(); groundSamples.set(x, row); }
    let y = row.get(z);
    if (y === undefined) { y = context.heightAt(x, z); row.set(z, y); }
    return y;
  };
  for (const part of parts) {
    const geometry = part.geometry;
    const vertices = geometry.getAttribute("position");
    const collisionBounds = new Box3();
    if (part.collisionGeometry) {
      const reference = part.collisionGeometry.getAttribute("position");
      for (let i = 0; i < reference.count; i++) {
        const localX = part.x + reference.getX(i), localZ = part.z + reference.getZ(i);
        const x = side * localX, z = localZ + offsetZ;
        collisionBounds.expandByPoint(new Vector3(x, reference.getY(i) + groundAt(x, z), z));
      }
      part.collisionGeometry.dispose();
    }
    for (let i = 0; i < vertices.count; i++) {
      const localX = part.x + vertices.getX(i), localZ = part.z + vertices.getZ(i);
      const x = side * localX, z = localZ + offsetZ;
      const ground = groundAt(x, z);
      vertices.setXYZ(i, x, vertices.getY(i) + ground, z);
    }
    if (!geometry.hasAttribute("color")) wash(geometry);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    if (part.solid) {
      const center = (collisionBounds.isEmpty() ? bounds : collisionBounds).getCenter(new Vector3());
      const size = (collisionBounds.isEmpty() ? bounds : collisionBounds).getSize(new Vector3());
      colliders.push({ center, size, yaw: part.yaw });
    }
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flat.deleteAttribute("uv");
    if (side < 0) {
      for (const attribute of Object.values(flat.attributes)) {
        for (let i = 0; i < attribute.count; i += 3) {
          for (let component = 0; component < attribute.itemSize; component++) {
            const a = (i + 1) * attribute.itemSize + component, b = (i + 2) * attribute.itemSize + component;
            [attribute.array[a], attribute.array[b]] = [attribute.array[b]!, attribute.array[a]!];
          }
        }
      }
      flat.computeVertexNormals();
    }
    batches[part.surface].push(flat);
    if (flat !== geometry) geometry.dispose();
  }
  for (const surface of Object.keys(batches) as Surface[]) {
    const geometry = mergeGeometries(batches[surface], false)!;
    batches[surface].forEach(part => part.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, surfaces[surface]);
    mesh.name = `milestones-${surface}`;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  const transformPoint = (p: Vector3): Vector3 => {
    const sx = side * p.x, sz = p.z + offsetZ;
    return new Vector3(sx, p.y + groundAt(sx, sz), sz);
  };
  const transformBox = (box: Box3): Box3 => {
    const out = new Box3();
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const sx = side * x, sz = z + offsetZ;
          out.expandByPoint(new Vector3(sx, y + groundAt(sx, sz), sz));
        }
      }
    }
    return out;
  };
  group.userData.statue = {
    totalHeight: sculpture.metadata.totalHeight,
    certificates: sculpture.metadata.certificates,
    fittedPieces: sculpture.metadata.fittedPieces.map(piece => ({ ...piece, bounds: transformBox(piece.bounds) })),
    plannedPieces: sculpture.metadata.plannedPieces.map(piece => ({ ...piece, bounds: transformBox(piece.bounds) })),
    hollowGaps: sculpture.metadata.hollowGaps.map(gap => ({
      ...gap,
      throughPoint: transformPoint(gap.throughPoint),
      bounds: transformBox(gap.bounds),
    })),
    floatingFragments: sculpture.metadata.floatingFragments.map(fragment => ({
      ...fragment,
      targetPoint: transformPoint(fragment.targetPoint),
      bounds: transformBox(fragment.bounds),
    })),
    portrait: {
      pedestal: transformBox(sculpture.metadata.portrait.pedestal),
      legs: transformBox(sculpture.metadata.portrait.legs),
      shoulders: transformBox(sculpture.metadata.portrait.shoulders),
      torso: transformBox(sculpture.metadata.portrait.torso),
      neck: transformBox(sculpture.metadata.portrait.neck),
      head: transformBox(sculpture.metadata.portrait.head),
      glasses: transformBox(sculpture.metadata.portrait.glasses),
      hair: transformBox(sculpture.metadata.portrait.hair),
    },
    weatheredStatueVertexCount: sculpture.metadata.weatheredStatueVertexCount,
    inscribedStrokeCount: sculpture.metadata.inscribedStrokeCount,
  } satisfies MilestoneStatueMetadata;

  const middle = colliders[0]!.center.clone();
  // Interaction point on the front of the plinth at comfortable eye height (~1.38 m)
  const interactPosition = new Vector3(middle.x, groundAt(middle.x, middle.z) + 1.38, middle.z);

  let disposed = false;
  return {
    zoneId: "milestones", group, colliders,
    interactable: { position: interactPosition, label: { vi: "Cụm đá dấu mốc", en: "Milestone rocks" } },
    update() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      group.traverse(object => {
        if (object instanceof Mesh) object.geometry.dispose();
      });
      Object.values(surfaces).forEach(material => material.dispose());
      group.clear();
    },
  };
};
