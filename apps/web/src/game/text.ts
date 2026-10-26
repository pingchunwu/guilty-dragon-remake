import {
  WEAPON_KINDS,
  skillValue,
  type CardType,
  type DeckError,
  type DeckSlot,
  type ItemDefinition,
  type ItemKind,
  type LoadoutError,
  type SkillDefinition,
} from "@gdr/engine";

export const TYPE_LABEL: Record<CardType, string> = { heavy: "重裝", light: "輕裝", magic: "魔裝" };
export const SLOT_LABEL: Record<DeckSlot, string> = { ...TYPE_LABEL, free: "自由" };
export const isWeapon = (kind: ItemKind): kind is CardType => WEAPON_KINDS.includes(kind as CardType);

export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  heavy: "重裝武器",
  light: "輕裝武器",
  magic: "魔裝武器",
  head: "頭甲",
  body: "胴甲",
  legs: "腿甲",
  back: "背甲",
};

const WHO = { self: "", enemy: "敵方" } as const;

/** What a skill does at a level, e.g. 「連擊數 +2」. */
export function skillEffectText(skill: SkillDefinition, level: number): string {
  const v = skillValue(skill, level);
  const e = skill.effect;
  switch (e.kind) {
    case "combo":
      return e.target === "self" ? `連擊數 +${v}` : `敵方連擊數 −${v}（最低 ×1.0）`;
    case "power":
      return `${WHO[e.target]}武器攻擊 ${e.target === "self" ? "+" : "−"}${v}${e.unit === "pct" ? "%" : ""}`;
    case "reckless":
      return `武器攻擊 +${v}%，自身防禦 −${Math.floor(v / 4)}%`;
    case "defense":
      return `${WHO[e.target]}防禦 ${e.target === "self" ? "+" : "−"}${v}%`;
    case "guard":
      return `本階段受到的傷害 −${v}`;
    case "heal":
      return e.unit === "flat" ? `回復 ${v} HP` : `回復最大 HP 的 ${v}%`;
    case "hpDamage":
      return `${e.unit === "flat" ? `敵方 HP −${v}` : `敵方目前 HP −${v}%`}（不會低於 1）`;
    case "hpCost":
      return `消耗 ${v} HP，${e.ratio >= 1 ? "全部" : "一半"}加到攻擊`;
    case "finalDamage":
      return `贏下階段時傷害 +${v}${e.unit === "pct" ? "%" : ""}`;
    case "finalBlowGuard":
      return `牌庫耗盡的傷害 −${v}${e.unit === "pct" ? "%" : ""}（在手牌中就有效）`;
    case "element":
      return { balance: "雙方都沒有相剋加成", surpass: `自身總有相剋加成 ×1.2`, slump: "取消對方的相剋加成" }[e.mode];
    case "discard":
      return `其餘手牌丟掉 ${v} 張（異色優先）${e.redraw ? "並補抽" : ""}`;
    case "elitism":
      return `${v} 張異色手牌洗回牌庫並重抽`;
    case "draws":
      return `${WHO[e.target]}連鎖抽牌上限 ${e.target === "self" ? "+" : "−"}${v}`;
    case "board":
      return `每張${e.colour === "same" ? "同色支援" : "阻擋的異色卡"}攻擊 +${v}`;
    case "shuffle": {
      const who = { self: "", enemy: "對手的", both: "雙方的" }[e.target];
      return e.scope === "hand" ? `${who}其餘手牌洗回牌庫並重抽` : `${who}手牌、棄牌和牌庫全部洗牌並重抽`;
    }
    case "purge":
      return `格子全被擋住時移除 ${v} 張阻擋卡，繼續抽牌`;
    case "charge":
      return e.types.length === 3 ? "所有顏色都能併入攻擊" : `${e.types.map((t) => TYPE_LABEL[t]).join("、")}也能併入攻擊`;
    case "shield":
      return "使對方領導卡的技能無效";
    case "mimic":
      return "改用對方領導卡的技能（以本卡等級）";
  }
}

export function itemStatText(item: ItemDefinition): string {
  return isWeapon(item.kind) ? `攻擊 ${item.attack}` : `防禦 ${item.defense}%`;
}

export function loadoutErrorText(e: LoadoutError): string {
  const slot = ITEM_KIND_LABEL[e.slot];
  switch (e.code) {
    case "UNKNOWN_ITEM":
      return `未知的裝備：${e.itemId}。`;
    case "WRONG_KIND":
      return `這件裝備不能放在${slot}欄。`;
    case "NOT_OWNED":
      return `尚未擁有這件${slot}。`;
  }
}

export function errorText(code: string): string {
  switch (code) {
    case "INSUFFICIENT_TICKETS":
      return "抽卡券不足。";
    case "NETWORK":
      return "連線失敗，請重試。";
    case "NOT_AUTHENTICATED":
      return "登入已過期，請重新登入。";
    case "NO_ACTIVE_POOL":
      return "目前沒有開放的卡池。";
    case "CONTENT_MISSING":
    case "CONTENT_INVALID":
      return "卡片資料有誤，請稍後再試。";
    case "IDEMPOTENCY_KEY_REUSED":
      return "抽卡請求重複，請再按一次。";
    case "NAME_TOO_LONG":
      return "名稱最多 20 個字。";
    case "FRIEND_NOT_FOUND":
      return "找不到這個好友代碼。";
    case "FRIEND_IS_SELF":
      return "這是你自己的好友代碼。";
    case "BATTLE_IN_PROGRESS":
      return "你還有一場未結束的對戰。";
    case "NO_ACTIVE_BATTLE":
      return "這場對戰已經結束。";
    case "PHASE_CONFLICT":
      return "這個階段已經結算過了。";
    case "INVALID_SELECTION":
      return "出牌不符合規則，請重選。";
    case "CANNOT_CHALLENGE_SELF":
    case "OPPONENT_NOT_FOUND":
      return "找不到這位玩家。";
    case "OPPONENT_NO_DECK":
      return "對手還沒有防守牌組。";
    case "DECK_MISSING":
      return "你還沒有進攻牌組。";
    case "RULE_VERSION_RETIRED":
      return "這場對戰的規則版本已停用。";
    default:
      return `發生錯誤（${code}），請稍後再試。`;
  }
}

export function deckErrorText(e: DeckError, cardName: (id: string) => string): string {
  const slot = SLOT_LABEL[e.slot];
  switch (e.code) {
    case "SLOT_SIZE":
      return `${slot}欄需要 ${e.expected} 張，目前 ${e.actual} 張。`;
    case "WRONG_TYPE":
      return `${cardName(e.cardId)} 不能放在${slot}欄。`;
    case "DUPLICATE_NAME_IN_SLOT":
      return `${slot}欄有重複的卡：${e.name}。`;
    case "DUPLICATE_CARD_IN_DECK":
      return `${cardName(e.cardId)} 在牌組中重複。`;
    case "NOT_OWNED":
      return `尚未擁有 ${cardName(e.cardId)}。`;
    case "UNKNOWN_CARD":
      return `未知的卡片：${e.cardId}。`;
  }
}
