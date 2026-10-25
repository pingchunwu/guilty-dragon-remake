import { describe, expect, it } from "vitest";
import { RULES_V0, deckCardIds, validateDeck, type CardDefinition, type CardType, type Deck } from "../src";

function makeCards(type: CardType, count: number): CardDefinition[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${type}-${i}`, name: `${type} ${i}`, type, attack: 50, rarity: "N" as const, skill: null }));
}

const all = [...makeCards("heavy", 11), ...makeCards("light", 11), ...makeCards("magic", 10)];
const cards = new Map(all.map((c) => [c.id, c]));
const ids = (type: CardType, from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => `${type}-${from + i}`);

const validDeck: Deck = {
  heavy: ids("heavy", 0, 8),
  light: ids("light", 0, 8),
  magic: ids("magic", 0, 8),
  free: [...ids("heavy", 8, 11), ...ids("light", 8, 11), ...ids("magic", 8, 10)],
};

describe("validateDeck", () => {
  it("accepts a valid 32-card deck", () => {
    expect(validateDeck(validDeck, cards, RULES_V0)).toEqual([]);
    expect(deckCardIds(validDeck)).toHaveLength(32);
  });

  it("rejects wrong slot sizes", () => {
    const deck = { ...validDeck, heavy: ids("heavy", 0, 7) };
    expect(validateDeck(deck, cards, RULES_V0)).toContainEqual({
      code: "SLOT_SIZE",
      slot: "heavy",
      expected: 8,
      actual: 7,
    });
  });

  it("rejects off-type cards in a typed slot but allows them in Free", () => {
    const deck = { ...validDeck, heavy: [...ids("heavy", 0, 7), "magic-9"] };
    expect(validateDeck(deck, cards, RULES_V0)).toContainEqual({
      code: "WRONG_TYPE",
      slot: "heavy",
      cardId: "magic-9",
    });
  });

  it("rejects duplicate names within a slot", () => {
    const deck = { ...validDeck, light: [...ids("light", 0, 7), "light-0"] };
    expect(validateDeck(deck, cards, RULES_V0)).toContainEqual({
      code: "DUPLICATE_NAME_IN_SLOT",
      slot: "light",
      name: "light 0",
    });
  });

  it("rejects the same card in two slots", () => {
    const deck = { ...validDeck, free: [...validDeck.free.slice(0, 7), "heavy-0"] };
    expect(validateDeck(deck, cards, RULES_V0)).toContainEqual({
      code: "DUPLICATE_CARD_IN_DECK",
      slot: "free",
      cardId: "heavy-0",
    });
  });

  it("rejects unknown and unowned cards", () => {
    const deck = { ...validDeck, magic: [...ids("magic", 0, 7), "nope"] };
    const owned = new Set(all.map((c) => c.id).filter((id) => id !== "magic-1"));
    const errors = validateDeck(deck, cards, RULES_V0, owned);
    expect(errors).toContainEqual({ code: "UNKNOWN_CARD", slot: "magic", cardId: "nope" });
    expect(errors).toContainEqual({ code: "NOT_OWNED", slot: "magic", cardId: "magic-1" });
  });
});
