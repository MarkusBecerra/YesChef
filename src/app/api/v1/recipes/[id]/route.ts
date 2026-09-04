import type { NextRequest } from "next/server";
import { jsonError, parseId, withErrorHandling } from "@/lib/http";
import { parseBody } from "@/lib/validate";
import { deleteRecipe, getRecipe, patchRecipe, updateRecipe } from "@/server/recipes/service";
import { recipeInputSchema, recipePatchSchema } from "@/server/recipes/types";

type Ctx = RouteContext<"/api/v1/recipes/[id]">;

export const GET = withErrorHandling(async (_request: NextRequest, ctx: Ctx) => {
  const recipe = await getRecipe(parseId((await ctx.params).id));
  return recipe ? Response.json({ recipe }) : jsonError(404, "Recipe not found");
});

/** Full replace. */
export const PUT = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  const id = parseId((await ctx.params).id);
  const input = await parseBody(recipeInputSchema, request);
  const recipe = await updateRecipe(id, input);
  return recipe ? Response.json({ recipe }) : jsonError(404, "Recipe not found");
});

/** Partial update (e.g. { isFavorite: true }). */
export const PATCH = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  const id = parseId((await ctx.params).id);
  const patch = await parseBody(recipePatchSchema, request);
  const recipe = await patchRecipe(id, patch);
  return recipe ? Response.json({ recipe }) : jsonError(404, "Recipe not found");
});

export const DELETE = withErrorHandling(async (_request: NextRequest, ctx: Ctx) => {
  const deleted = await deleteRecipe(parseId((await ctx.params).id));
  return deleted ? new Response(null, { status: 204 }) : jsonError(404, "Recipe not found");
});
