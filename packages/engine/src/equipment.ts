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

export function resolveEquipment(loadout: Loadout, items: Items): Equipment {
  const get = (slot: ItemKind) => {
    const id = loadout[slot];
    return id === null ? null : (items.get(id) ?? null);
  };
  return { armor: get("armor"), weapon: get("weapon"), gear: get("gear") };
}

export const defenseOf = (e: Equipment) => e.armor?.defense ?? 0;
export const weaponAttackOf = (e: Equipment) => e.weapon?.attack ?? 0;
