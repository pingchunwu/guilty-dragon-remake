import type { CardDefinition, CardType, Deck, ItemDefinition, ItemKind, Loadout } from "./types";
import { SKILLS, type Rarity } from "./skills";

/**
 * PLACEHOLDER content for development: one card per skill (skills.ts), dealt
 * to the three types in turn, no art. Rarity follows the original game's
 * tiers (N … SR+) and sets the attack range and draw weight; the numbers are
 * not balanced. Replace once the card design (original vs. recreated) is
 * decided. supabase/seed is generated from this file; keep them in sync with
 * `npm run gen:seed`. IDs ph-<type>-01…16 existed before skills and are kept.
 */
const TYPE_LABEL: Record<CardType, string> = { heavy: "重裝", light: "輕裝", magic: "魔裝" };
const TYPES: readonly CardType[] = ["heavy", "light", "magic"];

export const placeholderCardId = (type: CardType, n: number) => `ph-${type}-${String(n).padStart(2, "0")}`;

/** Rarity of a skill's card: numbered tiers by tier, the rest by strength. */
const SKILL_RARITY: Record<string, Rarity> = {
  ranbu: "SR+", swift: "R", rengeki: "R", assault: "SR", pursuit: "R+", "far-gaze": "N+", mikiri: "R",
  "mind-eye": "SR", "iron-fist": "R", "gift-of-power": "R+", "soul-breath": "SR+", reckless: "SR",
  "belly-laugh": "R", disarm: "R+", "arms-curse": "SR+", scout: "R", "silver-crown": "SR", watchful: "R",
  "soul-armor": "SR", paw: "R", "high-heal": "SR", prank: "R", "jump-the-gun": "SR", "last-stand": "SR+",
  "war-hammer": "SR+", "armor-pierce": "SR", "balance-art": "R+", "surpass-art": "SR", "slump-art": "R",
  "distant-bond": "N", reinforcements: "R", decoy: "N+", snatch: "N+", pincer: "R+", encircle: "SR",
  "friend-mail": "R", "friend-call": "SR", "joint-fight": "R+", alliance: "SR", hometown: "N+", compatriot: "R",
  regroup: "N+", shuffle: "R", disrupt: "R+", "strategy-crush": "SR", havoc: "SR+", regal: "SR+",
  "curse-support": "R", "steel-charge": "R", "twin-blade": "R", shield: "SR", mimic: "SR+",
};
const TIER_RARITY: readonly Rarity[] = ["N", "N+", "R+", "SR"];

export function placeholderRarity(skillId: string): Rarity {
  const tier = /-(\d)$/.exec(skillId);
  return SKILL_RARITY[skillId] ?? TIER_RARITY[Number(tier?.[1] ?? 1) - 1]!;
}

/** Attack range by rarity, about a tenth of the original's starting POW. */
const ATTACK_RANGE: Record<Rarity, readonly [number, number]> = {
  N: [30, 45],
  "N+": [35, 55],
  R: [45, 65],
  "R+": [50, 72],
  SR: [60, 85],
  "SR+": [70, 100],
};

export const PLACEHOLDER_CARDS: readonly CardDefinition[] = SKILLS.map((skill, i) => {
  const type = TYPES[i % TYPES.length]!;
  const n = Math.floor(i / TYPES.length) + 1;
  const rarity = placeholderRarity(skill.id);
  const [low, high] = ATTACK_RANGE[rarity];
  return {
    id: placeholderCardId(type, n),
    name: `${TYPE_LABEL[type]}試作 ${String(n).padStart(2, "0")}`,
    type,
    // Spread across the rarity's range so hands differ; not balanced.
    attack: low + ((i * 37) % (high - low + 1)),
    rarity,
    skill: skill.id,
  };
});

const range = (type: CardType, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => placeholderCardId(type, from + i));

/** PLACEHOLDER default deck granted once on first sign-in (and used by guests). */
export const PLACEHOLDER_DEFAULT_DECK: Deck = {
  heavy: range("heavy", 1, 8),
  light: range("light", 1, 8),
  magic: range("magic", 1, 8),
  free: [...range("heavy", 9, 11), ...range("light", 9, 11), ...range("magic", 9, 10)],
};

export interface PoolEntry {
  /** Card ID in a card pool, item ID in an item pool. */
  id: string;
  weight: number;
}

export interface Pool {
  id: string;
  entries: readonly PoolEntry[];
}

/** PLACEHOLDER draw weight of one card by rarity; real odds are still TBD. */
export const RARITY_WEIGHT: Record<Rarity, number> = { N: 12, "N+": 8, R: 5, "R+": 3, SR: 2, "SR+": 1 };

/** PLACEHOLDER pool: every card, weighted by rarity. */
export const PLACEHOLDER_POOL: Pool = {
  id: "pool-v1",
  entries: PLACEHOLDER_CARDS.map((c) => ({ id: c.id, weight: RARITY_WEIGHT[c.rarity] })),
};

const ITEM_LABEL: Record<ItemKind, string> = { armor: "防具", weapon: "武器", gear: "飾品" };
const PER_KIND = 6;
const itemId = (kind: ItemKind, n: number) => `ph-${kind}-${String(n).padStart(2, "0")}`;

/**
 * PLACEHOLDER equipment, 6 of each kind. Item 01 of each kind is the starter.
 * Balance rule: armor defense (up to ×1.9 at level 10) should stay well below
 * a typical phase attack so most won phases deal damage; deck-outs ignore
 * armor, so battles always end. Weapon attack is added after multipliers.
 * Gear has no stats until its effect is decided.
 */
export const PLACEHOLDER_ITEMS: readonly ItemDefinition[] = (["armor", "weapon", "gear"] as const).flatMap((kind) =>
  Array.from({ length: PER_KIND }, (_, i) => ({
    id: itemId(kind, i + 1),
    name: i === 0 ? `見習${ITEM_LABEL[kind]}` : `${ITEM_LABEL[kind]}試作 ${String(i + 1).padStart(2, "0")}`,
    kind,
    attack: kind === "weapon" ? 10 * (i + 1) : 0,
    defense: kind === "armor" ? 14 + 3 * i : 0,
  })),
);

/** PLACEHOLDER loadout granted to every player (and guests). */
export const PLACEHOLDER_STARTER_LOADOUT: Loadout = {
  armor: itemId("armor", 1),
  weapon: itemId("weapon", 1),
  gear: itemId("gear", 1),
};

/** PLACEHOLDER item pool: every item, equal weight, same tickets as cards. */
export const PLACEHOLDER_ITEM_POOL: Pool = {
  id: "item-pool-v0",
  entries: PLACEHOLDER_ITEMS.map((item) => ({ id: item.id, weight: 1 })),
};
