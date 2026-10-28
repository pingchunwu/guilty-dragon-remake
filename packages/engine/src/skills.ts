import type { CardType } from "./types";

/**
 * Leader skills, recreated from the original game's community skill table
 * (https://wikiwiki.jp/guildra/スキル, last edited 2014). Only the leader card's
 * skill fires, at that card's level (one level per duplicate, capped at
 * maxLevel). Values are the original's (rule 0.7.0-draft put flat values back
 * on the OG scale; 0.6.0 divided them by 10). Defense skills are percents: 0.6.0
 * scales flat armor by them, 0.7.0 adds them to the defense %.
 * Event-only, synthesis and sale skills are left out: this game has none of
 * those systems. See docs/development-spec.md §6a for the resolution order.
 */

export type Rarity = "N" | "N+" | "R" | "R+" | "SR" | "SR+";
export const RARITIES: readonly Rarity[] = ["N", "N+", "R", "R+", "SR", "SR+"];

/** When the original fires the skill. Informational: §6a fixes one order for all. */
export type SkillTiming = "leader" | "afterCharge" | "endOfDraw" | "battle" | "finalBlow";

type Side = "self" | "enemy";
type Unit = "flat" | "pct";

/** `value` below is the skill's value at its level (see skillValue). */
export type SkillEffect =
  /** Self: +value combo count. Enemy: −value combo count (never below ×1.0). */
  | { kind: "combo"; target: Side }
  /** Self: +value weapon power (flat, or % of the weapon), as in the original. Enemy: −value, not below 0. */
  | { kind: "power"; target: Side; unit: Unit }
  /** +value % weapon power, −value/4 % own defense (不借身命). */
  | { kind: "reckless" }
  /** Self: +value % defense. Enemy: −value % defense. */
  | { kind: "defense"; target: Side }
  /** −value damage taken this phase. */
  | { kind: "guard" }
  /** Heal value HP, or value % of max HP; never above max. */
  | { kind: "heal"; unit: Unit }
  /** Enemy loses value HP, or value % of current HP; never below 1. */
  | { kind: "hpDamage"; unit: Unit }
  /** Lose value HP (never below 1); value × ratio is added to attack. */
  | { kind: "hpCost"; ratio: number }
  /** When this side wins the phase: +value damage (flat, or % of the damage). */
  | { kind: "finalDamage"; unit: Unit }
  /** Deck-out (final blow) damage taken −value (flat or %). Works from the hand, see §6a. */
  | { kind: "finalBlowGuard"; unit: Unit }
  /** balance: no advantage either way. surpass: own ×1.2 always. slump: cancels the enemy's advantage. */
  | { kind: "element"; mode: "balance" | "surpass" | "slump" }
  /** Discard value cards from the rest of the hand (other colours first), drawing replacements if redraw. */
  | { kind: "discard"; redraw: boolean }
  /** Return value other-colour cards from the rest of the hand to the deck, shuffle, draw as many. */
  | { kind: "elitism" }
  /** Self: +value chain draws. Enemy: −value chain draws. */
  | { kind: "draws"; target: Side }
  /** +value attack per same-colour (excluding the leader) or other-colour (blocking) card in the chain. */
  | { kind: "board"; colour: "same" | "other" }
  /** Shuffle the rest of the hand (or hand, discard and deck) back and redraw the same number. */
  | { kind: "shuffle"; target: Side | "both"; scope: "hand" | "all" }
  /** When all spaces are blocked, discard up to value blockers so the chain can draw into them (once). */
  | { kind: "purge" }
  /** These colours also merge into the attack. */
  | { kind: "charge"; types: readonly CardType[] }
  /** Cancels the enemy leader's skill (unless it is also a shield). */
  | { kind: "shield" }
  /** Uses the enemy leader's skill instead, at this card's level (capped at that skill's max). */
  | { kind: "mimic" };

export interface SkillDefinition {
  id: string;
  name: string;
  /** Name in the original game, for tracing back to the source. */
  original: string;
  maxLevel: number;
  timing: SkillTiming;
  effect: SkillEffect;
  /** Value at level 1 when perLevel (it grows by this much each level), otherwise fixed. */
  value: number;
  perLevel: boolean;
}

