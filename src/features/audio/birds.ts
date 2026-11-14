/** Listener-relative source samples, in metres; no world runtime dependency. */
export interface BirdListener {
  readonly distance: number;
  readonly pan: number;
  readonly species: number;
  readonly evening: number;
  /** Camera-space metres, matching Web Audio's default forward direction (-Z). */
  readonly position?: readonly [number, number, number];
}

export function birdLevel(sample: BirdListener): number {
  if (![sample.distance, sample.pan, sample.evening].every(Number.isFinite)) return 0;
  const t = Math.max(0, Math.min(1, 1 - Math.max(0, sample.distance - 2) / 32));
  return t * t * (3 - 2 * t);
}

/** Original synthesized call contours: short whistles, warbling phrases, gull cries. */
export function birdPhrase(species: number, random: () => number) {
  const kind = ((Math.floor(species) % 3) + 3) % 3;
  const pitch = [2700, 1900, 850][kind]! * (0.92 + random() * 0.16);
  const duration = [0.28, 0.55, 0.7][kind]!;
  const contour = kind === 0 ? [1, 1.35, 0.92] : kind === 1 ? [1, 1.22, 0.97, 1.3, 0.94] : [1, 1.6, 1.25, 0.8];
  return { pitch, duration, contour };
}

export type BirdHabitat = "forest" | "coast" | "other";
export const BIRD_CLIPS = {
  tailorbird: [1, 2, 3, 4],
  sparrow: [1, 2, 3, 4, 5],
  "magpie-robin": [1, 2, 3],
  bulbul: [1, 2, 3],
  gull: [1, 2, 3],
} as const;
type RecordedSpecies = keyof typeof BIRD_CLIPS;
const FOREST_SPECIES = ["tailorbird", "sparrow", "magpie-robin", "bulbul"] as const;

/** Owned by the opt-in graph. Neither construction nor import starts a request. */
function recordings(context: AudioContext) {
  const pending = new Map<RecordedSpecies, Promise<AudioBuffer[]>>();
  const abort = new AbortController();
  let disposed = false;
  return {
    load(species: RecordedSpecies): Promise<AudioBuffer[]> {
      if (disposed || context.state !== "running" || typeof context.decodeAudioData !== "function") return Promise.resolve([]);
      let request = pending.get(species);
      if (!request) {
        request = Promise.all(BIRD_CLIPS[species].map(async index => {
          try {
            const response = await fetch(`/audio/birds/${species}-${index}.ogg`, { signal: abort.signal });
            if (!response.ok || disposed) return undefined;
            const bytes = await response.arrayBuffer();
            if (disposed) return undefined;
            const buffer = await context.decodeAudioData(bytes);
            return !disposed && buffer.duration > 0 ? buffer : undefined;
          } catch {
            // Offline, unsupported codec, and aborted requests all retain synthesis.
            return undefined;
          }
        })).then(buffers => disposed ? [] : buffers.filter((buffer): buffer is AudioBuffer => !!buffer));
        pending.set(species, request);
      }
      return request;
    },
    dispose() {
      disposed = true;
      abort.abort();
      pending.clear();
    },
  };
}

/** One positioned voice on the audio clock, shared by recordings and fallback. */
export function createBirdVoice(context: AudioContext, output: AudioNode, random: () => number) {
  const bank = recordings(context);
  const pan = context.createPanner();
  pan.panningModel = "HRTF";
  pan.rolloffFactor = 0; // birdLevel already supplies distance attenuation.
  pan.connect(output);
  let sample: BirdListener | undefined;
  let habitat: BirdHabitat | undefined;
  let enabled = false, disposed = false;
  let bird: { source: AudioScheduledSourceNode; envelope: GainNode } | undefined;

  function release(stop: boolean) {
    if (!bird) return;
    const { source, envelope } = bird;
    bird = undefined;
    source.onended = null;
    if (stop) source.stop(context.currentTime);
    source.disconnect();
    envelope.disconnect();
  }

  function attach(source: AudioScheduledSourceNode, start: number, duration: number, peak: number) {
    const envelope = context.createGain();
    const voice = { source, envelope };
    bird = voice;
    envelope.gain.setValueAtTime(0, context.currentTime);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(peak, start + 0.03);
    envelope.gain.setValueAtTime(peak, start + Math.max(0.03, duration - 0.04));
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(envelope);
    envelope.connect(pan);
    source.onended = () => {
      if (bird !== voice) return;
      release(false);
      schedule();
    };
    source.start(start);
    source.stop(start + duration);
    return voice;
  }

  function schedule() {
    if (disposed || !enabled || bird) return;
    const evening = sample ? Math.max(0, Math.min(1, sample.evening)) : 0;
    const start = context.currentTime + (4 + random() * 5) * (1 + evening * 3);
    const phrase = sample ? birdPhrase(sample.species, random) : undefined;
    const duration = phrase?.duration ?? 0.12 + random() * 0.12;
    const pitch = phrase?.pitch ?? 1800 + random() * 1400;
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(pitch, start);
    if (phrase) {
      phrase.contour.slice(1).forEach((ratio, index) => oscillator.frequency.linearRampToValueAtTime(pitch * ratio, start + duration * (index + 1) / (phrase.contour.length - 1)));
    } else {
      oscillator.frequency.linearRampToValueAtTime(pitch + 650, start + duration * 0.35);
      oscillator.frequency.linearRampToValueAtTime(pitch - 200, start + duration);
    }
    const fallback = attach(oscillator, start, duration, 0.12);
    const coastal = habitat === "coast" || (!habitat && sample?.species === 2);
    const species = coastal ? "gull" : FOREST_SPECIES[Math.floor(random() * FOREST_SPECIES.length)]!;
    const clipChoice = random(), playbackRate = 0.97 + random() * 0.06;
    void bank.load(species).then(buffers => {
      // Late network/decode callbacks cannot restart a muted or relocated voice.
      // A slow load waits for the next phrase rather than cutting a call in half.
      if (disposed || !enabled || bird !== fallback || context.currentTime >= start || !buffers.length) return;
      const buffer = buffers[Math.floor(clipChoice * buffers.length)]!;
      release(true);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(playbackRate, start);
      attach(source, start, buffer.duration / playbackRate, 0.7);
    });
  }

  return {
    update(level: number, next?: BirdListener, nextHabitat?: BirdHabitat) {
      if (disposed) return;
      if (next?.species !== sample?.species || nextHabitat !== habitat) release(true);
      sample = next;
      habitat = nextHabitat;
      const p = next && Number.isFinite(next.pan) ? Math.max(-1, Math.min(1, next.pan)) : 0;
      const position = next?.position?.every(Number.isFinite) ? next.position : [p, 0, -Math.sqrt(1 - p * p)];
      [pan.positionX, pan.positionY, pan.positionZ].forEach((param, axis) => {
        param.cancelAndHoldAtTime(context.currentTime);
        param.linearRampToValueAtTime(position[axis]!, context.currentTime + 0.06);
      });
      enabled = Number.isFinite(level) && level > 0 && (!next || birdLevel(next) > 0);
      if (enabled) schedule();
      else release(true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      enabled = false;
      bank.dispose();
      release(true);
      pan.disconnect();
    },
  };
}
