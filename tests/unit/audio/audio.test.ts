import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAmbience, CHIME_SCALE, DEFAULT_MASTER_VOLUME, MIX_RAMP_SECONDS } from "../../../src/features/audio/ambience";
import { createAudioController } from "../../../src/features/audio/controller";
import { birdLevel, birdPhrase } from "../../../src/features/audio/birds";
import { ambienceMixAt, type AmbienceInputs, type AmbienceMix } from "../../../src/features/audio/mix";

type Automation = { kind: "set" | "ramp" | "cancel"; value?: number; time: number };

class FakeParam {
  events: Automation[] = [];
  setValueAtTime(value: number, time: number) {
    this.events.push({ kind: "set", value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ kind: "ramp", value, time });
    return this;
  }
  cancelScheduledValues(time: number) {
    this.events.push({ kind: "cancel", time });
    return this;
  }
  cancelAndHoldAtTime(time: number) { return this.cancelScheduledValues(time); }
}

class FakeNode {
  connections: (FakeNode | FakeParam)[] = [];
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  pan = new FakeParam();
  positionX = new FakeParam();
  positionY = new FakeParam();
  positionZ = new FakeParam();
  panningModel = "equalpower";
  rolloffFactor = 1;
  type = "sine";
  loop = false;
  buffer: unknown;
  onended: (() => void) | null = null;
  constructor(readonly kind: "gain" | "filter" | "oscillator" | "noise" | "destination" | "pan") {}
  connect(node: FakeNode | FakeParam) {
    this.connections.push(node);
    return node;
  }
  disconnect = vi.fn(() => { this.connections = []; });
  start = vi.fn<(time: number, offset?: number) => void>();
  stop = vi.fn<(time: number) => void>();
}

class FakeContext {
  currentTime = 10;
  sampleRate = 32;
  state: AudioContextState = "suspended";
  nodes: FakeNode[] = [];
  buffers: Float32Array[] = [];
  destination = new FakeNode("destination");
  create(kind: FakeNode["kind"]) {
    const node = new FakeNode(kind);
    this.nodes.push(node);
    return node;
  }
  createGain() { return this.create("gain"); }
  createStereoPanner() { return this.create("pan"); }
  createPanner() { return this.create("pan"); }
  createBiquadFilter() { return this.create("filter"); }
  createOscillator() { return this.create("oscillator"); }
  createBufferSource() { return this.create("noise"); }
  createBuffer(channels: number, length: number, rate: number) {
    expect(channels).toBe(1);
    expect(rate).toBe(this.sampleRate);
    const data = new Float32Array(length);
    this.buffers.push(data);
    return { getChannelData: () => data };
  }
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
  asAudio() { return this as unknown as AudioContext; }
  gains() { return this.nodes.filter(node => node.kind === "gain"); }
  birds() {
    return this.nodes.filter(node => node.kind === "oscillator" && node.onended && node.frequency.events.some(e => e.kind === "ramp"));
  }
  chimes() {
    return this.nodes.filter(node => node.kind === "oscillator" && node.onended && !node.frequency.events.some(e => e.kind === "ramp"));
  }
  finishBird() {
    const bird = this.birds()[0]!;
    this.currentTime = bird.stop.mock.calls[0]![0];
    bird.onended!();
    return bird;
  }
  finishChime() {
    const chime = this.chimes()[0]!;
    this.currentTime = chime.stop.mock.calls[0]![0];
    chime.onended!();
    return chime;
  }
}

const forest: AmbienceInputs = {
  distanceToRiver: 0, distanceToSea: 500, zoneBiome: "forest-dawn", timeOfDay: 0,
};
const hill: AmbienceInputs = {
  distanceToRiver: 100, distanceToSea: 200, zoneBiome: "hill", timeOfDay: 0.5,
};
const coast: AmbienceInputs = {
  distanceToRiver: 100, distanceToSea: 0, zoneBiome: "coast-dusk", timeOfDay: 1,
};
const quiet: AmbienceMix = { stream: 0, wind: 0, birds: 0, sea: 0, chime: 0 };
const full: AmbienceMix = { stream: 1, wind: 1, birds: 1, sea: 1, chime: 1 };

