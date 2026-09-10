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

/**
 * A gap the cook has to fill before the recipe is worth cooking from: the model writes one
 * of these per thing it would have needed to ask, and the import flow asks them in turn.
 */
export const followUpSchema = z.object({
  /** Short identifier for the gap, e.g. "servings", "oven_temp", "chicken_quantity". */
  key: z.string(),
  /** Asked the way a person would: "How much chicken goes in?" */
  question: z.string(),
});
export type FollowUp = z.infer<typeof followUpSchema>;

/** What comes back from a spoken recipe: the same draft, plus what the model still needs. */
export const voiceDraftSchema = recipeDraftSchema.extend({
  followUps: z.array(followUpSchema).max(5),
});
export type VoiceDraft = z.infer<typeof voiceDraftSchema>;

export type ImportMethod = "jsonld" | "llm" | "text" | "video" | "voice" | "metadata" | "none";

/**
 * Why an import came back without a recipe. They are worth telling apart: only "unread"
 * leaves any reason to trust what the page says about itself, because once something has
 * actually read the content and found no recipe, the page's title and blurb belong to
 * whatever else it is - a vlog, a product listing - and are not a recipe at all.
 */
export type EmptyImport = "no-recipe" | "unread";

export type ImportResult = {
  draft: RecipeDraft;
  /** Remote image the page advertised; the server copies it into our storage on save. */
  imageUrl: string | null;
  /** The page the recipe came from; null when the user pasted text without one. */
  sourceUrl: string | null;
  sourceName: string | null;
  method: ImportMethod;
  warnings: string[];
  /** Voice imports only: what the model would still like to know. */
  followUps?: FollowUp[];
};

/** Does the draft carry enough to be worth showing? */
export function draftHasContent(d: RecipeDraft): boolean {
  return Boolean(d.title) && (d.ingredients.length > 0 || d.steps.length > 0);
}

/**
 * Nothing a recipe could be built from. Stricter than `!draftHasContent`, which also insists
 * on a name: a draft with ingredients and steps but no title is a recipe the model forgot to
 * name, and is not evidence that the source held no recipe.
 */
export function draftIsEmpty(d: RecipeDraft): boolean {
  return d.ingredients.length === 0 && d.steps.length === 0;
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
