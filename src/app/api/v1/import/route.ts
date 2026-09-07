import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, withErrorHandling } from "@/lib/http";
import { parseBody } from "@/lib/validate";
import { ImportError, importRecipeFromUrl } from "@/server/import";

// A page fetch plus, when the page carries no structured recipe, an LLM round trip.
export const maxDuration = 60;

const bodySchema = z.object({ url: z.string().trim().min(1, "Paste a link first").max(2000) });

/** POST { url } -> a recipe draft to review, never a saved recipe. */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const { url } = await parseBody(bodySchema, request);
  try {
    return Response.json(await importRecipeFromUrl(url));
  } catch (err) {
    if (err instanceof ImportError) return jsonError(err.status, err.message);
    throw err;
  }
});
