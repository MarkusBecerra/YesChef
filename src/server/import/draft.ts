import { z } from "zod";
import type { RecipeInput } from "@/server/recipes/types";

/**
 * What an importer produces: a loose, best-effort recipe. Every field is optional
 * because parsing quality varies wildly by source; the user reviews it in the form.
 */
export const recipeDraftSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  prepMinutes: z.number().int().nullable(),
  cookMinutes: z.number().int().nullable(),
  totalMinutes: z.number().int().nullable(),
  servings: z.number().int().nullable(),
  yieldText: z.string().nullable(),
  category: z.string().nullable(),
  tags: z.array(z.string()),
  notes: z.string().nullable(),
});
export type RecipeDraft = z.infer<typeof recipeDraftSchema>;

export const EMPTY_DRAFT: RecipeDraft = {
  title: null,
  description: null,
  ingredients: [],
  steps: [],
  prepMinutes: null,
  cookMinutes: null,
  totalMinutes: null,
  servings: null,
  yieldText: null,
  category: null,
  tags: [],
  notes: null,
};

export type ImportMethod = "jsonld" | "llm" | "metadata";

export type ImportResult = {
  draft: RecipeDraft;
  /** Remote image the page advertised; the server copies it into our storage on save. */
  imageUrl: string | null;
  sourceUrl: string;
  sourceName: string | null;
  method: ImportMethod;
  warnings: string[];
};

/** Does the draft carry enough to be worth showing? */
export function draftHasContent(d: RecipeDraft): boolean {
  return Boolean(d.title) && (d.ingredients.length > 0 || d.steps.length > 0);
}

export function clean(s: string | null | undefined): string | null {
  const t = s?.replace(/\s+/g, " ").trim();
  return t ? t : null;
}

/** Turn a draft into the same payload the manual form sends. */
export function draftToRecipeInput(result: ImportResult): RecipeInput {
  const d = result.draft;
  return {
    title: d.title ?? "",
    description: d.description,
    notes: d.notes,
    prepMinutes: d.prepMinutes,
    cookMinutes: d.cookMinutes,
    totalMinutes: d.totalMinutes,
    servings: d.servings,
    yieldText: d.yieldText,
    category: d.category,
    sourceUrl: result.sourceUrl,
    sourceName: result.sourceName,
    ingredients: d.ingredients,
    steps: d.steps,
    tags: d.tags,
    photoSourceUrl: result.imageUrl,
  };
}
