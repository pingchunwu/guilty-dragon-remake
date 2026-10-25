import type { CardType, DeckError, DeckSlot, ItemDefinition, ItemKind, LoadoutError } from "@gdr/engine";

export const TYPE_LABEL: Record<CardType, string> = { heavy: "重裝", light: "輕裝", magic: "魔裝" };
export const SLOT_LABEL: Record<DeckSlot, string> = { ...TYPE_LABEL, free: "自由" };
export const ITEM_KIND_LABEL: Record<ItemKind, string> = { armor: "防具", weapon: "武器", gear: "飾品" };

export function itemStatText(item: ItemDefinition): string {
  if (item.kind === "armor") return `防禦 ${item.defense}`;
  if (item.kind === "weapon") return `攻擊 +${item.attack}`;
  return "效果待定";
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
