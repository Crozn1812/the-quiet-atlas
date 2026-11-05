// Node 24.22 (the CI runtime) fails to remove a listener registered with a boolean `capture: true`
// when removeEventListener also receives the boolean `true`:
//   t.addEventListener("a", f, true); t.removeEventListener("a", f, true); // f still fires on Node 24.22
// The object form `{ capture: true }` is removed correctly, and the DOM standard treats both forms as
// identical. Our unit tests use in-memory DOMs built on Node's EventTarget, so a stale capture listener
// survived unmount there and swallowed later key events (CI runs 41955505444, 41963333179; Node 26 and
// browsers are unaffected). Normalising the boolean to the object form restores standard behaviour.
const original = EventTarget.prototype.removeEventListener;
EventTarget.prototype.removeEventListener = function removeEventListener(
  this: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject | null,
  options?: boolean | EventListenerOptions,
) {
  return original.call(this, type, listener, typeof options === "boolean" ? { capture: options } : options);
};
