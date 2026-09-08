import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/current-user";
import { jsonError, withErrorHandling } from "@/lib/http";
import { parseBody } from "@/lib/validate";
import { ImportError, importRecipeFromSpeech } from "@/server/import";
import { recipeDraftSchema } from "@/server/import/draft";
import { MAX_ANSWER_CHARS, MAX_TRANSCRIPT_CHARS } from "@/server/import/voice";

// One LLM round trip over a few minutes of speech.
export const maxDuration = 60;

const bodySchema = z.object({
  transcript: z.string().trim().min(1, "Say the recipe first").max(MAX_TRANSCRIPT_CHARS * 2),
  /** The draft from the first pass, sent back so the model edits it instead of starting over. */
  previous: recipeDraftSchema.nullish(),
  answers: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(300),
        answer: z.string().trim().min(1).max(MAX_ANSWER_CHARS),
      }),
    )
    .max(5)
    .optional(),
});

/**
 * POST { transcript, previous?, answers? } -> a recipe draft to review, plus the questions
 * the model would still like answered. Never a saved recipe.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  await requireApiUser();
  const body = await parseBody(bodySchema, request);
  try {
    return Response.json(await importRecipeFromSpeech(body));
  } catch (err) {
    if (err instanceof ImportError) return jsonError(err.status, err.message);
    throw err;
  }
});
