import type { CardType, DeckError, DeckSlot } from "@gdr/engine";

export const TYPE_LABEL: Record<CardType, string> = { heavy: "重裝", light: "輕裝", magic: "魔裝" };
export const SLOT_LABEL: Record<DeckSlot, string> = { ...TYPE_LABEL, free: "自由" };

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
