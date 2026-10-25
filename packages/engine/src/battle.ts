import { createRng, restoreRng, shuffle, type Rng, type RngState } from "./rng";
import { AI_STRATEGY_VERSION, type RuleConfig } from "./rules";
import type { Armor, CardDefinition, CardType } from "./types";

/**
 * Multi-phase battle, rule version 0.3.0-draft (docs/development-spec.md §6a).
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
  /** Unplayed cards stay here between phases. */
  hand: string[];
  discard: string[];
  /** Draw pile was empty when this phase started. */
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

/** Leader plus up to four picks in order; picks of another colour block a chain space. */
export interface Selection {
  leader: string;
  supports: string[];
}

export interface ChainStep {
  card: string;
  /** Picked from the hand, or drawn from the deck during the chain. */
  from: "pick" | "draw";
  /** Same colour as the leader and added to the attack; otherwise it blocks a space. */
  counted: boolean;
}

export interface SideResult {
  /** Cards that counted: the chain's counted cards, or the whole hand on deck-out. */
  played: string[];
  /** Every card resolved this phase in order, leader first. Empty on deck-out. */
  chain: ChainStep[];
  blocks: number;
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
  return refill({
    ruleVersion: rules.ruleVersion,
    aiVersion: AI_STRATEGY_VERSION,
    rng: rng.state(),
    phase: 1,
    kind: "normal",
    sides,
    status: "active",
  }, rules);
}

/**
 * Tops each hand back up to the hand size. A side whose draw pile is empty
 * afterwards has run out, and the phase becomes a deck-out phase.
 */
