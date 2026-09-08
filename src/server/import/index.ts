import * as cheerio from "cheerio";
import { clean, draftHasContent, EMPTY_DRAFT, type ImportResult, type RecipeDraft } from "./draft";
import { fetchHtml, hostName, ImportError } from "./fetch-page";
import { extractJsonLdRecipe } from "./jsonld";
import { getRecipeExtractor } from "./llm";
import { extractPageMeta, extractReadableText, type PageMeta } from "./page-meta";
import { importYouTubeVideo, youtubeVideoId } from "./youtube";

export { ImportError } from "./fetch-page";
export type { ImportResult } from "./draft";
export { importRecipeFromText } from "./text";
export { importRecipeFromSpeech, transcribeRecipeAudio } from "./voice";

/**
 * Import strategy, cheapest first:
 *  1. schema.org/Recipe JSON-LD (most recipe blogs, some aggregators) - exact and free
 *  2. for YouTube, a model that watches the video, then its description
 *  3. the configured LLM over the page's readable text (plain blogs)
 *  4. page metadata only (title, description, image) so the form isn't empty
 */
export async function importRecipeFromUrl(rawUrl: string): Promise<ImportResult> {
  const { html, finalUrl } = await fetchHtml(rawUrl);
  const $ = cheerio.load(html);
  const meta = extractPageMeta($, finalUrl);
  const sourceName = meta.siteName ?? hostName(finalUrl);
  const warnings: string[] = [];

  const structured = extractJsonLdRecipe($);
  if (structured && draftHasContent(structured.draft)) {
    if (structured.draft.steps.length === 0) warnings.push("No steps were found on the page.");
    if (structured.draft.ingredients.length === 0) warnings.push("No ingredients were found on the page.");
    return {
      draft: structured.draft,
      imageUrl: structured.imageUrl ?? meta.imageUrl,
      sourceUrl: finalUrl,
      sourceName,
      method: "jsonld",
      warnings,
    };
  }

  const videoId = youtubeVideoId(finalUrl);
  if (videoId) {
    const watched = await importYouTubeVideo({ videoId, finalUrl, html, meta, sourceName, warnings });
    // A YouTube page's own text is player chrome; there is nothing further to try.
    return watched ?? metadataFallback(meta, finalUrl, sourceName, warnings);
  }

  const text = extractReadableText($);
  const extractor = getRecipeExtractor();
  if (extractor && text.length > 80) {
    let draft: RecipeDraft;
    try {
      draft = await extractor.extract({ url: finalUrl, title: meta.title, description: meta.description, text });
    } catch (err) {
      console.error("LLM extraction failed", err);
      throw new ImportError("The AI parser failed on this page. Try again, or enter the recipe manually.", 502);
    }
    if (draftHasContent(draft)) {
      warnings.push("Parsed by AI from the page text. Double-check quantities and steps.");
      if (draft.steps.length === 0) warnings.push("No steps were found.");
      return { draft, imageUrl: meta.imageUrl, sourceUrl: finalUrl, sourceName, method: "llm", warnings };
    }
    warnings.push("The AI couldn't find a recipe on that page.");
  } else if (!extractor) {
    warnings.push("No structured recipe data on that page, and no AI parser is configured (set ANTHROPIC_API_KEY, the Anthropic federation IDs, or GEMINI_API_KEY).");
  } else {
    warnings.push("That page had almost no readable text - it probably needs a login. Copy the caption and use \"Paste text\" instead.");
  }

  return metadataFallback(meta, finalUrl, sourceName, warnings);
}

/** Last resort: what the page said about itself, so the form isn't empty. */
function metadataFallback(meta: PageMeta, finalUrl: string, sourceName: string | null, warnings: string[]): ImportResult {
  const draft: RecipeDraft = { ...EMPTY_DRAFT, title: clean(meta.title), description: clean(meta.description) };
  if (!draft.title) throw new ImportError("Couldn't find a recipe or even a title on that page. Try entering it manually.", 422);
  return { draft, imageUrl: meta.imageUrl, sourceUrl: finalUrl, sourceName, method: "metadata", warnings };
}
