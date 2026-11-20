import { expect, it } from "vitest";
import { frequencyFor, keyForCode, midiFor, noteName, PIANO_KEYS, shiftOctave } from "../../../src/components/portfolio/piano/keymap";

it("QF-06 maps the home row to white keys and the row above to black keys, from C4", () => {
  expect(PIANO_KEYS).toHaveLength(18);
  expect(noteName(midiFor(keyForCode("KeyA")!, 0))).toBe("C4");
  expect(noteName(midiFor(keyForCode("KeyW")!, 0))).toBe("C♯4");
  expect(noteName(midiFor(keyForCode("KeyK")!, 0))).toBe("C5");
  expect(noteName(midiFor(keyForCode("Quote")!, 0))).toBe("F5");
  expect(PIANO_KEYS.filter(key => key.black).map(key => key.label).join("")).toBe("WETYUOP");
  expect(keyForCode("KeyQ")).toBeUndefined();
  expect(frequencyFor(69)).toBeCloseTo(440);
  expect(frequencyFor(60)).toBeCloseTo(261.63, 1);
});

it("QF-06 Z / X shift the octave within two octaves either way", () => {
  let octave = 0;
  for (let i = 0; i < 5; i++) octave = shiftOctave(octave, "KeyZ");
  expect(octave).toBe(-2);
  expect(noteName(midiFor(keyForCode("KeyA")!, octave))).toBe("C2");
  for (let i = 0; i < 9; i++) octave = shiftOctave(octave, "KeyX");
  expect(octave).toBe(2);
  expect(shiftOctave(1, "KeyA")).toBe(1);
});
