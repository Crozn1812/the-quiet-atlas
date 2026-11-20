// QF-06: a small WebAudio piano. No samples are downloaded; every note is synthesized.

import { frequencyFor } from "./keymap";

interface Voice { stop(at: number): void }

/** Partials of a soft upright: fundamental plus decaying overtones. */
const PARTIALS: readonly [ratio: number, gain: number, decay: number][] = [
  [1, 1, 1], [2, 0.42, 0.7], [3, 0.2, 0.5], [4, 0.1, 0.35], [5.02, 0.05, 0.25],
];

export interface PianoSynth {
  noteOn(midi: number): void;
  noteOff(midi: number): void;
  allOff(): void;
  dispose(): void;
}

function impulse(context: AudioContext, seconds: number) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

export function createPianoSynth(): PianoSynth {
  const AudioContextClass = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const context = new AudioContextClass();
  const master = context.createDynamicsCompressor();
  master.threshold.value = -18;
  master.ratio.value = 4;
  const output = context.createGain();
  output.gain.value = 0.55;
  const reverb = context.createConvolver();
  reverb.buffer = impulse(context, 1.6);
  const wet = context.createGain();
  wet.gain.value = 0.18;
  master.connect(output);
  master.connect(reverb);
  reverb.connect(wet);
  wet.connect(output);
  output.connect(context.destination);
  const voices = new Map<number, Voice>();

  function start(midi: number): Voice {
    const now = context.currentTime;
    const frequency = frequencyFor(midi);
    // Higher notes ring shorter, like real strings.
    const ring = Math.max(1.2, 4.5 - (midi - 48) * 0.06);
    const tone = context.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.setValueAtTime(Math.min(12000, frequency * 9), now);
    tone.frequency.exponentialRampToValueAtTime(Math.max(600, frequency * 2.5), now + ring);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.32, now + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.12, now + 0.35);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + ring);
    tone.connect(envelope);
    envelope.connect(master);
    const oscillators = PARTIALS.map(([ratio, gain, decay]) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency * ratio;
      const level = context.createGain();
      level.gain.setValueAtTime(gain, now);
      level.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * 0.05), now + ring * decay);
      oscillator.connect(level);
      level.connect(tone);
      oscillator.start(now);
      oscillator.stop(now + ring + 0.1);
      return oscillator;
    });
    return {
      stop(at: number) {
        envelope.gain.cancelScheduledValues(at);
        envelope.gain.setValueAtTime(Math.max(0.0001, envelope.gain.value), at);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
        for (const oscillator of oscillators) {
          try { oscillator.stop(at + 0.4); } catch { /* already stopped */ }
        }
      },
    };
  }

  return {
    noteOn(midi) {
      if (context.state === "suspended") void context.resume();
      voices.get(midi)?.stop(context.currentTime);
      voices.set(midi, start(midi));
    },
    noteOff(midi) {
      voices.get(midi)?.stop(context.currentTime);
      voices.delete(midi);
    },
    allOff() {
      for (const voice of voices.values()) voice.stop(context.currentTime);
      voices.clear();
    },
    dispose() {
      this.allOff();
      void context.close();
    },
  };
}
