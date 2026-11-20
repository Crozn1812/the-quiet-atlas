// QF-06 (Duy, 20/11): play the seaside-porch piano with the computer keyboard.
// Layout-independent physical keys (KeyboardEvent.code), the common DAW layout:
// the home row plays white keys, the row above plays the black keys between them.

export interface PianoKey {
  /** Semitones above C4 (before the octave shift). */
  readonly semitone: number;
  readonly code: string;
  /** Printed on the on-screen key. */
  readonly label: string;
  readonly black: boolean;
}

const WHITE: readonly [string, string, number][] = [
  ["KeyA", "A", 0], ["KeyS", "S", 2], ["KeyD", "D", 4], ["KeyF", "F", 5], ["KeyG", "G", 7], ["KeyH", "H", 9],
  ["KeyJ", "J", 11], ["KeyK", "K", 12], ["KeyL", "L", 14], ["Semicolon", ";", 16], ["Quote", "'", 17],
];
const BLACK: readonly [string, string, number][] = [
  ["KeyW", "W", 1], ["KeyE", "E", 3], ["KeyT", "T", 6], ["KeyY", "Y", 8], ["KeyU", "U", 10],
  ["KeyO", "O", 13], ["KeyP", "P", 15],
];

export const PIANO_KEYS: readonly PianoKey[] = [
  ...WHITE.map(([code, label, semitone]) => ({ code, label, semitone, black: false })),
  ...BLACK.map(([code, label, semitone]) => ({ code, label, semitone, black: true })),
].sort((a, b) => a.semitone - b.semitone);

export const OCTAVE_DOWN = "KeyZ";
export const OCTAVE_UP = "KeyX";
export const OCTAVE_RANGE = 2;

const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;

export function keyForCode(code: string): PianoKey | undefined {
  return PIANO_KEYS.find(key => key.code === code);
}

/** MIDI note number: C4 = 60. */
export function midiFor(key: PianoKey, octave: number): number {
  return 60 + key.semitone + 12 * octave;
}

export function frequencyFor(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function noteName(midi: number): string {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function shiftOctave(octave: number, code: string): number {
  if (code === OCTAVE_DOWN) return Math.max(-OCTAVE_RANGE, octave - 1);
  if (code === OCTAVE_UP) return Math.min(OCTAVE_RANGE, octave + 1);
  return octave;
}
