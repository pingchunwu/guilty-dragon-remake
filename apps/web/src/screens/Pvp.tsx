import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RULES_V0, RULES_V07, type Selection, type SideId } from "@gdr/engine";
import type { PvpBattle, PvpHistoryEntry, PvpLobby, PvpPlayer, PvpService } from "../game/pvp";
import { errorText } from "../game/text";
import { GameError, type PlayerState } from "../game/types";
import { ConfirmDialog, DeckOutPanel, HandPicker, HpBar, isV07, ResultScreen, type SideLabels } from "./BattleParts";
import { PhaseBoard, hpAfterSkills } from "./Playback";
import { Duel } from "./Duel";

/** Server grace after the deadline; matches game_config pvp_grace_seconds. */
const GRACE_MS = 5000;

const END_REASON: Record<PvpHistoryEntry["endReason"], string> = { hp: "HP 歸零", surrender: "投降", timeout: "逾時" };

interface Props {
  pvp: PvpService;
  state: PlayerState;
  /** `shown`: a battle fills the screen. `locked`: it is unfinished and the player may not leave. */
  onBattle: (shown: boolean, locked: boolean) => void;
}

/**
 * Friend PvP: challenge any player's saved defense deck, played by the
 * server's defender AI. Each phase goes to the `pvp` Edge Function. One
 * battle at a time; leaving only by surrender, and running out the turn clock loses.
 */
