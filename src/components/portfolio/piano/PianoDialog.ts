// QF-06 (Duy, 20/11): "Ở khu vực này sẽ có nút bấm để chơi đàn piano bằng bàn phím, và cá nhân có thể
// tự chơi piano được luôn thông qua bàn phím của họ." The Quiet Shore overlay offers "Play the piano"; this modal
// keeps the world paused (no movement, no camera), maps the keyboard to notes and synthesizes them in WebAudio.
// Nothing is stored. Esc or × Close returns to the world.

import { pauseWorld, trapFocus } from "../worldMenuControls";
import { keyForCode, midiFor, noteName, OCTAVE_RANGE, PIANO_KEYS, shiftOctave } from "./keymap";
import { createPianoSynth, type PianoSynth } from "./synth";

const STYLE_ID = "tqa-piano-style";
const CSS = `
.tqa-piano { position: fixed; inset: auto 0 2.5rem 0; margin: 0 auto; width: min(46rem, calc(100vw - 2rem));
  padding: 1.25rem 1.25rem 1rem; border: 1px solid var(--ink, #2b2924); border-radius: 0.5rem;
  background: var(--paper, #efe7d6); color: var(--ink, #2b2924); box-shadow: 0 1rem 3rem rgb(0 0 0 / 0.35); }
.tqa-piano::backdrop { background: transparent; }
.tqa-piano header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 0.75rem; }
.tqa-piano h2 { margin: 0; font-size: 1.25rem; }
.tqa-piano p { margin: 0 0 0.75rem; font-size: 0.9rem; }
.tqa-piano-keys { position: relative; height: 10.5rem; display: flex; user-select: none; touch-action: none; }
.tqa-piano-key { position: relative; flex: 1; display: flex; align-items: flex-end; justify-content: center;
  padding: 0 0 0.5rem; border: 1px solid #2b2924; border-radius: 0 0 0.35rem 0.35rem; background: #fbf8f1;
  color: #2b2924; font: inherit; font-size: 0.8rem; cursor: pointer; }
.tqa-piano-key[data-black="true"] { position: absolute; top: 0; z-index: 1; width: 6%; height: 62%;
  background: #22201c; color: #efe7d6; border-color: #000; }
.tqa-piano-key[aria-pressed="true"] { background: #c9a35f; color: #2b2924; }
.tqa-piano-key:focus-visible { outline: 3px solid #2f6f8f; outline-offset: -3px; }
.tqa-piano-octave { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.75rem; font-size: 0.85rem; }
.tqa-piano button.tqa-piano-small { font: inherit; padding: 0.2rem 0.6rem; border: 1px solid currentColor; border-radius: 999px;
  background: transparent; color: inherit; cursor: pointer; }
`;

const COPY = {
  en: {
    title: "The seaside piano", close: "Close", octave: "Octave",
    help: "Play with your keyboard: A S D F G H J K L ; ' are the white keys, W E T Y U O P the black keys. Z / X change the octave. Esc returns to the world.",
    down: "Octave down (Z)", up: "Octave up (X)",
  },
  vi: {
    title: "Cây piano bên biển", close: "Đóng", octave: "Quãng tám",
    help: "Chơi bằng bàn phím: A S D F G H J K L ; ' là phím trắng, W E T Y U O P là phím đen. Z / X đổi quãng tám. Esc để quay lại thế giới.",
    down: "Hạ quãng tám (Z)", up: "Nâng quãng tám (X)",
  },
} as const;

export interface PianoHandle { open(): void; close(): void; readonly isOpen: boolean; dispose(): void }

