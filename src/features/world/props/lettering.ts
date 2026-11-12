import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from "three";

export function createLettering(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void, transparent = true) {
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
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

export function createSignLabel(label: string) {
  return createLettering(0.72, 0.25, ctx => {
    ctx.fillStyle = "#fff2d3";
    ctx.font = "bold 98px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 256, 128, 492);
  });
}

export function createSkillsBoard() {
  return createLettering(0.90, 0.90, ctx => {
    ctx.fillStyle = "#f5f2ea";
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = "#5e8c6a";
    ctx.lineWidth = 3;
    const branches = [[115, 48], [396, 48], [115, 204], [396, 204]] as const;
    for (const [x, y] of branches) {
      ctx.beginPath(); ctx.moveTo(256, 128); ctx.lineTo(x, y); ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const node = (x: number, y: number, title: string, details: string) => {
      ctx.fillStyle = "#e0e9dc";
      ctx.fillRect(x - 105, y - 27, 210, 54);
      ctx.fillStyle = "#203e35";
      ctx.font = "bold 27px sans-serif";
      ctx.fillText(title, x, y - 9);
      ctx.font = "21px sans-serif";
      ctx.fillText(details, x, y + 13, 196);
    };
    node(115, 48, "AWS", "EKS · S3 · Lambda");
    node(396, 48, "Azure", "APIM · Functions · Foundry");
    node(115, 204, "Delivery", "Terraform · Jenkins · Argo CD");
    node(396, 204, "Data & RAG", "Python · Redis · pgvector");
    node(256, 128, "Project skills", "Cloud · DevOps · Data");
  }, false);
}
