import { useEffect, useState, type RefObject } from "react";
import { reducedMotion } from "./BattleParts";
import { useFxQuality } from "../game/settings";
import type { FxStage } from "../fx/FxStage";

/**
 * The duel's 3D light layer, lazy-loaded so three.js stays out of the main chunk. It is null until
 * loaded, and stays null for low quality, reduced motion or a failed WebGL context (the 2D scene
 * plays as before). Disposed with the duel.
 */
export function useFxStage(host: RefObject<HTMLElement | null>): FxStage | null {
  const quality = useFxQuality();
  const [fx, setFx] = useState<FxStage | null>(null);
  useEffect(() => {
    if (quality === "low" || reducedMotion() || !host.current) return;
    let dead = false;
    let stage: FxStage | null = null;
    import("../fx/FxStage")
      .then(({ FxStage }) => {
        if (dead) return;
        stage = new FxStage(host.current!);
        setFx(stage);
      })
      .catch(() => {}); // no WebGL or the chunk failed: stay 2D
    return () => {
      dead = true;
      stage?.dispose();
      setFx(null);
    };
  }, [quality, host]);
  return fx;
}
