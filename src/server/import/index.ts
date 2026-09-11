import * as cheerio from "cheerio";
import { clean, draftHasContent, draftIsEmpty, EMPTY_DRAFT, type EmptyImport, type ImportResult, type RecipeDraft } from "./draft";
import { fetchHtml, hostName, ImportError } from "./fetch-page";
import { extractJsonLdRecipe, nonEnglishWarning } from "./jsonld";
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
 *  4. nothing - a blank form, seeded from page metadata only when nothing read the page
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
    // Recipe nodes rarely carry inLanguage themselves (WordPress puts it on the WebPage node),
    // so fall back to what the page as a whole declares.
    const language = nonEnglishWarning(structured.language.length ? structured.language : meta.language ? [meta.language] : []);
    if (language) warnings.push(language);
    return {
      draft: structured.draft,
      imageUrl: structured.imageUrl ?? meta.imageUrl,
      sourceUrl: finalUrl,
      sourceName,
      method: "jsonld",
      warnings,
    };
  }

  /**
   * A page that declares itself a schema.org/Recipe is about a recipe even when nothing could
   * build one out of it - a card rendered client-side, or a paywall. Never tell that cook the
   * page isn't a recipe; what it says about itself is the best lead there is.
   */
  const settle = (outcome: EmptyImport): EmptyImport => (structured ? "unread" : outcome);

  const videoId = youtubeVideoId(finalUrl);
  if (videoId) {
    const watched = await importYouTubeVideo({ videoId, finalUrl, html, meta, sourceName, warnings });
    // A YouTube page's own text is player chrome; there is nothing further to try.
    return typeof watched === "string" ? emptyImport(meta, finalUrl, sourceName, warnings, settle(watched)) : watched;
  }

  const text = extractReadableText($);
  const extractor = getRecipeExtractor();
  let outcome: EmptyImport = "unread";
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
    if (draftIsEmpty(draft)) outcome = "no-recipe";
  } else if (!extractor) {
    warnings.push("No structured recipe data on that page, and no AI parser is configured (set ANTHROPIC_API_KEY, the Anthropic federation IDs, or GEMINI_API_KEY).");
  } else {
    warnings.push("That page had almost no readable text - it probably needs a login. Copy the caption and use \"Paste text\" instead.");
  }

  return emptyImport(meta, finalUrl, sourceName, warnings, settle(outcome));
}

/**
 * Nothing came back with a recipe. What the page says about itself is worth seeding the form
 * with only when nothing actually read it - a login wall, or no AI configured - because then
 * its title is the one lead there is. Once something has read the page and found no recipe,
 * the title and blurb belong to whatever else it is about, so the form opens blank: a cook
 * looking at a non-recipe video should see that nothing was found, not a filled-in title and
 * a blurb that make a failed import look like a successful one.
 *
 * A link gets a blank form rather than the 422 that pasted text and spoken recipes throw: those
 * are the cook's own words to fix and paste again, while a link may still be worth typing up by
 * hand - and the form keeps the source, so doing that doesn't lose where it came from.
 */
function emptyImport(meta: PageMeta, finalUrl: string, sourceName: string | null, warnings: string[], outcome: EmptyImport): ImportResult {
  const source = { sourceUrl: finalUrl, sourceName, warnings };
  // The photo goes the same way as the title: an unrelated video's thumbnail is not this recipe's.
  if (outcome === "no-recipe") return { draft: { ...EMPTY_DRAFT }, imageUrl: null, method: "none", ...source };

  const draft: RecipeDraft = { ...EMPTY_DRAFT, title: clean(meta.title), description: clean(meta.description) };
  if (!draft.title) throw new ImportError("Couldn't find a recipe or even a title on that page. Try entering it manually.", 422);
  return { draft, imageUrl: meta.imageUrl, method: "metadata", ...source };
}
