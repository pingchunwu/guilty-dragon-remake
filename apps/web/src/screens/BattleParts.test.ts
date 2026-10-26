import { describe, expect, it } from "vitest";
import { RULES_V0, skillOf, type SideResult } from "@gdr/engine";
import { skillOutcome } from "./BattleParts";

const side = (over: Partial<SideResult> = {}): SideResult => ({
  played: [],
  chain: [],
  blocks: 0,
  leaderType: "heavy",
  skill: null,
  baseAttack: 0,
  comboCount: 1,
  combo: 1,
  advantageMultiplier: 1,
  advantage: false,
  weaponAttack: 0,
  skillAttack: 0,
  enemySkillAttack: 0,
  attack: 0,
  defense: 0,
  healed: 0,
  hpCost: 0,
  hpDamageTaken: 0,
  handChange: { discarded: 0, returned: 0, drawn: 0, shuffled: false },
  drawLimit: RULES_V0.maxChainDraws,
  ranOut: false,
  ...over,
});

describe("skillOutcome", () => {
  it("credits each leader only with its own attack change", () => {
    // I lost 670 to the enemy's 武裝封咒 while my own 力之封印 cut theirs by 3.
    const mine = side({ skillAttack: -670, enemySkillAttack: -670 });
    const theirs = side({ skillAttack: -3, enemySkillAttack: -3 });
    expect(skillOutcome(skillOf("power-seal-3").effect, mine, theirs)).toEqual(["對手攻擊 −3"]);
  });

  it("describes shuffles on the enemy and draw limits", () => {
    const shuffled = { discarded: 0, returned: 3, drawn: 3, shuffled: true };
    expect(skillOutcome(skillOf("disrupt").effect, side(), side({ handChange: shuffled }))).toEqual([
      "對手手牌 3 張洗回牌庫",
      "對手補抽 3 張",
    ]);
    expect(skillOutcome(skillOf("pincer").effect, side(), side({ drawLimit: 2 }))).toEqual(["對手抽牌上限 5→2"]);
  });
});
