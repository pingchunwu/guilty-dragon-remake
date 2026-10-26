import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { RULES_V0 } from "@gdr/engine";
import { loadContent, type Content } from "./game/content";
import { createGuestService } from "./game/guestService";
import { createPvpService } from "./game/pvp";
import { createAccountService, supabase } from "./game/supabase";
import { errorText } from "./game/text";
import { GameError, type GameService, type PlayerState } from "./game/types";
import { Battle } from "./screens/Battle";
import { CardToast } from "./screens/CardTile";
import { DeckEditor } from "./screens/DeckEditor";
import { Equipment } from "./screens/Equipment";
import { Gacha } from "./screens/Gacha";
import { Player } from "./screens/Player";
import { Pvp } from "./screens/Pvp";
import { SignIn } from "./screens/SignIn";

type Tab = "battle" | "deck" | "gacha" | "player";
const TABS: { id: Tab; label: string }[] = [
  { id: "battle", label: "對戰" },
  { id: "deck", label: "牌組" },
  { id: "gacha", label: "抽卡" },
  { id: "player", label: "玩家" },
];

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [service, setService] = useState<GameService | null>(null);
  const [state, setState] = useState<PlayerState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("battle");
  const [deckView, setDeckView] = useState<"deck" | "equipment">("deck");
  const [content, setContent] = useState<Content | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  const fetchContent = useCallback(async () => {
    setContentError(null);
    try {
      setContent(await loadContent(supabase));
    } catch (e) {
      setContentError(errorText(e instanceof GameError ? e.code : "UNKNOWN"));
    }
  }, []);

  useEffect(() => {
    void fetchContent();
  }, [fetchContent]);

  // A friend battle on screen hides practice; an unfinished one also locks navigation.
  const [pvpBattle, setPvpBattle] = useState({ shown: false, locked: false });
  const pvp = useMemo(() => (service?.mode === "account" && supabase ? createPvpService(supabase) : null), [service]);
  const onPvpBattle = useCallback((shown: boolean, locked: boolean) => {
    setPvpBattle({ shown, locked });
    if (locked) setTab("battle");
  }, []);
  useEffect(() => {
    if (!pvp) setPvpBattle({ shown: false, locked: false });
  }, [pvp]);
  // Any battle on screen takes the whole screen: no header, no tabs (§6c).
  const [practice, setPractice] = useState(false);
  const inBattle = practice || pvpBattle.shown;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (supabase && userId) setService(createAccountService(supabase));
    else setService((current) => (current?.mode === "account" ? null : current));
  }, [userId]);

  const load = useCallback(async (svc: GameService) => {
    setLoadError(null);
    setState(null);
    try {
      setState(await svc.sync());
    } catch (e) {
      setLoadError(errorText(e instanceof GameError ? e.code : "UNKNOWN"));
    }
  }, []);

  useEffect(() => {
    if (service) void load(service);
    else setState(null);
  }, [service, load]);

  async function signOut() {
    if (service?.mode === "account") await supabase?.auth.signOut();
    setService(null);
    setTab("battle");
  }

  return (
    <div className={inBattle ? "shell in-battle" : "shell"}>
      <header hidden={inBattle}>
        <h1>Guilty Dragon Remake</h1>
        {!service && <p className="muted small">開發版 · 規則 {RULES_V0.ruleVersion} · 卡片為佔位內容</p>}
      </header>

      {contentError && (
        <div className="panel stack">
          <p className="error">{contentError}</p>
          <button type="button" onClick={fetchContent}>
            重試
          </button>
        </div>
      )}
      {(!authReady || (!content && !contentError)) && <p className="muted">載入中…</p>}
      {/* !userId: a restored session is about to create the account service, so don't flash the sign-in form. */}
      {authReady && content && !service && !userId && (
        <SignIn client={supabase} onGuest={() => setService(createGuestService(content))} />
      )}

      {service && content && (
        <>
          {loadError && (
            <div className="panel stack">
              <p className="error">{loadError}</p>
              <button type="button" onClick={() => load(service)}>
                重試
              </button>
            </div>
          )}
          {!state && !loadError && <p className="muted">載入玩家資料…</p>}
          {state && (
            <main>
              {tab === "deck" && (
                <div className="stack">
                  <div className="chips">
                    {(["deck", "equipment"] as const).map((v) => (
                      <button key={v} type="button" className={deckView === v ? "chip active" : "chip"} onClick={() => setDeckView(v)}>
                        {v === "deck" ? "牌組" : "裝備"}
                      </button>
                    ))}
                  </div>
                  {/* Both stay mounted so switching keeps unsaved drafts. */}
                  <div hidden={deckView !== "deck"}>
                    <DeckEditor content={content} service={service} state={state} onState={setState} />
                  </div>
                  <div hidden={deckView !== "equipment"}>
                    <Equipment content={content} service={service} state={state} onState={setState} />
                  </div>
                </div>
              )}
              {/* Kept mounted so switching tabs doesn't lose a battle in progress. */}
              <div hidden={tab !== "battle"}>
                <div hidden={practice}>{pvp && <Pvp pvp={pvp} state={state} onBattle={onPvpBattle} />}</div>
                <div hidden={pvpBattle.shown}>
                  <Battle content={content} state={state} onActive={setPractice} />
                </div>
              </div>
              {tab === "gacha" && <Gacha content={content} service={service} state={state} onState={setState} />}
              {tab === "player" && (
                <Player content={content} service={service} state={state} email={session?.user.email} onSignOut={signOut} />
              )}
            </main>
          )}
          {!inBattle && (
            <nav className="tabs">
              {TABS.map((t) => (
                <button key={t.id} type="button" className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </nav>
          )}
        </>
      )}
      <CardToast />
    </div>
  );
}
