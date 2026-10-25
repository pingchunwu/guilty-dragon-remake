import { describe, expect, it } from "vitest";
import { createRng, restoreRng, shuffle } from "../src";

describe("createRng", () => {
  it("is deterministic for the same seed", () => {
    const a = createRng([1, 2, 3, 4]);
    const b = createRng([1, 2, 3, 4]);
    const seqA = Array.from({ length: 20 }, () => a.nextUint32());
    const seqB = Array.from({ length: 20 }, () => b.nextUint32());
    expect(seqA).toEqual(seqB);
  });

  it("differs for different seeds", () => {
    expect(createRng([1, 2, 3, 4]).nextUint32()).not.toBe(createRng([1, 2, 3, 5]).nextUint32());
  });

  it("resumes from a persisted state", () => {
    const rng = createRng([9, 8, 7, 6]);
    rng.nextUint32();
    const resumed = restoreRng(JSON.parse(JSON.stringify(rng.state())));
    expect(Array.from({ length: 10 }, () => resumed.nextUint32())).toEqual(
      Array.from({ length: 10 }, () => rng.nextUint32()),
    );
  });

  it("keeps nextInt within range", () => {
    const rng = createRng([5, 5, 5, 5]);
    for (let i = 0; i < 1000; i++) {
      const n = rng.nextInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });
});

describe("shuffle", () => {
  it("is a deterministic permutation", () => {
    const items = Array.from({ length: 32 }, (_, i) => i);
    const a = shuffle(items, createRng([1, 1, 1, 1]));
    const b = shuffle(items, createRng([1, 1, 1, 1]));
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
    expect(a).not.toEqual(items);
  });
});
