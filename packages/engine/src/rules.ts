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
  /** Hand size; unused cards stay in hand and the hand refills to this after each phase. */
  handSize: number;
  startingHp: number;
  /** Cards played each phase: the leader plus maxSelected − 1 spaces behind it. */
  maxSelected: number;
  /** At most this many chain-drawn cards can count in one phase. */
  maxChainDraws: number;
  /** Attack multiplier by number of counted cards (index 0 = leader alone); stays at the last value beyond. */
  comboMultipliers: readonly number[];
  advantageMultiplier: number;
  /** Each type beats the type it maps to. Order is provisional. */
  beats: Readonly<Record<CardType, CardType>>;
}

export const RULES_V0: RuleConfig = {
  ruleVersion: "0.6.0-draft",
  rng: "sfc32",
  deckSize: 32,
  slotSize: 8,
  handSize: 8,
  startingHp: 3000,
  maxSelected: 5,
  maxChainDraws: 5,
  comboMultipliers: [1, 1.1, 1.2, 1.3, 1.5],
  advantageMultiplier: 1.2,
  beats: { heavy: "light", light: "magic", magic: "heavy" },
};

/** Version of the defender AI strategy in battle.ts. */
export const AI_STRATEGY_VERSION = "0.4.0";
