import type { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/http";
import { parseBody } from "@/lib/validate";
import { parseListQuery } from "@/server/recipes/query";
import { storePhotoFromUrl } from "@/server/import/remote-photo";
import { createRecipe, listRecipes, setRecipePhoto } from "@/server/recipes/service";
import { recipeInputSchema } from "@/server/recipes/types";

/** GET /api/v1/recipes?q=&tag=&category=&difficulty=&favorite=1&sort= */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const recipes = await listRecipes(parseListQuery(request.nextUrl.searchParams));
  return Response.json({ recipes });
});

/** POST /api/v1/recipes */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const input = await parseBody(recipeInputSchema, request);
  let recipe = await createRecipe(input);
  if (input.photoSourceUrl) {
    const stored = await storePhotoFromUrl(input.photoSourceUrl);
    if (stored) recipe = (await setRecipePhoto(recipe.id, stored)) ?? recipe;
  }
  return Response.json({ recipe }, { status: 201 });
});
