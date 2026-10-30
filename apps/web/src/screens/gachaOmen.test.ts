import { describe, expect, it } from "vitest";
import { omenOf } from "./gachaOmen";

describe("omenOf", () => {
  it("N and R packs are not good", () => {
    expect(omenOf(["N", "R"], () => 0)).toEqual({ good: false, tier: null, tease: false });
    expect(omenOf([], () => 0)).toEqual({ good: false, tier: null, tease: false });
  });
  it("SR is good and never teases", () => {
    expect(omenOf(["N", "SR", "R"], () => 0)).toEqual({ good: true, tier: "SR", tease: false });
  });
  it("SSR is good; tease below 0.5 only", () => {
    expect(omenOf(["SSR", "SR", "N"], () => 0.49)).toEqual({ good: true, tier: "SSR", tease: true });
    expect(omenOf(["SSR", "N"], () => 0.5)).toEqual({ good: true, tier: "SSR", tease: false });
  });
  it("UR beats SSR and always teases (gold first)", () => {
    expect(omenOf(["SSR", "UR", "N"], () => 0.99)).toEqual({ good: true, tier: "UR", tease: true });
  });
});
