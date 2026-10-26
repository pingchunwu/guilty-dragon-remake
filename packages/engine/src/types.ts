import type { Rarity } from "./skills";

/** Unit card types. A card's type decides which non-Free slot it may occupy. */
export type CardType = "heavy" | "light" | "magic";

/** Deck slots: one per card type plus a Free slot that accepts any type. */
export type DeckSlot = CardType | "free";

export const DECK_SLOTS: readonly DeckSlot[] = ["heavy", "light", "magic", "free"];

/**
 * Card definition. Type doubles as the card's colour (supports, advantage).
 * Level is the skill level; it does not change attack. Draw values are not
 * used (every leader may chain-draw the same). See docs/development-spec.md §6a.
 */
export interface CardDefinition {
  /** Stable ID, independent of display/translated names. */
  id: string;
  name: string;
  type: CardType;
  attack: number;
  rarity: Rarity;
  /** Skill ID (skills.ts); it fires only when this card leads. */
  skill: string | null;
}

/** Armor slots by body part, as in the original (頭, 胴, 脚, 背). */
export type ArmorPart = "head" | "body" | "legs" | "back";

/**
 * Equipment kinds; the kind is also the loadout slot, so a player equips one
 * of each: a weapon per card colour and an armor piece per body part
 * (docs/development-spec.md §6a, rule 0.7.0-draft).
 */
export type ItemKind = CardType | ArmorPart;

export const WEAPON_KINDS: readonly CardType[] = ["heavy", "light", "magic"];
export const ARMOR_KINDS: readonly ArmorPart[] = ["head", "body", "legs", "back"];
export const ITEM_KINDS: readonly ItemKind[] = [...WEAPON_KINDS, ...ARMOR_KINDS];

/**
 * Equipment, separate from the deck. Weapons have attack (power on the card
 * POW scale), armor pieces have defense (a percent). Both grow 10% per item
 * level.
 */
export interface ItemDefinition {
  id: string;
  name: string;
  kind: ItemKind;
  attack: number;
  defense: number;
}

export type Loadout = Record<ItemKind, string | null>;

export type Deck = Record<DeckSlot, readonly string[]>;
