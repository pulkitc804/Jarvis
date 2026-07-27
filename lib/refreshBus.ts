"use client";

// Tiny pub/sub so a single "Refresh" button can force every polling widget to
// re-fetch immediately, instead of waiting for its own interval.
type Listener = () => void;
const listeners = new Set<Listener>();

export function onRefresh(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function triggerRefresh(): void {
  for (const fn of listeners) fn();
}
