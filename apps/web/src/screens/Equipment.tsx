import { useState } from "react";
import { ARMOR_KINDS, WEAPON_KINDS, defenseOf, levelsOf, resolveEquipment, type ItemKind } from "@gdr/engine";
import type { Content } from "../game/content";
import { GameError, type GameService, type PlayerState } from "../game/types";
import { ITEM_KIND_LABEL, TYPE_LABEL, errorText, loadoutErrorText } from "../game/text";
import { ItemTile } from "./ItemTile";

interface Props {
  content: Content;
  service: GameService;
  state: PlayerState;
  onState: (s: PlayerState) => void;
}

/** One loadout (a weapon per colour, an armor piece per body part) used for both attack and defense battles. */
export function Equipment({ content: { items }, service, state, onState }: Props) {
  const [open, setOpen] = useState<ItemKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const equipped = resolveEquipment(state.loadout, items, levelsOf(state.items));

  async function equip(kind: ItemKind, itemId: string | null) {
    const loadout = { ...state.loadout, [kind]: itemId };
    setBusy(true);
    setError(null);
    try {
      const result = await service.saveLoadout(loadout);
      if (result.ok) {
        onState({ ...state, loadout });
        setOpen(null);
      } else {
        setError(result.errors.map(loadoutErrorText).join(" "));
      }
    } catch (e) {
      setError(errorText(e instanceof GameError ? e.code : "UNKNOWN"));
    } finally {
      setBusy(false);
    }
  }

  function slot(kind: ItemKind) {
    const current = equipped[kind];
    const owned = [...items.values()].filter((i) => i.kind === kind && state.items[i.id]);
    return (
      <div key={kind} className={`panel stack slot${open === kind ? " slot-active" : ""}`}>
        <div className="row between">
          <strong>{ITEM_KIND_LABEL[kind]}</strong>
          <span className="muted small">擁有 {owned.length}</span>
        </div>
        <div className="grid compact">
          {current ? (
            <ItemTile item={current} owned={state.items[current.id]} onClick={() => setOpen(open === kind ? null : kind)} />
          ) : (
            <button type="button" className="card card-empty" onClick={() => setOpen(open === kind ? null : kind)}>
              ＋
            </button>
          )}
        </div>
        {open === kind && (
          <div className="picker stack">
            <span className="small muted">選擇要裝備的{ITEM_KIND_LABEL[kind]}</span>
            <div className="grid compact">
              {owned.map((item) => (
                <ItemTile
                  key={item.id}
                  item={item}
                  owned={state.items[item.id]}
                  selected={item.id === current?.id}
                  badge={item.id === current?.id ? "裝備中" : undefined}
                  onClick={() => !busy && item.id !== current?.id && equip(kind, item.id)}
                />
              ))}
            </div>
            <div className="row">
              {current && (
                <button type="button" className="small" disabled={busy} onClick={() => equip(kind, null)}>
                  卸下
                </button>
              )}
              <button type="button" className="small" onClick={() => setOpen(null)}>
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="stack">
      <h2>裝備</h2>
      <div className="panel stack small">
        <div className="row between">
          <span>防禦（四件防具合計）</span>
          <strong>{defenseOf(equipped)}%</strong>
        </div>
        {WEAPON_KINDS.map((kind) => (
          <div key={kind} className="row between">
            <span>{TYPE_LABEL[kind]}領導卡用的武器</span>
            <strong>{equipped[kind]?.attack ?? 0}</strong>
          </div>
        ))}
        <p className="muted">
          進攻和防守使用同一套裝備。新規則尚未上線：目前對戰取最強的一把武器，防具合計當作固定防禦值。新裝備從抽卡頁的「裝備」十連抽取得。
        </p>
      </div>
      {error && <p className="error">{error}</p>}

      <h3>武器</h3>
      {WEAPON_KINDS.map(slot)}
      <h3>防具</h3>
      {ARMOR_KINDS.map(slot)}
    </section>
  );
}
