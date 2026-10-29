import { useEffect, useState } from "react";
import { ITEM_MAX_LEVEL, type PullResult } from "@gdr/engine";
import type { Content } from "../game/content";
import { GameError, type GameService, type PlayerState } from "../game/types";
import { errorText } from "../game/text";
import { GachaReveal } from "./GachaReveal";

type Kind = "card" | "item";
const KIND_LABEL: Record<Kind, string> = { card: "卡片", item: "裝備" };

interface Props {
  content: Content;
  service: GameService;
  state: PlayerState;
  onState: (s: PlayerState) => void;
}

export function Gacha({ content: { cards, items }, service, state, onState }: Props) {
  useEffect(() => void import("./GachaSeal3D"), []); // preload the 3D chunk so the seal starts instantly
  const [kind, setKind] = useState<Kind>("card");
  const [results, setResults] = useState<{ kind: Kind; list: PullResult[] } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept per kind until a draw succeeds, so a retry after a network failure
  // reuses it and is never charged twice.
  const [pendingKeys, setPendingKeys] = useState<Record<Kind, string | null>>({ card: null, item: null });
  const pendingKey = pendingKeys[kind];

  async function draw() {
    const key = pendingKey ?? crypto.randomUUID();
    const setPending = (k: string | null) => setPendingKeys((keys) => ({ ...keys, [kind]: k }));
    setPending(key);
    setBusy(true);
    setError(null);
    try {
      const outcome = kind === "card" ? await service.drawTen(key) : await service.drawItems(key);
      setResults({ kind, list: outcome.results });
      setRevealing(true);
      onState(outcome.state);
      setPending(null);
    } catch (e) {
      const err = e instanceof GameError ? e : new GameError("UNKNOWN");
      if (!err.retryable) setPending(null);
      setError(errorText(err.code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack">
      <h2>抽卡</h2>
      <div className="chips">
        {(["card", "item"] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`chip${kind === k ? " active" : ""}`}
            disabled={busy}
            onClick={() => {
              setKind(k);
              setError(null);
            }}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="panel stack">
        <div className="row between">
          <span>抽卡券</span>
          <strong className="big">{state.tickets}</strong>
        </div>
        <p className="muted small">
          每天（台北時間）獲得 1 張，可累積；卡片和裝備共用。1 張券進行 10 抽；每抽到重複的就升 1 級（卡片升的是技能等級，上限依技能；裝備每級 +10%，上限 Lv {ITEM_MAX_LEVEL}）。
        </p>
        <button type="button" className="primary" disabled={busy || (state.tickets < 1 && !pendingKey)} onClick={draw}>
          {busy ? "抽卡中…" : `${pendingKey ? "重試" : ""}${KIND_LABEL[kind]}十連抽${pendingKey ? "" : "（消耗 1 張）"}`}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
      {results && revealing && (
        <GachaReveal
          kind={results.kind}
          results={results.list}
          cards={cards}
          items={items}
          onClose={() => setRevealing(false)}
          onAgain={
            state.tickets >= 1 && !busy
              ? () => {
                  setRevealing(false);
                  void draw();
                }
              : undefined
          }
        />
      )}
    </section>
  );
}
