/**
 * Versioned rule configuration. Only confirmed (or explicitly provisional)
 * values live here; TBD rules are added once decided, under a new version.
 */
export interface RuleConfig {
  ruleVersion: string;
  /** Seedable PRNG algorithm used for every random step in this version. */
  rng: "sfc32";
  deckSize: number;
  slotSize: number;
  /** Provisional new-game decision (original reportedly dealt 8). */
  phaseHandSize: number;
}

export const RULES_V0: RuleConfig = {
  ruleVersion: "0.1.0-draft",
  rng: "sfc32",
  deckSize: 32,
  slotSize: 8,
  phaseHandSize: 5,
};
