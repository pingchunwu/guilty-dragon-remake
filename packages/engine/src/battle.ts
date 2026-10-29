import { createRng, restoreRng, shuffle, type Rng, type RngState } from "./rng";
import { AI_STRATEGY_V04, AI_STRATEGY_VERSION, RULES_V07, type RuleConfig } from "./rules";
import { defenseOf, weaponAttackOf, type Equipment } from "./equipment";
import { SKILL_BY_ID, clampSkillLevel, skillValue, type SkillDefinition, type SkillEffect } from "./skills";
import { WEAPON_KINDS, type CardDefinition, type CardType } from "./types";

/**
 * Multi-phase battle, rule versions 0.6.0-draft and 0.7.0-draft (docs/development-spec.md §6a).
 * Pure and deterministic: the same seed, decks and selections always give the
 * same result. State is plain JSON so it can be stored between phase requests.
 */

export type SideId = "challenger" | "defender";
export const SIDES: readonly SideId[] = ["challenger", "defender"];
const other = (side: SideId): SideId => (side === "challenger" ? "defender" : "challenger");

export type Cards = ReadonlyMap<string, CardDefinition>;

export interface SideState {
  hp: number;
  /** Armor defense and weapon attack (already at item level) apply every phase. */
  equipment: Equipment;
  /** Owned card levels, which are skill levels; a missing card is level 1. */
  levels: Readonly<Record<string, number>>;
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

/** Leader plus four picks (five cards, or the whole hand if smaller); other colours block a space. */
export interface Selection {
  leader: string;
  supports: string[];
}

export interface ChainStep {
  card: string;
  /** Picked from the hand (0.7.0: a charge card), or drawn from the deck. */
  from: "pick" | "draw";
  /** Merges into the attack and frees its space. Otherwise it blocks the space. */
  counted: boolean;
  /** A blocker removed by 肅清 (purge), freeing its space. */
  purged?: boolean;
}

/** The leader's skill this phase. */
export interface SkillUse {
  /** Skill that took effect (the copied one for 模仿). */
  id: string;
  level: number;
  /** The leader's own skill when it copied another (模仿). */
  via?: string;
  /** Cancelled by the enemy's 護盾 (shield); nothing else applied. */
  blocked: boolean;
}

export interface SideResult {
  /** Cards that counted: the chain's counted cards, or the whole hand on deck-out. */
  played: string[];
  /** Every card resolved this phase in order, leader first. Empty on deck-out. */
  chain: ChainStep[];
  blocks: number;
  leaderType: CardType | null;
  skill: SkillUse | null;
  baseAttack: number;
  /** Combo count after skills (1–5) and its multiplier. */
  comboCount: number;
  combo: number;
  /** Colour multiplier after skills (1 when none). */
  advantageMultiplier: number;
  advantage: boolean;
  /**
   * Weapon power before skills; already included in `attack`. 0.6.0: the strongest
   * weapon, added after the multipliers. 0.7.0: the weapon of the leader's colour,
   * inside the multiplied total; on deck-out all three.
   */
  weaponAttack: number;
  /** 0.7.0: the weapon's power after both leaders' power skills (results stored before 2026-10-28 lack it). */
  skillWeapon?: number;
  /** Net attack change from both leaders' skills; already included in `attack`. */
  skillAttack: number;
  /** The part of skillAttack caused by the enemy leader's skill. */
  enemySkillAttack: number;
  attack: number;
  /** Defense after skills. 0.6.0: flat armor. 0.7.0: defense % (0–100). */
  defense: number;
  /** HP this side healed, paid (own skills) and lost to the enemy's direct damage. */
  healed: number;
  hpCost: number;
  hpDamageTaken: number;
  /** What skills did to this side's hand before the chain (counts only: PvP shows them to both players). */
  handChange: HandChange;
  /** 0.6.0: chain-drawn cards that could count. 0.7.0: the leader's DRAW. Both after draw skills. */
  drawLimit: number;
  ranOut: boolean;
}

export interface HandChange {
  discarded: number;
  /** Returned to the deck (選民主義, shuffles). */
  returned: number;
  drawn: number;
  /** The draw pile was shuffled. */
  shuffled: boolean;
}

const noChange = (): HandChange => ({ discarded: 0, returned: 0, drawn: 0, shuffled: false });

export interface PhaseResult {
  phase: number;
  kind: "normal" | "deck_out";
  sides: Record<SideId, SideResult>;
  winner: SideId | null;
  /** Damage dealt by the winner, after defense and every skill. */
  damage: number;
  /** Deck-out hits from one side go straight to HP (0.6.0 only; 0.7.0 final blows count defense). */
  ignoredArmor: boolean;
  /**
   * HP each side lost to this phase's attack (after defense and every skill).
   * Normal phases: only the loser. 0.7.0 deck-out: every side that was hit, so a double final blow hurts both.
   */
  damageTaken: Record<SideId, number>;
  hpAfter: Record<SideId, number>;
  reshuffled: SideId[];
}

export interface SideSetup {
  deck: readonly string[];
  equipment: Equipment;
  levels?: Readonly<Record<string, number>>;
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
    equipment: setup.equipment,
    levels: setup.levels ?? {},
    drawPile: shuffle(setup.deck, rng),
    hand: [],
    discard: [],
    ranOut: false,
  });
  const sides = { challenger: side(challenger), defender: side(defender) };
  return refill({
    ruleVersion: rules.ruleVersion,
    aiVersion: rules.ruleVersion === RULES_V07.ruleVersion ? AI_STRATEGY_VERSION : AI_STRATEGY_V04,
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
  rules.comboMultipliers[Math.max(1, Math.min(count, rules.comboMultipliers.length)) - 1]!;

/** A card's skill at its owner's level, or null. */
export function cardSkill(
  card: CardDefinition,
  levels: Readonly<Record<string, number>>,
): { skill: SkillDefinition; level: number } | null {
  const skill = card.skill ? SKILL_BY_ID.get(card.skill) : undefined;
  return skill ? { skill, level: clampSkillLevel(skill, levels[card.id] ?? 1) } : null;
}

/** Colours that merge into the attack under this leader: its own plus any its skill allows. */
export function chargeTypes(leader: CardDefinition, levels: Readonly<Record<string, number>> = {}): Set<CardType> {
  const types = new Set<CardType>([leader.type]);
  const effect = cardSkill(leader, levels)?.skill.effect;
  if (effect?.kind === "charge") for (const t of effect.types) types.add(t);
  return types;
}

export type SelectionError = "LEADER_NOT_IN_HAND" | "SUPPORT_NOT_IN_HAND" | "DUPLICATE" | "WRONG_COUNT";

/** Every phase plays exactly maxSelected cards, or the whole hand if it is smaller. */
export const requiredPicks = (hand: readonly string[], rules: RuleConfig) => Math.min(rules.maxSelected, hand.length);

export function validateSelection(
  hand: readonly string[],
  selection: Selection,
  rules: RuleConfig,
): SelectionError | null {
  if (!hand.includes(selection.leader)) return "LEADER_NOT_IN_HAND";
  const all = [selection.leader, ...selection.supports];
  if (new Set(all).size !== all.length) return "DUPLICATE";
  if (all.length !== requiredPicks(hand, rules)) return "WRONG_COUNT";
  if (selection.supports.some((id) => !hand.includes(id))) return "SUPPORT_NOT_IN_HAND";
  return null;
}

/**
 * Attack of the picked cards before chain draws, skills and advantage:
 * floor(sum of counted picks × combo). Counted colours default to the leader's.
 */
export function previewAttack(
  selected: readonly string[],
  cards: Cards,
  rules: RuleConfig,
  counts: ReadonlySet<CardType> = new Set(selected.length ? [cardOf(cards, selected[0]!).type] : []),
): number {
  if (selected.length === 0) return 0;
  const counted = selected.filter((id) => counts.has(cardOf(cards, id).type));
  return Math.floor((sumAttack(counted, cards) * perMille(comboFor(counted.length, rules))) / 1000);
}

/**
 * Defender AI. Rule 0.7.0-draft uses AI_STRATEGY_VERSION (aiSelectV05);
 * older rules keep AI_STRATEGY_V04: lead with the colour whose cards give
 * the highest attack before advantage (highest attack first; ties go heavy,
 * light, magic), then fill the remaining picks with the lowest-attack cards
 * of other colours. Both ignore skills and never see the challenger's selection.
 */
export function aiSelect(hand: readonly string[], cards: Cards, rules: RuleConfig): Selection {
  if (rules.ruleVersion === RULES_V07.ruleVersion) return aiSelectV05(hand, cards, rules);
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
  const chosen = best.ids;
  const fillers = hand
    .filter((id) => !chosen.includes(id))
    .sort((a, b) => cardOf(cards, a).attack - cardOf(cards, b).attack || a.localeCompare(b))
    .slice(0, requiredPicks(hand, rules) - chosen.length);
  const [leader, ...supports] = [...chosen, ...fillers];
  return { leader: leader!, supports };
}

/**
 * AI 0.5.0 (rule 0.7.0-draft): the colour with the most hand cards leads (ties:
 * higher total POW, then heavy, light, magic). Its highest-DRAW card is the
 * leader (ties: higher POW), so more same-colour draws can count. The 4 charge
 * picks are its other cards of that colour, highest POW first, then the
 * lowest-POW cards of other colours as blockers.
 */
function aiSelectV05(hand: readonly string[], cards: Cards, rules: RuleConfig): Selection {
  if (hand.length === 0) throw new Error("AI has an empty hand");
  const byPow = (a: string, b: string) => cardOf(cards, b).attack - cardOf(cards, a).attack || a.localeCompare(b);
  const groups = (["heavy", "light", "magic"] as const).map((type) => hand.filter((id) => cardOf(cards, id).type === type));
  const colour = groups.reduce((best, g) =>
    g.length > best.length || (g.length === best.length && sumAttack(g, cards) > sumAttack(best, cards)) ? g : best);
  const leader = [...colour].sort((a, b) => cardOf(cards, b).draw - cardOf(cards, a).draw || byPow(a, b))[0]!;
  const charges = colour.filter((id) => id !== leader).sort(byPow);
  const fillers = hand.filter((id) => !colour.includes(id)).sort((a, b) => byPow(b, a));
  return { leader, supports: [...charges, ...fillers].slice(0, requiredPicks(hand, rules) - 1) };
}

interface ChainOptions {
  /** Colours that merge into the attack. */
  counts: ReadonlySet<CardType>;
  /** Most chain-drawn cards that can count. */
  drawLimit: number;
  /** Blockers 肅清 removes once when every space is blocked. */
  purge: number;
}

/**
 * Resolves one side's chain. The leader sits in front and the other picks
 * fill the maxSelected − 1 spaces behind it, resolved in order. A counted card
 * merges into the attack and frees its space, and a new card is drawn from the
 * deck into the end of the row; any other card stays and blocks its space,
 * drawing nothing. The chain ends when every space is blocked, the draw pile
 * is empty, or drawLimit drawn cards have counted (a draw is only made while
 * counted plus waiting draws are under it). The picks have already left the hand.
 */
function runChain(side: SideState, picks: readonly string[], cards: Cards, rules: RuleConfig, options: ChainOptions) {
  const drawPile = [...side.drawPile];
  const chain: ChainStep[] = [{ card: picks[0]!, from: "pick", counted: true }];
  const queue: Omit<ChainStep, "counted">[] = picks.slice(1).map((card) => ({ card, from: "pick" }));
  const spaces = rules.maxSelected - 1;
  let blocks = 0;
  let countedDraws = 0;
  let waitingDraws = 0;
  let purge = options.purge;
  const draw = () => {
    if (drawPile.length > 0 && countedDraws + waitingDraws < options.drawLimit) {
      queue.push({ card: drawPile.shift()!, from: "draw" });
      waitingDraws++;
    }
  };
  for (let step = queue.shift(); step; step = queue.shift()) {
    if (step.from === "draw") waitingDraws--;
    const counted = options.counts.has(cardOf(cards, step.card).type);
    if (!counted) blocks++;
    else if (step.from === "draw") countedDraws++;
    chain.push({ ...step, counted });
    if (counted) draw();
    else if (blocks === spaces && purge > 0) {
      // Field full: remove the earliest blockers and draw into their spaces.
      for (const blocker of chain.filter((s) => !s.counted && !s.purged).slice(0, purge)) {
        blocker.purged = true;
        blocks--;
        draw();
      }
      purge = 0;
    }
  }
  return {
    chain,
    blocks,
    side: { ...side, drawPile, discard: [...side.discard, ...chain.map((s) => s.card)] },
  };
}

/**
 * Rule 0.7.0-draft: the picks after the leader are charge cards in the
 * maxSelected − 1 spaces, resolved in order; then the deck draws `drawLimit`
 * cards one at a time into free spaces. A counted card adds its POW and frees
 * its space; any other card blocks it. Drawing stops when the count is used,
 * every space is blocked, or the pile is empty. 肅清 fires once when every
 * space is blocked, removing the earliest blockers.
 */
function runCharge(side: SideState, picks: readonly string[], cards: Cards, rules: RuleConfig, options: ChainOptions) {
  const drawPile = [...side.drawPile];
  const chain: ChainStep[] = [{ card: picks[0]!, from: "pick", counted: true }];
  const spaces = rules.maxSelected - 1;
  let blocks = 0;
  let purge = options.purge;
  const place = (card: string, from: ChainStep["from"]) => {
    const counted = options.counts.has(cardOf(cards, card).type);
    chain.push({ card, from, counted });
    if (counted) return;
    blocks++;
    if (blocks === spaces && purge > 0) {
      for (const blocker of chain.filter((s) => !s.counted && !s.purged).slice(0, purge)) {
        blocker.purged = true;
        blocks--;
      }
      purge = 0;
    }
  };
  for (const card of picks.slice(1)) place(card, "pick");
  for (let left = options.drawLimit; left > 0 && blocks < spaces && drawPile.length > 0; left--) place(drawPile.shift()!, "draw");
  return {
    chain,
    blocks,
    side: { ...side, drawPile, discard: [...side.discard, ...chain.map((s) => s.card)] },
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

/** Moves cards from the hand back into the draw pile, shuffles it and draws as many. */
function returnAndRedraw(side: SideState, back: readonly string[], rng: Rng, withDiscard = false): SideState {
  if (back.length === 0 && !withDiscard) return side;
  const drawPile = shuffle([...side.drawPile, ...back, ...(withDiscard ? side.discard : [])], rng);
  return {
    ...side,
    hand: [...side.hand.filter((id) => !back.includes(id)), ...drawPile.slice(0, back.length)],
    drawPile: drawPile.slice(back.length),
    discard: withDiscard ? [] : side.discard,
  };
}

/** Hand cards to give up first: other colours, then lowest attack, then ID. */
function discardOrder(hand: readonly string[], leaderType: CardType, cards: Cards): string[] {
  const key = (id: string) => [cardOf(cards, id).type === leaderType ? 1 : 0, cardOf(cards, id).attack] as const;
  return [...hand].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    return ka[0] - kb[0] || ka[1] - kb[1] || a.localeCompare(b);
  });
}

interface Active {
  skill: SkillDefinition;
  level: number;
  use: SkillUse;
}

/**
 * Settles both leaders' skills: a 護盾 cancels the other leader's skill
 * (unless it is also a shield), then a 模仿 that was not cancelled becomes the
 * other leader's own skill (not a shield or mimic) at the mimic's level.
 */
function settleSkills(leaders: Record<SideId, CardDefinition>, sides: Record<SideId, SideState>): Record<SideId, Active | null> {
  const own = {
    challenger: cardSkill(leaders.challenger, sides.challenger.levels),
    defender: cardSkill(leaders.defender, sides.defender.levels),
  };
  const kind = (id: SideId) => own[id]?.skill.effect.kind;
  const settled = {} as Record<SideId, Active | null>;
  for (const id of SIDES) {
    const mine = own[id];
    if (!mine) {
      settled[id] = null;
      continue;
    }
    const blocked = kind(other(id)) === "shield" && kind(id) !== "shield";
    const theirs = own[other(id)];
    if (!blocked && mine.skill.effect.kind === "mimic" && theirs && !["mimic", "shield"].includes(theirs.skill.effect.kind)) {
      const level = clampSkillLevel(theirs.skill, mine.level);
      settled[id] = { skill: theirs.skill, level, use: { id: theirs.skill.id, level, via: mine.skill.id, blocked } };
    } else {
      settled[id] = { ...mine, use: { id: mine.skill.id, level: mine.level, blocked } };
    }
  }
  return settled;
}

/** Sum of a side's skill values whose effect matches. */
function total(active: Active | null, match: (e: SkillEffect) => boolean): number {
  if (!active || active.use.blocked || !match(active.skill.effect)) return 0;
  return skillValue(active.skill, active.level);
}

const effectOf = (active: Active | null): SkillEffect | null =>
  active && !active.use.blocked ? active.skill.effect : null;

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
  const v07 = rules.ruleVersion === RULES_V07.ruleVersion;
  const sides = { ...state.sides };
  let sideResults: Record<SideId, SideResult>;
  let winner: SideId | null = null;
  let damage = 0;
  let ignoredArmor = false;
  const damageTaken: Record<SideId, number> = { challenger: 0, defender: 0 };
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
    const leaders = {
      challenger: cardOf(cards, selection.leader),
      defender: cardOf(cards, ai.leader),
    };
    for (const id of SIDES) sides[id] = { ...sides[id], hand: sides[id].hand.filter((c) => !picks[id].includes(c)) };
    const active = settleSkills(leaders, sides);

    // 1. Leader-time hand and deck effects, challenger first.
    const changes = { challenger: noChange(), defender: noChange() };
    const recordRedraw = (t: SideId, returned: number) => {
      changes[t].returned += returned;
      changes[t].drawn += returned;
      changes[t].shuffled = true;
    };
    for (const id of SIDES) {
      const effect = effectOf(active[id]);
      if (!effect) continue;
      const value = skillValue(active[id]!.skill, active[id]!.level);
      const leaderType = leaders[id].type;
      if (effect.kind === "discard") {
        const out = discardOrder(sides[id].hand, leaderType, cards).slice(0, value);
        const s = sides[id];
        const drawn = effect.redraw ? s.drawPile.slice(0, out.length) : [];
        sides[id] = {
          ...s,
          hand: [...s.hand.filter((c) => !out.includes(c)), ...drawn],
          drawPile: s.drawPile.slice(drawn.length),
          discard: [...s.discard, ...out],
        };
        changes[id].discarded += out.length;
        changes[id].drawn += drawn.length;
      } else if (effect.kind === "elitism") {
        const back = sides[id].hand.filter((c) => cardOf(cards, c).type !== leaderType).slice(0, value);
        sides[id] = returnAndRedraw(sides[id], back, rng);
        if (back.length > 0) recordRedraw(id, back.length);
      } else if (effect.kind === "shuffle") {
        const targets = effect.target === "both" ? SIDES : [effect.target === "self" ? id : other(id)];
        for (const t of targets) {
          recordRedraw(t, sides[t].hand.length);
          sides[t] = returnAndRedraw(sides[t], sides[t].hand, rng, effect.scope === "all");
        }
      }
    }

    // 2. Chains (0.7.0: charge spaces, then the leader's DRAW).
    const chains = {} as Record<SideId, ReturnType<typeof runChain>>;
    const drawLimits = {} as Record<SideId, number>;
    for (const id of SIDES) {
      const drawLimit = Math.max(
        0,
        (v07 ? leaders[id].draw : rules.maxChainDraws) +
          total(active[id], (e) => e.kind === "draws" && e.target === "self") -
          total(active[other(id)], (e) => e.kind === "draws" && e.target === "enemy"),
      );
      const counts = new Set<CardType>([leaders[id].type]);
      const charge = effectOf(active[id]);
      if (charge?.kind === "charge") for (const t of charge.types) counts.add(t);
      drawLimits[id] = drawLimit;
      chains[id] = (v07 ? runCharge : runChain)(sides[id], picks[id], cards, rules, {
        counts,
        drawLimit,
        purge: total(active[id], (e) => e.kind === "purge"),
      });
      sides[id] = chains[id].side;
    }

    // 3. Colour multipliers: natural advantage, then 天秤, 凌駕, 不調.
    const advantage = {} as Record<SideId, number>;
    for (const id of SIDES) {
      advantage[id] = rules.beats[leaders[id].type] === leaders[other(id)].type ? rules.advantageMultiplier : 1;
    }
    const element = (id: SideId) => {
      const e = effectOf(active[id]);
      return e?.kind === "element" ? e.mode : null;
    };
    if (SIDES.some((id) => element(id) === "balance")) for (const id of SIDES) advantage[id] = 1;
    for (const id of SIDES) if (element(id) === "surpass") advantage[id] = rules.advantageMultiplier;
    for (const id of SIDES) if (element(id) === "slump" && advantage[other(id)] > 1) advantage[other(id)] = 1;

    // 4. Attack, defense and HP effects per side.
    const results = {} as Record<SideId, SideResult>;
    const hp = { challenger: sides.challenger.hp, defender: sides.defender.hp };
    const hpDamageTaken = { challenger: 0, defender: 0 };
    for (const id of SIDES) {
      const mine = active[id];
      const theirs = active[other(id)];
      const { chain, blocks } = chains[id];
      const played = chain.filter((s) => s.counted).map((s) => s.card);
      const comboCount = Math.max(
        1,
        Math.min(
          rules.comboMultipliers.length,
          played.length +
            total(mine, (e) => e.kind === "combo" && e.target === "self") -
            total(theirs, (e) => e.kind === "combo" && e.target === "enemy"),
        ),
      );
      const combo = comboFor(comboCount, rules);
      const baseAttack = sumAttack(played, cards);
      const weaponAttack = v07 ? (sides[id].equipment[leaders[id].type]?.attack ?? 0) : weaponAttackOf(sides[id].equipment);
      const cardAttack = Math.floor((baseAttack * perMille(combo) * perMille(advantage[id])) / 1_000_000);
      // 0.6.0 adds the weapon after the multipliers; 0.7.0 multiplies it in: floor(floor(total × colour) × combo).
      const attackWith = (weapon: number) =>
        v07
          ? Math.floor((Math.floor(((baseAttack + weapon) * perMille(advantage[id])) / 1000) * perMille(combo)) / 1000)
          : cardAttack + weapon;
      const chainAttack = attackWith(weaponAttack);

      const hpCostEffect = effectOf(mine);
      const hpCost = hpCostEffect?.kind === "hpCost" ? skillValue(mine!.skill, mine!.level) : 0;
      const ratio = hpCostEffect?.kind === "hpCost" ? hpCostEffect.ratio : 0;
      const ownPercent = total(
        mine,
        (e) => (e.kind === "power" && e.target === "self" && e.unit === "pct") || e.kind === "reckless",
      );
      const ownWeaponFlat = total(mine, (e) => e.kind === "power" && e.target === "self" && e.unit === "flat");
      const ownFlat =
        total(mine, (e) => e.kind === "board" && e.colour === "same") * (played.length - 1) +
        total(mine, (e) => e.kind === "board" && e.colour === "other") * blocks +
        Math.floor(hpCost * ratio);
      const enemyPercent = total(theirs, (e) => e.kind === "power" && e.target === "enemy" && e.unit === "pct");
      const enemyFlat = total(theirs, (e) => e.kind === "power" && e.target === "enemy" && e.unit === "flat");
      // Power skills change only the weapon's power, as in the original (武器パワー), and it can't go below 0.
      // Provisional (0.7.0): board and HP-for-attack bonuses stay outside the multipliers, as in 0.6.0.
      const weaponWith = (pct: number, weaponFlat: number) =>
        Math.max(0, Math.floor((weaponAttack * (100 + pct)) / 100) + weaponFlat);
      const withSkills = (pct: number, weaponFlat: number) => attackWith(weaponWith(pct, weaponFlat)) + ownFlat;
      const skillWeapon = weaponWith(ownPercent - enemyPercent, ownWeaponFlat - enemyFlat);
      const attack = withSkills(ownPercent - enemyPercent, ownWeaponFlat - enemyFlat);
      // Own skill alone, so the UI can credit each leader with its own effect.
      const ownAttack = withSkills(ownPercent, ownWeaponFlat);

      const defensePercent =
        total(mine, (e) => e.kind === "defense" && e.target === "self") -
        Math.floor(total(mine, (e) => e.kind === "reckless") / 4) -
        total(theirs, (e) => e.kind === "defense" && e.target === "enemy");
      // 0.7.0: armor % plus defense skills in percentage points; 0.6.0 scales flat armor by them.
      const defense = v07
        ? Math.max(0, Math.min(100, defenseOf(sides[id].equipment) + defensePercent))
        : Math.max(0, Math.floor((defenseOf(sides[id].equipment) * (100 + defensePercent)) / 100));

      // Heal, then pay HP, then hit the enemy; neither of the last two goes below 1.
      const heal =
        total(mine, (e) => e.kind === "heal" && e.unit === "flat") +
        Math.floor((rules.startingHp * total(mine, (e) => e.kind === "heal" && e.unit === "pct")) / 100);
      const before = hp[id];
      hp[id] = Math.min(rules.startingHp, hp[id] + heal);
      const healed = hp[id] - before;
      const paid = Math.min(hpCost, hp[id] - 1);
      hp[id] -= paid;
      const enemy = other(id);
      const hit =
        total(mine, (e) => e.kind === "hpDamage" && e.unit === "flat") +
        Math.floor((hp[enemy] * total(mine, (e) => e.kind === "hpDamage" && e.unit === "pct")) / 100);
      const dealt = Math.min(hit, hp[enemy] - 1);
      hp[enemy] -= dealt;
      hpDamageTaken[enemy] += dealt;

      results[id] = {
        played,
        chain,
        blocks,
        leaderType: leaders[id].type,
        skill: mine?.use ?? null,
        baseAttack,
        comboCount,
        combo,
        advantageMultiplier: advantage[id],
        advantage: advantage[id] > 1,
        weaponAttack,
        skillWeapon,
        skillAttack: attack - chainAttack,
        enemySkillAttack: attack - ownAttack,
        attack,
        defense,
        healed,
        hpCost: paid,
        hpDamageTaken: 0,
        handChange: changes[id],
        drawLimit: drawLimits[id],
        ranOut: false,
      };
    }
    for (const id of SIDES) {
      results[id].hpDamageTaken = hpDamageTaken[id];
      sides[id] = { ...sides[id], hp: hp[id] };
    }
    sideResults = results;

    // 5. Phase damage: winner's attack − loser's defense, then 追加傷害 etc., then the loser's 防護.
    // 0.7.0: the attack difference, reduced by the loser's defense %.
    const { challenger: c, defender: d } = sideResults;
    if (c.attack !== d.attack) {
      winner = c.attack > d.attack ? "challenger" : "defender";
      const loser = other(winner);
      const [w, l] = [sideResults[winner], sideResults[loser]];
      const raw = v07
        ? Math.floor(((w.attack - l.attack) * (100 - l.defense)) / 100)
        : Math.max(0, w.attack - l.defense);
      damage = Math.max(
        0,
        raw +
          total(active[winner], (e) => e.kind === "finalDamage" && e.unit === "flat") +
          Math.floor((raw * total(active[winner], (e) => e.kind === "finalDamage" && e.unit === "pct")) / 100) -
          total(active[loser], (e) => e.kind === "guard"),
      );
    }
  } else {
    const deckOut = (id: SideId): SideResult => {
      const e = sides[id].equipment;
      const weaponAttack = v07 ? WEAPON_KINDS.reduce((sum, k) => sum + (e[k]?.attack ?? 0), 0) : weaponAttackOf(e);
      const sum = sumAttack(sides[id].hand, cards);
      return {
        played: sides[id].hand,
        chain: [],
        blocks: 0,
        leaderType: null,
        skill: null,
        baseAttack: sum,
        comboCount: 1,
        combo: 1,
        advantageMultiplier: 1,
        advantage: false,
        weaponAttack,
        skillAttack: 0,
        enemySkillAttack: 0,
        attack: sum + weaponAttack,
        defense: defenseOf(sides[id].equipment),
        healed: 0,
        hpCost: 0,
        hpDamageTaken: 0,
        handChange: noChange(),
        drawLimit: 0,
        ranOut: sides[id].ranOut,
      };
    };
    sideResults = { challenger: deckOut("challenger"), defender: deckOut("defender") };
    const out = SIDES.filter((id) => sides[id].ranOut);
    if (v07) {
      // 0.7.0: every side that ran out lands its final blow, reduced by the target's defense %; both can be hit.
      // A tied double final blow with no skills deals equal damage to both, so winner is the harder hitter or null.
      for (const id of out) {
        const target = other(id);
        const dealt = Math.floor((sideResults[id].attack * (100 - sideResults[target].defense)) / 100);
        const guard = finalBlowGuard(sides[target], cards, dealt);
        damageTaken[target] = dealt - guard.amount;
        if (guard.card) sideResults[target].skill = guard.card;
      }
      // Both out and neither hits harder: no winner. Otherwise the side that dealt more.
      const dealtBy = (id: SideId) => damageTaken[other(id)];
      winner = dealtBy("challenger") === dealtBy("defender") ? null : dealtBy("challenger") > dealtBy("defender") ? "challenger" : "defender";
      if (winner) damage = dealtBy(winner);
      else damage = out.length ? dealtBy(out[0]!) : 0;
    } else {
      if (out.length === 1) {
        winner = out[0]!;
        damage = sideResults[winner].attack;
        ignoredArmor = true;
      } else {
        const { challenger: c, defender: d } = sideResults;
        if (c.attack !== d.attack) {
          winner = c.attack > d.attack ? "challenger" : "defender";
          damage = Math.max(0, sideResults[winner].attack - sideResults[other(winner)].defense);
        }
      }
      if (winner) {
        // Skills don't fire on deck-out, except a final-blow guard held in the hand.
        const guard = finalBlowGuard(sides[other(winner)], cards, damage);
        damage -= guard.amount;
        if (guard.card) sideResults[other(winner)].skill = guard.card;
        damageTaken[other(winner)] = damage;
      }
    }
    // Only sides that ran out use their hand; the other side keeps it.
    for (const id of out) sides[id] = reshuffle(sides[id], rng);
    reshuffled.push(...out);
  }

  if (state.kind === "normal" && winner) damageTaken[other(winner)] = damage;
  for (const id of SIDES) sides[id] = { ...sides[id], hp: Math.max(0, sides[id].hp - damageTaken[id]) };

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
      damageTaken,
      hpAfter: { challenger: sides.challenger.hp, defender: sides.defender.hp },
      reshuffled,
    },
  };
}

/** The strongest 一縷希望 / 守護神 among the hand's cards against `damage`. */
function finalBlowGuard(side: SideState, cards: Cards, damage: number): { amount: number; card: SkillUse | null } {
  let best: { amount: number; card: SkillUse | null } = { amount: 0, card: null };
  for (const id of side.hand) {
    const found = cardSkill(cardOf(cards, id), side.levels);
    if (!found || found.skill.effect.kind !== "finalBlowGuard") continue;
    const value = skillValue(found.skill, found.level);
    const amount = Math.min(damage, found.skill.effect.unit === "flat" ? value : Math.floor((damage * value) / 100));
    if (amount > best.amount) best = { amount, card: { id: found.skill.id, level: found.level, blocked: false } };
  }
  return best;
}
