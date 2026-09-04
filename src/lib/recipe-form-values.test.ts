import { describe, expect, it } from "vitest";
import type { RecipeDetail } from "@/server/recipes/types";
import { EMPTY_VALUES, payloadFromValues, valuesFromRecipe } from "./recipe-form-values";

const detail: RecipeDetail = {
  id: 7,
  title: "Granola",
  description: "Crunchy",
  photoUrl: null,
  difficulty: "easy",
  category: "Breakfast",
  prepMinutes: 10,
  cookMinutes: 30,
  totalMinutes: 40,
  explicitTotalMinutes: null,
  servings: 8,
  yieldText: "1 big jar",
  isFavorite: true,
  ingredientCount: 2,
  cookCount: 0,
  lastCookedOn: null,
  tags: ["breakfast", "make ahead"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  notes: "Stir halfway.",
  sourceUrl: "https://example.com/granola",
  sourceName: "Example",
  costRating: 2,
  costAmount: 12.5,
  ingredients: ["3 cups oats", "1/2 cup honey"],
  steps: ["Mix.", "Bake."],
  cookLogs: [],
};

describe("recipe form values", () => {
  it("round-trips a recipe through the form", () => {
    const values = valuesFromRecipe(detail);
    expect(values.ingredients).toBe("3 cups oats\n1/2 cup honey");
    expect(values.steps).toBe("Mix.\n\nBake.");
    expect(values.totalMinutes).toBe(""); // explicit total was null, so the field stays blank
    expect(values.tags).toBe("breakfast, make ahead");

    const payload = payloadFromValues(values);
    expect(payload).toMatchObject({
      title: "Granola",
      prepMinutes: 10,
      cookMinutes: 30,
      totalMinutes: null,
      servings: 8,
      difficulty: "easy",
      costRating: 2,
      costAmount: 12.5,
      ingredients: ["3 cups oats", "1/2 cup honey"],
      steps: ["Mix.", "Bake."],
      tags: ["breakfast", "make ahead"],
    });
  });

  it("turns blanks into nulls and splits lists", () => {
    const payload = payloadFromValues({
      ...EMPTY_VALUES,
      title: "x",
      ingredients: "- a\n\n2. b\n",
      steps: "",
      tags: "one, Two\nthree,,",
    });
    expect(payload.prepMinutes).toBeNull();
    expect(payload.difficulty).toBeNull();
    expect(payload.ingredients).toEqual(["a", "b"]);
    expect(payload.steps).toEqual([]);
    expect(payload.tags).toEqual(["one", "Two", "three"]);
  });
});
