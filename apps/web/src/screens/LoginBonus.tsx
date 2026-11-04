import { createPortal } from "react-dom";
import type { LoginBonus as Bonus, LoginBonusItem } from "@gdr/engine";

const itemText = ({ kind, count }: LoginBonusItem) => `${kind === "card" ? "卡片券" : "裝備券"} ×${count}`;

/** Shown once, on the first login of each Taipei day; the server has already granted the item. */
export function LoginBonus({ bonus: { panel, checked }, onClose }: { bonus: Bonus; onClose: () => void }) {
  return createPortal(
    <div className="login-bonus" role="dialog" aria-modal="true" aria-labelledby="login-bonus-title">
      <div className="login-bonus-box stack">
        <h2 id="login-bonus-title">歡迎回來</h2>
        <p>今天的登入獎勵：{itemText(panel[checked - 1]!)}</p>
        <ol className="login-bonus-panel">
          {panel.map((item, i) => (
            <li key={i} className={i === checked - 1 ? "today" : i < checked ? "done" : ""}>
              <span className="small">第 {i + 1} 格</span>
              <strong>{itemText(item)}</strong>
              <span className="login-bonus-check">{i < checked ? "✓" : ""}</span>
            </li>
          ))}
        </ol>
        <p className="small">每天第一次登入可領下一格，不必連續登入。第 {panel.length} 格領完後會換新的面板。</p>
        <button type="button" className="primary" autoFocus onClick={onClose}>
          收下
        </button>
      </div>
    </div>,
    document.body,
  );
}
