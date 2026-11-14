#!/usr/bin/env node
// node tools/review/final-showcase.mjs <existing-out-dir> <empty-dest-or-checklist-template-dir>
// Uses installed Edge, Playwright and Next's transitive sharp; no downloads or builds.
import { mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { createOutServer } from "../serve-out/index.mjs";
import { captureIngame } from "./ingame-shots.mjs";
import { captureIntro } from "./intro-shots.mjs";
import { captureEnding } from "./ending-shots.mjs";
import { meanLuma, sharp } from "./luma.mjs";

const MAX_BYTES = 30_000_000;
const MAX_VIDEO_BYTES = 8_000_000;
const ZONES = ["first-light", "workshop", "roots", "milestones", "old-trail", "horizon", "quiet-shore", "last-postcard"];
const names = ["Ánh sáng đầu tiên", "Xưởng", "Cội rễ", "Cột mốc", "Lối mòn cũ", "Chân trời", "Bờ yên tĩnh", "Tấm bưu thiếp cuối"];

async function main() {
  const [outArg, destArg, ...extra] = process.argv.slice(2);
  if (!outArg || !destArg || extra.length) throw new Error("Usage: node tools/review/final-showcase.mjs <out-dir> <dest>");
  const outDir = await realpath(path.resolve(outArg));
  await stat(path.join(outDir, "404.html"));
  await stat(path.join(outDir, "vi/index.html"));
  // Resolve symlinks before checking overlap. Refuse stale output instead of silently mixing builds.
  await mkdir(path.resolve(destArg), { recursive: true });
  const dest = await realpath(path.resolve(destArg));
  const contains = (parent, child) => child === parent || child.startsWith(parent + path.sep);
  if (contains(outDir, dest) || contains(dest, outDir)) throw new Error("Build and destination must not overlap");
  const entries = await readdir(dest);
  if (entries.some(name => name !== "checklist.md")) throw new Error("Destination must be empty (checklist.md template is allowed); choose a new directory");
  const template = await readFile(new URL("../../docs/showcase/39-final/checklist.md", import.meta.url), "utf8");
  const started = Date.now();
  const metrics = {
    status: "running", generatedAt: new Date().toISOString(), build: outDir,
    viewport: { width: 1600, height: 900 }, webpQuality: 82,
    assetRequests: 0, assetBytes: 0, consoleErrors: [], pageErrors: [], failedRequests: [], cancelledRequests: [],
    sessions: [], zones: {}, captures: [], cinematics: {},
  };
  const pending = new Set();
  const flush = async () => { while (pending.size) await Promise.all([...pending]); };
  const track = async (page, label) => {
    const session = { label, assetRequests: 0, assetBytes: 0 };
    metrics.sessions.push(session);
    page.setDefaultTimeout(90_000);
    page.on("console", message => {
      if (message.type() === "error") metrics.consoleErrors.push({ session: label, message: message.text(), location: message.location() });
    });
    page.on("pageerror", error => metrics.pageErrors.push({ session: label, message: error.message }));
    page.on("requestfailed", request => {
      const error = request.failure()?.errorText;
      // Zone transitions cancel superseded environment fetches through AbortController.
      // Retain these in the report without treating a deliberate cancellation as a broken asset.
      const bucket = error === "net::ERR_ABORTED" ? metrics.cancelledRequests : metrics.failedRequests;
      bucket.push({ session: label, url: request.url(), error });
    });
    page.on("request", request => {
      if (request.resourceType() === "document" || !request.url().startsWith(baseUrl)) return;
      session.assetRequests++;
      metrics.assetRequests++;
    });
    page.on("requestfinished", request => {
      if (request.resourceType() === "document" || !request.url().startsWith(baseUrl)) return;
      const task = (async () => {
        const sizes = await request.sizes();
        session.assetBytes += sizes.responseBodySize;
        metrics.assetBytes += sizes.responseBodySize;
      })().catch(error => metrics.failedRequests.push({ session: label, url: request.url(), error: error.message }));
      pending.add(task);
      void task.finally(() => pending.delete(task));
    });
  };
  const save = async (page, file, details = {}) => {
    const world = page.locator('.world-viewport[data-world-intro]');
    if (details.quality && await world.getAttribute("data-world-quality") !== details.quality) throw new Error(`${file}: requested quality is not active`);
    const source = await page.screenshot();
    const image = await sharp(source).resize(1600, 900).webp({ quality: 82 }).toBuffer();
    await writeFile(path.join(dest, file), image);
    const capture = { file, bytes: image.length, luma: Number((await meanLuma(image)).toFixed(4)), ...details };
    metrics.captures.push(capture);
    console.log(`capture: ${file} (${image.length} bytes, luma ${capture.luma})`);
    return capture;
  };
  const turn = async (page, key, duration) => {
    await page.keyboard.down(key);
    try { await page.waitForTimeout(duration); } finally { await page.keyboard.up(key); }
    await page.waitForTimeout(600);
  };
  const sheet = async quality => {
    const tiles = await Promise.all(ZONES.map(async (zone, index) => ({
      input: await sharp(path.join(dest, `${quality}-${zone}-01.webp`)).resize(800, 450).toBuffer(),
      left: index % 2 * 800, top: Math.floor(index / 2) * 450,
    })));
    await sharp({ create: { width: 1600, height: 1800, channels: 3, background: "#171d21" } })
      .composite(tiles).webp({ quality: 82 }).toFile(path.join(dest, `sheet-${quality}.webp`));
  };
  const server = createOutServer(outDir);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log(`showcase: ${baseUrl} -> ${dest}`);
  try {
    for (const quality of ["high", "low"]) {
      let before;
      await captureIngame({ outDir: dest, baseUrl, locale: "en", showcase: {
        quality,
        onPage: page => track(page, quality),
        onBeforeZone: async () => {
          await flush();
          before = { requests: metrics.assetRequests, bytes: metrics.assetBytes };
        },
        onZone: async (page, world, zone) => {
          const captures = [await save(page, `${quality}-${zone}-01.webp`, { quality, zone, angle: "standard" })];
          if (quality === "high") {
            await turn(page, "ArrowLeft", 420);
            captures.push(await save(page, `${quality}-${zone}-02.webp`, { quality, zone, angle: "left" }));
            await turn(page, "ArrowRight", 840);
            captures.push(await save(page, `${quality}-${zone}-03.webp`, { quality, zone, angle: "right" }));
            // Restore the original heading so the next zone retains ingame-shots' standard composition.
            await turn(page, "ArrowLeft", 420);
          }
          await flush();
          metrics.zones[zone] ??= { name: names[ZONES.indexOf(zone)] };
          metrics.zones[zone][quality] = {
            luma: captures.map(capture => capture.luma),
            assetRequests: metrics.assetRequests - before.requests,
            assetBytes: metrics.assetBytes - before.bytes,
          };
        },
        onComplete: quality === "high" ? async (page, world) => {
          await world.evaluate(el => el.__tqaJourney.goTo("first-light"));
          await world.locator("canvas").focus();
          await page.mouse.move(800, 450);
          await page.mouse.wheel(0, -2000);
          await page.waitForTimeout(2000);
          // Keep the gameplay camera: tqa:postcard deliberately hides the character.
          for (let i = 1; i <= 3; i++) {
            await save(page, `character-0${i}.webp`, { quality: "high", subject: "character", angle: i });
            if (i < 3) await turn(page, "ArrowLeft", 700);
          }
          await world.evaluate(el => el.__tqaJourney.nearVehicle());
          await page.waitForTimeout(2000);
          for (let i = 1; i <= 3; i++) {
            await save(page, `vehicle-0${i}.webp`, { quality: "high", subject: "vehicle", angle: i });
            if (i < 3) await turn(page, "ArrowLeft", 700);
          }
        } : undefined,
      } });
    }
    for (const [label, run] of [["intro", captureIntro], ["ending", captureEnding]]) {
      let recordingError;
      let recordingStarted;
      const frames = [];
      await run({ outDir: dest, baseUrl, showcase: {
        onPage: page => track(page, label),
        onReady: async (page, world) => {
          // Deferred world dressing only finishes AFTER the intro. Waiting for
          // data-world-build=done here would miss the entire opening flight.
          await world.locator("canvas").waitFor({ state: "visible" });
          if (label === "intro" && await world.getAttribute("data-world-intro") !== "playing") throw new Error("Intro was missed before recording started");
          await world.evaluate(el => el.dispatchEvent(new CustomEvent("tqa:set-quality", { detail: { quality: "high" } })));
          try {
            await page.evaluate(() => {
              const canvas = document.querySelector(".world-viewport canvas");
              const mimeType = ["video/webm;codecs=vp8", "video/webm"].find(type => MediaRecorder.isTypeSupported(type));
              if (!mimeType || !canvas?.captureStream) throw new Error("Canvas WebM recording unavailable");
              const stream = canvas.captureStream(15);
              const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_200_000 });
              const chunks = [];
              const state = { recorder, stream, chunks, error: null };
              recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
              recorder.onerror = event => { state.error = event.error?.message ?? "MediaRecorder error"; };
              window.__showcaseRecording = state;
              recorder.start(1000);
            });
            recordingStarted = Date.now();
          } catch (error) { recordingError = error.message; }
        },
        capture: async (page, file, atMs) => {
          frames.push(await save(page, `${file}.webp`, { quality: "high", cinematic: label, atMs }));
        },
        onComplete: async page => {
          try {
            if (recordingError) throw new Error(recordingError);
            const durationSeconds = (Date.now() - recordingStarted) / 1000;
            if (durationSeconds < 30 || durationSeconds > 60) throw new Error(`Recording duration ${durationSeconds}s outside 30–60s`);
            const encoded = await page.evaluate(async () => {
              const { recorder, chunks, stream, error } = window.__showcaseRecording;
              try {
                if (error) throw new Error(error);
                await new Promise((resolve, reject) => {
                  const timeout = setTimeout(() => reject(new Error("MediaRecorder stop timed out")), 5000);
                  recorder.onstop = () => { clearTimeout(timeout); resolve(); };
                  recorder.onerror = () => { clearTimeout(timeout); reject(new Error("MediaRecorder stop failed")); };
                  recorder.stop();
                });
                const blob = new Blob(chunks, { type: "video/webm" });
                if (blob.size === 0 || blob.size > 8_000_000) throw new Error(`WebM size ${blob.size} outside budget`);
                return await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result.split(",")[1]);
                  reader.onerror = reject;
                  reader.readAsDataURL(blob);
                });
              } finally { stream.getTracks().forEach(track => track.stop()); }
            });
            const video = Buffer.from(encoded, "base64");
            if (video.length > MAX_VIDEO_BYTES) throw new Error("Video exceeds 8 MB");
            await writeFile(path.join(dest, `${label}.webm`), video);
            metrics.cinematics[label] = { mode: "video", file: `${label}.webm`, bytes: video.length, durationSeconds, frames: frames.map(frame => frame.file), audio: false };
          } catch (error) {
            metrics.cinematics[label] = { mode: "frames", reason: error.message, frames: frames.map(frame => frame.file) };
            console.log(`${label}: fallback to 12 frames: ${error.message}`);
          }
        },
      } });
    }
    await flush();
    await sheet("high");
    await sheet("low");
    if (metrics.pageErrors.length || metrics.consoleErrors.length || metrics.failedRequests.length) throw new Error("Browser errors detected; inspect metrics.json");
    metrics.status = "pass";
  } catch (error) {
    metrics.status = "fail";
    metrics.error = error.message;
    throw error;
  } finally {
    await flush();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    metrics.elapsedSeconds = Number(((Date.now() - started) / 1000).toFixed(2));
    const files = await readdir(dest);
    const sizes = await Promise.all(files.filter(file => !["metrics.json", "checklist.md"].includes(file)).map(async file => (await stat(path.join(dest, file))).size));
    metrics.totalBytes = sizes.reduce((sum, bytes) => sum + bytes, 0);
    let checklist = template.replaceAll("{{generatedAt}}", metrics.generatedAt).replaceAll("{{elapsedSeconds}}", String(metrics.elapsedSeconds))
      .replaceAll("{{assetRequests}}", String(metrics.assetRequests)).replaceAll("{{assetBytes}}", String(metrics.assetBytes))
      .replaceAll("{{cancelledRequests}}", String(metrics.cancelledRequests.length))
      .replaceAll("{{consoleErrors}}", String(metrics.consoleErrors.length + metrics.pageErrors.length));
    for (const zone of ZONES) {
      for (const quality of ["high", "low"]) checklist = checklist.replaceAll(`{{${zone}.${quality}}}`, String(metrics.zones[zone]?.[quality]?.luma[0] ?? "—"));
    }
    for (const label of ["intro", "ending"]) checklist = checklist.replaceAll(`{{${label}}}`, metrics.cinematics[label]?.mode === "video" ? `${metrics.cinematics[label].durationSeconds.toFixed(1)} s; ${metrics.cinematics[label].bytes} byte` : `${metrics.cinematics[label]?.frames.length ?? 0} khung`);
    // Include both text artifacts in the limit; iterate to account for totalBytes' own digits.
    for (let i = 0; i < 4; i++) {
      const filled = checklist.replaceAll("{{totalBytes}}", String(metrics.totalBytes));
      const json = JSON.stringify(metrics, null, 2) + "\n";
      metrics.totalBytes = sizes.reduce((sum, bytes) => sum + bytes, 0) + Buffer.byteLength(filled) + Buffer.byteLength(json);
    }
    if (metrics.totalBytes > MAX_BYTES) { metrics.status = "fail"; metrics.error = "Showcase exceeds 30 MB"; }
    await writeFile(path.join(dest, "checklist.md"), checklist.replaceAll("{{totalBytes}}", String(metrics.totalBytes)));
    await writeFile(path.join(dest, "metrics.json"), JSON.stringify(metrics, null, 2) + "\n");
    console.log(`SHOWCASE ${metrics.status.toUpperCase()}: ${metrics.captures.length} images; ${metrics.elapsedSeconds}s; ${metrics.totalBytes} bytes / ${MAX_BYTES}; assets ${metrics.assetRequests} requests / ${metrics.assetBytes} bytes; console ${metrics.consoleErrors.length}; page ${metrics.pageErrors.length}`);
    if (metrics.status !== "pass") process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