function refill(state: BattleState, rules: RuleConfig): BattleState {
  const sides = { ...state.sides };
  for (const id of SIDES) {
    const s = sides[id];
    const count = Math.max(0, Math.min(rules.handSize - s.hand.length, s.drawPile.length));
    const drawPile = s.drawPile.slice(count);
    sides[id] = {
      ...s,
      hand: [...s.hand, ...s.drawPile.slice(0, count)],
      drawPile,
      ranOut: drawPile.length === 0,
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
const comboFor = (count: number, rules: RuleConfig) =>
  rules.comboMultipliers[Math.min(count, rules.comboMultipliers.length) - 1]!;

export type SelectionError = "LEADER_NOT_IN_HAND" | "SUPPORT_NOT_IN_HAND" | "DUPLICATE" | "TOO_MANY";

export function validateSelection(
  hand: readonly string[],
  selection: Selection,
  rules: RuleConfig,
): SelectionError | null {
  if (!hand.includes(selection.leader)) return "LEADER_NOT_IN_HAND";
  const all = [selection.leader, ...selection.supports];
  if (new Set(all).size !== all.length) return "DUPLICATE";
  if (all.length > rules.maxSelected) return "TOO_MANY";
  if (selection.supports.some((id) => !hand.includes(id))) return "SUPPORT_NOT_IN_HAND";
  return null;
}

/**
 * Attack of the picked cards before chain draws and advantage:
 * floor(sum of leader-colour picks × combo).
 */
export function previewAttack(selected: readonly string[], cards: Cards, rules: RuleConfig): number {
  if (selected.length === 0) return 0;
  const colour = cardOf(cards, selected[0]!).type;
  const counted = selected.filter((id) => cardOf(cards, id).type === colour);
  return Math.floor((sumAttack(counted, cards) * perMille(comboFor(counted.length, rules))) / 1000);
}

/**
 * Defender AI (AI_STRATEGY_VERSION): plays up to five cards of one colour,
 * highest attack first as leader, choosing the colour with the highest attack
 * before advantage. Ties go heavy, light, magic. Never picks blockers, and
 * never sees the challenger's selection.
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

/**
 * Resolves one side's chain. The leader always counts and draws nothing.
 * Every later card, picked or drawn, counts if it matches the leader's colour
 * and otherwise blocks one of the maxSelected − 1 spaces; then one card is
 * drawn onto the end of the chain, unless all spaces are blocked, the draw
 * pile is empty, or maxChainDraws drawn cards have counted or are waiting.
 * Drawn cards already waiting still resolve after the drawing stops.
 */
function runChain(side: SideState, picks: readonly string[], cards: Cards, rules: RuleConfig) {
  const leaderType = cardOf(cards, picks[0]!).type;
  const spaces = rules.maxSelected - 1;
  const drawPile = [...side.drawPile];
  const chain: ChainStep[] = [{ card: picks[0]!, from: "pick", counted: true }];
  const queue: Omit<ChainStep, "counted">[] = picks.slice(1).map((card) => ({ card, from: "pick" }));
  let blocks = 0;
  let countedDraws = 0;
  let waitingDraws = 0;
  for (let step = queue.shift(); step; step = queue.shift()) {
    if (step.from === "draw") waitingDraws--;
    const counted = cardOf(cards, step.card).type === leaderType;
    if (!counted) blocks++;
    else if (step.from === "draw") countedDraws++;
    chain.push({ ...step, counted });
    if (blocks < spaces && drawPile.length > 0 && countedDraws + waitingDraws < rules.maxChainDraws) {
      queue.push({ card: drawPile.shift()!, from: "draw" });
      waitingDraws++;
    }
  }
  return {
    chain,
    blocks: Math.min(blocks, spaces),
    side: {
      ...side,
      drawPile,
      hand: side.hand.filter((id) => !picks.includes(id)),
      discard: [...side.discard, ...chain.map((s) => s.card)],
    },
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
 * Resolves the current phase and refills hands for the next one. `selection`
 * is the challenger's play in a normal phase and is ignored on deck-out.
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
  const sides = { ...state.sides };
  let sideResults: Record<SideId, SideResult>;
  let winner: SideId | null = null;
  let damage = 0;
  let ignoredArmor = false;
  const reshuffled: SideId[] = [];

  if (state.kind === "normal") {
    if (!selection) throw new Error("selection required");
    const error = validateSelection(sides.challenger.hand, selection, rules);
    if (error) throw new Error(`invalid selection: ${error}`);
    const ai = aiSelect(sides.defender.hand, cards, rules);
    const picks: Record<SideId, string[]> = {
      challenger: [selection.leader, ...selection.supports],
      defender: [ai.leader, ...ai.supports],
    };
    const leaderTypes = {
      challenger: cardOf(cards, selection.leader).type,
      defender: cardOf(cards, ai.leader).type,
    };
    const resolveSide = (id: SideId): SideResult => {
      const run = runChain(sides[id], picks[id], cards, rules);
      sides[id] = run.side;
      const played = run.chain.filter((s) => s.counted).map((s) => s.card);
      const combo = comboFor(played.length, rules);
      const advantage = rules.beats[leaderTypes[id]] === leaderTypes[other(id)];
      const baseAttack = sumAttack(played, cards);
      const multiplier = perMille(combo) * (advantage ? perMille(rules.advantageMultiplier) : 1000);
      return {
        played,
        chain: run.chain,
        blocks: run.blocks,
        leaderType: leaderTypes[id],
        baseAttack,
        combo,
        advantage,
        attack: Math.floor((baseAttack * multiplier) / 1_000_000),
        ranOut: false,
      };
    };
    sideResults = { challenger: resolveSide("challenger"), defender: resolveSide("defender") };
    const { challenger: c, defender: d } = sideResults;
    if (c.attack !== d.attack) {
      winner = c.attack > d.attack ? "challenger" : "defender";
      damage = Math.max(0, sideResults[winner].attack - sides[other(winner)].armor.defense);
    }
  } else {
    const deckOut = (id: SideId): SideResult => {
      const total = sumAttack(sides[id].hand, cards);
      return {
        played: sides[id].hand,
        chain: [],
        blocks: 0,
        leaderType: null,
        baseAttack: total,
        combo: 1,
        advantage: false,
        attack: total,
        ranOut: sides[id].ranOut,
      };
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
    // Only sides that ran out use their hand; the other side keeps it.
    for (const id of out) sides[id] = reshuffle(sides[id], rng);
    reshuffled.push(...out);
  }

  if (winner) {
    const loser = other(winner);
    sides[loser] = { ...sides[loser], hp: Math.max(0, sides[loser].hp - damage) };
  }

  const status: BattleStatus =
    sides.defender.hp === 0 ? "challenger_won" : sides.challenger.hp === 0 ? "defender_won" : "active";
  let next: BattleState = { ...state, sides, status, rng: rng.state() };
  if (status === "active") next = refill({ ...next, phase: state.phase + 1 }, rules);

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
