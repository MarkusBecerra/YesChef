import { describe, expect, it } from "vitest";
import { draftHasContent, draftToRecipeInput, EMPTY_DRAFT, type ImportResult } from "./draft";

describe("import drafts", () => {
  it("needs a title plus ingredients or steps to count as content", () => {
    expect(draftHasContent(EMPTY_DRAFT)).toBe(false);
    expect(draftHasContent({ ...EMPTY_DRAFT, title: "x" })).toBe(false);
    expect(draftHasContent({ ...EMPTY_DRAFT, title: "x", ingredients: ["a"] })).toBe(true);
    expect(draftHasContent({ ...EMPTY_DRAFT, title: "x", steps: ["a"] })).toBe(true);
  });

  it("maps a result onto the recipe payload, including the remote photo", () => {
    const result: ImportResult = {
      draft: { ...EMPTY_DRAFT, title: "Toast", ingredients: ["bread"], steps: ["toast it"], prepMinutes: 2, tags: ["breakfast"] },
      imageUrl: "https://img.example/t.jpg",
      sourceUrl: "https://blog.example/toast",
      sourceName: "Toast Blog",
      method: "jsonld",
      warnings: [],
    };
    expect(draftToRecipeInput(result)).toMatchObject({
      title: "Toast",
      ingredients: ["bread"],
      steps: ["toast it"],
      prepMinutes: 2,
      cookMinutes: null,
      tags: ["breakfast"],
      sourceUrl: "https://blog.example/toast",
      sourceName: "Toast Blog",
      photoSourceUrl: "https://img.example/t.jpg",
    });
  });
});
