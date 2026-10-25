import {
  PLACEHOLDER_DEFAULT_DECK,
  PLACEHOLDER_ITEM_POOL,
  PLACEHOLDER_POOL,
  PLACEHOLDER_STARTER_LOADOUT,
  ITEM_MAX_LEVEL,
  RULES_V0,
  STARTING_TICKETS,
  cardMaxLevel,
  createRng,
  drawTen,
  validateDeck,
  validateLoadout,
  type Collection,
  type Pool,
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
      .map((id) => [id, { level: 1, shards: 0 }]),
  );
  let state: PlayerState = {
    tickets: STARTING_TICKETS,
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
    const drawn = drawTen(state[field], pool, createRng(randomSeed()), maxLevel);
    state = { ...state, tickets: state.tickets - 1, [field]: drawn.collection };
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
