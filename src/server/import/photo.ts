import { draftIsEmpty, type ImportResult, type RecipeDraft } from "./draft";
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
    // The provider failed, not the photo: a quota, a network blip, a bad token. Don't send the cook back to re-shoot.
    console.error("LLM photo extraction failed", err);
    throw new ImportError("The AI couldn't read that photo just now. Try again in a moment, or enter the recipe manually.", 502);
  }

  // Ingredients or steps with no title is a recipe the model forgot to name, not an empty photo.
  if (draftIsEmpty(draft)) {
    throw new ImportError("The AI couldn't find a written recipe in that photo. Get the whole card or page in frame, in good light, and try again.", 422);
  }

  const warnings = ["Read by AI from your photo. Check every quantity against the original - handwriting is easy to misread."];
  const text = [draft.title, draft.description, draft.notes, draft.yieldText, draft.category, ...draft.ingredients, ...draft.steps, ...draft.tags];
  if (text.some((s) => s?.includes("[?]"))) warnings.push("Some words couldn't be made out; they're marked [?].");
  if (!draft.title) warnings.push("No name came through - give it one before saving.");
  if (draft.steps.length === 0) warnings.push("No steps came through - the photo may only show the ingredients.");
  if (draft.ingredients.length === 0) warnings.push("No ingredients came through - the photo may only show the method.");

  return { draft, imageUrl: null, sourceUrl: null, sourceName: null, method: "photo", warnings };
}
