import type { NextRequest } from "next/server";
import { HttpError, jsonError, parseId, withErrorHandling } from "@/lib/http";
import { getRecipe, setRecipePhoto } from "@/server/recipes/service";
import { extensionFor, getPhotoStorage, MAX_PHOTO_BYTES } from "@/server/storage";

type Ctx = RouteContext<"/api/v1/recipes/[id]/photo">;

/** POST multipart/form-data with a `file` field. Replaces any existing photo. */
export const POST = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  const id = parseId((await ctx.params).id);
  const existing = await getRecipe(id);
  if (!existing) return jsonError(404, "Recipe not found");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, "Expected multipart form data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Missing file");
  if (file.size === 0) throw new HttpError(400, "Empty file");
  if (file.size > MAX_PHOTO_BYTES) throw new HttpError(413, "Photo is too large (max 8 MB)");
  const extension = extensionFor(file.type);
  if (!extension) throw new HttpError(415, "Unsupported image type");

  const storage = getPhotoStorage();
  const { url } = await storage.put({ bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type, extension });
  const recipe = await setRecipePhoto(id, url);
  if (existing.photoUrl && existing.photoUrl !== url) await storage.delete(existing.photoUrl);
  return Response.json({ recipe });
});

export const DELETE = withErrorHandling(async (_request: NextRequest, ctx: Ctx) => {
  const id = parseId((await ctx.params).id);
  const existing = await getRecipe(id);
  if (!existing) return jsonError(404, "Recipe not found");
  const recipe = await setRecipePhoto(id, null);
  if (existing.photoUrl) await getPhotoStorage().delete(existing.photoUrl);
  return Response.json({ recipe });
});
