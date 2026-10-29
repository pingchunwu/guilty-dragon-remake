import { RULES_V07 } from "@gdr/engine";
import type { Content } from "../game/content";
import type { GameService, PlayerState } from "../game/types";
import { setFxQuality, useFxQuality } from "../game/settings";
import { Collection } from "./Collection";

interface Props {
  content: Content;
  service: GameService;
  state: PlayerState;
  email: string | undefined;
  onSignOut: () => void;
}

export function Player({ content, service, state, email, onSignOut }: Props) {
  const fx = useFxQuality();
  return (
    <div className="stack">
      <section className="panel stack">
        <h2>玩家</h2>
        <p>{service.mode === "guest" ? "訪客試玩（不保存）" : email}</p>
        <p className="muted small">開發版 · 規則 {RULES_V07.ruleVersion} · 卡片為佔位內容</p>
        <button type="button" onClick={onSignOut}>
          {service.mode === "guest" ? "離開試玩" : "登出"}
        </button>
      </section>
      <section className="panel stack">
        <div className="row settings-row">
          <span>特效</span>
          <div className="chips">
            {(["high", "low"] as const).map((q) => (
              <button key={q} type="button" className={`chip${fx === q ? " active" : ""}`} onClick={() => setFxQuality(q)}>
                {q === "high" ? "高" : "低"}
              </button>
            ))}
          </div>
        </div>
        <p className="muted small">低：使用 2D 特效，適合較舊的手機</p>
      </section>
      <Collection content={content} state={state} />
    </div>
  );
}
