import { clampUnit, type AmbienceMix } from "./mix";

export const MIX_RAMP_SECONDS = 1.5;
export const DEFAULT_MASTER_VOLUME = 0.35;

export interface Ambience {
  setMix(mix: AmbienceMix): void;
  setMasterVolume(volume: number): void;
  /** Stops and disconnects every node. A later setMix rebuilds the graph. */
  mute(): void;
  /** Terminal, idempotent cleanup; the caller still owns the AudioContext. */
  dispose(): void;
}

function randomFromSeed(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Track the ramp ourselves so rapid retargets hold the actual interpolated value. */
function fader(context: AudioContext, param: AudioParam, initial: number) {
  let from = initial;
  let target = initial;
  let start = context.currentTime;
  let end = start;
  param.setValueAtTime(initial, start);
  return (value: number) => {
    const next = clampUnit(value);
    if (next === target) return;
    const now = context.currentTime;
    const progress = end === start ? 1 : clampUnit((now - start) / (end - start));
    from += (target - from) * progress;
    target = next;
    start = now;
    end = now + MIX_RAMP_SECONDS;
    param.cancelScheduledValues(now);
    param.setValueAtTime(from, now);
    param.linearRampToValueAtTime(target, end);
  };
}

function createGraph(context: AudioContext, seed: number, volume: number) {
  const nodes = new Set<AudioNode>();
  const sources = new Set<AudioScheduledSourceNode>();
  const own = <T extends AudioNode>(node: T): T => {
    nodes.add(node);
    return node;
  };
  const ownSource = <T extends AudioScheduledSourceNode>(node: T): T => {
    sources.add(node);
    return own(node);
  };
  const master = own(context.createGain());
  const masterFade = fader(context, master.gain, volume);
  master.connect(context.destination);
  const channels = {
    stream: own(context.createGain()), wind: own(context.createGain()),
    birds: own(context.createGain()), sea: own(context.createGain()),
  };
  const fades = Object.fromEntries(Object.entries(channels).map(([key, node]) => {
    node.connect(master);
    return [key, fader(context, node.gain, 0)];
  })) as Record<keyof AmbienceMix, (value: number) => void>;

  // One locally generated mono buffer, shared by three differently filtered loops.
  const noiseRandom = randomFromSeed(seed);
  const noise = context.createBuffer(1, Math.ceil(context.sampleRate * 4), context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = noiseRandom() * 2 - 1;

  function modulate(param: AudioParam, frequency: number, depth: number) {
    const oscillator = ownSource(context.createOscillator());
    const amount = own(context.createGain());
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    amount.gain.setValueAtTime(depth, context.currentTime);
    oscillator.connect(amount);
    amount.connect(param);
    oscillator.start(context.currentTime);
  }

  function noiseLayer(channel: GainNode, type: BiquadFilterType, frequency: number, level: number, offset: number) {
    const source = ownSource(context.createBufferSource());
    const filter = own(context.createBiquadFilter());
    const envelope = own(context.createGain());
    source.buffer = noise;
    source.loop = true;
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, context.currentTime);
    filter.Q.setValueAtTime(0.7, context.currentTime);
    envelope.gain.setValueAtTime(level, context.currentTime);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(channel);
    source.start(context.currentTime, offset);
    return { filter, envelope };
  }

  const stream = noiseLayer(channels.stream, "bandpass", 1100, 0.22, 0);
  modulate(stream.filter.frequency, 0.08, 240);
  const wind = noiseLayer(channels.wind, "lowpass", 480, 0.18, 1.1);
  modulate(wind.envelope.gain, 0.055, 0.1);
  const sea = noiseLayer(channels.sea, "lowpass", 700, 0.19, 2.3);
  const waveRandom = randomFromSeed(seed ^ 0x5ea);
  // A positive sine envelope swells once every seeded 6–9 seconds.
  modulate(sea.envelope.gain, 1 / (6 + waveRandom() * 3), 0.17);

  const birdRandom = randomFromSeed(seed ^ 0xb17d);
  let bird: { oscillator: OscillatorNode; envelope: GainNode } | undefined;
  let birdsEnabled = false;
  let disposed = false;

  function releaseBird(stop: boolean) {
    if (!bird) return;
    const { oscillator, envelope } = bird;
    bird = undefined;
    oscillator.onended = null;
    if (stop) oscillator.stop(context.currentTime);
    oscillator.disconnect();
    envelope.disconnect();
    sources.delete(oscillator);
    nodes.delete(oscillator);
    nodes.delete(envelope);
  }

  function scheduleBird() {
    if (disposed || !birdsEnabled || bird) return;
    // Only one chirp is queued. onended schedules its successor on the audio clock,
    // so suspension/background throttling cannot accumulate a burst of catch-up calls.
    const start = context.currentTime + 4 + birdRandom() * 5;
    const duration = 0.12 + birdRandom() * 0.12;
    const pitch = 1800 + birdRandom() * 1400;
    const oscillator = ownSource(context.createOscillator());
    const envelope = own(context.createGain());
    bird = { oscillator, envelope };
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(pitch, start);
    oscillator.frequency.linearRampToValueAtTime(pitch + 650, start + duration * 0.35);
    oscillator.frequency.linearRampToValueAtTime(pitch - 200, start + duration);
    envelope.gain.setValueAtTime(0, context.currentTime);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(0.12, start + 0.025);
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    oscillator.connect(envelope);
    envelope.connect(channels.birds);
    oscillator.onended = () => {
      if (bird?.oscillator !== oscillator) return;
      releaseBird(false);
      scheduleBird();
    };
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  return {
    setMix(mix: AmbienceMix) {
      for (const key of Object.keys(channels) as (keyof AmbienceMix)[]) fades[key](mix[key]);
      birdsEnabled = clampUnit(mix.birds) > 0;
      if (birdsEnabled) scheduleBird();
      else releaseBird(true);
    },
    setMasterVolume: masterFade,
    dispose() {
      if (disposed) return;
      disposed = true;
      birdsEnabled = false;
      releaseBird(true);
      for (const source of sources) {
        source.onended = null;
        source.stop(context.currentTime);
      }
      for (const node of nodes) node.disconnect();
      sources.clear();
      nodes.clear();
    },
  };
}

/** No files, fetches, browser globals or timers. AudioContext ownership stays outside. */
export function createAmbience(context: AudioContext, options: { seed?: number } = {}): Ambience {
  let graph: ReturnType<typeof createGraph> | undefined;
  let volume = DEFAULT_MASTER_VOLUME;
  let disposed = false;
  function mute() {
    graph?.dispose();
    graph = undefined;
  }
  return {
    setMix(mix) {
      if (disposed) return;
      graph ??= createGraph(context, options.seed ?? 0x71a5, volume);
      graph.setMix(mix);
    },
    setMasterVolume(value) {
      if (disposed) return;
      volume = clampUnit(value);
      graph?.setMasterVolume(volume);
    },
    mute,
    dispose() {
      disposed = true;
      mute();
    },
  };
}
