/**
 * Deterministic PRNG (sfc32). Battles must reproduce exactly from a stored
 * server seed, so Math.random is never used in rule code.
 */
export type RngState = readonly [number, number, number, number];

export interface Rng {
  /** Uniform 32-bit unsigned integer. */
  nextUint32(): number;
  /** Uniform integer in [0, maxExclusive), without modulo bias. */
  nextInt(maxExclusive: number): number;
  /** Current internal state; persist it between phase requests and pass to restoreRng. */
  state(): RngState;
}

/** Starts a new generator from a server-generated seed. */
export function createRng(seed: RngState): Rng {
  const rng = restoreRng(seed);
  // Discard early outputs so similar seeds diverge.
  for (let i = 0; i < 12; i++) rng.nextUint32();
  return rng;
}

/** Continues a generator exactly where a persisted state left off. */
export function restoreRng(state: RngState): Rng {
  let [a, b, c, d] = state.map((n) => n >>> 0) as [number, number, number, number];

  const nextUint32 = (): number => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t;
  };

  return {
    nextUint32,
    nextInt(maxExclusive) {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
        throw new RangeError(`maxExclusive must be an integer in [1, 2^32], got ${maxExclusive}`);
      }
      const limit = 2 ** 32 - (2 ** 32 % maxExclusive);
      let x = nextUint32();
      while (x >= limit) x = nextUint32();
      return x % maxExclusive;
    },
    state: () => [a, b, c, d],
  };
}

/** Fisher–Yates shuffle; returns a new array and leaves the input untouched. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
