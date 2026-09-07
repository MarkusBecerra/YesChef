import { draftHasContent, type ImportResult, type RecipeDraft } from "./draft";
import { assertPublicHttpUrl, hostName, ImportError } from "./fetch-page";
import { getRecipeExtractor } from "./llm";

/** Below this a "recipe" is almost certainly a stray tap on the paste button. */
const MIN_CHARS = 40;
/** Captions and messages are short; this only guards against a pasted novel. */
export const MAX_TEXT_CHARS = 20_000;

export type TextImport = { text: string; sourceUrl?: string | null };

/**
 * Import from text the user pasted - an Instagram caption, a message, a typed-out card.
 * There's no structured data to try first, so this is always the LLM.
 */
export async function importRecipeFromText({ text, sourceUrl }: TextImport): Promise<ImportResult> {
  const body = text.trim().slice(0, MAX_TEXT_CHARS);
  if (body.length < MIN_CHARS) throw new ImportError("That's too short to hold a recipe. Paste the whole caption or post.");

  const trimmedSource = sourceUrl?.trim();
  const source = trimmedSource ? assertPublicHttpUrl(trimmedSource).href : null;

  const extractor = getRecipeExtractor();
  if (!extractor) {
    throw new ImportError("Reading pasted text needs an AI parser, and none is configured (set ANTHROPIC_API_KEY, the Anthropic federation IDs, or GEMINI_API_KEY).", 503);
  }

  let draft: RecipeDraft;
  try {
    draft = await extractor.extract({ url: source, title: null, description: null, text: body });
  } catch (err) {
    console.error("LLM extraction failed", err);
    throw new ImportError("The AI parser failed on that text. Try again, or enter the recipe manually.", 502);
  }
  if (!draftHasContent(draft)) {
    throw new ImportError("The AI couldn't find a recipe in that text. Check you pasted the whole thing.", 422);
  }

  const warnings = ["Parsed by AI from the text you pasted. Double-check quantities and steps."];
  if (draft.steps.length === 0) warnings.push("No steps were found - the text may only list ingredients.");

  return {
    draft,
    imageUrl: null,
    sourceUrl: source,
    sourceName: source ? hostName(source) : null,
    method: "text",
    warnings,
  };
}
