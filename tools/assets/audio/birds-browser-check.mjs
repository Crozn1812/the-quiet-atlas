// Run against the completed local static build:
// node tools/assets/audio/birds-browser-check.mjs http://127.0.0.1:4187
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:4187");
if (!["127.0.0.1", "localhost"].includes(base.hostname)) throw new Error("Local builds only");
const output = "test-results/audio-birds";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const checks = [];
try {
  for (const offline of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, reducedMotion: "reduce" });
    page.setDefaultTimeout(90_000);
    const requests = [], errors = [];
    page.on("request", request => { if (request.url().includes("/audio/birds/")) requests.push(request.url()); });
    page.on("pageerror", error => errors.push(error.message));
    if (offline) await page.route("**/audio/birds/*.ogg", route => route.abort("failed"));
    await page.addInitScript(() => {
      window.__tqaJourney = true;
      window.__tqaSkipIntro = true;
      const audit = window.__birdAudio = { decoded: [], clips: [], synth: [], pans: [], closed: 0 };
      const proto = AudioContext.prototype;
      const decode = proto.decodeAudioData;
      proto.decodeAudioData = async function (bytes) {
        const buffer = await decode.call(this, bytes);
        audit.decoded.push({ seconds: buffer.duration, channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
        return buffer;
      };
      const createBuffer = proto.createBufferSource;
      proto.createBufferSource = function () {
        const source = createBuffer.call(this);
        const start = source.start, stop = source.stop;
        let event;
        source.start = (...args) => {
          if (!source.loop) {
            event = { start: args[0], rate: source.playbackRate.value, seconds: source.buffer?.duration, stopped: false };
            audit.clips.push(event);
          }
          return start.apply(source, args);
        };
        source.stop = (...args) => { if (event) event.stopped = true; return stop.apply(source, args); };
        return source;
      };
      const createOscillator = proto.createOscillator;
      proto.createOscillator = function () {
        const source = createOscillator.call(this), start = source.start;
        source.start = (...args) => {
          if (source.onended) audit.synth.push({ start: args[0], pitch: source.frequency.value });
          return start.apply(source, args);
        };
        return source;
      };
      const createPanner = proto.createPanner;
      proto.createPanner = function () { const pan = createPanner.call(this); audit.pans.push(pan); return pan; };
      const close = proto.close;
      proto.close = function () { audit.closed++; return close.call(this); };
    });
    await page.goto(new URL("/en/", base).href);
    const sound = page.getByRole("button", { name: "Sound", exact: true });
    assert.equal(await sound.getAttribute("aria-pressed"), "false");
    assert.equal(requests.length, 0);
    // Sound may be enabled on Welcome, but there is no world mix to load yet.
    await sound.click();
    await page.waitForTimeout(600);
    assert.equal(requests.length, 0);
    await page.getByRole("button", { name: "Enter World", exact: true }).click();
    const world = page.locator('[data-world-build="done"][data-world-intro="done"]');
    await world.waitFor({ state: "visible" });
    await page.waitForFunction(() => window.__birdAudio.synth.length > 0);
    if (!offline) {
      await page.waitForFunction(() => window.__birdAudio.clips.length > 0);
      await page.waitForFunction(() => window.__birdAudio.clips.some(clip => clip.start < window.__birdAudio.pans[0].context.currentTime));
      // Inspect actual browser decoded buffers and actual Web Audio schedule.
      const audit = await page.evaluate(() => ({ decoded: window.__birdAudio.decoded, clips: window.__birdAudio.clips, hrtf: window.__birdAudio.pans.every(pan => pan.panningModel === "HRTF") }));
      assert(audit.decoded.every(buffer => buffer.channels === 1 && buffer.seconds >= 1 && buffer.seconds <= 4));
      assert(audit.clips.every(clip => clip.rate >= 0.97 && clip.rate <= 1.03));
      assert(audit.hrtf);
      checks.push({ mode: "online", requests: [...requests], ...audit });
    } else {
      await page.waitForFunction(() => window.__birdAudio.synth.some(call => call.start < window.__birdAudio.pans[0].context.currentTime));
      const audit = await page.evaluate(() => ({ decoded: window.__birdAudio.decoded, clips: window.__birdAudio.clips, synth: window.__birdAudio.synth }));
      assert.equal(audit.clips.length, 0);
      assert(audit.synth.length > 0);
      checks.push({ mode: "offline-fallback", requests: [...requests], ...audit });
    }
    await sound.click();
    assert.equal(await sound.getAttribute("aria-pressed"), "false");
    const afterMute = await page.evaluate(() => ({ closed: window.__birdAudio.closed, clips: window.__birdAudio.clips.length, synth: window.__birdAudio.synth.length }));
    assert.equal(afterMute.closed, 1);
    await page.waitForTimeout(500);
    assert.deepEqual(await page.evaluate(() => ({ closed: window.__birdAudio.closed, clips: window.__birdAudio.clips.length, synth: window.__birdAudio.synth.length })), afterMute);
    await page.screenshot({ path: `${output}/${offline ? "offline" : "online"}.png` });
    assert.deepEqual(errors, []);
    await page.close();
  }
  writeFileSync(`${output}/browser-check.json`, JSON.stringify(checks, null, 2) + "\n");
  console.log("PASS: Edge / no bird requests before Enter World / mono Opus decode / HRTF / pitch / offline synthesis / mute closes context / no stale restart / 0 page errors");
} finally {
  await browser.close();
}
