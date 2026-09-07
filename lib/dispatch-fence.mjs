const generations = new WeakMap();

// A cancellation invalidates preparation already in flight, while a later
// explicit prompt captures a fresh generation and can resume normally.
export function captureDispatchGuard(owner) {
  const generation = generations.get(owner) ?? 0;
  return () => {
    if (generation !== (generations.get(owner) ?? 0)) throw Object.assign(new Error("Prompt cancelled before native dispatch"), { code: "operation_cancelled" });
  };
}

export function cancelPendingDispatch(owner) {
  generations.set(owner, (generations.get(owner) ?? 0) + 1);
}