export function mountPiano(container: HTMLElement, getLocale: () => "en" | "vi"): PianoHandle {
  // Built on first use: most visits never open the piano.
  let dialog!: HTMLDialogElement;
  function ensureDialog() {
    if (dialog) return;
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.append(style);
    }
    dialog = document.createElement("dialog");
    dialog.className = "tqa-piano";
    dialog.dataset.worldPiano = "closed";
    dialog.setAttribute("aria-labelledby", "tqa-piano-title");
    dialog.addEventListener("cancel", event => { event.preventDefault(); handle.close(); });
    container.parentElement?.append(dialog);
  }
  let synth: PianoSynth | undefined;
  let octave = 0;
  let isOpen = false;
  /** Sounding notes by source (a key code or a pointer id), so a held key survives an octave change. */
  const sounding = new Map<string, { midi: number; code: string }>();
  const buttons = new Map<string, HTMLButtonElement>();
  let octaveLabel: HTMLSpanElement;

  function build() {
    const copy = COPY[getLocale()];
    dialog.replaceChildren();
    buttons.clear();
    const header = document.createElement("header");
    const title = document.createElement("h2");
    title.id = "tqa-piano-title";
    title.textContent = copy.title;
    title.tabIndex = -1;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tqa-piano-small";
    close.textContent = `× ${copy.close}`;
    close.addEventListener("click", () => handle.close());
    header.append(title, close);
    const help = document.createElement("p");
    help.textContent = copy.help;
    const keys = document.createElement("div");
    keys.className = "tqa-piano-keys";
    const whites = PIANO_KEYS.filter(key => !key.black).length;
    let whiteIndex = 0;
    for (const key of PIANO_KEYS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tqa-piano-key";
      button.dataset.black = String(key.black);
      button.dataset.code = key.code;
      button.setAttribute("aria-pressed", "false");
      button.textContent = key.label;
      if (key.black) button.style.left = `calc(${(whiteIndex / whites) * 100}% - 3%)`;
      else whiteIndex++;
      button.addEventListener("pointerdown", event => {
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        press(`pointer:${event.pointerId}`, key.code);
      });
      const lift = (event: PointerEvent) => release(`pointer:${event.pointerId}`);
      button.addEventListener("pointerup", lift);
      button.addEventListener("pointercancel", lift);
      button.addEventListener("lostpointercapture", lift);
      // Enter/Space on a focused key plays it once (keyboard users without the letter layout).
      button.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (!event.repeat) press(`focus:${key.code}`, key.code);
      });
      button.addEventListener("keyup", event => { if (event.key === "Enter" || event.key === " ") release(`focus:${key.code}`); });
      buttons.set(key.code, button);
      keys.append(button);
    }
    const octaveRow = document.createElement("div");
    octaveRow.className = "tqa-piano-octave";
    const down = document.createElement("button");
    down.type = "button"; down.className = "tqa-piano-small"; down.textContent = "−"; down.setAttribute("aria-label", copy.down);
    down.addEventListener("click", () => setOctave(shiftOctave(octave, "KeyZ")));
    const up = document.createElement("button");
    up.type = "button"; up.className = "tqa-piano-small"; up.textContent = "+"; up.setAttribute("aria-label", copy.up);
    up.addEventListener("click", () => setOctave(shiftOctave(octave, "KeyX")));
    octaveLabel = document.createElement("span");
    octaveLabel.setAttribute("aria-live", "polite");
    octaveRow.append(down, octaveLabel, up);
    dialog.append(header, help, keys, octaveRow);
    setOctave(octave);
  }

  function setOctave(next: number) {
    octave = Math.max(-OCTAVE_RANGE, Math.min(OCTAVE_RANGE, next));
    const copy = COPY[getLocale()];
    if (octaveLabel) octaveLabel.textContent = `${copy.octave}: C${4 + octave}`;
    for (const key of PIANO_KEYS) buttons.get(key.code)?.setAttribute("aria-label", noteName(midiFor(key, octave)));
    dialog.dataset.pianoOctave = String(octave);
  }

  function refreshPressed() {
    const held = new Set([...sounding.values()].map(note => note.code));
    for (const [code, button] of buttons) button.setAttribute("aria-pressed", String(held.has(code)));
    const notes = [...new Set([...sounding.values()].map(note => note.midi))].sort((a, b) => a - b);
    dialog.dataset.pianoActive = notes.map(noteName).join(" ");
  }

  function press(source: string, code: string) {
    const key = keyForCode(code);
    if (!key || sounding.has(source)) return;
    synth ??= createPianoSynth();
    const midi = midiFor(key, octave);
    sounding.set(source, { midi, code });
    synth.noteOn(midi);
    refreshPressed();
  }

  function release(source: string) {
    const note = sounding.get(source);
    if (!note) return;
    sounding.delete(source);
    // Another source (key and mouse together) may still hold the same note.
    if (![...sounding.values()].some(other => other.midi === note.midi)) synth?.noteOff(note.midi);
    refreshPressed();
  }

  function releaseAll() {
    sounding.clear();
    synth?.allOff();
    refreshPressed();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!isOpen || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      handle.close();
      return;
    }
    if (event.key === "Tab") {
      const items = Array.from(dialog.querySelectorAll<HTMLElement>("button"));
      const next = trapFocus(items, document.activeElement as HTMLElement | null, event.shiftKey);
      event.stopImmediatePropagation();
      if (!next) return;
      event.preventDefault();
      next.focus();
      return;
    }
    if (event.code === "KeyZ" || event.code === "KeyX") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) setOctave(shiftOctave(octave, event.code));
      return;
    }
    if (!keyForCode(event.code)) return;
    // The piano owns its keys: W/A/S/D/E/J never reach movement, interaction or the journal.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) press(`key:${event.code}`, event.code);
  }

  function onKeyUp(event: KeyboardEvent) {
    if (!isOpen || !keyForCode(event.code)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    release(`key:${event.code}`);
  }

  const onBlur = () => releaseAll();

  const handle: PianoHandle = {
    get isOpen() { return isOpen; },
    open() {
      if (isOpen) return;
      isOpen = true;
      ensureDialog();
      build();
      pauseWorld(container, true);
      dialog.showModal();
      dialog.dataset.worldPiano = "open";
      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("keyup", onKeyUp, true);
      window.addEventListener("blur", onBlur);
      dialog.querySelector<HTMLElement>("#tqa-piano-title")?.focus();
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      releaseAll();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      dialog.close();
      dialog.dataset.worldPiano = "closed";
      pauseWorld(container, false);
      (container.querySelector<HTMLElement>("canvas") ?? container).focus();
    },
    dispose() {
      handle.close();
      synth?.dispose();
      synth = undefined;
      dialog?.remove();
    },
  };
  return handle;
}
