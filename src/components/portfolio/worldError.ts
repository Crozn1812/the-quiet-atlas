type Lifecycle = {
  generation: { current: number };
  teardown: { current: (() => void) | undefined };
  recover: () => void;
};

export function listenWorldError(target: EventTarget, lifecycle: Lifecycle) {
  const listener = () => {
    lifecycle.generation.current++;
    try {
      lifecycle.teardown.current?.();
    } finally {
      lifecycle.teardown.current = undefined;
      lifecycle.recover();
    }
  };
  target.addEventListener("tqa:world-error", listener);
  return () => target.removeEventListener("tqa:world-error", listener);
}
