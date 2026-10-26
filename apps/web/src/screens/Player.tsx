import { RULES_V0 } from "@gdr/engine";
import type { Content } from "../game/content";
import type { GameService, PlayerState } from "../game/types";
import { Collection } from "./Collection";

interface Props {
  content: Content;
  service: GameService;
  state: PlayerState;
  email: string | undefined;
  onSignOut: () => void;
}

export function Player({ content, service, state, email, onSignOut }: Props) {
  return (
    <div className="stack">
      <section className="panel stack">
        <h2>玩家</h2>
        <p>{service.mode === "guest" ? "訪客試玩（不保存）" : email}</p>
        <p className="muted small">開發版 · 規則 {RULES_V0.ruleVersion} · 卡片為佔位內容</p>
        <button type="button" onClick={onSignOut}>
          {service.mode === "guest" ? "離開試玩" : "登出"}
        </button>
      </section>
      <Collection content={content} state={state} />
    </div>
  );
}
