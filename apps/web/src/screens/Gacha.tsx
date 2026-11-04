import { useEffect, useRef, useState } from "react";
import { ITEM_MAX_LEVEL, RARITIES, SSR_PITY, type PullResult, type Rarity } from "@gdr/engine";
import type { Content } from "../game/content";
import { GameError, type GameService, type PlayerState } from "../game/types";
import { errorText } from "../game/text";
import { GachaReveal } from "./GachaReveal";
import { SealRing } from "./SealRing";

type Kind = "card" | "item";
const KIND_LABEL: Record<Kind, string> = { card: "卡片", item: "裝備" };

// Survives leaving the tab or reloading, so a draw whose reveal was missed can be replayed free.
// shortcut: not tied to an account, so after switching accounts 重試 is a normal draw; add the user ID if that matters.
const pendingStorageKey = (kind: Kind) => `gdr.gacha.pending.${kind}`;
function readPending(kind: Kind): string | null {
  try {
    return window.localStorage.getItem(pendingStorageKey(kind));
  } catch {
    return null;
  }
}
function writePending(kind: Kind, key: string | null) {
  try {
    if (key) window.localStorage.setItem(pendingStorageKey(kind), key);
    else window.localStorage.removeItem(pendingStorageKey(kind));
  } catch {
    // Not remembered in this browser; the retry still works while this screen stays open.
  }
}

/** e.g. 「N 57.83%・R 31.47%」; empty until the odds have loaded. */
function ratesText(weights: Partial<Record<Rarity, number>> | null): string {
  if (!weights) return "";
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  return RARITIES.filter((r) => weights[r])
    .map((r) => `${r} ${((weights[r]! / total) * 100).toFixed(2)}%`)
    .join("・");
}

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
  const [pendingKeys, setPendingKeys] = useState<Record<Kind, string | null>>({ card: readPending("card"), item: readPending("item") });
  const [weights, setWeights] = useState<Partial<Record<Rarity, number>> | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    service.rarityWeights().then(setWeights, () => {}); // the odds line just stays hidden
  }, [service]);
  const pendingKey = pendingKeys[kind];

  async function draw() {
    const key = pendingKey ?? crypto.randomUUID();
    const setPending = (k: string | null) => {
      writePending(kind, k);
      setPendingKeys((keys) => ({ ...keys, [kind]: k }));
    };
    setPending(key);
    setBusy(true);
    setError(null);
    try {
      const outcome = kind === "card" ? await service.drawTen(key) : await service.drawItems(key);
      onState(outcome.state);
      if (!mounted.current) return; // left the tab: the kept key makes 重試 replay this draw and show its reveal
      setResults({ kind, list: outcome.results });
      setRevealing(true);
      setPending(null);
    } catch (e) {
      const err = e instanceof GameError ? e : new GameError("UNKNOWN");
      if (!err.retryable) setPending(null);
      if (err.code === "INSUFFICIENT_TICKETS") service.sync().then(onState, () => {}); // the count on screen was stale
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
      <div className="gacha-vault">
        <div className="gacha-mark">
          <SealRing size={160} />
          <div className="gacha-count">
            <strong>{state.tickets}</strong>
            <span>抽卡券</span>
          </div>
        </div>
        <div className="gacha-foot">
          <details className="gacha-rules">
            <summary>規則</summary>
            <p>
              每天（台北時間）獲得 1 張，可累積；卡片和裝備共用。1 張券進行 10 抽；每抽到重複的就升 1 級（卡片升的是技能等級，上限依技能；裝備每級 +10%，上限 Lv {ITEM_MAX_LEVEL}）。
            </p>
            {kind === "card" ? (
              <>
                {weights && <p>單抽機率：{ratesText(weights)}</p>}
                <p>保底：每次十連至少 1 張 SR 以上；連續 {SSR_PITY} 抽沒有 SSR 以上時，第 {SSR_PITY} 抽必為 SSR 以上。</p>
              </>
            ) : (
              <p>單抽機率：每件裝備相同。</p>
            )}
          </details>
          {kind === "card" && <p className="small">再抽 {SSR_PITY - state.pity} 抽內必得 SSR 以上</p>}
          {state.tickets < 1 && !pendingKey && <p className="small">下一張券在台北時間午夜發放</p>}
          {error && <p className="error">{error}</p>}
          <button type="button" className="primary gacha-draw" disabled={busy || (state.tickets < 1 && !pendingKey)} onClick={draw}>
            {busy ? (
              "抽卡中…"
            ) : (
              <>
                {pendingKey ? "重試" : ""}
                {KIND_LABEL[kind]}十連抽{!pendingKey && <small>消耗 1 張</small>}
              </>
            )}
          </button>
        </div>
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
