import { useState } from "react";
import { PLACEHOLDER_CARDS, type PullResult } from "@gdr/engine";
import { GameError, type GameService, type PlayerState } from "../game/types";
import { errorText } from "../game/text";
import { CardTile } from "./CardTile";

const cards = new Map(PLACEHOLDER_CARDS.map((c) => [c.id, c]));

interface Props {
  service: GameService;
  state: PlayerState;
  onState: (s: PlayerState) => void;
}

function badge(r: PullResult): string {
  if (r.isNew) return "NEW";
  return r.leveledUp ? `升級 Lv ${r.level}` : "碎片 +1";
}

export function Gacha({ service, state, onState }: Props) {
  const [results, setResults] = useState<PullResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept until a draw succeeds, so a retry after a network failure reuses it and is never charged twice.
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  async function draw() {
    const key = pendingKey ?? crypto.randomUUID();
    setPendingKey(key);
    setBusy(true);
    setError(null);
    try {
      const outcome = await service.drawTen(key);
      setResults(outcome.results);
      onState(outcome.state);
      setPendingKey(null);
    } catch (e) {
      const err = e instanceof GameError ? e : new GameError("UNKNOWN");
      if (!err.retryable) setPendingKey(null);
      setError(errorText(err.code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack">
      <h2>抽卡</h2>
      <div className="panel stack">
        <div className="row between">
          <span>抽卡券</span>
          <strong className="big">{state.tickets}</strong>
        </div>
        <p className="muted small">每天（台北時間）獲得 1 張，可累積。1 張券進行 10 抽；重複卡轉為碎片，5 片升 1 級。</p>
        <button type="button" className="primary" disabled={busy || (state.tickets < 1 && !pendingKey)} onClick={draw}>
          {busy ? "抽卡中…" : pendingKey ? "重試十連抽" : "十連抽（消耗 1 張）"}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
      {results && (
        <div className="grid">
          {results.map((r, i) => {
            const card = cards.get(r.cardId);
            return card ? (
              <CardTile key={i} card={card} owned={{ level: r.level, shards: r.shards }} badge={badge(r)} />
            ) : null;
          })}
        </div>
      )}
    </section>
  );
}
