// L3-004 — cold-cache load budget trace (spec §8 rows 1–3 + time to playable, §13 Q18, T08 network part, ADR 0007).
// For each of RUNS cold loads (fresh browser process, fresh context, HTTP cache disabled, CDP network emulation
// 10 Mbps down / 10 Mbps up / RTT 100 ms):
//   1. Welcome /en/ and Quick /en/quick/: compressed bytes received (`Network.loadingFinished.encodedDataLength`)
//      for every request of the initial window; JS subtotal; CV (.pdf) excluded.
//   2. 0 requests for GLB/glTF/KTX2/Basis/WASM, 3D MIME types or world/3D JS chunks before Enter World.
//   3. Click Enter World → "player controllable": compressed bytes of every request started in that window,
//      and elapsed time.
// "Player controllable" (definition used for the gate): the world container carries
//   data-world-chunk="__TQA_WORLD_CHUNK__", its <canvas> has received at least one WebGL draw call
//   (drawArrays/drawElements/…Instanced/drawRangeElements), and the next animation frame has started
//   (i.e. that frame was handed to the compositor). Timestamp = start of that next frame.
// Gates are evaluated per run and on the worst run (tools/load-budget). Results → test-results/load-budget/.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, expect, test, type Browser, type CDPSession, type Page } from "@playwright/test";
import {
  NETWORK,
  WORLD_MARKER,
  WORLD_SIGNATURES,
  evaluateInitialPage,
  evaluateWorld,
  fmtBytes,
  formatMarkdown,
  worstOf,
  type RecordedRequest,
  type RunResult,
  type Summary,
} from "../../tools/load-budget/index.mjs";

const RUNS = Number(process.env.PERF_RUNS ?? 3);
const VIEWPORT = { width: 1366, height: 800 };
const DPR = 1;
const OUT_DIR = path.resolve(process.cwd(), "test-results", "load-budget");
const isCI = Boolean(process.env.CI);
const CHANNEL = process.env.PLAYWRIGHT_CHANNEL || (isCI ? undefined : "msedge");
// Local Edge uses the real GPU; CI runners have none → SwiftShader (software WebGL, recorded in the report).
const SWIFTSHADER = isCI || Boolean(process.env.PERF_SWIFTSHADER);
const LAUNCH_ARGS = SWIFTSHADER ? ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] : [];
// ADR 0007 §4 "mô phỏng máy yếu": PERF_CPU_THROTTLE=4 → DevTools CPU throttling 4× (reference only, not a gate).
const CPU_THROTTLE = Number(process.env.PERF_CPU_THROTTLE ?? 1);
const MACHINE_LABEL =process.env.PERF_MACHINE_LABEL ?? (isCI ? "GitHub Actions runner (not the ADR 0007 reference machine)" : "desktop dGPU RTX 3060");

type Tracked = RecordedRequest & { done: boolean; requestId: string };
type Probe = { clickMs: number | null; firstDrawMs: number | null; playableMs: number | null };

test.describe.configure({ mode: "serial" });

/** In-page probe: Enter World click time and the first presented frame of the world canvas. */
function installProbe(marker: string) {
  const w = window as unknown as { __tqaPerf: Probe };
  const now = () => performance.timeOrigin + performance.now();
  w.__tqaPerf = { clickMs: null, firstDrawMs: null, playableMs: null };
  document.addEventListener(
    "click",
    event => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (w.__tqaPerf.clickMs === null && button?.textContent?.trim() === "Enter World") w.__tqaPerf.clickMs = now();
    },
    true,
  );
  const draws = ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"];
  for (const ctor of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!ctor) continue;
    const proto = ctor.prototype as unknown as Record<string, unknown>;
    for (const name of draws) {
      const original = proto[name];
      if (typeof original !== "function") continue;
      proto[name] = function (this: WebGLRenderingContext, ...args: unknown[]) {
        if (w.__tqaPerf.firstDrawMs === null) {
          const canvas = this.canvas;
          if (canvas instanceof HTMLCanvasElement && canvas.closest(`[data-world-chunk="${marker}"]`)) {
            w.__tqaPerf.firstDrawMs = now();
            requestAnimationFrame(() => void (w.__tqaPerf.playableMs = now()));
          }
        }
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      };
    }
  }
}

