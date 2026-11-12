import { Quaternion, Vector3, type PerspectiveCamera } from "three";
import { RAILING_COPY } from "../../i18n/railing";
import { createLeaningPose } from "../world/character/lean";
import type { Character } from "../world/character/runtime";
import type { WorldLocale } from "../world/copy";
import { HEIGHT } from "../world/scene";
import { RAIL_HEIGHT } from "../world/road/railing";
import { ROAD_LIFT } from "../world/road/layout";
import { surfaceHeight } from "../world/terrain/height";
import { isInputTarget, type KeyEventLike } from "./input";
import { pickTarget, type InteractionTarget } from "./targets";

const movement = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);
export function leanExitKey(code: string) { return code === "KeyE" || code === "Escape" || movement.has(code); }

/** Integration: begin via createInteraction.lookout; keydown BEFORE menu/interaction;
 * update AFTER normal camera+animator. Lock locomotion/camera input while active.
 * enabled must reflect app/intro/ending/vehicle gates, independently of active.
 * Call cancel on travel, pause, context loss and ending. No event listeners or storage.
 */
export function createRailingLookout(options: {
  container: HTMLElement; character: Character; camera: PerspectiveCamera;
  target: InteractionTarget | undefined; forward: Vector3;
  player(): Vector3; moveTo(position: Vector3): void; enabled(): boolean;
  reducedMotion(): boolean; locale(): WorldLocale; clearInput(): void;
}) {
  const { container, target, forward, camera } = options;
  const pose = createLeaningPose(options.character);
  const status = document.createElement("output");
  status.setAttribute("role", "status");
  Object.assign(status.style, { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clipPath: "inset(50%)" });
  container.appendChild(status);
  let style: HTMLStyleElement | undefined;
  function hideHud() {
    style ??= document.createElement("style");
    style.textContent = `.world-entry:has([data-world-lean="on"]) .world-hud,
      [data-world-lean="on"] [data-world-interaction-hint], [data-world-lean="on"] [data-hud-keys] { visibility:hidden; pointer-events:none; }`;
    container.appendChild(style);
  }
  const right = new Vector3(-forward.z, 0, forward.x);
  const stand = target ? new Vector3(target.position.x, target.position.y, target.position.z) : new Vector3();
  const contacts = [1, -1].map(sign => stand.clone().addScaledVector(forward, .45).addScaledVector(right, sign * .27)
    .add(new Vector3(0, RAIL_HEIGHT - HEIGHT, 0))) as [Vector3, Vector3];
  const view = stand.clone().addScaledVector(forward, -4.2).addScaledVector(right, -1.1).add(new Vector3(0, .65, 0));
  // Bisect the road-forward and dusk sun azimuths so the figure and sun share the frame.
  const look = stand.clone().addScaledVector(new Vector3(.8, 0, -.6).add(forward).normalize(), 18)
    .add(new Vector3(0, .35, 0));
  const from = new Vector3(), fromRotation = new Quaternion(), last = new Vector3(), lastRotation = new Quaternion();
  let active = false, disposed = false, elapsed = 0, blend = 0;
  function cancel() {
    if (!active) return;
    active = false; options.clearInput();
    delete container.dataset.worldLean; status.textContent = "";
    pose.update(false, forward, contacts, 0, true);
  }
  return {
    get active() { return active; },
    begin() {
      if (disposed || active || !target || !options.enabled() || !pickTarget(options.player(), [target], .9)) return false;
      stand.set(target.position.x, target.position.y, target.position.z);
      // The hint sits comfortably behind the collider; step into the authored
      // leaning pose only after E, keeping the hands within the rig's reach.
      stand.addScaledVector(forward, .4);
      stand.y = surfaceHeight(stand.x, stand.z) + ROAD_LIFT + HEIGHT;
      contacts.forEach((contact, i) => contact.copy(stand).addScaledVector(forward, .45)
        .addScaledVector(right, (i ? -1 : 1) * .27).add(new Vector3(0, RAIL_HEIGHT - HEIGHT, 0)));
      view.copy(stand).addScaledVector(forward, -4.2).addScaledVector(right, -1.1).add(new Vector3(0, .65, 0));
      look.copy(stand).addScaledVector(new Vector3(.8, 0, -.6).add(forward).normalize(), 18).add(new Vector3(0, .35, 0));
      active = true; elapsed = 0; blend = 0;
      from.copy(camera.position); fromRotation.copy(camera.quaternion);
      options.clearInput(); options.moveTo(stand.clone());
      hideHud();
      container.dataset.worldLean = "on";
      status.textContent = RAILING_COPY[options.locale()].active;
      return true;
    },
    cancel,
    keydown(event: KeyEventLike & { repeat?: boolean }) {
      if (!active || event.repeat || isInputTarget(event.target) || isInputTarget(document.activeElement) || !leanExitKey(event.code)) return false;
      cancel();
      // Movement must continue through the normal input reducer on the same keydown.
      return !movement.has(event.code);
    },
    update(dt: number) {
      if (disposed) return;
      if (active && !options.enabled()) cancel();
      const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .1)) : 0;
      const reduced = options.reducedMotion();
      if (active) {
        elapsed += step; blend = reduced ? 1 : Math.min(1, blend + step / .8);
        const eased = blend * blend * (3 - 2 * blend);
        options.character.root.position.copy(options.player());
        pose.update(true, forward, contacts, elapsed, reduced);
        camera.position.copy(view); camera.lookAt(look);
        camera.quaternion.slerpQuaternions(fromRotation, camera.quaternion.clone(), eased);
        camera.position.lerpVectors(from, view, eased);
        last.copy(camera.position); lastRotation.copy(camera.quaternion);
        const announcement = RAILING_COPY[options.locale()].active;
        if (status.textContent !== announcement) status.textContent = announcement;
      } else if (blend > 0) {
        blend = reduced ? 0 : Math.max(0, blend - step / .6);
        camera.position.lerp(last, blend);
        camera.quaternion.slerp(lastRotation, blend);
      }
    },
    dispose() { if (disposed) return; cancel(); disposed = true; status.remove(); style?.remove(); },
  };
}
