import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/current-user";
import { jsonError, parseId, withErrorHandling } from "@/lib/http";
import { parseBody } from "@/lib/validate";
import { deleteRecipe, getRecipe, patchRecipe, updateRecipe } from "@/server/recipes/service";
import { recipeInputSchema, recipePatchSchema } from "@/server/recipes/types";
import { getPhotoStorage } from "@/server/storage";

type Ctx = RouteContext<"/api/v1/recipes/[id]">;

export const GET = withErrorHandling(async (_request: NextRequest, ctx: Ctx) => {
  const user = await requireApiUser();
  const recipe = await getRecipe(user.id, parseId((await ctx.params).id));
  return recipe ? Response.json({ recipe }) : jsonError(404, "Recipe not found");
});

/** Full replace. */
export const PUT = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  const user = await requireApiUser();
  const id = parseId((await ctx.params).id);
  const input = await parseBody(recipeInputSchema, request);
  const recipe = await updateRecipe(user.id, id, input);
  return recipe ? Response.json({ recipe }) : jsonError(404, "Recipe not found");
});

/** Partial update (e.g. { isFavorite: true }). */
export const PATCH = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  const user = await requireApiUser();
  const id = parseId((await ctx.params).id);
  const patch = await parseBody(recipePatchSchema, request);
  const recipe = await patchRecipe(user.id, id, patch);
  return recipe ? Response.json({ recipe }) : jsonError(404, "Recipe not found");
});

export const DELETE = withErrorHandling(async (_request: NextRequest, ctx: Ctx) => {
  const user = await requireApiUser();
  const deleted = await deleteRecipe(user.id, parseId((await ctx.params).id));
  if (!deleted) return jsonError(404, "Recipe not found");
  if (deleted.photoUrl) await getPhotoStorage().delete(deleted.photoUrl);
  return new Response(null, { status: 204 });
});