/** CDP network recorder for one page: cold cache + §8 network profile. */
async function record(page: Page) {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const byId = new Map<string, Tracked>();
  const bodyReads: Promise<void>[] = [];
  const warnings: string[] = [];
  let lastRequestAt = Date.now();

  cdp.on("Network.requestWillBeSent", event => {
    lastRequestAt = Date.now();
    const existing = byId.get(event.requestId);
    if (existing) {
      existing.url = event.request.url; // redirect: same requestId, keep the original start time
      return;
    }
    byId.set(event.requestId, {
      requestId: event.requestId,
      url: event.request.url,
      resourceType: event.type,
      encodedBytes: 0,
      startMs: event.wallTime * 1000,
      done: false,
    });
  });
  cdp.on("Network.responseReceived", event => {
    const r = byId.get(event.requestId);
    if (!r) return;
    r.mimeType = event.response.mimeType;
    r.status = event.response.status;
    r.resourceType = event.type;
  });
  cdp.on("Network.loadingFinished", event => {
    const r = byId.get(event.requestId);
    if (!r) return;
    r.encodedBytes = event.encodedDataLength;
    r.done = true;
    if (r.resourceType === "Script" || /javascript|ecmascript/i.test(r.mimeType ?? "")) {
      bodyReads.push(
        cdp
          .send("Network.getResponseBody", { requestId: event.requestId })
          .then(({ body, base64Encoded }) => {
            const text = base64Encoded ? Buffer.from(body, "base64").toString("latin1") : body;
            r.signatures = WORLD_SIGNATURES.filter(s => text.includes(s));
          })
          .catch(error => void warnings.push(`body unavailable (3D signature not checked): ${r.url} — ${String(error)}`)),
      );
    }
  });
  cdp.on("Network.loadingFailed", event => {
    const r = byId.get(event.requestId);
    if (!r) return;
    r.failed = true;
    r.done = true;
  });

  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: NETWORK.rttMs,
    downloadThroughput: (NETWORK.downloadMbps * 1_000_000) / 8,
    uploadThroughput: (NETWORK.uploadMbps * 1_000_000) / 8,
  });
  if (CPU_THROTTLE > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

  return {
    warnings,
    snapshot: (): RecordedRequest[] =>
      [...byId.values()].map(r => ({
        url: r.url,
        resourceType: r.resourceType,
        mimeType: r.mimeType,
        status: r.status,
        encodedBytes: r.encodedBytes,
        startMs: r.startMs,
        failed: r.failed,
        signatures: r.signatures ? [...r.signatures] : undefined,
      })),
    /** No new request for `quietMs` and every started request finished (max `maxMs`). */
    async settle(quietMs = 1_000, maxMs = 20_000) {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        const pending = [...byId.values()].some(r => !r.done);
        if (!pending && Date.now() - lastRequestAt >= quietMs) return true;
        await page.waitForTimeout(100);
      }
      warnings.push(`settle timed out after ${maxMs} ms: ${[...byId.values()].filter(r => !r.done).map(r => r.url).join(", ") || "requests kept starting"}`);
      return false;
    },
    /** Wait until every request started at or before `t` (epoch ms) has finished (max `maxMs`). */
    async drain(t: number, maxMs = 60_000) {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        if (![...byId.values()].some(r => r.startMs <= t && !r.done)) return;
        await page.waitForTimeout(100);
      }
      warnings.push(`drain timed out: some requests started before playable never finished`);
    },
    bodies: () => Promise.all(bodyReads),
  };
}

function top(requests: RecordedRequest[], n = 8) {
  return [...requests]
    .sort((a, b) => b.encodedBytes - a.encodedBytes)
    .slice(0, n)
    .map(r => ({ url: new URL(r.url).pathname, type: r.resourceType, bytes: r.encodedBytes, status: r.status }));
}

function machineInfo(browser: Browser, renderer: string) {
  let power = "n/a";
  if (process.platform === "win32") {
    try {
      power = execFileSync("powercfg", ["/getactivescheme"], { encoding: "utf8" }).trim();
    } catch {
      power = "n/a (powercfg unavailable)";
    }
  }
  return {
    label: MACHINE_LABEL,
    os: `${os.type()} ${os.release()} (${os.version()}) ${os.arch()}`,
    cpu: `${os.cpus()[0]?.model ?? "n/a"} × ${os.cpus().length} logical`,
    ramGB: Math.round(os.totalmem() / 1024 ** 3),
    browser: `${CHANNEL ?? "chromium (bundled)"} ${browser.version()}`,
    headless: true,
    cpuThrottle: CPU_THROTTLE,
    webglRenderer: renderer,
    power,
    viewport: `${VIEWPORT.width}×${VIEWPORT.height}`,
    dpr: DPR,
    node: process.version,
  };
}

