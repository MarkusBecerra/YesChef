import { describe, expect, it } from "vitest";
import { recipeInputSchema, type RecipeDetail } from "@/server/recipes/types";
import { EMPTY_VALUES, payloadFromValues, saveBlockedReason, valuesFromRecipe, type RecipeFormValues } from "./recipe-form-values";

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

  it("blocks saving until there is a title and some content", () => {
    expect(saveBlockedReason(EMPTY_VALUES)).toBe("Add a title to save.");
    expect(saveBlockedReason({ ...EMPTY_VALUES, ingredients: "4 eggs" })).toBe("Add a title to save.");
    expect(saveBlockedReason({ ...EMPTY_VALUES, title: "  " })).toBe("Add a title to save.");

    const titleOnly = { ...EMPTY_VALUES, title: "Shakshuka", description: "Eggs in tomato", notes: "From mom" };
    expect(saveBlockedReason(titleOnly)).toBe("Add at least one ingredient or step to save.");
    // Whitespace-only lists are not content either.
    expect(saveBlockedReason({ ...titleOnly, ingredients: "  \n\n \t" })).toBe("Add at least one ingredient or step to save.");

    expect(saveBlockedReason({ ...titleOnly, ingredients: "4 eggs" })).toBeNull();
    expect(saveBlockedReason({ ...titleOnly, steps: "Crack in the eggs." })).toBeNull();
    expect(saveBlockedReason(valuesFromRecipe(detail))).toBeNull();
  });

  it("keeps the save button in step with the schema", () => {
    // The button is only honest if it blocks exactly what the API would reject.
    // Values stay inside the field length limits, where the two are meant to agree.
    const cases: RecipeFormValues[] = [
      EMPTY_VALUES,
      { ...EMPTY_VALUES, ingredients: "4 eggs" },
      { ...EMPTY_VALUES, title: "Shakshuka" },
      { ...EMPTY_VALUES, title: "Shakshuka", description: "Eggs in tomato", notes: "From mom" },
      { ...EMPTY_VALUES, title: "Shakshuka", ingredients: " \n\t " },
      { ...EMPTY_VALUES, title: "Shakshuka", ingredients: "4 eggs" },
      { ...EMPTY_VALUES, title: "Shakshuka", steps: "Crack in the eggs." },
      { ...EMPTY_VALUES, title: "Shakshuka", ingredients: "4 eggs", steps: "Crack in the eggs." },
      valuesFromRecipe(detail),
    ];
    for (const values of cases) {
      const accepted = recipeInputSchema.safeParse(payloadFromValues(values)).success;
      expect({ title: values.title, accepted }).toEqual({ title: values.title, accepted: saveBlockedReason(values) === null });
    }
  });
});
