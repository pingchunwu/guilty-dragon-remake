import { useMemo, useState } from "react";
import { DECK_SLOTS, PLACEHOLDER_CARDS, RULES_V0, validateDeck, type Deck, type DeckSlot } from "@gdr/engine";
import { GameError, type DeckKind, type GameService, type PlayerState } from "../game/types";
import { SLOT_LABEL, deckErrorText, errorText } from "../game/text";
import { CardTile } from "./CardTile";

const cards = new Map(PLACEHOLDER_CARDS.map((c) => [c.id, c]));
const cardName = (id: string) => cards.get(id)?.name ?? id;

interface Props {
  service: GameService;
  state: PlayerState;
  onState: (s: PlayerState) => void;
}

export function DeckEditor({ service, state, onState }: Props) {
  const [kind, setKind] = useState<DeckKind>("attack");
  const [draft, setDraft] = useState<Deck>(state.decks.attack);
  const [slot, setSlot] = useState<DeckSlot>("heavy");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const owned = useMemo(() => new Set(Object.keys(state.cards)), [state.cards]);
  const errors = validateDeck(draft, cards, RULES_V0, owned);
  const inDeck = new Set(Object.values(draft).flat());
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.decks[kind]);
  const candidates = PLACEHOLDER_CARDS.filter(
    (c) => owned.has(c.id) && !inDeck.has(c.id) && (slot === "free" || c.type === slot),
  );

  function switchKind(next: DeckKind) {
    setKind(next);
    setDraft(state.decks[next]);
    setMessage(null);
  }

  const remove = (s: DeckSlot, id: string) => {
    setDraft({ ...draft, [s]: draft[s].filter((x) => x !== id) });
    setSlot(s);
    setMessage(null);
  };
  const add = (id: string) => {
    if (draft[slot].length >= RULES_V0.slotSize) return;
    setDraft({ ...draft, [slot]: [...draft[slot], id] });
    setMessage(null);
  };

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const result = await service.saveDeck(kind, draft);
      if (result.ok) {
        onState({ ...state, decks: { ...state.decks, [kind]: draft } });
        setMessage("已儲存。");
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
    <section className="stack">
      <h2>牌組</h2>
      <div className="chips">
        {(["attack", "defense"] as const).map((k) => (
          <button key={k} type="button" className={kind === k ? "chip active" : "chip"} onClick={() => switchKind(k)}>
            {k === "attack" ? "進攻牌組" : "防守牌組"}
          </button>
        ))}
      </div>

      {DECK_SLOTS.map((s) => (
        <div key={s} className={`panel slot${slot === s ? " slot-active" : ""}`}>
          <button type="button" className="slot-header" onClick={() => setSlot(s)}>
            <span>{SLOT_LABEL[s]}欄</span>
            <span className="muted">
              {draft[s].length}/{RULES_V0.slotSize}
            </span>
          </button>
          <div className="grid compact">
            {draft[s].map((id) => {
              const card = cards.get(id);
              return card ? (
                <CardTile key={id} card={card} owned={state.cards[id]} onClick={() => remove(s, id)} badge="移除" />
              ) : null;
            })}
          </div>
        </div>
      ))}

      <div className="panel stack">
        <div className="row between">
          <strong>加入{SLOT_LABEL[slot]}欄</strong>
          <span className="muted small">點欄位標題切換</span>
        </div>
        {draft[slot].length >= RULES_V0.slotSize ? (
          <p className="muted">此欄已滿，先移除一張再加入。</p>
        ) : candidates.length === 0 ? (
          <p className="muted">沒有可加入的卡。</p>
        ) : (
          <div className="grid compact">
            {candidates.map((c) => (
              <CardTile key={c.id} card={c} owned={state.cards[c.id]} onClick={() => add(c.id)} badge="加入" />
            ))}
          </div>
        )}
      </div>

      <div className="sticky-actions">
        {errors.length > 0 && (
          <ul className="error small">
            {errors.slice(0, 3).map((e, i) => (
              <li key={i}>{deckErrorText(e, cardName)}</li>
            ))}
          </ul>
        )}
        {message && <p className="small">{message}</p>}
        <div className="row">
          <button type="button" disabled={!dirty || saving} onClick={() => setDraft(state.decks[kind])}>
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
