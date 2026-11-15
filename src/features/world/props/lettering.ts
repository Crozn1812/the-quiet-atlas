import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from "three";
import { PALETTE } from "../art/palette";

export function createLettering(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void, transparent = true, resolution: readonly [number, number] = [512, 256]) {
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = resolution[0];
  canvas.height = resolution[1];
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return undefined;
  paint(ctx);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(new PlaneGeometry(width, height),
    new MeshBasicMaterial({ map, transparent, alphaTest: transparent ? 0.15 : 0, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  mesh.raycast = () => {};
  return { mesh, dispose() { mesh.geometry.dispose(); mesh.material.dispose(); map.dispose(); } };
}

/** Hand-painted trail lettering: the same words, with paint worn away along the grain. */
export function createSignLabel(label: string) {
  const lettering = createLettering(0.72, 0.25, ctx => {
    ctx.fillStyle = "#f3e7c6";
    ctx.font = "bold 98px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 256, 128, 492);
    let seed = 2166136261;
    for (const character of label) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
    const random = () => ((seed = Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9 >>> 0) >>> 0) / 4294967296;
    ctx.globalCompositeOperation = "destination-out";
    // Flakes, then long scratches following the board's horizontal grain. Strokes stay legible.
    for (let i = 0; i < 420; i++) {
      const size = 1.5 + random() * random() * 7;
      ctx.fillRect(random() * 512, 60 + random() * 136, size * (1 + random() * 2), size * 0.6);
    }
    for (let i = 0; i < 26; i++) ctx.fillRect(random() * 470, 66 + random() * 124, 24 + random() * 110, 0.8 + random() * 1.6);
    ctx.globalCompositeOperation = "source-over";
  });
  if (lettering) lettering.mesh.userData.signLabel = true;
  return lettering;
}

export function createSkillsBoard() {
  return createLettering(3.2, 4, ctx => {
    ctx.fillStyle = PALETTE.paper;
    ctx.fillRect(0, 0, 800, 1000);
    ctx.strokeStyle = PALETTE.forestLight;
    ctx.lineWidth = 5;
    // A single branching stem keeps the five groups legible from the approach.
    ctx.beginPath(); ctx.moveTo(45, 85); ctx.lineTo(45, 865); ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const node = (y: number, title: string, subtitle?: string) => {
      ctx.beginPath(); ctx.moveTo(45, y); ctx.lineTo(95, y); ctx.stroke();
      ctx.fillStyle = PALETTE.mist;
      ctx.fillRect(95, y - (subtitle ? 112 : 65), 680, subtitle ? 224 : 130);
      ctx.fillStyle = PALETTE.ink;
      ctx.font = "bold 108px sans-serif";
      ctx.fillText(title, 435, y - (subtitle ? 55 : 0), 650);
      if (subtitle) ctx.fillText(subtitle, 435, y + 55, 650);
    };
    ctx.fillStyle = PALETTE.ink;
    ctx.font = "bold 68px sans-serif";
    ctx.fillText("Skills", 435, 60);
    node(190, "AWS");
    node(355, "Azure");
    node(520, "Languages");
    node(685, "Tools");
    node(865, "Network and", "Systems");
  }, false, [800, 1000]);
}
