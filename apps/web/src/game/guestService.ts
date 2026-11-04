import {
  PLACEHOLDER_DEFAULT_DECK,
  PLACEHOLDER_ITEM_POOL,
  PLACEHOLDER_POOL,
  PLACEHOLDER_STARTER_LOADOUT,
  ITEM_MAX_LEVEL,
  RULES_V0,
  cardMaxLevel,
  createRng,
  drawTen,
  validateDeck,
  validateLoadout,
  type Collection,
  type Pool,
  type Rarity,
} from "@gdr/engine";
import type { Content } from "./content";
import { GameError, type GameService, type PlayerState } from "./types";

function randomSeed(): [number, number, number, number] {
  const seed = new Uint32Array(4);
  crypto.getRandomValues(seed);
  return [seed[0]!, seed[1]!, seed[2]!, seed[3]!];
}

/** Guest preview: in-memory only, gone on reload (guest progress is never saved). */
export function createGuestService({ cards, items }: Content): GameService {
  const collection: Collection = Object.fromEntries(
    Object.values(PLACEHOLDER_DEFAULT_DECK)
      .flat()
      .map((id) => [id, { level: 1, shards: 0, obtainedAt: new Date().toISOString() }]),
  );
  let state: PlayerState = {
    // shortcut: guests get 100 tickets for testing the gacha; switch back to STARTING_TICKETS before launch.
    tickets: 100,
    pity: 0,
    cards: collection,
    decks: { attack: PLACEHOLDER_DEFAULT_DECK, defense: PLACEHOLDER_DEFAULT_DECK },
    items: Object.fromEntries(
      Object.values(PLACEHOLDER_STARTER_LOADOUT)
        .filter((id) => id !== null)
        .map((id) => [id, { level: 1, shards: 0 }]),
    ),
    loadout: PLACEHOLDER_STARTER_LOADOUT,
  };
  const draws = new Map<string, ReturnType<typeof drawTen>["results"]>();
  function draw(key: string, pool: Pool, field: "cards" | "items") {
    const replay = draws.get(key);
    if (replay) return { results: replay, state };
    if (state.tickets < 1) throw new GameError("INSUFFICIENT_TICKETS");
    const maxLevel = (id: string) => {
      const card = cards.get(id);
      return field === "items" ? ITEM_MAX_LEVEL : card ? cardMaxLevel(card) : 1;
    };
    const guarantee = field === "cards" ? { rarityOf: (id: string) => cards.get(id)?.rarity, pity: state.pity } : undefined;
    const drawn = drawTen(state[field], pool, createRng(randomSeed()), maxLevel, guarantee);
    const now = new Date().toISOString();
    const stamped = Object.fromEntries(
      Object.entries(drawn.collection).map(([id, c]) => [id, { ...c, obtainedAt: state[field][id]?.obtainedAt ?? now }]),
    );
    state = { ...state, tickets: state.tickets - 1, pity: guarantee ? drawn.pity : state.pity, [field]: stamped };
    draws.set(key, drawn.results);
    return { results: drawn.results, state };
  }
  return {
    mode: "guest",
    async sync() {
      return state;
    },
    async drawTen(key) {
      return draw(key, PLACEHOLDER_POOL, "cards");
    },
    async drawItems(key) {
      return draw(key, PLACEHOLDER_ITEM_POOL, "items");
    },
    async rarityWeights() {
      const weights: Partial<Record<Rarity, number>> = {};
      for (const { id, weight } of PLACEHOLDER_POOL.entries) {
        const rarity = cards.get(id)?.rarity;
        if (rarity) weights[rarity] = (weights[rarity] ?? 0) + weight;
      }
      return weights;
    },
    async saveDeck(kind, deck) {
      const errors = validateDeck(deck, cards, RULES_V0, new Set(Object.keys(state.cards)));
      if (errors.length === 0) state = { ...state, decks: { ...state.decks, [kind]: deck } };
      return { ok: errors.length === 0, errors };
    },
    async saveLoadout(loadout) {
      const errors = validateLoadout(loadout, items, new Set(Object.keys(state.items)));
      if (errors.length === 0) state = { ...state, loadout };
      return { ok: errors.length === 0, errors };
    },
  };
}