function installContext() {
  const instances: FakeContext[] = [];
  vi.stubGlobal("AudioContext", class extends FakeContext {
    constructor() { super(); instances.push(this); }
  });
  return instances;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("pure ambience mix", () => {
  it("attenuates positioned birds, permits gulls, and distinguishes original call contours", () => {
    const bird = { distance: 2, pan: 1, species: 2, evening: 1 };
    expect(birdLevel(bird)).toBe(1);
    expect(birdLevel({ ...bird, distance: 16 })).toBeLessThan(1);
    expect(birdLevel({ ...bird, distance: 35 })).toBe(0);
    expect(birdLevel({ ...bird, distance: NaN })).toBe(0);
    expect(ambienceMixAt({ ...coast, bird }).birds).toBeGreaterThan(0);
    expect(ambienceMixAt({ ...coast, bird: { ...bird, distance: Infinity } }).birds).toBe(0);
    const phrases = [0, 1, 2].map(species => birdPhrase(species, () => 0.5));
    expect(new Set(phrases.map(call => call.pitch)).size).toBe(3);
    expect(new Set(phrases.map(call => call.duration)).size).toBe(3);
  });
  it("favours stream and birds at forest dawn, wind on hills, waves at the coast", () => {
    const dawn = ambienceMixAt(forest);
    const hills = ambienceMixAt(hill);
    const shore = ambienceMixAt(coast);
    expect(dawn.stream).toBeGreaterThan(dawn.wind);
    expect(dawn.birds).toBeGreaterThan(dawn.wind);
    expect(hills.wind).toBeGreaterThan(dawn.wind);
    expect(hills.wind).toBeGreaterThan(hills.stream + hills.sea);
    expect(shore.sea).toBeGreaterThan(shore.wind);
    expect(shore.birds).toBe(0);
    expect(hills.birds).toBe(0);
    expect(ambienceMixAt({ ...forest, timeOfDay: 1 }).birds).toBeLessThan(dawn.birds);
  });

  it("attenuates with distance, is deterministic, and returns fresh bounded values", () => {
    const mix = ambienceMixAt(forest);
    expect(ambienceMixAt(forest)).toEqual(mix);
    expect(ambienceMixAt(forest)).not.toBe(mix);
    for (let distance = 0; distance < 100; distance++) {
      expect(ambienceMixAt({ ...forest, distanceToRiver: distance + 1 }).stream)
        .toBeLessThanOrEqual(ambienceMixAt({ ...forest, distanceToRiver: distance }).stream);
      expect(ambienceMixAt({ ...coast, distanceToSea: distance + 1 }).sea)
        .toBeLessThanOrEqual(ambienceMixAt({ ...coast, distanceToSea: distance }).sea);
    }
    for (const value of [-Infinity, -10, 0, 0.5, 100, Infinity, NaN]) {
      for (const zone of [forest, hill, coast]) {
        const result = ambienceMixAt({ ...zone, distanceToRiver: value, distanceToSea: value, timeOfDay: value });
        for (const level of Object.values(result)) {
          expect(level).toBeGreaterThanOrEqual(0);
          expect(level).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("attenuates chime with distance (0 at >= 18 m, monotonically increasing closer, NaN -> 0)", () => {
    // Zero at >= 18 m
    expect(ambienceMixAt({ ...forest, distanceToChime: 18 }).chime).toBe(0);
    expect(ambienceMixAt({ ...forest, distanceToChime: 18.01 }).chime).toBe(0);
    expect(ambienceMixAt({ ...forest, distanceToChime: 100 }).chime).toBe(0);
    expect(ambienceMixAt({ ...forest, distanceToChime: Infinity }).chime).toBe(0);

    // Full / clearest within 4 m
    expect(ambienceMixAt({ ...forest, distanceToChime: 4 }).chime).toBe(1);
    expect(ambienceMixAt({ ...forest, distanceToChime: 2 }).chime).toBe(1);
    expect(ambienceMixAt({ ...forest, distanceToChime: 0 }).chime).toBe(1);

    // Monotonically increases when approaching (distance decreasing)
    for (let distance = 0; distance < 30; distance += 0.5) {
      const further = ambienceMixAt({ ...forest, distanceToChime: distance + 0.5 }).chime!;
      const closer = ambienceMixAt({ ...forest, distanceToChime: distance }).chime!;
      expect(closer).toBeGreaterThanOrEqual(further);
    }

    // NaN and undefined default to 0
    expect(ambienceMixAt({ ...forest, distanceToChime: NaN }).chime).toBe(0);
    expect(ambienceMixAt({ ...forest, distanceToChime: undefined }).chime).toBe(0);

    // Pure position check: carries no secret discovery state or progress
    const atSecret = ambienceMixAt({ ...forest, distanceToChime: 2 });
    expect(atSecret.chime).toBe(1);
  });
});

describe("synthesized graph", () => {
  it("generates one local noise buffer, with separate incoming, breaking and draining surf", () => {
    const context = new FakeContext();
    const ambience = createAmbience(context.asAudio());
    ambience.setMix(quiet);
    expect(context.buffers).toHaveLength(1);
    expect(context.buffers[0]!.some(value => value !== 0)).toBe(true);
    expect(context.buffers[0]!.every(value => value >= -1 && value <= 1)).toBe(true);
    const sources = context.nodes.filter(node => node.kind === "noise");
    expect(sources).toHaveLength(5);
    expect(sources.every(node => node.loop && node.buffer)).toBe(true);
    const filters = context.nodes.filter(node => node.kind === "filter");
    expect(filters.map(node => node.type)).toEqual(["bandpass", "lowpass", "lowpass", "bandpass", "highpass"]);
    expect(sources.map(node => node.connections[0])).toEqual(filters);
    const lfos = context.nodes.filter(node => node.kind === "oscillator");
    expect(lfos).toHaveLength(2);
    expect(lfos.every(node => node.type === "sine")).toBe(true);
    expect(lfos[0]!.frequency.events[0]!.value).toBeLessThan(0.1);
    expect(lfos[1]!.frequency.events[0]!.value).toBeLessThan(0.1);
    expect(context.gains()[0]!.gain.events[0]!.value).toBe(DEFAULT_MASTER_VOLUME);
    expect(context.gains()[0]!.connections).toEqual([context.destination]);
    expect(context.gains().slice(1, 6).every((node, i) => node.connections[0] === (i === 3 ? context.nodes.find(n => n.kind === "pan") : context.gains()[0]))).toBe(true);
    ambience.dispose();
  });

  it("follows the visual clock and camera pan without restarting on mute or clock freezes", () => {
    const context = new FakeContext();
    const ambience = createAmbience(context.asAudio());
    const sample = { seconds: 2.2, along: 0, distance: 1, pan: -1 };
    ambience.setMix({ ...quiet, sea: 1, surf: sample });
    const seaGains = context.nodes.filter(n => n.kind === "filter").slice(2).map(n => n.connections[0] as FakeNode);
    expect(seaGains[1]!.gain.events.at(-1)!.value).toBeCloseTo(0.32);
    expect(context.nodes.find(n => n.kind === "pan")!.pan.events.at(-1)!.value).toBe(-0.8);
    const eventCount = seaGains[1]!.gain.events.length;
    context.currentTime += 20; // Context time cannot advance a frozen visual clock.
    ambience.setMix({ ...quiet, sea: 1, surf: sample });
    expect(seaGains[1]!.gain.events).toHaveLength(eventCount);
    ambience.setMix({ ...quiet, sea: 1, surf: { ...sample, seconds: 5, pan: 1 } });
    expect(seaGains[1]!.gain.events.at(-1)!.value).toBe(0);
    expect(seaGains[2]!.gain.events.at(-1)!.value).toBeGreaterThan(0.04);
    expect(context.nodes.find(n => n.kind === "pan")!.pan.events.at(-1)!.value).toBe(0.8);
    ambience.mute();
    ambience.setMix({ ...quiet, sea: 1, surf: sample });
    const resumed = context.nodes.filter(n => n.kind === "filter").slice(-3).map(n => n.connections[0] as FakeNode);
    expect(resumed[1]!.gain.events.at(-1)!.value).toBeCloseTo(0.32);
    ambience.dispose();
  });

  it("clamps mix / volume and ramps every channel over at least 1.5 seconds", () => {
    const context = new FakeContext();
    const ambience = createAmbience(context.asAudio());
    ambience.setMix(full);
    ambience.setMasterVolume(2);
    for (const node of context.gains().slice(0, 6)) {
      const ramp = node.gain.events.find(event => event.kind === "ramp")!;
      expect(ramp.value).toBe(1);
      expect(ramp.time - context.currentTime).toBeGreaterThanOrEqual(1.5);
    }
    context.currentTime += 2;
    ambience.setMix({ stream: -5, wind: NaN, birds: 0, sea: Infinity, chime: 0 });
    ambience.setMasterVolume(NaN);
    expect(context.gains().slice(0, 4).map(node => node.gain.events.at(-1)!.value)).toEqual([0, 0, 0, 0]);
    expect(context.gains()[4]!.gain.events.at(-1)!.value).toBe(1);
    expect(context.gains()[5]!.gain.events.at(-1)!.value).toBe(0);
    ambience.dispose();
  });

  it("holds the interpolated level during frequent retargets and leaves identical targets alone", () => {
    const context = new FakeContext();
    const ambience = createAmbience(context.asAudio());
    ambience.setMix({ ...quiet, stream: 1 });
    const gain = context.gains()[1]!.gain;
    context.currentTime += MIX_RAMP_SECONDS / 2;
    const count = gain.events.length;
    ambience.setMix({ ...quiet, stream: 1 });
    expect(gain.events).toHaveLength(count);
    ambience.setMix(quiet);
    expect(gain.events.slice(-3)).toEqual([
      { kind: "cancel", time: context.currentTime },
      { kind: "set", value: 0.5, time: context.currentTime },
      { kind: "ramp", value: 0, time: context.currentTime + MIX_RAMP_SECONDS },
    ]);
    ambience.dispose();
  });

  it.each(["mute", "dispose"] as const)("%s stops and disconnects every live or queued node once", method => {
    const context = new FakeContext();
    const ambience = createAmbience(context.asAudio());
    ambience.setMix(full);
    const queuedBird = context.birds()[0]!;
    const endedCallback = queuedBird.onended!;
    const sources = context.nodes.filter(node => node.kind === "noise" || node.kind === "oscillator");
    ambience[method]();
    ambience[method]();
    for (const node of context.nodes) {
      expect(node.disconnect).toHaveBeenCalledTimes(1);
      expect(node.connections).toEqual([]);
      expect(node.onended).toBeNull();
    }
    for (const node of sources) expect(node.stop).toHaveBeenLastCalledWith(context.currentTime);
    const count = context.nodes.length;
    endedCallback();
    expect(context.nodes).toHaveLength(count);
    expect(context.close).not.toHaveBeenCalled(); // Caller owns this context.
    if (method === "dispose") {
      ambience.setMix(full);
      ambience.setMasterVolume(1);
      expect(context.nodes).toHaveLength(count);
    } else {
      ambience.setMix(full);
      expect(context.nodes.length).toBeGreaterThan(count);
      ambience.dispose();
    }
  });

  it("schedules sparse sine chirps only for forest mixes and cancels them at the biome boundary", () => {
    const context = new FakeContext();
    const ambience = createAmbience(context.asAudio());
    for (const inputs of [hill, coast]) {
      ambience.setMix(ambienceMixAt(inputs));
      expect(context.birds()).toHaveLength(0);
    }
    ambience.setMix(ambienceMixAt(forest));
    const bird = context.birds()[0]!;
    const staleCallback = bird.onended!;
    expect(bird.type).toBe("sine");
    expect(bird.start.mock.calls[0]![0] - context.currentTime).toBeGreaterThanOrEqual(4);
    expect(bird.start.mock.calls[0]![0] - context.currentTime).toBeLessThanOrEqual(9);
    expect(bird.frequency.events.filter(event => event.kind === "ramp")).toHaveLength(2);
    ambience.setMix(ambienceMixAt(coast));
    expect(bird.stop).toHaveBeenLastCalledWith(context.currentTime);
    expect(bird.disconnect).toHaveBeenCalledOnce();
    expect(context.birds()).toHaveLength(0);
    staleCallback();
    expect(context.birds()).toHaveLength(0);
    ambience.dispose();
  });

  it("produces the same noise and repeated audio-clock schedule for the same seed", () => {
    function schedule(seed: number) {
      const context = new FakeContext();
      const ambience = createAmbience(context.asAudio(), { seed });
      ambience.setMix(full);
      const events = [];
      for (let i = 0; i < 5; i++) {
        const bird = context.birds()[0]!;
        expect(context.birds()).toHaveLength(1);
        events.push({ start: bird.start.mock.calls[0], stop: bird.stop.mock.calls[0], pitch: bird.frequency.events });
        context.finishBird();
        expect(bird.disconnect).toHaveBeenCalledOnce();
      }
      const result = { events, noise: context.buffers[0] };
      ambience.dispose();
      return result;
    }
    expect(schedule(123)).toEqual(schedule(123));
    expect(schedule(124)).not.toEqual(schedule(123));
  });

  it("does not schedule chimes when mix = 0, and cancels queued chime on transition to 0", () => {
    const context = new FakeContext();
    const ambience = createAmbience(context.asAudio());
    ambience.setMix(quiet);
    expect(context.chimes()).toHaveLength(0);

    ambience.setMix({ ...quiet, chime: 0.5 });
    expect(context.chimes()).toHaveLength(1);
    const chime = context.chimes()[0]!;
    const staleCallback = chime.onended!;
    expect(chime.type).toBe("sine");
    // Inter-note interval is 0.8–4 s
    expect(chime.start.mock.calls[0]![0] - context.currentTime).toBeGreaterThanOrEqual(0.8);
    expect(chime.start.mock.calls[0]![0] - context.currentTime).toBeLessThanOrEqual(4.0);

    // Transitioning mix to 0 cancels the active chime and stops scheduling
    ambience.setMix({ ...quiet, chime: 0 });
    expect(chime.stop).toHaveBeenLastCalledWith(context.currentTime);
    expect(chime.disconnect).toHaveBeenCalledOnce();
    expect(context.chimes()).toHaveLength(0);

    staleCallback();
    expect(context.chimes()).toHaveLength(0);
    ambience.dispose();
  });

  it("produces deterministic chime schedule from seed and selects notes from pentatonic scale", () => {
    function scheduleChimes(seed: number) {
      const context = new FakeContext();
      const ambience = createAmbience(context.asAudio(), { seed });
      ambience.setMix({ ...quiet, chime: 1 });
      const events = [];
      for (let i = 0; i < 5; i++) {
        const chime = context.chimes()[0]!;
        expect(context.chimes()).toHaveLength(1);
        const pitch = chime.frequency.events[0]?.value;
        expect(CHIME_SCALE).toContain(pitch);
        events.push({
          start: chime.start.mock.calls[0],
          stop: chime.stop.mock.calls[0],
          pitch,
        });
        context.finishChime();
        expect(chime.disconnect).toHaveBeenCalledOnce();
      }
      ambience.dispose();
      return events;
    }
    expect(scheduleChimes(42)).toEqual(scheduleChimes(42));
    expect(scheduleChimes(43)).not.toEqual(scheduleChimes(42));
  });

  it("releases all chime nodes on dispose or mute", () => {
    for (const method of ["mute", "dispose"] as const) {
      const context = new FakeContext();
      const ambience = createAmbience(context.asAudio());
      ambience.setMix({ ...quiet, chime: 1 });
      expect(context.chimes()).toHaveLength(1);
      const queuedChime = context.chimes()[0]!;
      const ended = queuedChime.onended!;
      ambience[method]();
      expect(queuedChime.stop).toHaveBeenLastCalledWith(context.currentTime);
      expect(queuedChime.disconnect).toHaveBeenCalledOnce();
      expect(context.chimes()).toHaveLength(0);
      ended();
      expect(context.chimes()).toHaveLength(0);
    }
  });

  it("enforces chime envelope attack >= 30 ms and volume peak <= 0.5", () => {
    const context = new FakeContext();
    const ambience = createAmbience(context.asAudio());
    ambience.setMix({ ...quiet, chime: 1 });
    const chimeOsc = context.chimes()[0]!;
    const chimeChannel = context.gains()[5];
    const envelope = context.gains().find(g => g.connections.includes(chimeChannel!))!;
    expect(envelope).toBeDefined();
    const ramps = envelope.gain.events.filter(e => e.kind === "ramp");
    expect(ramps.length).toBeGreaterThanOrEqual(2);
    const attackRamp = ramps[0]!;
    const startTime = chimeOsc.start.mock.calls[0]![0];
    expect(attackRamp.time - startTime).toBeGreaterThanOrEqual(0.03);
    expect(attackRamp.value).toBeLessThanOrEqual(0.5);
    ambience.dispose();
  });
});

describe("opt-in audio controller", () => {
  it("pans positioned calls, thins the evening schedule, and cancels old species and muted nodes", () => {
    const context = new FakeContext(), ambience = createAmbience(context.asAudio());
    const bird = { distance: 4, pan: -0.8, species: 0, evening: 0 };
    ambience.setMix(ambienceMixAt({ ...forest, bird }));
    const morning = context.birds()[0]!;
    const morningDelay = morning.start.mock.calls[0]![0] - context.currentTime;
    const pans = context.nodes.filter(node => node.kind === "pan");
    expect(pans.at(-1)!.panningModel).toBe("HRTF");
    expect(pans.at(-1)!.positionX.events.at(-1)!.value).toBe(-0.8);
    ambience.setMix(ambienceMixAt({ ...coast, bird: { ...bird, species: 2, evening: 1, pan: 0.7 } }));
    const evening = context.birds()[0]!;
    expect(morning.disconnect).toHaveBeenCalledOnce();
    expect(evening.start.mock.calls[0]![0] - context.currentTime).toBeGreaterThan(morningDelay);
    expect(pans.at(-1)!.positionX.events.at(-1)!.value).toBe(0.7);
    ambience.setMix(ambienceMixAt({ ...forest, bird: { ...bird, position: [-3, 2, -5] } }));
    const spatial = pans.at(-1)!;
    expect([spatial.positionX, spatial.positionY, spatial.positionZ].map(param => param.events.at(-1)!.value)).toEqual([-3, 2, -5]);
    ambience.mute();
    expect(context.birds()).toHaveLength(0);
    expect(pans.every(node => node.disconnect.mock.calls.length === 1)).toBe(true);
    ambience.dispose();
  });
  it("does not create a context before enable and applies only the latest disabled inputs", async () => {
    const contexts = installContext();
    const controller = createAudioController();
    controller.update(forest);
    controller.update(coast);
    await controller.disable();
    expect(contexts).toHaveLength(0);
    const enabling = controller.enable();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.resume).toHaveBeenCalledOnce();
    expect(await enabling).toBe(true);
    const context = contexts[0]!;
    expect(context.birds()).toHaveLength(0);
    expect(context.gains()[4]!.gain.events.at(-1)!.value).toBe(ambienceMixAt(coast).sea);
    expect(await controller.enable()).toBe(true);
    expect(contexts).toHaveLength(1);
    await controller.disable();
  });

  it("limits position updates to 4 Hz without scheduling timers", async () => {
    const contexts = installContext();
    const controller = createAudioController();
    controller.update(forest);
    await controller.enable();
    const context = contexts[0]!;
    const wind = context.gains()[2]!.gain;
    const count = wind.events.length;
    for (let i = 1; i < 15; i++) {
      context.currentTime = 10 + i / 60;
      controller.update(hill);
    }
    expect(wind.events).toHaveLength(count);
    context.currentTime = 10.25;
    controller.update(hill);
    expect(wind.events.at(-1)!.value).toBe(ambienceMixAt(hill).wind);
    expect(wind.events).toHaveLength(count + 3);
    context.currentTime = 10.49;
    controller.update(forest);
    expect(wind.events).toHaveLength(count + 3);
    context.currentTime = 10.5;
    controller.update(coast);
    expect(wind.events).toHaveLength(count + 6);
    await controller.disable();
  });

  it("stops / disconnects nodes, closes once, and supports explicit re-enable", async () => {
    const contexts = installContext();
    const controller = createAudioController();
    controller.update(forest);
    await controller.enable();
    const first = contexts[0]!;
    await controller.disable();
    await controller.disable();
    expect(first.close).toHaveBeenCalledOnce();
    expect(first.nodes.every(node => node.disconnect.mock.calls.length === 1)).toBe(true);
    controller.update(hill);
    expect(await controller.enable()).toBe(true);
    expect(contexts).toHaveLength(2);
    expect(contexts[1]!.birds()).toHaveLength(0);
    await controller.disable();
  });

  it("deduplicates pending enables and cannot restart sound after disable during resume", async () => {
    const contexts: FakeContext[] = [];
    let finishResume: () => void = () => undefined;
    vi.stubGlobal("AudioContext", class extends FakeContext {
      constructor() {
        super();
        contexts.push(this);
        this.resume = vi.fn(() => new Promise<void>(resolve => {
          finishResume = () => { this.state = "running"; resolve(); };
        }));
      }
    });
    const controller = createAudioController();
    controller.update(forest);
    const first = controller.enable();
    expect(controller.enable()).toBe(first);
    await controller.disable();
    finishResume();
    expect(await first).toBe(false);
    expect(contexts[0]!.nodes).toHaveLength(0);
    expect(contexts[0]!.close).toHaveBeenCalledOnce();
  });

  it("uses inputs received during resume, and resumes an externally suspended context", async () => {
    const contexts = installContext();
    const controller = createAudioController();
    controller.update(forest);
    const pending = controller.enable();
    controller.update(coast);
    expect(await pending).toBe(true);
    const context = contexts[0]!;
    expect(context.birds()).toHaveLength(0);
    context.state = "suspended";
    controller.update(forest);
    expect(context.birds()).toHaveLength(0);
    expect(await controller.enable()).toBe(true);
    expect(contexts).toHaveLength(1);
    expect(context.birds()).toHaveLength(1);
    expect(context.resume).toHaveBeenCalledTimes(2);
    await controller.disable();
  });

  it("returns false without throwing when WebAudio is unavailable or construction fails", async () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(await createAudioController().enable()).toBe(false);
    vi.stubGlobal("AudioContext", class { constructor() { throw new Error("Unavailable"); } });
    expect(await createAudioController().enable()).toBe(false);
  });

  it.each(["reject", "throw", "stay-suspended"])("cleans up when resume fails: %s", async failure => {
    const contexts: FakeContext[] = [];
    vi.stubGlobal("AudioContext", class extends FakeContext {
      constructor() {
        super();
        contexts.push(this);
        this.resume = vi.fn(() => {
          if (failure === "throw") throw new Error("Blocked");
          if (failure === "reject") return Promise.reject(new Error("Blocked"));
          return Promise.resolve();
        });
      }
    });
    const controller = createAudioController();
    controller.update(forest);
    expect(await controller.enable()).toBe(false);
    expect(contexts[0]!.close).toHaveBeenCalledOnce();
    expect(contexts[0]!.nodes).toHaveLength(0);
    await controller.disable();
  });
});

describe("audio loading boundary", () => {
  function sourcesUnder(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? sourcesUnder(path) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
    });
  }

  it("keeps audio out of app / shared components and has no runtime import of world", () => {
    // Source grep includes static imports, dynamic imports, re-exports and require.
    // B2-081 (Lead): the lazy sound bridge is the one shell module allowed to reach features/audio;
    // WorldEntry only reaches it through a dynamic import (checked in sound-loading.test).
    const bridge = resolve("src/components/portfolio/sound");
    for (const path of [...sourcesUnder(resolve("src/app")), ...sourcesUnder(resolve("src/components"))]) {
      if (path.startsWith(bridge)) continue;
      expect(readFileSync(path, "utf8"), path).not.toMatch(/["'][^"'\n]*(?:features\/audio|\.\.\/audio)(?:\/[^"'\n]*)?["']/);
    }
    for (const path of sourcesUnder(resolve("src/features/audio"))) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/(?:setInterval|setTimeout|fetch|localStorage|sessionStorage)\s*\(/);
      const runtimeSource = source.replace(/import type\s+[\s\S]*?;/g, "");
      expect(runtimeSource, path).not.toMatch(/(?:from\s*|import\s*\()["'][^"']*world/);
    }
  });
});
