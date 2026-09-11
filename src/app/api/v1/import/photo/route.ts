import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/current-user";
import { HttpError, jsonError, withErrorHandling } from "@/lib/http";
import { ImportError, importRecipeFromPhoto } from "@/server/import";
import { imageMimeType, MAX_IMAGE_BYTES } from "@/server/import/photo";

// Uploading the photo, then a vision round trip.
export const maxDuration = 60;

/**
 * POST multipart/form-data with a `photo` field -> ImportResult.
 *
 * A photo of a handwritten card, a cookbook page or a clipping. The browser has already
 * shrunk it to a phone-screen JPEG; the model reads it and the draft goes to the same review
 * form as every other import.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  await requireApiUser();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, "Expected multipart form data");
  }
  const file = form.get("photo");
  if (!(file instanceof File)) throw new HttpError(400, "Missing photo");
  if (file.size === 0) throw new HttpError(400, "That photo is empty");
  if (file.size > MAX_IMAGE_BYTES) throw new HttpError(413, "That photo is too big - try again, or choose a smaller one");

  const mimeType = imageMimeType(file.type);
  if (!mimeType) throw new HttpError(415, "That photo format can't be read - a JPEG or PNG works");

  try {
    const result = await importRecipeFromPhoto({ bytes: new Uint8Array(await file.arrayBuffer()), mimeType });
    return Response.json(result);
  } catch (err) {
    if (err instanceof ImportError) return jsonError(err.status, err.message);
    throw err;
  }
});
