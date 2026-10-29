import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFxQuality, setFxQuality } from "./settings";

function stub(reduced: boolean) {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: reduced }) });
}

describe("fx quality", () => {
  beforeEach(() => stub(false));
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to high", () => expect(getFxQuality()).toBe("high"));

  it("persists the choice", () => {
    setFxQuality("low");
    expect(getFxQuality()).toBe("low");
    setFxQuality("high");
    expect(getFxQuality()).toBe("high");
  });

  it("reduced motion forces low", () => {
    setFxQuality("high");
    stub(true);
    expect(getFxQuality()).toBe("low");
  });
});
