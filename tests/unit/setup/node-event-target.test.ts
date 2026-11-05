import { expect, it } from "vitest";

// Guards the setup workaround (tests/unit/setup/node-event-target.ts): Node 24.22 kept boolean-capture listeners.
it("removes listeners registered with a boolean capture flag, in every form", () => {
  for (const [add, remove] of [[true, true], [{ capture: true }, true], [true, { capture: true }], [false, false]] as const) {
    const target = new EventTarget();
    let calls = 0;
    const listener = () => { calls++; };
    target.addEventListener("ping", listener, add);
    target.removeEventListener("ping", listener, remove);
    target.dispatchEvent(new Event("ping"));
    expect(calls, `${JSON.stringify(add)} / ${JSON.stringify(remove)}`).toBe(0);
  }
});