const ALL_TYPES: readonly CardType[] = ["heavy", "light", "magic"];

const s = (
  id: string,
  name: string,
  original: string,
  maxLevel: number,
  timing: SkillTiming,
  effect: SkillEffect,
  value: number,
  perLevel = maxLevel > 1,
): SkillDefinition => ({ id, name, original, maxLevel, timing, effect, value, perLevel });

/** Numbered tiers (I, II, III…) share an effect with a bigger per-level value. */
const tiers = (
  id: string,
  name: string,
  original: string,
  values: readonly number[],
  timing: SkillTiming,
  effect: SkillEffect,
  maxLevels: readonly number[] = values.map(() => 10),
) =>
  values.map((value, i) =>
    s(`${id}-${i + 1}`, `${name}${"ⅠⅡⅢⅣ"[i]}`, `${original}${i + 1}`, maxLevels[i]!, timing, effect, value, true),
  );

export const SKILLS: readonly SkillDefinition[] = [
  // Combo count
  s("ranbu", "亂舞", "乱舞", 1, "leader", { kind: "combo", target: "self" }, 3),
  s("swift", "疾足", "俊足", 1, "leader", { kind: "combo", target: "self" }, 2),
  s("rengeki", "連擊", "連撃", 3, "leader", { kind: "combo", target: "self" }, 1),
  s("assault", "強襲連擊", "強襲連撃", 5, "leader", { kind: "combo", target: "self" }, 1),
  s("pursuit", "追擊", "追撃", 3, "afterCharge", { kind: "combo", target: "self" }, 1),
  s("far-gaze", "遠望", "遠い目", 1, "endOfDraw", { kind: "combo", target: "enemy" }, 1),
  s("mikiri", "看穿", "見切り", 3, "endOfDraw", { kind: "combo", target: "enemy" }, 1),
  s("mind-eye", "心眼", "心眼", 5, "endOfDraw", { kind: "combo", target: "enemy" }, 1),
  // Own attack up
  s("iron-fist", "鐵拳", "アイアンフィスト", 1, "battle", { kind: "power", target: "self", unit: "flat" }, 300),
  ...tiers("power-up", "力量提升", "パワーアップ", [20, 40, 60], "battle", { kind: "power", target: "self", unit: "flat" }),
  s("gift-of-power", "力量之賜", "ギフトオブパワー", 1, "battle", { kind: "power", target: "self", unit: "pct" }, 15),
  ...tiers("power-gaze", "力量凝視", "パワーゲイズ", [1, 2, 3], "battle", { kind: "power", target: "self", unit: "pct" }),
  s("soul-breath", "魂之氣息", "魂の息吹", 5, "battle", { kind: "power", target: "self", unit: "pct" }, 10),
  s("reckless", "不惜身命", "不借身命", 3, "battle", { kind: "reckless" }, 60),
  // Enemy attack down
  s("belly-laugh", "捧腹大笑", "腹筋崩壊", 1, "battle", { kind: "power", target: "enemy", unit: "flat" }, 300),
  ...tiers("weaken", "脫力", "脱力", [20, 40, 60], "battle", { kind: "power", target: "enemy", unit: "flat" }),
  s("disarm", "武裝解除", "武装解除", 1, "battle", { kind: "power", target: "enemy", unit: "pct" }, 15),
  ...tiers("power-seal", "力之封印", "力の封印", [1, 2, 3], "battle", { kind: "power", target: "enemy", unit: "pct" }),
  s("arms-curse", "武裝封咒", "武装封咒", 1, "battle", { kind: "power", target: "enemy", unit: "pct" }, 100),
  // Damage taken down
  s("scout", "攻擊調查", "攻撃調査", 1, "battle", { kind: "guard" }, 500),
  ...tiers("guard", "防護", "ガード", [50, 100, 150], "battle", { kind: "guard" }),
  // Own defense up
  s("silver-crown", "銀冠穴熊", "銀冠穴熊", 1, "battle", { kind: "defense", target: "self" }, 40),
  s("watchful", "守望之心", "見守る心", 1, "battle", { kind: "defense", target: "self" }, 15),
  ...tiers("hard-armor", "硬甲", "ハードアーマー", [1, 2, 3], "battle", { kind: "defense", target: "self" }),
  s("soul-armor", "魄之甲冑", "魄の甲冑", 5, "battle", { kind: "defense", target: "self" }, 10),
  // Healing
  s("paw", "治癒肉球", "癒しの肉球", 1, "battle", { kind: "heal", unit: "flat" }, 800),
  ...tiers("healing-water", "治癒之水", "癒しの水", [50, 100, 150, 200], "battle", { kind: "heal", unit: "flat" }),
  s("high-heal", "高階治療", "ハイヒール", 1, "battle", { kind: "heal", unit: "pct" }, 15),
  ...tiers("heal", "治療", "ヒール", [1, 2, 3, 4], "battle", { kind: "heal", unit: "pct" }),
  // Direct damage
  s("prank", "惡作劇", "いたずら", 1, "battle", { kind: "hpDamage", unit: "flat" }, 800),
  ...tiers("shadow-strike", "影討", "影討ち", [50, 100, 150], "battle", { kind: "hpDamage", unit: "flat" }),
  s("jump-the-gun", "搶先一步", "先走り", 1, "battle", { kind: "hpDamage", unit: "pct" }, 10),
  ...tiers("ambush", "突襲", "不意討ち", [1, 2, 3], "battle", { kind: "hpDamage", unit: "pct" }),
  // HP for attack
  ...tiers("price-of-power", "力量的代價", "力の代償", [100, 200, 300], "battle", { kind: "hpCost", ratio: 0.5 }),
  ...tiers("price-of-violence", "暴力的代價", "暴力の代償", [100, 200, 300], "battle", { kind: "hpCost", ratio: 1 }),
  s("last-stand", "背水之陣", "背水の陣", 5, "battle", { kind: "hpCost", ratio: 1 }, 800),
  // Final damage up
  ...tiers("plus-damage", "追加傷害", "プラスダメージ", [50, 100, 150], "battle", { kind: "finalDamage", unit: "flat" }),
  // Not in the wiki table (cards use it): value and max level inferred from tiers 2 and 3.
  s("raise-damage-1", "增幅傷害Ⅰ", "レイズダメージ1", 10, "battle", { kind: "finalDamage", unit: "pct" }, 1),
  s("raise-damage-2", "增幅傷害Ⅱ", "レイズダメージ2", 10, "battle", { kind: "finalDamage", unit: "pct" }, 2),
  s("raise-damage-3", "增幅傷害Ⅲ", "レイズダメージ3", 10, "battle", { kind: "finalDamage", unit: "pct" }, 3),
  s("war-hammer", "戰神之鎚", "戦神の鉄槌", 5, "battle", { kind: "finalDamage", unit: "pct" }, 10),
  // Final blow (deck-out) damage taken down
  ...tiers("slim-hope", "一縷希望", "いちるの望み", [200, 400, 600], "finalBlow", { kind: "finalBlowGuard", unit: "flat" }),
  ...tiers("guardian", "守護神", "守護神", [2, 4, 6], "finalBlow", { kind: "finalBlowGuard", unit: "pct" }),
  // Enemy defense down
  ...tiers("break-armor", "破甲", "ブレイクアーマー", [1, 2, 3], "battle", { kind: "defense", target: "enemy" }),
  s("armor-pierce", "鎧通", "鎧通し", 5, "battle", { kind: "defense", target: "enemy" }, 8),
  // Colour advantage
  s("balance-art", "天秤武技", "天秤の武技", 1, "battle", { kind: "element", mode: "balance" }, 0),
  s("surpass-art", "凌駕武技", "凌駕の武技", 1, "battle", { kind: "element", mode: "surpass" }, 0),
  s("slump-art", "不調武技", "不調の武技", 1, "battle", { kind: "element", mode: "slump" }, 0),
  // Hand
  s("distant-bond", "遙遠的羈絆", "遠い絆", 1, "leader", { kind: "discard", redraw: true }, 1),
  s("reinforcements", "援軍", "援軍", 3, "leader", { kind: "discard", redraw: true }, 1),
  s("decoy", "誘餌", "おとり", 3, "leader", { kind: "discard", redraw: false }, 1),
  ...tiers("elitism", "選民主義", "選民主義", [1, 1, 1], "leader", { kind: "elitism" }, [1, 3, 5]),
  // Chain draws
  s("snatch", "搶奪", "よこどり", 1, "leader", { kind: "draws", target: "enemy" }, 1),
  s("pincer", "挾擊", "挟撃", 3, "leader", { kind: "draws", target: "enemy" }, 1),
  s("encircle", "包圍網", "包囲網", 5, "leader", { kind: "draws", target: "enemy" }, 1),
  s("friend-mail", "好友信件", "フレンドメール", 3, "leader", { kind: "draws", target: "self" }, 1),
  s("friend-call", "好友來電", "フレンドコール", 5, "leader", { kind: "draws", target: "self" }, 1),
  // Chain board
  s("joint-fight", "共鬥", "共闘", 3, "battle", { kind: "board", colour: "other" }, 300),
  s("alliance", "同盟", "同盟", 3, "battle", { kind: "board", colour: "other" }, 500),
  s("hometown", "同鄉之友", "同郷の友", 3, "battle", { kind: "board", colour: "same" }, 100),
  s("compatriot", "同國之友", "同国の友", 3, "battle", { kind: "board", colour: "same" }, 200),
  // Shuffles
  s("regroup", "隊伍重編", "PT再編成", 1, "leader", { kind: "shuffle", target: "self", scope: "hand" }, 0),
  s("shuffle", "洗牌", "シャッフル", 1, "leader", { kind: "shuffle", target: "self", scope: "all" }, 0),
  s("disrupt", "擾亂", "かく乱", 1, "leader", { kind: "shuffle", target: "enemy", scope: "hand" }, 0),
  s("strategy-crush", "戰略粉碎", "戦略潰し", 1, "leader", { kind: "shuffle", target: "enemy", scope: "all" }, 0),
  s("havoc", "大破壞", "ぶちこわし", 1, "leader", { kind: "shuffle", target: "both", scope: "all" }, 0),
  // Charge
  ...tiers("purge", "肅清", "粛清", [1, 1, 1], "leader", { kind: "purge" }, [1, 3, 5]),
  s("regal", "王者風範", "王者の風格", 1, "leader", { kind: "charge", types: ALL_TYPES }, 0),
  s("curse-support", "咒紋支援", "呪紋支援", 1, "leader", { kind: "charge", types: ["magic"] }, 0),
  s("steel-charge", "鋼刃突擊", "鋼刃突撃", 1, "leader", { kind: "charge", types: ["heavy"] }, 0),
  s("twin-blade", "雙刃介入", "双刃介入", 1, "leader", { kind: "charge", types: ["light"] }, 0),
  // Counters
  s("shield", "護盾", "シールド", 1, "leader", { kind: "shield" }, 0),
  s("mimic", "模仿", "ものまね", 3, "leader", { kind: "mimic" }, 0),
];

export const SKILL_BY_ID: ReadonlyMap<string, SkillDefinition> = new Map(SKILLS.map((k) => [k.id, k]));

export function skillOf(id: string): SkillDefinition {
  const skill = SKILL_BY_ID.get(id);
  if (!skill) throw new Error(`unknown skill ${id}`);
  return skill;
}

export const clampSkillLevel = (skill: SkillDefinition, level: number) =>
  Math.max(1, Math.min(skill.maxLevel, Math.floor(level)));

/** The skill's number at a level, e.g. 連擊 Lv 2 → 2 combo. */
export const skillValue = (skill: SkillDefinition, level: number) =>
  skill.perLevel ? skill.value * clampSkillLevel(skill, level) : skill.value;

/** A card's level cap: its skill's max level (1 without a skill). */
export const cardMaxLevel = (card: { skill: string | null }) => (card.skill ? skillOf(card.skill).maxLevel : 1);
