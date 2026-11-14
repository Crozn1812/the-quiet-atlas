import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BIRD_CLIPS, createBirdVoice } from "../../../src/features/audio/birds";
import { ambienceMixAt } from "../../../src/features/audio/mix";

class Param {
  values: { value: number; time: number }[] = [];
  setValueAtTime(value: number, time: number) { this.values.push({ value, time }); }
  linearRampToValueAtTime(value: number, time: number) { this.values.push({ value, time }); }
  cancelAndHoldAtTime() {}
}
class Node {
  gain = new Param();
  frequency = new Param();
  playbackRate = new Param();
  positionX = new Param();
  positionY = new Param();
  positionZ = new Param();
  panningModel = "equalpower";
  rolloffFactor = 1;
  type = "sine";
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn<(time: number) => void>();
  stop = vi.fn<(time: number) => void>();
  constructor(readonly kind: "oscillator" | "buffer" | "gain" | "pan") {}
}
const decoded = { duration: 2.5 } as AudioBuffer;
class Context {
  currentTime = 10;
  state: AudioContextState = "running";
  nodes: Node[] = [];
  decodeAudioData = vi.fn(async () => decoded);
  create(kind: Node["kind"]) { const node = new Node(kind); this.nodes.push(node); return node; }
  createOscillator() { return this.create("oscillator"); }
  createBufferSource() { return this.create("buffer"); }
  createGain() { return this.create("gain"); }
  createPanner() { return this.create("pan"); }
  live(kind: Node["kind"]) { return this.nodes.filter(node => node.kind === kind && node.onended); }
}
const sample = { distance: 4, pan: -0.6, species: 0, evening: 0, position: [-3, 2, -5] as const };
const response = () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }) as Response;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function setup(random: () => number = () => 0.5) {
  const context = new Context();
  const voice = createBirdVoice(context as unknown as AudioContext, new Node("gain") as unknown as AudioNode, random);
  return { context, voice };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("deferred recorded bird voice", () => {
  it("keeps construction, silence, suspended contexts, and out-of-range birds free of requests", async () => {
    const fetcher = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>(async () => response());
    vi.stubGlobal("fetch", fetcher);
    const { context, voice } = setup();
    expect(fetcher).not.toHaveBeenCalled();
    voice.update(0, sample, "forest");
    voice.update(1, { ...sample, distance: Infinity }, "forest");
    context.state = "suspended";
    voice.update(1, sample, "forest");
    await flush();
    expect(fetcher).not.toHaveBeenCalled();
    voice.dispose();
  });

  it("replaces a queued fallback with decoded mono audio at the same start, using HRTF and +/-3% pitch", async () => {
    const fetcher = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>(async () => response());
    vi.stubGlobal("fetch", fetcher);
    const { context, voice } = setup(() => 0.999);
    voice.update(1, sample, "forest");
    const fallback = context.live("oscillator")[0]!;
    const start = fallback.start.mock.calls[0]![0];
    await flush();
    const clip = context.live("buffer")[0]!;
    expect(clip.buffer).toBe(decoded);
    expect(clip.start).toHaveBeenCalledWith(start);
    expect(clip.playbackRate.values[0]!.value).toBeCloseTo(1.02994);
    expect(clip.stop.mock.calls[0]![0] - start).toBeCloseTo(2.5 / 1.02994);
    expect(fallback.stop).toHaveBeenLastCalledWith(context.currentTime);
    expect(fallback.disconnect).toHaveBeenCalledOnce();
    const pan = context.nodes.find(node => node.kind === "pan")!;
    expect(pan.panningModel).toBe("HRTF");
    expect(pan.rolloffFactor).toBe(0);
    expect([pan.positionX, pan.positionY, pan.positionZ].map(p => p.values.at(-1)!.value)).toEqual([-3, 2, -5]);
    expect(fetcher.mock.calls.map(args => args[0])).toEqual(["/audio/birds/bulbul-1.ogg", "/audio/birds/bulbul-2.ogg", "/audio/birds/bulbul-3.ogg"]);
    // Natural completion schedules one successor and reuses decoded buffers.
    context.currentTime = clip.stop.mock.calls[0]![0];
    clip.onended!();
    await flush();
    expect(context.live("buffer")).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(clip.disconnect).toHaveBeenCalledOnce();
    voice.dispose();
    voice.dispose();
    expect(context.nodes.every(node => node.disconnect.mock.calls.length === 1)).toBe(true);
    expect(fetcher.mock.calls.every(args => (args[1] as RequestInit).signal?.aborted)).toBe(true);
  });

  it.each([0, 0.26, 0.51, 0.76])("selects all four inland species, never gulls (random=%s)", async random => {
    const fetcher = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>(async () => response());
    vi.stubGlobal("fetch", fetcher);
    const { voice } = setup(() => random);
    voice.update(1, { ...sample, species: 2 }, "forest");
    await flush();
    const species = ["tailorbird", "sparrow", "magpie-robin", "bulbul"][Math.floor(random * 4)];
    expect(fetcher.mock.calls[0]![0]).toBe(`/audio/birds/${species}-1.ogg`);
    voice.dispose();
  });

  it("uses the biome for coastal gulls, changes species on travel, and spaces evening calls further apart", async () => {
    const fetcher = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>(async () => response());
    vi.stubGlobal("fetch", fetcher);
    const { context, voice } = setup(() => 0);
    voice.update(1, sample, "forest");
    await flush();
    const morning = context.live("buffer")[0]!;
    expect(morning.playbackRate.values[0]!.value).toBe(0.97);
    const morningRest = morning.start.mock.calls[0]![0] - context.currentTime;
    const coast = ambienceMixAt({ distanceToRiver: 100, distanceToSea: 0, zoneBiome: "coast-dusk", timeOfDay: 1, bird: { ...sample, evening: 1 } });
    voice.update(coast.birds, coast.bird, coast.birdHabitat);
    await flush();
    const gull = context.live("buffer")[0]!;
    expect(morning.disconnect).toHaveBeenCalledOnce();
    expect(gull.start.mock.calls[0]![0] - context.currentTime).toBe(morningRest * 4);
    expect(fetcher.mock.calls.slice(-3).map(args => args[0])).toEqual(["/audio/birds/gull-1.ogg", "/audio/birds/gull-2.ogg", "/audio/birds/gull-3.ogg"]);
    voice.dispose();
  });

  it.each(["offline", "http", "decode"])("retains synthesis on %s failure without retry storms", async failure => {
    const fetcher = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>(async () => {
      if (failure === "offline") throw new Error("offline");
      return { ...response(), ok: failure !== "http" };
    });
    vi.stubGlobal("fetch", fetcher);
    const { context, voice } = setup();
    if (failure === "decode") context.decodeAudioData.mockRejectedValue(new Error("unsupported"));
    voice.update(1, sample, "forest");
    await flush();
    expect(context.live("buffer")).toHaveLength(0);
    const fallback = context.live("oscillator")[0]!;
    context.currentTime = fallback.stop.mock.calls[0]![0];
    fallback.onended!();
    await flush();
    expect(context.live("oscillator")).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
    voice.dispose();
  });

  it("uses surviving clips if another clip fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ...response(), ok: url.endsWith("-2.ogg") })));
    const { context, voice } = setup();
    voice.update(1, sample, "forest");
    await flush();
    expect(context.live("buffer")).toHaveLength(1);
    voice.dispose();
  });

  it.each(["dispose", "silence", "travel", "already-playing"])("ignores late decode after %s", async action => {
    vi.stubGlobal("fetch", vi.fn(async () => response()));
    const { context, voice } = setup();
    let finish!: (buffer: AudioBuffer) => void;
    const decode = new Promise<AudioBuffer>(resolve => { finish = resolve; });
    context.decodeAudioData.mockReturnValue(decode);
    voice.update(1, sample, "forest");
    const old = context.live("oscillator")[0]!;
    await flush();
    if (action === "dispose") voice.dispose();
    if (action === "silence") voice.update(0, sample, "forest");
    if (action === "travel") voice.update(1, { ...sample, species: 2 }, "coast");
    if (action === "already-playing") context.currentTime = old.start.mock.calls[0]![0] + 0.01;
    finish(decoded);
    await flush();
    if (action === "travel") {
      // The old woodland response cannot replace the new coastal call.
      expect(context.live("buffer")).toHaveLength(1);
      expect(context.live("oscillator")).toHaveLength(0);
    } else {
      expect(context.live("buffer")).toHaveLength(0);
      expect(context.live("oscillator")).toHaveLength(action === "already-playing" ? 1 : 0);
    }
    voice.dispose();
  });
});

it("ships every runtime clip as mono Opus with exactly one CC0 inventory row", () => {
  const inventory = readFileSync("assets/LICENSES.csv", "utf8").split(/\r?\n/);
  for (const [species, indices] of Object.entries(BIRD_CLIPS)) for (const index of indices) {
    const path = `public/audio/birds/${species}-${index}.ogg`;
    const data = readFileSync(path);
    expect(data.subarray(0, 4).toString()).toBe("OggS");
    const header = data.indexOf("OpusHead");
    expect(header).toBeGreaterThan(0);
    expect(data[header + 9]).toBe(1);
    const rows = inventory.filter(row => row.startsWith(`"${path}",`));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('"CC0-1.0"');
    expect(rows[0]).toContain("https://commons.wikimedia.org/wiki/File:");
  }
});