export function Pvp({ pvp, state: player, onBattle }: Props) {
  const [lobby, setLobby] = useState<PvpLobby | null>(null);
  const [battle, setBattle] = useState<PvpBattle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // A battle that ended away from its screen (surrender, timeout) still gets the result screen.
  const [ended, setEnded] = useState<PvpHistoryEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(errorText(e instanceof GameError ? e.code : "UNKNOWN"));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  const battleRef = useRef(battle);
  battleRef.current = battle;

  /** Reloads the lobby; an unfinished battle (e.g. after a reload) comes back on screen. */
  const refresh = useCallback(
    async (fallbackNotice?: string) => {
      const next = await run(() => pvp.lobby());
      if (!next) return;
      setLobby(next);
      const current = battleRef.current;
      if (next.active) setBattle(next.active);
      else if (current?.status === "active") {
        const finished = next.history.find((h) => h.id === current.id);
        setEnded(finished ?? null);
        setNotice(finished ? null : (fallbackNotice ?? null));
        setBattle(null);
      }
    },
    [pvp, run],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = battle?.status === "active";
  useEffect(() => onBattle(battle !== null, active), [battle, active, onBattle]);

  // Leaving the page is not allowed mid-battle (decided); warn on reload/close.
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  async function start(opponent: Pick<PvpPlayer, "id">) {
    setNotice(null);
    setEnded(null);
    const view = await run(() => pvp.start(opponent.id));
    if (view) setBattle(view);
    else void refresh();
  }

  async function play(selection: Selection | null) {
    if (!battle) return;
    try {
      setBusy(true);
      setError(null);
      setBattle(await pvp.play(battle.phase, selection));
    } catch (e) {
      const code = e instanceof GameError ? e.code : "UNKNOWN";
      if (code === "NO_ACTIVE_BATTLE" || code === "PHASE_CONFLICT") await refresh(errorText(code));
      else setError(errorText(code));
    } finally {
      setBusy(false);
    }
  }

  async function surrender() {
    const next = await run(() => pvp.surrender());
    if (!next) return void refresh();
    setLobby(next);
    setBattle(null);
    setEnded(next.history[0] ?? null);
  }

  if (battle) {
    return (
      <BattleView
        key={battle.id}
        battle={battle}
        player={player}
        busy={busy}
        error={error}
        onPlay={play}
        onSurrender={surrender}
        onTimeout={() => void refresh()}
        onClose={() => {
          setBattle(null);
          void refresh();
        }}
        onRematch={() => {
          setBattle(null);
          void start(battle.opponent);
        }}
      />
    );
  }

  return (
    <section className="stack">
      <h2>好友對戰</h2>
      {notice && <p className="panel">{notice}</p>}
      {ended && (
        <ResultScreen won={ended.won} stats={`${END_REASON[ended.endReason]} · 共 ${ended.phase} 階段 · 你剩 ${ended.hp.challenger} HP · ${ended.opponent.name} 剩 ${ended.hp.defender} HP`}>
          <button type="button" className="primary grow" disabled={busy} onClick={() => void start(ended.opponent)}>
            再戰一次
          </button>
          <button type="button" className="grow" onClick={() => setEnded(null)}>
            返回
          </button>
        </ResultScreen>
      )}
      {error && <p className="error">{error}</p>}
      {!lobby ? (
        <p className="muted">{busy ? "載入對戰資料…" : ""}</p>
      ) : (
        <Lobby lobby={lobby} busy={busy} run={run} pvp={pvp} onLobby={setLobby} onChallenge={start} />
      )}
    </section>
  );
}

interface LobbyProps {
  lobby: PvpLobby;
  busy: boolean;
  pvp: PvpService;
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  onLobby: (lobby: PvpLobby) => void;
  onChallenge: (opponent: PvpPlayer) => void;
}

function Lobby({ lobby, busy, pvp, run, onLobby, onChallenge }: LobbyProps) {
  const [name, setName] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const friends = lobby.players.filter((p) => p.friend);
  const others = lobby.players.filter((p) => !p.friend);

  async function update(fn: () => Promise<PvpLobby>, after?: () => void) {
    const next = await run(fn);
    if (next) {
      onLobby(next);
      after?.();
    }
  }

  const playerRow = (p: PvpPlayer) => (
    <li key={p.id} className="row between">
      <span className="grow">{p.name}</span>
      {p.friend && (
        <button type="button" className="link" disabled={busy} onClick={() => update(() => pvp.removeFriend(p.id))}>
          移除
        </button>
      )}
      <button type="button" className="primary" disabled={busy} onClick={() => onChallenge(p)}>
        挑戰
      </button>
    </li>
  );

  return (
    <>
      <div className="panel stack">
        <p className="muted small">
          用你的進攻牌組挑戰其他玩家的防守牌組，對手由伺服器 AI 出牌，結果由伺服器結算。一次只能進行一場；
          對戰中不能離開，投降或回合時間（90 秒，含動畫）內沒有出牌都算落敗。沒有獎勵。
        </p>
        {name === null ? (
          <div className="row between">
            <span>
              你的名稱：<strong>{lobby.me.name}</strong>
            </span>
            <button type="button" className="link" onClick={() => setName(lobby.me.name)}>
              修改
            </button>
          </div>
        ) : (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void update(() => pvp.setName(name), () => setName(null));
            }}
          >
            <input className="grow" value={name} maxLength={20} placeholder="留空則顯示「玩家＋好友代碼」" onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="primary" disabled={busy}>
              儲存
            </button>
            <button type="button" onClick={() => setName(null)}>
              取消
            </button>
          </form>
        )}
        <div className="row between">
          <span>
            你的好友代碼：<strong>{lobby.me.friendCode}</strong>
          </span>
          <button type="button" className="link" onClick={() => void navigator.clipboard?.writeText(lobby.me.friendCode)}>
            複製
          </button>
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void update(() => pvp.addFriend(code), () => setCode(""));
          }}
        >
          <input className="grow" value={code} placeholder="輸入朋友的好友代碼" onChange={(e) => setCode(e.target.value)} />
          <button type="submit" disabled={busy || !code.trim()}>
            加好友
          </button>
        </form>
      </div>

      <div className="panel stack">
        <strong>好友</strong>
        {friends.length === 0 ? (
          <p className="muted small">還沒有好友。輸入朋友的好友代碼，好友會排在最上面。</p>
        ) : (
          <ul className="result-list stack">{friends.map(playerRow)}</ul>
        )}
        <strong>所有玩家</strong>
        {others.length === 0 ? (
          <p className="muted small">還沒有其他玩家。</p>
        ) : (
          <ul className="result-list stack">{others.map(playerRow)}</ul>
        )}
      </div>

      <div className="panel stack">
        <strong>對戰紀錄</strong>
        {lobby.history.length === 0 ? (
          <p className="muted small">還沒有對戰紀錄。別人挑戰你的防守牌組後也會出現在這裡。</p>
        ) : (
          <ul className="result-list stack small">
            {lobby.history.map((h) => (
              <li key={h.id}>
                {h.role === "challenger" ? `你挑戰 ${h.opponent.name}` : `${h.opponent.name} 挑戰你`}：
                <strong>{h.won ? "勝利" : "落敗"}</strong>
                <span className="muted">
                  {" "}
                  · 第 {h.phase} 階段 · {END_REASON[h.endReason]} · HP {h.hp[h.role]} 對 {h.hp[h.role === "challenger" ? "defender" : "challenger"]} ·{" "}
                  {new Date(h.finishedAt).toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

interface BattleViewProps {
  battle: PvpBattle;
  player: PlayerState;
  busy: boolean;
  error: string | null;
  onPlay: (selection: Selection | null) => void;
  onSurrender: () => void;
  onTimeout: () => void;
  onClose: () => void;
  onRematch: () => void;
}

type Hp = Record<SideId, number>;

function BattleView({ battle, player, busy, error, onPlay, onSurrender, onTimeout, onClose, onRematch }: BattleViewProps) {
  const cards = useMemo(() => new Map(Object.entries(battle.cards)), [battle.cards]);
  const labels: SideLabels = { challenger: "你", defender: battle.opponent.name };
  const rules = battle.ruleVersion === RULES_V07.ruleVersion ? RULES_V07 : RULES_V0;
  const over = battle.status !== "active";
  const [asking, setAsking] = useState(false);
  const remaining = useCountdown(battle, over ? undefined : onTimeout);

  // A phase played while this view is open replays from the HP it started with; after a reload it shows the end state.
  const phase = battle.last?.phase ?? 0;
  const [track, setTrack] = useState<{ phase: number; hp: Hp; before: Hp | null }>({ phase, hp: battle.hp, before: null });
  if (track.phase !== phase || track.hp !== battle.hp) {
    setTrack({ phase, hp: battle.hp, before: phase > track.phase ? track.hp : phase === track.phase ? track.before : null });
  }
  const replaying = track.before !== null;
  const onReplayDone = useCallback(() => setTrack((t) => ({ ...t, before: null })), []);
  const onSkills = () => {
    const shown = battle.last;
    if (shown) setTrack((t) => (t.before ? { ...t, before: hpAfterSkills(t.before, shown) } : t));
  };
  const hpOf = (id: SideId) => track.before?.[id] ?? battle.hp[id];
  const endPanel = (
    <ResultScreen
      won={battle.status === "challenger_won"}
      stats={`${battle.endReason ? `${END_REASON[battle.endReason]} · ` : ""}共 ${battle.phase} 階段 · 你剩 ${battle.hp.challenger} HP · ${battle.opponent.name} 剩 ${battle.hp.defender} HP`}
    >
      <button type="button" className="primary grow" onClick={onRematch}>
        再戰一次
      </button>
      <button type="button" className="grow" onClick={onClose}>
        返回
      </button>
    </ResultScreen>
  );

  return (
    <section className="battle-screen">
      <div className="row between small">
        <strong className="one-line">
          挑戰 {battle.opponent.name}
          {!(over && !replaying) && ` · 第 ${replaying && battle.last ? battle.last.phase : battle.phase} 階段`}
        </strong>
        {over ? (
          !replaying && <span className="muted">結束</span>
        ) : (
          <span className="row nowrap">
            {/* The turn allows for the replay, so the clock only shows once it is your move. */}
            {!replaying && <strong className={remaining <= 10 ? "error" : ""}>剩 {Math.max(0, remaining)} 秒</strong>}
            <button type="button" className="link" disabled={busy} onClick={() => setAsking(true)}>
              投降
            </button>
          </span>
        )}
      </div>
      {asking && !over && (
        <ConfirmDialog
          message="確定要投降嗎？"
          confirmLabel="投降"
          onConfirm={() => {
            setAsking(false);
            onSurrender();
          }}
          onCancel={() => setAsking(false)}
        />
      )}
      {isV07(rules) ? (
        <Duel
          key={battle.id}
          labels={labels}
          cards={cards}
          owned={player.cards}
          rules={rules}
          equipment={battle.equipment}
          hp={{ challenger: hpOf("challenger"), defender: hpOf("defender") }}
          drawPile={battle.drawPile}
          hand={battle.hand}
          phase={battle.phase}
          kind={battle.kind}
          last={battle.last}
          animate={replaying}
          onDone={onReplayDone}
          onSkills={onSkills}
          busy={busy || replaying || over || remaining <= 0}
          onPlay={onPlay}
          notice={error}
        >
          {over && !replaying ? endPanel : remaining <= 0 && !over ? <p className="panel">時間到，正在確認結果…</p> : undefined}
        </Duel>
      ) : (
        <>
          <HpBar label={labels.defender} hp={hpOf("defender")} equipment={battle.equipment.defender} rules={rules} />
          <PhaseBoard
            key={`board-${phase}`}
            result={battle.last}
            cards={cards}
            labels={labels}
            rules={rules}
            equipment={battle.equipment}
            animate={replaying}
            onDone={onReplayDone}
            onSkills={onSkills}
          />
          <HpBar label={labels.challenger} hp={hpOf("challenger")} equipment={battle.equipment.challenger} rules={rules} />
          {error && <p className="error">{error}</p>}

          {over && !replaying ? (
            endPanel
          ) : remaining <= 0 && !over ? (
            <p className="panel">時間到，正在確認結果…</p>
          ) : battle.kind === "deck_out" && !over ? (
            <DeckOutPanel
              hand={battle.hand}
              cards={cards}
              owned={player.cards}
              ranOut={battle.ranOut}
              rules={rules}
              busy={busy || replaying}
              onResolve={() => onPlay(null)}
            />
          ) : (
            <HandPicker
              key={`hand-${battle.phase}`}
              hand={battle.hand}
              cards={cards}
              owned={player.cards}
              drawPile={battle.drawPile.challenger}
              rules={rules}
              equipment={battle.equipment.challenger}
              busy={busy || replaying || over}
              onPlay={onPlay}
            />
          )}
        </>
      )}
    </section>
  );
}

/** Whole seconds left before the deadline, by the server's clock. Calls `onExpired` once the grace has passed too. */
function useCountdown(battle: PvpBattle, onExpired?: () => void): number {
  const offset = useMemo(() => Date.parse(battle.serverNow) - Date.now(), [battle.serverNow]);
  const deadline = Date.parse(battle.deadline);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const left = deadline - (now + offset);
  const expired = left < -GRACE_MS - 1000;
  const expiredRef = useRef(onExpired);
  expiredRef.current = onExpired;
  // Keeps asking: one failed request must not leave the screen stuck on "time's up".
  useEffect(() => {
    if (!expired) return;
    expiredRef.current?.();
    const timer = window.setInterval(() => expiredRef.current?.(), 5000);
    return () => window.clearInterval(timer);
  }, [expired]);
  // `now` can lag a fresh response by one tick; never show more than the whole turn.
  return Math.min(Math.ceil(left / 1000), Math.round((deadline - Date.parse(battle.serverNow)) / 1000));
}
