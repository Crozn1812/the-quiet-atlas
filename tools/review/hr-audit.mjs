// HR-AUDIT: headed Edge visual evidence only; never modifies the world.
// Serve a verified build on slot C's 4203 first. --plan and --probe never write artifacts.
import { mkdir, access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chromium } from "@playwright/test";
import { sharp } from "./luma.mjs";
import { auditLayout } from "./hr-audit-layout.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const supplement = process.argv[2] === "--supplement";
const matchHorizon = process.argv[2] === "--horizon-match";
const dest = path.join(root, "test-results/hr-audit", ...(supplement ? ["supplement"] : matchHorizon ? ["horizon-match"] : []));
const base = "http://127.0.0.1:4203";
const mode = supplement || matchHorizon ? "--capture" : process.argv[2] ?? "--capture";
if (!["--plan", "--probe", "--capture"].includes(mode)) throw new Error("Use --plan, --probe, --capture, --supplement or --horizon-match");
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, s) => a.map(v => v * s);
const length = a => Math.hypot(...a);
const unit = a => scale(a, 1 / length(a));
const layout = await auditLayout();
const shots = [];
const pose = (id, zone, subject, position, target, angle, extra = {}) => shots.push({ id, zone, subject, position, target, angle, quality: "high", ...extra });
for (const z of layout.zones) {
  const { id, anchor: a, target: t, forward: f } = z;
  const toward = unit([t[0] - a[0], 0, t[2] - a[2]]);
  pose(`${id}-overview`, id, z.label, add(add(a, scale(f, -10)), [0, 3.5, 0]), t, "toàn cảnh");
  pose(`${id}-close`, id, z.label, add(add(t, scale(toward, -3)), [0, .4, 0]), t, "gần 3 m");
  pose(`${id}-up`, id, "Tán cây / vật chính / bầu trời", add(a, [0, 1.65, 0]), add(add(a, scale(f, 4)), [0, 16, 0]), "nhìn lên");
  pose(`${id}-path`, id, z.label, add(add(a, scale(f, -4)), [0, 1.65, 0]), t, "từ đường");
}
pose("stream-wide", "roots", "Suối", add(layout.river, [6, 2.3, 8]), layout.river, "toàn cảnh");
pose("stream-close", "roots", "Mặt nước / đáy suối", add(layout.river, [1, 1.3, 2]), layout.river, "gần");
pose("sea-wide", "quiet-shore", "Biển và sóng", add(layout.sea, [16, 3, 17]), add(layout.sea, [0, 0, -45]), "toàn cảnh");
pose("sea-surf", "last-postcard", "Sóng sát bờ", add(layout.sea, [2, 1.2, 3]), add(layout.sea, [0, 0, -5]), "gần");
pose("road-surface", "last-postcard", "Đường nhựa", add(layout.road, [0, 1.6, 3]), add(layout.road, [0, 0, -6]), "từ đường");
pose("road-railing", "last-postcard", "Lan can và cọc đường", add(layout.road, [-2, 1.7, 3]), add(layout.road, [3, .8, -4]), "chéo");
layout.bridges.forEach((p, i) => pose(`bridge-${i + 1}`, i ? "horizon" : "old-trail", `Cầu ${i + 1}`, add(p, [4, 2.7, 6]), p, "chéo"));
const first = layout.zones.find(z => z.id === "first-light");
pose("signpost", "first-light", "Biển chỉ đường tại điểm đến", add(first.anchor, [2, 1.8, 3]), add(first.anchor, [0, 1.2, 0]), "gần");
const milestones = layout.zones.find(z => z.id === "milestones");
pose("certificates", "milestones", "Bảng chứng chỉ / tượng", add(milestones.target, [2.7, .5, 1]), add(milestones.target, [0, .6, 0]), "gần");
for (const name of ["first-light", "roots"]) {
  const school = layout.fish.find(s => s.name === name);
  pose(`fish-${name}`, name, "Cá dưới nước", add(school.center, [0, 1.9, 1.6]), add(school.center, [0, -school.submergence, 0]), "từ bờ");
}
pose("birds", "first-light", "Chim đang bay", add(first.anchor, [0, 13, 2]), add(first.anchor, [-8, 21, -2]), "gần đàn chim; cần kiểm tra khung hình");
// This extra angle matches the direction in Lead's Horizon report.
const horizon = layout.zones.find(z => z.id === "horizon");
pose("horizon-left-holes", "horizon", "Sườn đồi trái nhìn về suối", add(horizon.anchor, [0, 1.7, 0]), [-160, 22, horizon.anchor[2] - 70], "kiểm tra lỗ thủng");
for (let i = 0; i < 3; i++) pose(`character-${i + 1}`, "first-light", "Nhân vật", null, null, "camera gameplay", { gameplay: "character", turnMs: i ? 700 : 0 });
pose("vehicle-parked", "first-light", "Xe dựng", null, null, "camera gameplay", { gameplay: "parked" });
pose("vehicle-riding", "first-light", "Nhân vật và xe khi lái", null, null, "camera gameplay đang chạy", { gameplay: "riding" });
pose("low-first-light", "first-light", "Đối chiếu Low", shots[0].position, shots[0].target, "toàn cảnh cùng pose High", { quality: "low" });
// Add evidence for framing gaps found in the first pass, without replacing it.
if (supplement) {
  shots.length = 0;
  pose("horizon-gameplay", "horizon", "Sườn trái nhìn về suối — camera gameplay", null, null, "hướng đến mặc định", { gameplay: "view" });
  const t = milestones.target;
  const toward = unit([t[0] - milestones.anchor[0], 0, t[2] - milestones.anchor[2]]);
  pose("certificates-chest", "milestones", "Chứng chỉ trên thân tượng", add(add(t, scale(toward, -3)), [0, 5.3, 0]), add(t, [0, 5, 0]), "gần 3 m, ngang thân");
  // The perch is also visible in first-light-close. Fixed world pose preserves
  // evidence if the bird takes flight; visual review still has to confirm it.
  pose("bird-perch", "first-light", "Chim đậu trên cành", [7.816, 10.207, 15.809], [8.752, 9.977, 14.571], "gần cành đậu");
  pose("bird-perch-2", "first-light", "Chim đậu thứ hai", [21.3, 10.65, 4.1], [22.806, 10.384, 2.942], "gần cành đậu");
  pose("surf-shore", "last-postcard", "Bọt sóng tại giao bờ thật", add(layout.shore, [2, 1.7, 3]), add(layout.shore, [0, 0, -2]), "gần bờ 3.6 m");
  const school = layout.fish.find(s => s.name === "first-light");
  pose("fish-first-light-wide", "first-light", "Toàn hành lang cá First Light", add(school.center, [0, 9, .1]), add(school.center, [0, -school.submergence, 0]), "nhìn xuống bao toàn đàn");
  pose("character-close", "first-light", "Nhân vật — camera gameplay gần", null, null, "zoom camera gameplay", { gameplay: "character", zoom: true });
  pose("vehicle-detail", "first-light", "Xe dựng — camera gameplay gần", null, null, "gần xe", { gameplay: "parked", zoom: true });
  pose("vehicle-riding-close", "first-light", "Nhân vật và xe đang chạy — gần", null, null, "gameplay đang chạy", { gameplay: "riding", zoom: true });
}
if (matchHorizon) {
  shots.length = 0;
  // Exact Horizon horizon pose from Lead's return1/before/poses.json, followed
  // by two parallel translations. No world objects or shaders are changed.
  const p = [32.404483795166016, 5.069798707962036, -408.219970703125];
  const t = [32.404483795166016, 5.069798707962036, -441.219970703125];
  for (const [id, dx] of [["horizon-lead-match", 0], ["horizon-lead-left", -.6], ["horizon-lead-right", .6]]) {
    pose(id, "horizon", "Sườn trái — cùng pose ảnh Lead", add(p, [dx, 0, 0]), add(t, [dx, 0, 0]), `pose Lead dịch x=${dx} m`);
  }
}
if (mode === "--plan") {
  console.log(JSON.stringify({ viewport: [1600, 900], captures: shots.length, layout, shots }, null, 2));
  process.exit(0);
}

