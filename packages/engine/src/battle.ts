import { createRng, restoreRng, shuffle, type Rng, type RngState } from "./rng";
import { AI_STRATEGY_VERSION, type RuleConfig } from "./rules";
import type { Armor, CardDefinition, CardType } from "./types";

/**
 * Multi-phase battle, rule version 0.2.0-draft (docs/development-spec.md §6a).
 * Pure and deterministic: the same seed, decks and selections always give the
 * same result. State is plain JSON so it can be stored between phase requests.
 */

export type SideId = "challenger" | "defender";
export const SIDES: readonly SideId[] = ["challenger", "defender"];
const other = (side: SideId): SideId => (side === "challenger" ? "defender" : "challenger");

export type Cards = ReadonlyMap<string, CardDefinition>;

export interface SideState {
  hp: number;
  armor: Armor;
  drawPile: string[];
  hand: string[];
  discard: string[];
  /** Drew the last card of its draw pile this phase. */
  ranOut: boolean;
}

export type BattleStatus = "active" | "challenger_won" | "defender_won";

export interface BattleState {
  ruleVersion: string;
  aiVersion: string;
  rng: RngState;
  phase: number;
  /** "deck_out" phases resolve without a selection. */
  kind: "normal" | "deck_out";
  sides: Record<SideId, SideState>;
  status: BattleStatus;
}

export interface Selection {
  leader: string;
  supports: string[];
}

export interface SideResult {
  /** Cards that counted: the selection in a normal phase, the whole hand on deck-out. */
  played: string[];
  leaderType: CardType | null;
  baseAttack: number;
  combo: number;
  advantage: boolean;
  attack: number;
  ranOut: boolean;
}

export interface PhaseResult {
  phase: number;
  kind: "normal" | "deck_out";
  sides: Record<SideId, SideResult>;
  winner: SideId | null;
  damage: number;
  /** Deck-out hits from one side go straight to HP. */
  ignoredArmor: boolean;
  hpAfter: Record<SideId, number>;
  reshuffled: SideId[];
}

export interface SideSetup {
  deck: readonly string[];
  armor: Armor;
}

export function startBattle(
  seed: RngState,
  challenger: SideSetup,
  defender: SideSetup,
  rules: RuleConfig,
): BattleState {
  const rng = createRng(seed);
  const side = (setup: SideSetup): SideState => ({
    hp: rules.startingHp,
    armor: setup.armor,
    drawPile: shuffle(setup.deck, rng),
    hand: [],
    discard: [],
    ranOut: false,
  });
  const sides = { challenger: side(challenger), defender: side(defender) };
  return deal({
    ruleVersion: rules.ruleVersion,
    aiVersion: AI_STRATEGY_VERSION,
    rng: rng.state(),
    phase: 1,
    kind: "normal",
    sides,
    status: "active",
  }, rules);
}

/** Draws each side's hand for the current phase. */
function deal(state: BattleState, rules: RuleConfig): BattleState {
  const sides = { ...state.sides };
  for (const id of SIDES) {
    const s = sides[id];
    const count = Math.min(rules.phaseHandSize, s.drawPile.length);
    sides[id] = {
      ...s,
      hand: s.drawPile.slice(0, count),
      drawPile: s.drawPile.slice(count),
      ranOut: s.drawPile.length <= rules.phaseHandSize,
    };
  }
  const kind = SIDES.some((id) => sides[id].ranOut) ? "deck_out" : "normal";
  return { ...state, sides, kind };
}

function cardOf(cards: Cards, id: string): CardDefinition {
  const card = cards.get(id);
  if (!card) throw new Error(`unknown card ${id}`);
  return card;
}

const perMille = (n: number) => Math.round(n * 1000);
const sumAttack = (ids: readonly string[], cards: Cards) => ids.reduce((sum, id) => sum + cardOf(cards, id).attack, 0);

export type SelectionError = "LEADER_NOT_IN_HAND" | "SUPPORT_NOT_IN_HAND" | "DUPLICATE" | "WRONG_COLOUR" | "TOO_MANY";

export function validateSelection(
  hand: readonly string[],
  selection: Selection,
  cards: Cards,
  rules: RuleConfig,
): SelectionError | null {
  if (!hand.includes(selection.leader)) return "LEADER_NOT_IN_HAND";
  const all = [selection.leader, ...selection.supports];
  if (new Set(all).size !== all.length) return "DUPLICATE";
  if (all.length > rules.maxSelected) return "TOO_MANY";
  const colour = cardOf(cards, selection.leader).type;
  for (const id of selection.supports) {
    if (!hand.includes(id)) return "SUPPORT_NOT_IN_HAND";
    if (cardOf(cards, id).type !== colour) return "WRONG_COLOUR";
  }
  return null;
}

/** Attack before advantage: floor(sum × combo). */
export function previewAttack(selected: readonly string[], cards: Cards, rules: RuleConfig): number {
  if (selected.length === 0) return 0;
  const combo = rules.comboMultipliers[Math.min(selected.length, rules.comboMultipliers.length) - 1]!;
  return Math.floor((sumAttack(selected, cards) * perMille(combo)) / 1000);
}

/**
 * Defender AI (AI_STRATEGY_VERSION): plays every card of one colour, choosing
 * the colour with the highest attack before advantage. Ties go heavy, light,
 * magic. It never sees the challenger's selection.
 */
