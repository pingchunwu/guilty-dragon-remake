import type { Collection, Deck, DeckError, PullResult } from "@gdr/engine";

export type DeckKind = "attack" | "defense";

export interface PlayerState {
  tickets: number;
  cards: Collection;
  decks: Record<DeckKind, Deck>;
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
  saveDeck(kind: DeckKind, deck: Deck): Promise<{ ok: boolean; errors: DeckError[] }>;
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
