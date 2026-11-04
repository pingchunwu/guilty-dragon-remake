import { useEffect, useMemo, useRef, useState } from "react";
import {
  DECK_SLOTS,
  RARITIES,
  RULES_V0,
  validateDeck,
  type Deck,
  type CardDefinition,
  type DeckSlot,
} from "@gdr/engine";
import type { Content } from "../game/content";
import { DEFAULT_CARD_QUERY, queryCards, type CardQuery, type CardSort } from "../game/cardQuery";
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

const SORT_LABEL: Record<CardSort, string> = { rarity: "稀有度", obtained: "取得時間", attack: "攻擊", draw: "抽牌" };
const OBTAINED_DAYS = [1, 7, 30];
const MIN_ATTACKS = [500, 1000, 1500, 2000];
const DRAWS = [0, 1, 2, 3, 4, 5, 6];

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
  const [query, setQuery] = useState<CardQuery>(DEFAULT_CARD_QUERY);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Where the page was when the picker opened: closing it goes back there.
  const scrollBack = useRef<number | null>(null);
  useEffect(() => {
    if (selected) pickerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    else if (scrollBack.current !== null) {
      window.scrollTo({ top: scrollBack.current, behavior: "smooth" });
      scrollBack.current = null;
    }
  }, [selected]);

  const owned = useMemo(() => new Set(Object.keys(state.cards)), [state.cards]);
  const errors = validateDeck(draft, cards, RULES_V0, owned);
  const inDeck = new Set(Object.values(draft).flat());
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.decks[kind]);

  function toggle(slot: DeckSlot, index: number) {
    if (!selected) scrollBack.current = window.scrollY;
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
        const eligible = editing
          ? [...cards.values()].filter((c) => owned.has(c.id) && !inDeck.has(c.id) && (slot === "free" || c.type === slot))
          : [];
        const candidates = queryCards(eligible, state.cards, query);

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
                {eligible.length === 0 ? (
                  <p className="muted small">沒有其他可放進這欄的卡，抽卡可取得更多卡片</p>
                ) : (
                  <>
                    <PickerControls query={query} onChange={setQuery} />
                    {candidates.length === 0 ? (
                      <p className="muted small">沒有符合篩選條件的卡</p>
                    ) : (
                      <Candidates key={`${slot}-${JSON.stringify(query)}`} cards={candidates} owned={state.cards} onPick={apply} />
                    )}
                  </>
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

/** Sort and filter menus for the picker. */
function PickerControls({ query, onChange }: { query: CardQuery; onChange: (q: CardQuery) => void }) {
  const set = (patch: Partial<CardQuery>) => onChange({ ...query, ...patch });
  const byTime = query.sort === "obtained";
  return (
    <div className="picker-controls small">
      <label>
        排序
        <select value={query.sort} onChange={(e) => set({ sort: e.target.value as CardSort })}>
          {(Object.keys(SORT_LABEL) as CardSort[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label>
        順序
        <button type="button" onClick={() => set({ descending: !query.descending })}>
          {query.descending ? (byTime ? "新到舊" : "高到低") : byTime ? "舊到新" : "低到高"}
        </button>
      </label>
      <label>
        稀有度
        <select value={query.rarity} onChange={(e) => set({ rarity: e.target.value as CardQuery["rarity"] })}>
          <option value="all">全部</option>
          {[...RARITIES].reverse().map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label>
        取得時間
        <select value={query.obtainedDays} onChange={(e) => set({ obtainedDays: Number(e.target.value) })}>
          <option value={0}>全部</option>
          {OBTAINED_DAYS.map((d) => (
            <option key={d} value={d}>
              {d} 天內
            </option>
          ))}
        </select>
      </label>
      <label>
        攻擊
        <select value={query.minAttack} onChange={(e) => set({ minAttack: Number(e.target.value) })}>
          <option value={0}>全部</option>
          {MIN_ATTACKS.map((a) => (
            <option key={a} value={a}>
              {a} 以上
            </option>
          ))}
        </select>
      </label>
      <label>
        抽牌
        <select value={query.draw} onChange={(e) => set({ draw: Number(e.target.value) })}>
          <option value={-1}>全部</option>
          {DRAWS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
    </div>
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
