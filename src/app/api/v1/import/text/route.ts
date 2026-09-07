import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/current-user";
import { jsonError, withErrorHandling } from "@/lib/http";
import { parseBody } from "@/lib/validate";
import { ImportError, importRecipeFromText } from "@/server/import";

// One LLM round trip over a caption; well inside this, but the default is tighter.
export const maxDuration = 60;

const bodySchema = z.object({
  text: z.string().trim().min(1, "Paste the recipe text first").max(200_000),
  sourceUrl: z.string().trim().max(2000).optional(),
});

/** POST { text, sourceUrl? } -> a recipe draft to review, never a saved recipe. */
export const POST = withErrorHandling(async (request: NextRequest) => {
  await requireApiUser();
  const body = await parseBody(bodySchema, request);
  try {
    return Response.json(await importRecipeFromText(body));
  } catch (err) {
    if (err instanceof ImportError) return jsonError(err.status, err.message);
    throw err;
  }
});
