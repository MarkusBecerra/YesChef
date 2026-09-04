import { describe, expect, it } from "vitest";
import { hasActiveFilters, parseListQuery } from "./query";

describe("parseListQuery", () => {
  it("reads valid params from a record or URLSearchParams", () => {
    expect(parseListQuery({ q: " eggs ", tag: "keto", difficulty: "hard", favorite: "1", sort: "cookCount" })).toEqual({
      q: "eggs",
      tag: "keto",
      category: "",
      difficulty: "hard",
      favorite: true,
      sort: "cookCount",
    });
    expect(parseListQuery(new URLSearchParams("q=rice&sort=title")).sort).toBe("title");
  });

  it("ignores malformed values and picks the first of repeated params", () => {
    expect(parseListQuery({ difficulty: "brutal", sort: "random", favorite: "maybe", q: ["a", "b"] })).toEqual({
      q: "a",
      tag: "",
      category: "",
      difficulty: undefined,
      favorite: false,
      sort: "updated",
    });
  });

  it("knows when any filter is active", () => {
    const none = parseListQuery({});
    expect(hasActiveFilters(none)).toBe(false);
    expect(hasActiveFilters({ ...none, sort: "title" })).toBe(false);
    expect(hasActiveFilters({ ...none, q: "x" })).toBe(true);
    expect(hasActiveFilters({ ...none, favorite: true })).toBe(true);
  });
});
