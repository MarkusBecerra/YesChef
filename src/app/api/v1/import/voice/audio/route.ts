import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/current-user";
import { HttpError, jsonError, withErrorHandling } from "@/lib/http";
import { ImportError, transcribeRecipeAudio } from "@/server/import";
import { audioMimeType, MAX_AUDIO_BYTES } from "@/server/import/voice";

// Uploading the recording, then a transcription round trip.
export const maxDuration = 60;

/**
 * POST multipart/form-data with an `audio` field -> { transcript }.
 *
 * The fallback for browsers with no dictation of their own; the ones that have it never
 * send audio anywhere. The transcript comes back for the cook to read and fix before it
 * becomes a recipe.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  await requireApiUser();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, "Expected multipart form data");
  }
  const file = form.get("audio");
  if (!(file instanceof File)) throw new HttpError(400, "Missing audio");
  if (file.size === 0) throw new HttpError(400, "That recording is empty");
  if (file.size > MAX_AUDIO_BYTES) throw new HttpError(413, "That recording is too long - keep it under a few minutes");

  const mimeType = audioMimeType(file.type);
  if (!mimeType) throw new HttpError(415, "That audio format can't be read");

  try {
    const transcript = await transcribeRecipeAudio({ bytes: new Uint8Array(await file.arrayBuffer()), mimeType });
    return Response.json({ transcript });
  } catch (err) {
    if (err instanceof ImportError) return jsonError(err.status, err.message);
    throw err;
  }
});
