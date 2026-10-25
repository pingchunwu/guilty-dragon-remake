import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { PLACEHOLDER_CARDS, PLACEHOLDER_ITEMS } from "@gdr/engine";
import { PLACEHOLDER_CONTENT, loadContent, parseContent } from "./content";
import { GameError } from "./types";

const card = { id: "c1", name: "卡", type: "heavy", attack: 50, rarity: "SR", skill_id: "rengeki" };
const item = { id: "i1", name: "盾", kind: "armor", attack: 0, defense: 20 };

/** Just enough of the client for `from(table).select(columns).order("id")`. */
function fakeClient(tables: Record<string, { data?: unknown[]; error?: { code: string } } | "throw">) {
  const calls: string[] = [];
  const client = {
    from: (table: string) => ({
      select: () => ({
        order: async () => {
          calls.push(table);
          const t = tables[table]!;
          if (t === "throw") throw new TypeError("Failed to fetch");
          return { data: t.data ?? null, error: t.error ?? null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

const code = (p: Promise<unknown>) => p.then(() => "ok", (e: GameError) => e.code);

describe("parseContent", () => {
  it("maps rows to definitions keyed by id", () => {
    const content = parseContent([card], [item]);
    expect(content.cards.get("c1")).toEqual({ id: "c1", name: "卡", type: "heavy", attack: 50, rarity: "SR", skill: "rengeki" });
    expect(parseContent([{ ...card, skill_id: null }], [item]).cards.get("c1")!.skill).toBeNull();
    expect(content.items.get("i1")).toEqual(item);
  });

  it("rejects malformed rows", () => {
    expect(() => parseContent([{ ...card, type: "fire" }], [item])).toThrow("CONTENT_INVALID");
    expect(() => parseContent([{ ...card, attack: "50" }], [item])).toThrow("CONTENT_INVALID");
    expect(() => parseContent([{ ...card, rarity: "UR" }], [item])).toThrow("CONTENT_INVALID");
    expect(() => parseContent([{ ...card, skill_id: "no-such-skill" }], [item])).toThrow("CONTENT_INVALID");
    expect(() => parseContent([card], [{ ...item, defense: null }])).toThrow("CONTENT_INVALID");
  });

  it("rejects empty tables", () => {
    expect(() => parseContent([], [item])).toThrow("CONTENT_MISSING");
    expect(() => parseContent([card], [])).toThrow("CONTENT_MISSING");
  });
});

describe("loadContent", () => {
  it("falls back to the bundled placeholder catalog without Supabase", async () => {
    const content = await loadContent(null);
    expect(content).toBe(PLACEHOLDER_CONTENT);
    expect(content.cards.size).toBe(PLACEHOLDER_CARDS.length);
    expect(content.items.size).toBe(PLACEHOLDER_ITEMS.length);
  });

  it("retries after a failure and keeps a success in memory", async () => {
    const down = fakeClient({ card_definitions: "throw", item_definitions: "throw" });
    expect(await code(loadContent(down.client))).toBe("NETWORK");

    const up = fakeClient({ card_definitions: { data: [card] }, item_definitions: { data: [item] } });
    const content = await loadContent(up.client);
    expect(content.cards.get("c1")).toEqual({ id: "c1", name: "卡", type: "heavy", attack: 50, rarity: "SR", skill: "rengeki" });
    expect(parseContent([{ ...card, skill_id: null }], [item]).cards.get("c1")!.skill).toBeNull();
    expect(await loadContent(up.client)).toBe(content);
    expect(up.calls).toEqual(["card_definitions", "item_definitions"]);
  });
});
