import { draftHasContent, type ImportResult, type RecipeDraft } from "./draft";
import { ImportError } from "./fetch-page";
import { getImageExtractor } from "./llm";
import { IMAGE_MIME_TYPES, type ImageInput, type ImageMimeType } from "./llm/provider";

/**
 * Same ceiling as audio: Vercel rejects a bigger body before the route runs. The browser
 * re-encodes the photo to a phone-screen JPEG first, so a real upload is well under a megabyte.
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** `image/jpeg; charset=binary` -> `image/jpeg`, and null for anything the models won't read. */
export function imageMimeType(raw: string | null | undefined): ImageMimeType | null {
  const base = raw?.split(";")[0].trim().toLowerCase();
  if (!base) return null;
  return (IMAGE_MIME_TYPES as readonly string[]).includes(base) ? (base as ImageMimeType) : null;
}

const NOT_CONFIGURED =
  "Reading a photo needs an AI parser, and none is configured (set ANTHROPIC_API_KEY, the Anthropic federation IDs, or GEMINI_API_KEY).";

/**
 * Turn a photo of a written recipe - a handwritten card, a cookbook page, a clipping - into a
 * draft to review. The model marks anything it couldn't read with [?], and the warnings say so,
 * because a misread "1" for "7" is the kind of mistake nobody spots until the cake is in the oven.
 */
export async function importRecipeFromPhoto(input: ImageInput): Promise<ImportResult> {
  const extractor = getImageExtractor();
  if (!extractor) throw new ImportError(NOT_CONFIGURED, 503);

  let draft: RecipeDraft;
  try {
    draft = await extractor.extractFromImage(input);
  } catch (err) {
    console.error("LLM photo extraction failed", err);
    throw new ImportError("The AI couldn't read that photo. Try again with the whole recipe in frame, or enter it manually.", 502);
  }

  if (!draftHasContent(draft)) {
    throw new ImportError("The AI couldn't find a written recipe in that photo. Get the whole card or page in frame, in good light, and try again.", 422);
  }

  const warnings = ["Read by AI from your photo. Check every quantity against the original - handwriting is easy to misread."];
  const unread = [draft.title, draft.description, draft.notes, ...draft.ingredients, ...draft.steps].some((s) => s?.includes("[?]"));
  if (unread) warnings.push("Some words couldn't be made out; they're marked [?].");
  if (draft.steps.length === 0) warnings.push("No steps came through - the photo may only show the ingredients.");

  return { draft, imageUrl: null, sourceUrl: null, sourceName: null, method: "photo", warnings };
}
