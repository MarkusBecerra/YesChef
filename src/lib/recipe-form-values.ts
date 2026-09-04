import type { ImportResult } from "@/server/import/draft";
import type { RecipeDetail, RecipeInput } from "@/server/recipes/types";
import { splitLines } from "@/server/recipes/values";

/**
 * Pure mapping between the recipe form's string fields and the API payload.
 * Kept out of the "use client" module so server components can use it too.
 */

export type RecipeFormValues = {
  title: string;
  description: string;
  ingredients: string;
  steps: string;
  prepMinutes: string;
  cookMinutes: string;
  totalMinutes: string;
  servings: string;
  yieldText: string;
  difficulty: string;
  category: string;
  tags: string;
  sourceUrl: string;
  sourceName: string;
  costRating: string;
  costAmount: string;
  notes: string;
};

export const EMPTY_VALUES: RecipeFormValues = {
  title: "",
  description: "",
  ingredients: "",
  steps: "",
  prepMinutes: "",
  cookMinutes: "",
  totalMinutes: "",
  servings: "",
  yieldText: "",
  difficulty: "",
  category: "",
  tags: "",
  sourceUrl: "",
  sourceName: "",
  costRating: "",
  costAmount: "",
  notes: "",
};

const str = (v: string | number | null | undefined) => (v == null ? "" : String(v));

export function valuesFromRecipe(r: RecipeDetail): RecipeFormValues {
  return {
    title: r.title,
    description: r.description ?? "",
    ingredients: r.ingredients.join("\n"),
    steps: r.steps.join("\n\n"),
    prepMinutes: str(r.prepMinutes),
    cookMinutes: str(r.cookMinutes),
    totalMinutes: str(r.explicitTotalMinutes),
    servings: str(r.servings),
    yieldText: r.yieldText ?? "",
    difficulty: r.difficulty ?? "",
    category: r.category ?? "",
    tags: r.tags.join(", "),
    sourceUrl: r.sourceUrl ?? "",
    sourceName: r.sourceName ?? "",
    costRating: str(r.costRating),
    costAmount: str(r.costAmount),
    notes: r.notes ?? "",
  };
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));

/** Form strings -> API payload. Numbers stay numbers; blanks become null. */
export function payloadFromValues(v: RecipeFormValues): RecipeInput {
  return {
    title: v.title,
    description: v.description,
    notes: v.notes,
    prepMinutes: num(v.prepMinutes),
    cookMinutes: num(v.cookMinutes),
    totalMinutes: num(v.totalMinutes),
    servings: num(v.servings),
    yieldText: v.yieldText,
    difficulty: v.difficulty === "" ? null : (v.difficulty as RecipeInput["difficulty"]),
    category: v.category,
    sourceUrl: v.sourceUrl,
    sourceName: v.sourceName,
    costRating: num(v.costRating),
    costAmount: num(v.costAmount),
    ingredients: splitLines(v.ingredients),
    steps: splitLines(v.steps),
    tags: v.tags
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

/** Prefill the form from an import result; the user reviews before saving. */
export function valuesFromImport(result: ImportResult): RecipeFormValues {
  const d = result.draft;
  return {
    ...EMPTY_VALUES,
    title: d.title ?? "",
    description: d.description ?? "",
    ingredients: d.ingredients.join("\n"),
    steps: d.steps.join("\n\n"),
    prepMinutes: str(d.prepMinutes),
    cookMinutes: str(d.cookMinutes),
    totalMinutes: str(d.totalMinutes),
    servings: str(d.servings),
    yieldText: d.yieldText ?? "",
    category: d.category ?? "",
    tags: d.tags.join(", "),
    sourceUrl: result.sourceUrl,
    sourceName: result.sourceName ?? "",
    notes: d.notes ?? "",
  };
}
