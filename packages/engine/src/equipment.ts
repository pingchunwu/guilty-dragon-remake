import { ITEM_KINDS, type ItemDefinition, type ItemKind, type Loadout } from "./types";

export type Items = ReadonlyMap<string, ItemDefinition>;

/** Equipped items resolved to definitions; null is an empty slot. */
export type Equipment = Record<ItemKind, ItemDefinition | null>;

export const NO_EQUIPMENT: Equipment = { armor: null, weapon: null, gear: null };

export type LoadoutError =
  | { code: "UNKNOWN_ITEM"; slot: ItemKind; itemId: string }
  | { code: "WRONG_KIND"; slot: ItemKind; itemId: string }
  | { code: "NOT_OWNED"; slot: ItemKind; itemId: string };

/** Same rules as the database's save_loadout. */
export function validateLoadout(loadout: Loadout, items: Items, owned?: ReadonlySet<string>): LoadoutError[] {
  const errors: LoadoutError[] = [];
  for (const slot of ITEM_KINDS) {
    const itemId = loadout[slot];
    if (itemId === null) continue;
    const item = items.get(itemId);
    if (!item) errors.push({ code: "UNKNOWN_ITEM", slot, itemId });
    else if (item.kind !== slot) errors.push({ code: "WRONG_KIND", slot, itemId });
    if (owned && !owned.has(itemId)) errors.push({ code: "NOT_OWNED", slot, itemId });
  }
  return errors;
}

/** Item levels stop here; later duplicates are kept as shards. */
export const ITEM_MAX_LEVEL = 10;
/** Each item level past 1 adds this percent of the item's base attack and defense. */
export const ITEM_LEVEL_PERCENT = 10;

/** An item's stats at a level: base × (1 + 10% per level past 1), rounded down. */
export function leveledItem(item: ItemDefinition, level: number): ItemDefinition {
  const lv = Math.max(1, Math.min(ITEM_MAX_LEVEL, Math.floor(level)));
  const scale = (n: number) => Math.floor((n * (100 + ITEM_LEVEL_PERCENT * (lv - 1))) / 100);
  return { ...item, attack: scale(item.attack), defense: scale(item.defense) };
}

/** Equipped items with their stats at the owner's item levels (level 1 when missing). */
export function resolveEquipment(loadout: Loadout, items: Items, levels: Readonly<Record<string, number>> = {}): Equipment {
  const get = (slot: ItemKind) => {
    const id = loadout[slot];
    const item = id === null ? undefined : items.get(id);
    return item ? leveledItem(item, levels[item.id] ?? 1) : null;
  };
  return { armor: get("armor"), weapon: get("weapon"), gear: get("gear") };
}

export const defenseOf = (e: Equipment) => e.armor?.defense ?? 0;
export const weaponAttackOf = (e: Equipment) => e.weapon?.attack ?? 0;