test("load budget §8: Welcome/Quick initial transfer, 0 3D before Enter World, Enter World → playable (worst of cold runs)", async ({ baseURL }) => {
  const base = baseURL ?? "http://127.0.0.1:4174";
  const runs: (RunResult & { details: Record<string, unknown> })[] = [];
  let machine: ReturnType<typeof machineInfo> | undefined;

  for (let i = 1; i <= RUNS; i++) {
    const browser = await chromium.launch({ ...(CHANNEL ? { channel: CHANNEL } : {}), args: LAUNCH_ARGS });
    try {
      // --- Welcome /en/ → Enter World → playable
      const welcomeContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
      const page = await welcomeContext.newPage();
      await page.addInitScript(installProbe, WORLD_MARKER);
      const welcome = await record(page);
      await page.goto(`${base}/en/`, { waitUntil: "load" });
      const enter = page.getByRole("button", { name: "Enter World" });
      await expect(enter).toBeEnabled({ timeout: 30_000 });
      await welcome.settle();
      const renderer = await page.evaluate(() => {
        const gl = document.createElement("canvas").getContext("webgl2");
        if (!gl) return "no WebGL2";
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      });
      machine ??= machineInfo(browser, renderer);

      await enter.click();
      await page
        .waitForFunction(() => (window as unknown as { __tqaPerf: Probe }).__tqaPerf.playableMs !== null, null, { timeout: 60_000, polling: 50 })
        .catch(() => undefined);
      const probe = await page.evaluate(() => (window as unknown as { __tqaPerf: Probe }).__tqaPerf);
      await welcome.drain(probe.playableMs ?? Date.now());
      await welcome.bodies();
      const welcomeRequests = welcome.snapshot();
      const clickMs = probe.clickMs ?? Number.POSITIVE_INFINITY;
      const initial = evaluateInitialPage("Welcome /en/", welcomeRequests.filter(r => r.startMs < clickMs));
      const world = evaluateWorld(welcomeRequests, { clickMs, playableMs: probe.playableMs });
      const worldRequests = welcomeRequests.filter(r => r.startMs >= clickMs && (probe.playableMs === null || r.startMs <= probe.playableMs));
      await welcomeContext.close();

      // --- Quick /en/quick/
      const quickContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
      const quickPage = await quickContext.newPage();
      const quick = await record(quickPage);
      await quickPage.goto(`${base}/en/quick/`, { waitUntil: "load" });
      await quick.settle();
      await quick.bodies();
      const quickRequests = quick.snapshot();
      const quickResult = evaluateInitialPage("Quick /en/quick/", quickRequests);
      await quickContext.close();

      const gates = [
        ...initial.gates.filter(g => !g.id.endsWith("no-3d-before-enter")),
        ...quickResult.gates.filter(g => !g.id.endsWith("no-3d-before-enter")),
        ...initial.gates.filter(g => g.id.endsWith("no-3d-before-enter")),
        ...quickResult.gates.filter(g => g.id.endsWith("no-3d-before-enter")),
        ...world.gates,
      ];
      const describe = (s: Summary) => ({ ...s, totalHuman: fmtBytes(s.total) });
      runs.push({
        label: `Lần ${i}`,
        gates,
        details: {
          probe,
          clickToFirstDrawMs: probe.clickMs !== null && probe.firstDrawMs !== null ? probe.firstDrawMs - probe.clickMs : null,
          welcome: { summary: describe(initial.summary), forbidden: initial.forbidden, top: top(welcomeRequests.filter(r => r.startMs < clickMs)) },
          quick: { summary: describe(quickResult.summary), forbidden: quickResult.forbidden, top: top(quickRequests) },
          world: { summary: describe(world.summary), timeMs: world.timeMs, top: top(worldRequests) },
          warnings: [...welcome.warnings, ...quick.warnings],
        },
      });
      console.log(`run ${i}: ${gates.map(g => `${g.label}=${g.measured} ${g.status}`).join("; ")}`);
    } finally {
      await browser.close();
    }
  }

  const result = { measuredAt: new Date().toISOString(), machine, network: NETWORK, runs };
  const markdown = formatMarkdown(result);
  const name = CPU_THROTTLE > 1 ? `load-budget-cpu${CPU_THROTTLE}x` : "load-budget";
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(result, null, 2));
  writeFileSync(path.join(OUT_DIR, `${name}.md`), `${markdown}\n`);
  console.log(`\n${markdown}\n\nmachine: ${JSON.stringify(machine)}\nresults: ${OUT_DIR}`);

  const worst = worstOf(runs);
  if (CPU_THROTTLE > 1) {
    test.info().annotations.push({ type: "reference-only", description: `CPU throttling ${CPU_THROTTLE}× (ADR 0007 "mô phỏng máy yếu"): not a gate; result ${worst.ok ? "within" : "outside"} §8 limits` });
    return;
  }
  expect(worst.gates.filter(g => g.status === "FAIL").map(g => `${g.label}: ${g.measured}`), "§8 gates (worst of runs)").toEqual([]);
});
