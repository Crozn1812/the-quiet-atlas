import type { Page, TestInfo } from "@playwright/test";

interface VehicleDiagnostics {
  events: { ms: number; event: string; state: Record<string, string | null> }[];
}

type DiagnosticWindow = Window & { __vehicleDiagnostics?: VehicleDiagnostics };

/** Read-only evidence for SwiftShader runs; never changes focus, input or app state. */
export async function recordVehicleDiagnostics(page: Page) {
  await page.addInitScript(() => {
    const diagnostics: VehicleDiagnostics = { events: [] };
    (window as DiagnosticWindow).__vehicleDiagnostics = diagnostics;
    const attributes = ["data-world-build", "data-world-paused", "data-world-vehicle"];
    let previous = "";
    function record(event: string) {
      const world = document.querySelector("[data-world-chunk]");
      const state = Object.fromEntries(attributes.map(name => [name, world?.getAttribute(name) ?? null]));
      diagnostics.events.push({ ms: Math.round(performance.now()), event, state });
    }
    new MutationObserver(() => {
      const world = document.querySelector("[data-world-chunk]");
      const current = JSON.stringify(attributes.map(name => world?.getAttribute(name) ?? null));
      if (current !== previous) { previous = current; record("world-state"); }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: attributes });
    for (const name of ["focus", "blur"]) window.addEventListener(name, () => record(name));
    document.addEventListener("visibilitychange", () => record(`visibility:${document.visibilityState}`));
    document.addEventListener("click", event => {
      if ((event.target as Element).closest("button")?.textContent?.trim() === "Enter World") record("enter-world");
    }, true);
    for (const name of ["keydown", "keyup"] as const) window.addEventListener(name, event => {
      if (!event.repeat) record(`${name}:${event.code}`);
    }, true);
  });
}

export async function attachVehicleDiagnostics(page: Page, testInfo: TestInfo) {
  const evidence = await page.evaluate(() => {
    const world = document.querySelector<HTMLElement>("[data-world-chunk]");
    const journey = (world as HTMLElement & { __tqaJourney?: { position(): unknown; rider(): unknown } } | null)?.__tqaJourney;
    return {
      ...(window as DiagnosticWindow).__vehicleDiagnostics,
      final: { dataset: world?.dataset, position: journey?.position(), rider: journey?.rider(),
        focused: document.hasFocus(), visibility: document.visibilityState },
    };
  });
  await testInfo.attach("vehicle-diagnostics", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
  const entered = evidence.events?.find(entry => entry.event === "enter-world");
  const done = evidence.events?.find(entry => entry.state["data-world-build"] === "done");
  console.log(`[vehicle] ${testInfo.title}: build=done ${done && entered ? `${done.ms - entered.ms}ms after Enter World` : "NOT REACHED"}`);
}
