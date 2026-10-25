import {
  PLACEHOLDER_CARDS,
  PLACEHOLDER_DEFAULT_DECK,
  PLACEHOLDER_POOL,
  RULES_V0,
  STARTING_TICKETS,
  createRng,
  drawTen,
  validateDeck,
  type Collection,
} from "@gdr/engine";
import { GameError, type GameService, type PlayerState } from "./types";

const cards = new Map(PLACEHOLDER_CARDS.map((c) => [c.id, c]));

function randomSeed(): [number, number, number, number] {
  const seed = new Uint32Array(4);
  crypto.getRandomValues(seed);
  return [seed[0]!, seed[1]!, seed[2]!, seed[3]!];
}

/** Guest preview: in-memory only, gone on reload (guest progress is never saved). */
export function createGuestService(): GameService {
  const collection: Collection = Object.fromEntries(
    Object.values(PLACEHOLDER_DEFAULT_DECK)
      .flat()
      .map((id) => [id, { level: 1, shards: 0 }]),
  );
  let state: PlayerState = {
    tickets: STARTING_TICKETS,
    cards: collection,
    decks: { attack: PLACEHOLDER_DEFAULT_DECK, defense: PLACEHOLDER_DEFAULT_DECK },
  };
  const draws = new Map<string, ReturnType<typeof drawTen>["results"]>();

  return {
    mode: "guest",
    async sync() {
      return state;
    },
    async drawTen(key) {
      const replay = draws.get(key);
      if (replay) return { results: replay, state };
      if (state.tickets < 1) throw new GameError("INSUFFICIENT_TICKETS");
      const drawn = drawTen(state.cards, PLACEHOLDER_POOL, createRng(randomSeed()));
      state = { ...state, tickets: state.tickets - 1, cards: drawn.collection };
      draws.set(key, drawn.results);
      return { results: drawn.results, state };
    },
    async saveDeck(kind, deck) {
      const errors = validateDeck(deck, cards, RULES_V0, new Set(Object.keys(state.cards)));
      if (errors.length === 0) state = { ...state, decks: { ...state.decks, [kind]: deck } };
      return { ok: errors.length === 0, errors };
    },
  };
}
