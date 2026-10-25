import { DECK_SLOTS, type CardDefinition, type Deck, type DeckSlot } from "./types";
import type { RuleConfig } from "./rules";

export type DeckError =
  | { code: "SLOT_SIZE"; slot: DeckSlot; expected: number; actual: number }
  | { code: "UNKNOWN_CARD"; slot: DeckSlot; cardId: string }
  | { code: "WRONG_TYPE"; slot: DeckSlot; cardId: string }
  | { code: "DUPLICATE_NAME_IN_SLOT"; slot: DeckSlot; name: string }
  | { code: "DUPLICATE_CARD_IN_DECK"; slot: DeckSlot; cardId: string }
  | { code: "NOT_OWNED"; slot: DeckSlot; cardId: string };

/**
 * Validates the confirmed deck rules: four slots of `slotSize` cards, non-Free
 * slots only accept their type, and no duplicate card names within a slot.
 * Duplicates convert to shards, so a player holds one copy of each card and a
 * card ID may appear only once per deck. Pass `owned` to also enforce ownership.
 */
export function validateDeck(
  deck: Deck,
  cards: ReadonlyMap<string, CardDefinition>,
  rules: RuleConfig,
  owned?: ReadonlySet<string>,
): DeckError[] {
  const errors: DeckError[] = [];
  const seenIds = new Set<string>();

  for (const slot of DECK_SLOTS) {
    const ids = deck[slot];
    if (ids.length !== rules.slotSize) {
      errors.push({ code: "SLOT_SIZE", slot, expected: rules.slotSize, actual: ids.length });
    }

    const names = new Set<string>();
    for (const cardId of ids) {
      if (seenIds.has(cardId)) errors.push({ code: "DUPLICATE_CARD_IN_DECK", slot, cardId });
      seenIds.add(cardId);
      const card = cards.get(cardId);
      if (!card) {
        errors.push({ code: "UNKNOWN_CARD", slot, cardId });
        continue;
      }
      if (owned && !owned.has(cardId)) errors.push({ code: "NOT_OWNED", slot, cardId });
      if (slot !== "free" && card.type !== slot) errors.push({ code: "WRONG_TYPE", slot, cardId });
      if (names.has(card.name)) errors.push({ code: "DUPLICATE_NAME_IN_SLOT", slot, name: card.name });
      names.add(card.name);
    }
  }

  return errors;
}

/** Flattens a deck into its 32-card draw order, before shuffling. */
export function deckCardIds(deck: Deck): string[] {
  return DECK_SLOTS.flatMap((slot) => deck[slot]);
}
