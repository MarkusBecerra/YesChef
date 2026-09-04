import { describe, expect, it } from "vitest";
import { effectiveTotalMinutes, normalizeTag, normalizeTags, splitLines } from "./values";

describe("values", () => {
  it("normalises tags", () => {
    expect(normalizeTag("  High   Protein ")).toBe("high protein");
    expect(normalizeTags(["Keto", "keto ", "", "  ", "Favorites"])).toEqual(["keto", "favorites"]);
  });

  it("splits textarea lines and strips list markers", () => {
    expect(splitLines("2 cups flour\n\n- 1 egg\r\n3. a pinch of salt\n• butter\n  ")).toEqual([
      "2 cups flour",
      "1 egg",
      "a pinch of salt",
      "butter",
    ]);
  });

  it("computes the effective total time", () => {
    expect(effectiveTotalMinutes({ prepMinutes: null, cookMinutes: null, totalMinutes: null })).toBeNull();
    expect(effectiveTotalMinutes({ prepMinutes: 10, cookMinutes: null, totalMinutes: null })).toBe(10);
    expect(effectiveTotalMinutes({ prepMinutes: 10, cookMinutes: 25, totalMinutes: null })).toBe(35);
    expect(effectiveTotalMinutes({ prepMinutes: 10, cookMinutes: 25, totalMinutes: 90 })).toBe(90);
  });
});
