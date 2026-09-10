import { z } from "zod";
import { DIFFICULTIES, type Difficulty } from "@/server/db/schema";
import { hasRecipeBody, RECIPE_BODY_REQUIRED } from "@/server/recipes/values";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const optionalText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable()).optional();
const optionalInt = (min: number, max: number) =>
  z.preprocess(blankToNull, z.number().int().min(min).max(max).nullable()).optional();

export const difficultySchema = z.enum(DIFFICULTIES);

const recipeFieldsSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: optionalText(2000),
  notes: optionalText(20000),
  prepMinutes: optionalInt(0, 100000),
  cookMinutes: optionalInt(0, 100000),
  totalMinutes: optionalInt(0, 100000),
  servings: optionalInt(1, 10000),
  yieldText: optionalText(200),
  difficulty: z.preprocess(blankToNull, difficultySchema.nullable()).optional(),
  category: optionalText(60),
  sourceUrl: z.preprocess(blankToNull, z.url("Source must be a valid URL").max(2000).nullable()).optional(),
  sourceName: optionalText(200),
  costRating: optionalInt(1, 4),
  costAmount: z.preprocess(blankToNull, z.number().min(0).max(1000000).nullable()).optional(),
  isFavorite: z.boolean().optional(),
  ingredients: z.array(z.string().trim().min(1).max(500)).max(300).default([]),
  steps: z.array(z.string().trim().min(1).max(5000)).max(300).default([]),
  tags: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  /** Import flow only: a remote image to copy into our storage after creating. */
  photoSourceUrl: z.preprocess(blankToNull, z.url().max(2000).nullable()).optional(),
});

/**
 * Payload for creating or fully replacing a recipe. A title alone is not a
 * recipe: it needs at least one ingredient or step to be worth saving.
 */
export const recipeInputSchema = recipeFieldsSchema.superRefine((value, ctx) => {
  if (hasRecipeBody(value)) return;
  for (const field of ["ingredients", "steps"] as const) {
    ctx.addIssue({ code: "custom", path: [field], message: RECIPE_BODY_REQUIRED });
  }
});
export type RecipeInput = z.input<typeof recipeInputSchema>;
export type ParsedRecipeInput = z.output<typeof recipeInputSchema>;

/** Partial update (e.g. toggling favourite). */
export const recipePatchSchema = z.object({
  isFavorite: z.boolean().optional(),
});
export type RecipePatch = z.infer<typeof recipePatchSchema>;

export const cookLogInputSchema = z.object({
  cookedOn: z.iso.date("Use a YYYY-MM-DD date").optional(),
  rating: optionalInt(1, 5),
  notes: optionalText(5000),
});
export type CookLogInput = z.input<typeof cookLogInputSchema>;

export const RECIPE_SORTS = ["updated", "created", "title", "lastCooked", "cookCount", "ingredientCount", "totalTime"] as const;
export type RecipeSort = (typeof RECIPE_SORTS)[number];

export const recipeListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(40).optional(),
  category: z.string().trim().max(60).optional(),
  difficulty: difficultySchema.optional(),
  favorite: z.boolean().optional(),
  sort: z.enum(RECIPE_SORTS).default("updated"),
});
export type RecipeListQuery = z.input<typeof recipeListQuerySchema>;

export type CookLog = {
  id: number;
  recipeId: number;
  cookedOn: string;
  rating: number | null;
  notes: string | null;
  createdAt: string;
};

export type RecipeSummary = {
  id: number;
  title: string;
  description: string | null;
  photoUrl: string | null;
  difficulty: Difficulty | null;
  category: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  /** Effective total (explicit total, else prep + cook). */
  totalMinutes: number | null;
  servings: number | null;
  isFavorite: boolean;
  ingredientCount: number;
  cookCount: number;
  lastCookedOn: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type RecipeDetail = RecipeSummary & {
  notes: string | null;
  yieldText: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  costRating: number | null;
  costAmount: number | null;
  /** Raw explicit total as stored, for editing. */
  explicitTotalMinutes: number | null;
  ingredients: string[];
  steps: string[];
  cookLogs: CookLog[];
};

export type TagSummary = { id: number; name: string; recipeCount: number };
