import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAmbienceBridge } from "@/components/portfolio/sound/ambience-bridge";
import { createAmbience } from "@/features/audio/ambience";

vi.mock("@/features/audio/ambience", () => ({ createAmbience: vi.fn() }));

const mix = { stream: 0.7, wind: 0.2, birds: 0.4, sea: 0.1 };
const graphs: { setMix: ReturnType<typeof vi.fn>; mute: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; setMasterVolume: ReturnType<typeof vi.fn> }[] = [];
const contexts: FakeContext[] = [];
class FakeContext {
  state = "suspended";
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
  constructor() { contexts.push(this); }
}
function emit(target: EventTarget, detail: unknown = mix) {
  target.dispatchEvent(new CustomEvent("tqa:ambience", { detail }));
}
beforeEach(() => {
  contexts.length = graphs.length = 0;
  vi.stubGlobal("AudioContext", FakeContext);
  vi.mocked(createAmbience).mockImplementation(() => {
    const graph = { setMix: vi.fn(), mute: vi.fn(), dispose: vi.fn(), setMasterVolume: vi.fn() };
    graphs.push(graph);
    return graph;
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("lazy ambience bridge", () => {
  it("constructs no context until enable; resumes synchronously and stays silent on Welcome", async () => {
    const controller = createAmbienceBridge();
    expect(contexts).toHaveLength(0);
    const enabled = controller.enable();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.resume).toHaveBeenCalledOnce();
    expect(await enabled).toBe(true);
    controller.update(mix);
    expect(graphs[0]!.setMix).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("forwards the exact mix only from the connected world, drops events while off and removes listeners", async () => {
    const target = new EventTarget();
    const other = new EventTarget();
    const add = vi.spyOn(target, "addEventListener");
    const remove = vi.spyOn(target, "removeEventListener");
    const controller = createAmbienceBridge();
    const update = vi.spyOn(controller, "update");
    controller.connect(target);
    emit(target);
    expect(contexts).toHaveLength(0);
    await controller.enable();
    expect(graphs[0]!.setMix).not.toHaveBeenCalled();
    emit(other);
    expect(graphs[0]!.setMix).not.toHaveBeenCalled();
    emit(target);
    expect(update).toHaveBeenLastCalledWith(mix);
    expect(graphs[0]!.setMix).toHaveBeenCalledExactlyOnceWith(mix);
    controller.disable();
    expect(graphs[0]!.dispose).toHaveBeenCalledOnce();
    expect(contexts[0]!.close).toHaveBeenCalledOnce();
    emit(target, { ...mix, wind: 1 });
    await controller.enable();
    expect(graphs[1]!.setMix).not.toHaveBeenCalled();
    emit(target);
    expect(graphs[1]!.setMix).toHaveBeenCalledExactlyOnceWith(mix);
    controller.dispose();
    expect(remove).toHaveBeenCalledWith("tqa:ambience", add.mock.calls[0]![1]);
    update.mockClear();
    emit(target);
    expect(update).not.toHaveBeenCalled();
    expect(contexts[1]!.close).toHaveBeenCalledOnce();
    controller.dispose();
    expect(contexts[1]!.close).toHaveBeenCalledOnce();
    expect(await controller.enable()).toBe(false);
  });

  it("rejects malformed mixes and disconnects an old world", async () => {
    const old = new EventTarget();
    const target = new EventTarget();
    const controller = createAmbienceBridge();
    controller.connect(old);
    await controller.enable();
    controller.connect(target);
    emit(old);
    for (const detail of [null, {}, { ...mix, sea: NaN }, { ...mix, wind: Infinity }, { ...mix, birds: -1 }, { ...mix, stream: 1.1 }, { ...mix, wind: "1" }]) emit(target, detail);
    expect(graphs[0]!.setMix).not.toHaveBeenCalled();
    emit(target, { stream: 0, wind: 1, birds: 0, sea: 1 });
    expect(graphs[0]!.setMix).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it("retains a mix while resuming, but cancellation cannot revive an old session", async () => {
    const target = new EventTarget();
    const controller = createAmbienceBridge();
    controller.connect(target);
    const first = controller.enable();
    emit(target);
    expect(graphs[0]!.setMix).not.toHaveBeenCalled();
    await first;
    expect(graphs[0]!.setMix).toHaveBeenCalledExactlyOnceWith(mix);
    controller.disable();
    const cancelled = controller.enable();
    controller.dispose();
    expect(await cancelled).toBe(false);
    expect(graphs[1]!.setMix).not.toHaveBeenCalled();
    expect(contexts[1]!.close).toHaveBeenCalledOnce();
  });

  it("handles unsupported and rejected audio without an unhandled rejection", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const unsupported = createAmbienceBridge();
    expect(await unsupported.enable()).toBe(false);
    unsupported.dispose();
    vi.stubGlobal("AudioContext", class extends FakeContext {
      resume = vi.fn(async () => { throw new Error("blocked"); });
    });
    const blocked = createAmbienceBridge();
    expect(await blocked.enable()).toBe(false);
    expect(graphs[0]!.dispose).toHaveBeenCalledOnce();
    expect(contexts[0]!.close).toHaveBeenCalledOnce();
    blocked.dispose();
  });

  it.each(["throw", "stay-suspended"])("releases audio when resume fails: %s", async failure => {
    vi.stubGlobal("AudioContext", class extends FakeContext {
      resume = vi.fn(() => {
        if (failure === "throw") throw new Error("blocked");
        return Promise.resolve();
      });
    });
    const controller = createAmbienceBridge();
    expect(await controller.enable()).toBe(false);
    expect(graphs[0]!.dispose).toHaveBeenCalledOnce();
    expect(contexts[0]!.close).toHaveBeenCalledOnce();
    controller.dispose();
  });
});
