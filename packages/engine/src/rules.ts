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
  /** 0.6.0: at most this many chain-drawn cards can count in one phase. 0.7.0 draws the leader's DRAW instead. */
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

/**
 * Rule 0.7.0-draft (docs/development-spec.md §6a): 4 charge spaces then the
 * leader's DRAW, the weapon of the leader's colour inside the multiplied total,
 * damage = attack difference reduced by defense %, deck-out adds all 3 weapons.
 */
export const RULES_V07: RuleConfig = { ...RULES_V0, ruleVersion: "0.7.0-draft" };

/** Version of the defender AI strategy in battle.ts used by new battles (rule 0.7.0-draft). */
export const AI_STRATEGY_VERSION = "0.5.0";
/** The defender AI that 0.6.0-draft battles keep. */
export const AI_STRATEGY_V04 = "0.4.0";
