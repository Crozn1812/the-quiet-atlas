// B2-209: Lead-only T10 capture. Start the styleframes Vite server before running.
// Usage: node tools/styleframes/t10.mjs <outDir> [baseUrl]
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2 || !args[0].trim()) {
  console.error("Usage: node tools/styleframes/t10.mjs <outDir> [baseUrl]");
  process.exit(1);
}

const outDir = resolve(args[0]);
const files = [];
const errors = [];
const stations = [
  { id: "forest", t: 0.06, label: "Rừng bình minh" },
  { id: "hill", t: 0.55, label: "Đồi giữa" },
  { id: "coast", t: 0.86, label: "Đường ven biển hoàng hôn" },
];
const directions = [
  { yaw: 0, label: "Theo hướng đi" },
  { yaw: 90, label: "Bên phải" },
  { yaw: 180, label: "Quay lại" },
  { yaw: 270, label: "Bên trái" },
];

function recordError(label, error) {
  const message = `${label}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
  errors.push(message);
  console.error(message);
}

let browser;
try {
  const baseUrl = new URL(`${(args[1] ?? "http://127.0.0.1:4190").replace(/\/+$/, "")}/`);
  if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.search || baseUrl.hash) {
    throw new Error("baseUrl must be an HTTP(S) directory URL without query or fragment");
  }
  await mkdir(outDir, { recursive: true });
  const rows = stations.flatMap(station => directions.map(direction => {
    const file = `t10-${station.id}-${direction.yaw}.png`;
    return `| [${file}](./${file}) | ${station.id} — ${station.label} (t=${station.t}) | ${direction.yaw}° — ${direction.label} | | |`;
  }));
  const checklist = [
    "# T10 — Visual consistency",
    "",
    "Duy và một người ngoài chấm độc lập từng ảnh; chỉ ghi đạt khi đủ cả năm tiêu chí:",
    "",
    "- (a) Cùng một thế giới/phong cách với 11 ảnh còn lại.",
    "- (b) Ánh sáng đúng giờ: rừng bình minh, biển hoàng hôn.",
    "- (c) Không lỗi hình: lơ lửng, xuyên, vệt, khối trơn đen.",
    "- (d) Màu theo palette, không lòe loẹt.",
    "- (e) Đọc được chất liệu.",
    "",
    "| Ảnh | Vị trí | Hướng | Duy: đạt/không | Người ngoài: đạt/không |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "Đạt khi ≥ 10/12 ảnh được cả hai người chấm đạt",
    "",
  ].join("\n");
  const checklistFile = join(outDir, "t10-checklist.md");
  await writeFile(checklistFile, checklist, "utf8");
  files.push(checklistFile);

  browser = await chromium.launch({ channel: "msedge" });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  for (const station of stations) for (const direction of directions) {
    const filename = `t10-${station.id}-${direction.yaw}.png`;
    let page;
    try {
      page = await context.newPage();
      page.on("pageerror", error => recordError(`${filename} pageerror`, error));
      const url = new URL("tour.html", baseUrl);
      url.searchParams.set("view", "road");
      url.searchParams.set("t", String(station.t));
      url.searchParams.set("yaw", String(direction.yaw));
      await page.goto(url.href, { waitUntil: "load", timeout: 60_000 });
      await page.waitForFunction(() => window.__frameReady === true, null, { timeout: 60_000 });
      const file = join(outDir, filename);
      await page.screenshot({ path: file, type: "png", fullPage: false });
      files.push(file);
    } catch (error) {
      recordError(filename, error);
    } finally {
      await page?.close();
    }
  }
} catch (error) {
  recordError("T10", error);
} finally {
  try {
    await browser?.close();
  } catch (error) {
    recordError("browser.close", error);
  }
  console.log(`Files written (${files.length}):\n${files.join("\n")}`);
  console.log(`Errors: ${errors.length}`);
  if (errors.length) process.exitCode = 1;
}
