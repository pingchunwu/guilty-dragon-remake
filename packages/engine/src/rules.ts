import type { CardType } from "./types";

/**
 * Versioned rule configuration. Only confirmed (or explicitly provisional)
 * values live here; TBD rules are added once decided, under a new version.
 * See docs/development-spec.md §6a.
 */
export interface RuleConfig {
  ruleVersion: string;
  /** Seedable PRNG algorithm used for every random step in this version. */
  rng: "sfc32";
  deckSize: number;
  slotSize: number;
  /** Provisional new-game decision (original reportedly dealt 8). */
  phaseHandSize: number;
  startingHp: number;
  /** Leader plus supports. */
  maxSelected: number;
  /** Attack multiplier by number of selected cards (index 0 = 1 card). */
  comboMultipliers: readonly number[];
  advantageMultiplier: number;
  /** Each type beats the type it maps to. Order is provisional. */
  beats: Readonly<Record<CardType, CardType>>;
}

export const RULES_V0: RuleConfig = {
  ruleVersion: "0.2.0-draft",
  rng: "sfc32",
  deckSize: 32,
  slotSize: 8,
  phaseHandSize: 5,
  startingHp: 1000,
  maxSelected: 5,
  comboMultipliers: [1, 1.1, 1.2, 1.3, 1.5],
  advantageMultiplier: 1.2,
  beats: { heavy: "light", light: "magic", magic: "heavy" },
};

/** Version of the defender AI strategy in battle.ts. */
export const AI_STRATEGY_VERSION = "0.2.0";
