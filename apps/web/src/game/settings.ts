import { useSyncExternalStore } from "react";

export type FxQuality = "high" | "low";

const KEY = "gdr.fxQuality";
const listeners = new Set<() => void>();

export function getFxQuality(): FxQuality {
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return "low";
  } catch {
    /* ignore */
  }
  try {
    return localStorage.getItem(KEY) === "low" ? "low" : "high";
  } catch {
    return "high";
  }
}

export function setFxQuality(q: FxQuality): void {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

export function useFxQuality(): FxQuality {
  return useSyncExternalStore(subscribe, getFxQuality);
}
