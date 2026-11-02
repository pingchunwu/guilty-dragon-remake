import { useEffect, useMemo, useRef, useState } from "react";
import {
  DECK_SLOTS,
  RULES_V0,
  validateDeck,
  type Deck,
  type CardDefinition,
  type DeckSlot,
} from "@gdr/engine";
import type { Content } from "../game/content";
import { GameError, type DeckKind, type GameService, type PlayerState } from "../game/types";
import { SLOT_LABEL, deckErrorText, errorText } from "../game/text";
import { DeckCard } from "./DeckCard";
import { useChunk } from "./useChunk";

const SLOT_HINT: Record<DeckSlot, string> = {
  heavy: "只能放重裝",
  light: "只能放輕裝",
  magic: "只能放魔裝",
  free: "可放任何類型",
};

/** A position being edited: a filled card, or an empty spot when index >= slot length. */
interface Selection {
  slot: DeckSlot;
  index: number;
}

interface Props {
  content: Content;
  service: GameService;
  state: PlayerState;
  onState: (s: PlayerState) => void;
}

export function DeckEditor({ content: { cards }, service, state, onState }: Props) {
  const cardName = (id: string) => cards.get(id)?.name ?? id;
  // Only the attack deck is edited for now; the defense deck keeps its saved value.
  const kind: DeckKind = "attack";
  const [draft, setDraft] = useState<Deck>(state.decks.attack);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) pickerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  const owned = useMemo(() => new Set(Object.keys(state.cards)), [state.cards]);
  const errors = validateDeck(draft, cards, RULES_V0, owned);
  const inDeck = new Set(Object.values(draft).flat());
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.decks[kind]);

  function toggle(slot: DeckSlot, index: number) {
    setSelected(selected?.slot === slot && selected.index === index ? null : { slot, index });
    setMessage(null);
  }

  /** Puts `id` at the selected position (replacing a card there), or removes it when `id` is null. */
  function apply(id: string | null) {
    if (!selected) return;
    const list = [...draft[selected.slot]];
    if (id === null) list.splice(selected.index, 1);
    else if (selected.index < list.length) list[selected.index] = id;
    else list.push(id);
    setDraft({ ...draft, [selected.slot]: list });
    setSelected(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const result = await service.saveDeck(kind, draft);
      if (result.ok) {
        onState({ ...state, decks: { ...state.decks, [kind]: draft } });
        setMessage("已儲存");
      } else {
        setMessage(result.errors.map((e) => deckErrorText(e, cardName)).join(" "));
      }
    } catch (e) {
      setMessage(errorText(e instanceof GameError ? e.code : "UNKNOWN"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="stack deck-page">
      <h2>牌組</h2>
      <p className="muted small">點一張卡可替換或移除，點空位可加入卡片</p>

      {DECK_SLOTS.map((slot) => {
        const ids = draft[slot];
        const empties = Math.max(0, RULES_V0.slotSize - ids.length);
        const editing = selected?.slot === slot ? selected : null;
        const current = editing ? ids[editing.index] : undefined;
        const candidates = editing
          ? [...cards.values()].filter((c) => owned.has(c.id) && !inDeck.has(c.id) && (slot === "free" || c.type === slot))
          : [];

        return (
          <div key={slot} className={`panel slot${editing ? " slot-active" : ""}`}>
            <div className="row between">
              <strong>
                {SLOT_LABEL[slot]}欄 <span className="muted small">{SLOT_HINT[slot]}</span>
              </strong>
              <span className={`slot-count${ids.length === RULES_V0.slotSize ? "" : " error"}`}>
                {ids.length}/{RULES_V0.slotSize}
              </span>
            </div>
            <div className="grid deck-grid">
              {ids.map((id, index) => {
                const card = cards.get(id);
                const isSelected = editing?.index === index;
                return card ? (
                  <DeckCard
                    key={id}
                    card={card}
                    owned={state.cards[id]}
                    selected={isSelected}
                    onClick={() => toggle(slot, index)}
                  />
                ) : null;
              })}
              {Array.from({ length: empties }, (_, i) => {
                const index = ids.length + i;
                return (
                  <button
                    key={`empty-${index}`}
                    type="button"
                    className={`card card-empty${editing?.index === index ? " card-selected" : ""}`}
                    onClick={() => toggle(slot, index)}
                    aria-label={`加入${SLOT_LABEL[slot]}欄`}
                  >
                    +
                  </button>
                );
              })}
            </div>

            {editing && (
              <div className="picker stack" ref={pickerRef}>
                <div className="row between">
                  <strong className="small">
                    {current ? `替換「${cardName(current)}」` : `加入${SLOT_LABEL[slot]}欄`}
                  </strong>
                  <div className="row">
                    {current && (
                      <button type="button" className="small" onClick={() => apply(null)}>
                        移除這張
                      </button>
                    )}
                    <button type="button" className="small" onClick={() => setSelected(null)}>
                      取消
                    </button>
                  </div>
                </div>
                {candidates.length === 0 ? (
                  <p className="muted small">沒有其他可放進這欄的卡，抽卡可取得更多卡片</p>
                ) : (
                  <Candidates key={slot} cards={candidates} owned={state.cards} onPick={apply} />
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Hidden while picking so it never covers the picker. */}
      <div className="sticky-actions" hidden={!!selected}>
        {errors.length > 0 && (
          <ul className="error small">
            {errors.slice(0, 3).map((e, i) => (
              <li key={i}>{deckErrorText(e, cardName)}</li>
            ))}
          </ul>
        )}
        {message && <p className="small">{message}</p>}
        <div className="row">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => {
              setDraft(state.decks[kind]);
              setSelected(null);
            }}
          >
            還原
          </button>
          <button type="button" className="primary grow" disabled={!dirty || errors.length > 0 || saving} onClick={save}>
            {saving ? "儲存中…" : "儲存牌組"}
          </button>
        </div>
      </div>
    </section>
  );
}

/** The picker grid, rendered in chunks since a big collection means hundreds of cards. */
function Candidates({ cards, owned, onPick }: { cards: CardDefinition[]; owned: PlayerState["cards"]; onPick: (id: string) => void }) {
  const { limit, sentinel } = useChunk(cards.length, 0);
  return (
    <>
      <div className="grid deck-grid">
        {cards.slice(0, limit).map((c) => (
          <DeckCard key={c.id} card={c} owned={owned[c.id]} onClick={() => onPick(c.id)} />
        ))}
      </div>
      {sentinel}
    </>
  );
}