const manifest = { status: "running", head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  generatedAt: new Date().toISOString(), base, viewport: [1600, 900], captures: [], errors: [], failedRequests: [],
  measurement: "3 s rAF; WebGL calls/triangles include all passes; CDP main-thread TaskDuration. No ABBA or isolated-machine benchmark.",
  visualReview: "PENDING: inspect every original image; an image's existence is not visual approval." };
if (mode === "--capture") {
  await mkdir(dest, { recursive: true });
  await access(dest, constants.W_OK);
  // Fail before launching Edge if evidence cannot be persisted. Never overwrite prior captures.
  await writeFile(path.join(dest, "capture-manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
}
let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: false });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(120_000);
  await page.bringToFront();
  const gpu = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return { webgl2: !!gl, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, userAgent: navigator.userAgent };
  });
  console.log(JSON.stringify({ gpu }));
  if (!gpu.webgl2 || !gpu.renderer || /swiftshader|llvmpipe|software|basic render/i.test(gpu.renderer)) throw new Error("Hardware GPU not verified; refusing art/FPS evidence");
  manifest.gpu = gpu;
  if (mode === "--probe") { manifest.status = "probe-only"; }
  else {
    await page.addInitScript(() => {
      window.__tqaJourney = true; window.__tqaSkipIntro = true;
      const counts = { calls: 0, triangles: 0 };
      for (const [method, indexed, instanced] of [["drawArrays", false, false], ["drawElements", true, false], ["drawArraysInstanced", false, true], ["drawElementsInstanced", true, true]]) {
        const original = WebGL2RenderingContext.prototype[method];
        WebGL2RenderingContext.prototype[method] = function (...args) {
          counts.calls++;
          const vertices = args[indexed ? 1 : 2], instances = instanced ? args[indexed ? 4 : 3] : 1;
          counts.triangles += (args[0] === 4 ? vertices / 3 : args[0] === 5 || args[0] === 6 ? Math.max(0, vertices - 2) : 0) * instances;
          return original.apply(this, args);
        };
      }
      window.__hrAudit = { counts };
    });
    page.on("pageerror", e => manifest.errors.push(e.message));
    page.on("requestfailed", r => { if (r.failure()?.errorText !== "net::ERR_ABORTED") manifest.failedRequests.push({ url: r.url(), error: r.failure() }); });
    let responseBytes = 0;
    const pending = new Set();
    page.on("requestfinished", r => {
      if (!r.url().startsWith(base)) return;
      const task = r.sizes().then(s => { responseBytes += s.responseBodySize; }).catch(e => manifest.errors.push(e.message));
      pending.add(task); void task.finally(() => pending.delete(task));
    });
    await page.goto(`${base}/en/`);
    const entered = Date.now();
    await page.getByRole("button", { name: "Enter World", exact: true }).click();
    await page.locator('.world-viewport[data-world-intro="done"]').waitFor({ state: "visible" });
    manifest.enterToPlayableIntroDoneMs = Date.now() - entered;
    const world = page.locator('.world-viewport[data-world-build="done"][data-world-intro="done"]');
    await world.waitFor({ state: "visible" });
    manifest.enterToBuildDoneMs = Date.now() - entered;
    manifest.enterToBuildDoneBytes = responseBytes;
    if (await world.getAttribute("data-world-postcard") !== "ready") throw new Error("QA postcard hook missing");
    const canvas = world.locator("canvas");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const cpu = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
    const quality = async q => {
      await canvas.focus(); await page.keyboard.press("Escape");
      await page.locator(`.world-menu dialog input[value="${q}"]`).check();
      await page.keyboard.press("Escape"); await canvas.focus();
    };
    await quality("high");
    let activeZone, activeQuality = "high";
    for (const shot of shots) {
      if (shot.zone !== activeZone) {
        await world.evaluate((el, id) => el.__tqaJourney.goTo(id), shot.zone);
        activeZone = shot.zone;
      }
      if (shot.quality !== activeQuality) { await quality(shot.quality); activeQuality = shot.quality; }
      await world.evaluate((el, s) => el.dispatchEvent(new CustomEvent("tqa:postcard", { detail: s.position ? { position: s.position, target: s.target } : null })), shot);
      await canvas.focus();
      if (shot.gameplay === "character" && shot.turnMs) {
        await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(shot.turnMs); await page.keyboard.up("ArrowLeft");
      }
      if (shot.gameplay === "parked") await world.evaluate(el => el.__tqaJourney.nearVehicle());
      if (shot.zoom) {
        await page.mouse.move(800, 450); await page.mouse.wheel(0, -2000);
      }
      if (shot.gameplay === "riding") {
        await page.keyboard.press("e");
        await page.waitForFunction(() => ["manual", "cruise"].includes(document.querySelector("[data-world-build]").dataset.worldVehicle));
        await page.keyboard.down("w");
      }
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(3500);
      if (await world.getAttribute("data-world-quality") !== shot.quality || await world.getAttribute("data-world-paused") !== "false") throw new Error(`${shot.id}: quality or pause state invalid`);
      const before = await cpu();
      const frames = await page.evaluate(() => new Promise(resolve => {
        const samples = [], start = performance.now(); let last = start;
        const tick = now => {
          const { counts } = window.__hrAudit;
          samples.push({ ms: now - last, calls: counts.calls, triangles: counts.triangles });
          counts.calls = counts.triangles = 0; last = now;
          if (now - start < 3000) requestAnimationFrame(tick); else resolve(samples.slice(1));
        };
        window.__hrAudit.counts.calls = window.__hrAudit.counts.triangles = 0;
        requestAnimationFrame(tick);
      }));
      const after = await cpu();
      const seconds = frames.reduce((n, f) => n + f.ms, 0) / 1000;
      const rendered = frames.filter(f => f.calls > 0);
      const ms = frames.map(f => f.ms).sort((a, b) => a - b);
      const actualPlayer = await world.evaluate(el => el.__tqaJourney.position());
      const gameplayCamera = shot.position ? null : await world.evaluate(el => ({ yaw: el.__tqaJourney.cameraYaw(), distance: el.__tqaJourney.cameraDistance() }));
      const clean = await page.addStyleTag({ content: ".world-viewport > :not(canvas), .world-hud { visibility: hidden !important; }" });
      const bytes = await sharp(await page.screenshot()).webp({ quality: 94 }).toBuffer();
      await clean.evaluate(el => el.remove());
      const file = `${shot.id}.webp`;
      await writeFile(path.join(dest, file), bytes, { flag: "wx" });
      await page.keyboard.up("w");
      const sample = { ...shot, file, actualPlayer, gameplayCamera, seconds, sampleFrames: frames.length, fps: frames.length / seconds,
        renderedFps: rendered.length / seconds, p95Ms: ms[Math.min(ms.length - 1, Math.floor(ms.length * .95))],
        drawCallsAllPasses: rendered.reduce((n, f) => n + f.calls, 0) / Math.max(1, rendered.length),
        trianglesAllPasses: rendered.reduce((n, f) => n + f.triangles, 0) / Math.max(1, rendered.length),
        cpuTaskMsPerSecond: (after.TaskDuration - before.TaskDuration) * 1000 / (after.Timestamp - before.Timestamp),
        responseBytes, screenshotBytes: bytes.length, visualReview: "PENDING" };
      manifest.captures.push(sample);
      await writeFile(path.join(dest, "capture-manifest.json"), JSON.stringify(manifest, null, 2));
      console.log(`${shot.id}: ${sample.fps.toFixed(1)} FPS; review PENDING`);
      if (shot.gameplay === "riding") {
        await page.keyboard.down("s"); await page.waitForTimeout(5000); await page.keyboard.up("s");
        await page.keyboard.press("e"); await page.waitForTimeout(2000);
      }
    }
    await Promise.all([...pending]);
    manifest.responseBytes = responseBytes;
    manifest.layout = layout;
    manifest.status = manifest.errors.length || manifest.failedRequests.length ? "capture-errors" : "captured-review-pending";
  }
} catch (error) {
  manifest.status = "blocked"; manifest.error = error.message; process.exitCode = 1;
  console.error(error.message);
} finally {
  await browser?.close();
  if (mode === "--capture") {
    await writeFile(path.join(dest, "capture-manifest.json"), JSON.stringify(manifest, null, 2));
    const esc = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
    const cards = manifest.captures.map(s => `<article id="${s.id}"><h2>${esc(s.id)} · ${esc(s.subject)}</h2><a href="${s.file}"><img loading="lazy" src="${s.file}" width="800" height="450" alt="${esc(s.subject)}"></a><p>${s.quality} · ${s.fps.toFixed(1)} FPS · ${esc(s.angle)} · REVIEW PENDING</p><pre>${esc(JSON.stringify({ camera: s.position, target: s.target, player: s.actualPlayer }, null, 2))}</pre></article>`).join("\n");
    await writeFile(path.join(dest, "index.html"), `<!doctype html><html lang="vi"><meta charset="utf-8"><title>HR-AUDIT</title><style>body{background:#17201c;color:#eee;font:16px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(500px,1fr));gap:20px}img{width:100%;height:auto}article{background:#24342b;padding:16px}a{color:#bdebd4}pre{white-space:pre-wrap}</style><h1>HR-AUDIT · ${esc(manifest.status)}</h1><p>HEAD ${esc(manifest.head)} · Edge GPU · 1600×900 · ${manifest.captures.length} ảnh. Mọi ảnh cần review trực tiếp.</p><a href="capture-manifest.json">Số đo và camera JSON</a><main>${cards}</main></html>`);
    // Preserve raw per-angle data separately from the human findings report.
    const rows = manifest.captures.map(s => `| [${s.id}](${s.file}) | ${s.quality} | ${s.fps.toFixed(1)} | ${s.p95Ms.toFixed(1)} | ${s.trianglesAllPasses.toFixed(0)} | ${s.drawCallsAllPasses.toFixed(1)} | ${s.cpuTaskMsPerSecond.toFixed(1)} |`).join("\n");
    await writeFile(path.join(dest, "measurements.md"), `# HR-AUDIT — số đo thô\n\n${manifest.measurement}\n\n| Ảnh | Quality | FPS | p95 ms | Tam giác mọi pass | Draw mọi pass | CPU task ms/s |\n|---|---|---:|---:|---:|---:|---:|\n${rows}\n`);
    console.log(`HR-AUDIT ${manifest.status}: ${manifest.captures.length}/${shots.length} images`);
  }
}
