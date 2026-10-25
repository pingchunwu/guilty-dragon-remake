import { RULES_V0 } from "@gdr/engine";

export function App() {
  return (
    <main className="shell">
      <header>
        <h1>Guilty Dragon Remake</h1>
        <p className="muted">開發中 · 規則版本 {RULES_V0.ruleVersion}</p>
      </header>
      <section className="panel">
        <h2>牌組規則</h2>
        <ul>
          <li>
            牌組 {RULES_V0.deckSize} 張：重裝、輕裝、魔裝、自由欄位各 {RULES_V0.slotSize} 張
          </li>
          <li>每階段起始手牌 {RULES_V0.phaseHandSize} 張（暫定）</li>
        </ul>
      </section>
      <section className="panel muted">
        登入、收藏、抽卡與對戰功能將在規則定案後陸續加入。
      </section>
    </main>
  );
}