export function aiSelect(hand: readonly string[], cards: Cards, rules: RuleConfig): Selection {
  let best: { ids: string[]; attack: number } | null = null;
  for (const type of ["heavy", "light", "magic"] as const) {
    const ids = hand
      .filter((id) => cardOf(cards, id).type === type)
      .sort((a, b) => cardOf(cards, b).attack - cardOf(cards, a).attack || a.localeCompare(b))
      .slice(0, rules.maxSelected);
    if (ids.length === 0) continue;
    const attack = previewAttack(ids, cards, rules);
    if (!best || attack > best.attack) best = { ids, attack };
  }
  if (!best) throw new Error("AI has an empty hand");
  const [leader, ...supports] = best.ids;
  return { leader: leader!, supports };
}

function normalSide(selected: string[], opponentLeader: CardType, cards: Cards, rules: RuleConfig): SideResult {
  const leaderType = cardOf(cards, selected[0]!).type;
  const combo = rules.comboMultipliers[Math.min(selected.length, rules.comboMultipliers.length) - 1]!;
  const advantage = rules.beats[leaderType] === opponentLeader;
  const baseAttack = sumAttack(selected, cards);
  const multiplier = perMille(combo) * (advantage ? perMille(rules.advantageMultiplier) : 1000);
  return {
    played: selected,
    leaderType,
    baseAttack,
    combo,
    advantage,
    attack: Math.floor((baseAttack * multiplier) / 1_000_000),
    ranOut: false,
  };
}

function reshuffle(side: SideState, rng: Rng): SideState {
  return {
    ...side,
    drawPile: shuffle([...side.drawPile, ...side.hand, ...side.discard], rng),
    hand: [],
    discard: [],
  };
}

/**
 * Resolves the current phase and deals the next one. `selection` is the
 * challenger's play in a normal phase and is ignored on deck-out.
 */
export function resolvePhase(
  state: BattleState,
  selection: Selection | null,
  cards: Cards,
  rules: RuleConfig,
): { state: BattleState; result: PhaseResult } {
  if (state.status !== "active") throw new Error("battle is over");
  if (state.ruleVersion !== rules.ruleVersion) throw new Error(`rule version mismatch: ${state.ruleVersion}`);
  const rng = restoreRng(state.rng);
  let sides = { ...state.sides };
  let sideResults: Record<SideId, SideResult>;
  let winner: SideId | null = null;
  let damage = 0;
  let ignoredArmor = false;
  const reshuffled: SideId[] = [];

  if (state.kind === "normal") {
    if (!selection) throw new Error("selection required");
    const error = validateSelection(sides.challenger.hand, selection, cards, rules);
    if (error) throw new Error(`invalid selection: ${error}`);
    const ai = aiSelect(sides.defender.hand, cards, rules);
    const picks = {
      challenger: [selection.leader, ...selection.supports],
      defender: [ai.leader, ...ai.supports],
    };
    sideResults = {
      challenger: normalSide(picks.challenger, cardOf(cards, ai.leader).type, cards, rules),
      defender: normalSide(picks.defender, cardOf(cards, selection.leader).type, cards, rules),
    };
    const { challenger: c, defender: d } = sideResults;
    if (c.attack !== d.attack) {
      winner = c.attack > d.attack ? "challenger" : "defender";
      damage = Math.max(0, sideResults[winner].attack - sides[other(winner)].armor.defense);
    }
  } else {
    const deckOut = (id: SideId): SideResult => {
      const total = sumAttack(sides[id].hand, cards);
      return { played: sides[id].hand, leaderType: null, baseAttack: total, combo: 1, advantage: false, attack: total, ranOut: sides[id].ranOut };
    };
    sideResults = { challenger: deckOut("challenger"), defender: deckOut("defender") };
    const out = SIDES.filter((id) => sides[id].ranOut);
    if (out.length === 1) {
      winner = out[0]!;
      damage = sideResults[winner].attack;
      ignoredArmor = true;
    } else {
      const { challenger: c, defender: d } = sideResults;
      if (c.attack !== d.attack) {
        winner = c.attack > d.attack ? "challenger" : "defender";
        damage = Math.max(0, sideResults[winner].attack - sides[other(winner)].armor.defense);
      }
    }
    reshuffled.push(...out);
  }

  if (winner) {
    const loser = other(winner);
    sides[loser] = { ...sides[loser], hp: Math.max(0, sides[loser].hp - damage) };
  }
  for (const id of SIDES) {
    sides[id] = { ...sides[id], discard: [...sides[id].discard, ...sides[id].hand], hand: [] };
  }
  for (const id of reshuffled) sides[id] = reshuffle(sides[id], rng);

  const status: BattleStatus =
    sides.defender.hp === 0 ? "challenger_won" : sides.challenger.hp === 0 ? "defender_won" : "active";
  let next: BattleState = { ...state, sides, status, rng: rng.state() };
  if (status === "active") next = deal({ ...next, phase: state.phase + 1 }, rules);

  return {
    state: next,
    result: {
      phase: state.phase,
      kind: state.kind,
      sides: sideResults,
      winner,
      damage,
      ignoredArmor,
      hpAfter: { challenger: sides.challenger.hp, defender: sides.defender.hp },
      reshuffled,
    },
  };
}
