import type { Collection, Deck, DeckError, Loadout, LoadoutError, PullResult, Rarity } from "@gdr/engine";

export type DeckKind = "attack" | "defense";

export interface PlayerState {
  tickets: number;
  /** Card pulls since the last SSR or UR. */
  pity: number;
  cards: Collection;
  decks: Record<DeckKind, Deck>;
  items: Collection;
  /** One loadout for both attack and defense. */
  loadout: Loadout;
}

export interface DrawOutcome {
  results: PullResult[];
  state: PlayerState;
}

/**
 * One interface for both modes: guests run the engine in memory (nothing is
 * saved), signed-in players go through Supabase database functions.
 */
export interface GameService {
  readonly mode: "guest" | "account";
  sync(): Promise<PlayerState>;
  /** Reusing `idempotencyKey` for a retry never charges twice. */
  drawTen(idempotencyKey: string): Promise<DrawOutcome>;
  /** Ten pulls from the item pool for one ticket; keys must differ from card draws. */
  drawItems(idempotencyKey: string): Promise<DrawOutcome>;
  /** Total draw weight per rarity in the active card pool. */
  rarityWeights(): Promise<Partial<Record<Rarity, number>>>;
  saveDeck(kind: DeckKind, deck: Deck): Promise<{ ok: boolean; errors: DeckError[] }>;
  saveLoadout(loadout: Loadout): Promise<{ ok: boolean; errors: LoadoutError[] }>;
}

/** Errors raised by the database functions, by message. */
export class GameError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
  ) {
    super(code);
  }
}
