import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { RULES_V0 } from "@gdr/engine";
import { createGuestService } from "./game/guestService";
import { createAccountService, supabase } from "./game/supabase";
import { errorText } from "./game/text";
import { GameError, type GameService, type PlayerState } from "./game/types";
import { Battle } from "./screens/Battle";
import { Collection } from "./screens/Collection";
import { DeckEditor } from "./screens/DeckEditor";
import { Equipment } from "./screens/Equipment";
import { Gacha } from "./screens/Gacha";
import { SignIn } from "./screens/SignIn";

type Tab = "collection" | "deck" | "equipment" | "battle" | "gacha";
const TABS: { id: Tab; label: string }[] = [
  { id: "collection", label: "收藏" },
  { id: "deck", label: "牌組" },
  { id: "equipment", label: "裝備" },
  { id: "battle", label: "對戰" },
  { id: "gacha", label: "抽卡" },
];

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [service, setService] = useState<GameService | null>(null);
  const [state, setState] = useState<PlayerState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("collection");

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
    setTab("collection");
  }

  return (
    <div className="shell">
      <header className="row between">
        <div>
          <h1>Guilty Dragon Remake</h1>
          <p className="muted small">開發版 · 規則 {RULES_V0.ruleVersion} · 卡片為佔位內容</p>
        </div>
        {service && (
          <button type="button" className="link" onClick={signOut}>
            {service.mode === "guest" ? "離開試玩" : "登出"}
          </button>
        )}
      </header>

      {!authReady && <p className="muted">載入中…</p>}
      {authReady && !service && <SignIn client={supabase} onGuest={() => setService(createGuestService())} />}

      {service && (
        <>
          <div className="panel row between small">
            <span>{service.mode === "guest" ? "訪客試玩（不保存）" : session?.user.email}</span>
            {state && <span>抽卡券 {state.tickets}</span>}
          </div>
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
              {tab === "collection" && <Collection state={state} />}
              {tab === "deck" && <DeckEditor service={service} state={state} onState={setState} />}
              {tab === "equipment" && <Equipment service={service} state={state} onState={setState} />}
              {/* Kept mounted so switching tabs doesn't lose a battle in progress. */}
              <div hidden={tab !== "battle"}>
                <Battle state={state} />
              </div>
              {tab === "gacha" && <Gacha service={service} state={state} onState={setState} />}
            </main>
          )}
          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
