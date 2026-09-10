import { draftHasContent, draftIsEmpty, type EmptyImport, type ImportResult, type RecipeDraft } from "./draft";
import { getRecipeExtractor, getVideoExtractor } from "./llm";
import { VideoUnavailable } from "./llm/provider";
import type { PageMeta } from "./page-meta";

const ID = "[A-Za-z0-9_-]{11}";
const PATH_FORMS = new RegExp(`^/(?:shorts|embed|live|v)/(${ID})`);

/**
 * The video id behind any link a share sheet produces - watch, youtu.be, shorts,
 * embed, live - or null when this isn't a YouTube video at all.
 */
export function youtubeVideoId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return new RegExp(`^${ID}$`).test(id) ? id : null;
  }
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;

  const v = url.searchParams.get("v");
  if (v && new RegExp(`^${ID}$`).test(v)) return v;
  return PATH_FORMS.exec(url.pathname)?.[1] ?? null;
}

/** The canonical form; what the Gemini API wants, whatever shape the user pasted. */
export function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * The full video description. YouTube renders it with JavaScript, but the player
 * payload is inlined in the HTML and holds it verbatim; og:description is truncated.
 */
export function youtubeDescription(html: string): string | null {
  const match = /"shortDescription":"((?:[^"\\]|\\.)*)"/.exec(html);
  if (!match) return null;
  try {
    const text = JSON.parse(`"${match[1]}"`) as string;
    return text.trim() || null;
  } catch {
    return null;
  }
}

/** Runtime in seconds, from the same inlined player payload. */
export function youtubeLengthSeconds(html: string): number | null {
  const match = /"lengthSeconds":"(\d+)"/.exec(html);
  const seconds = match ? Number(match[1]) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/** Plenty of shorts show ingredients with no quantities at all; say so rather than inventing them. */
function lacksAmounts(draft: RecipeDraft): boolean {
  return draft.ingredients.length >= 3 && draft.ingredients.filter((i) => /\d/.test(i)).length * 2 < draft.ingredients.length;
}

/**
 * YouTube (Shorts included), best first:
 *  1. Gemini watches the video - the only thing that works when the recipe is
 *     spoken or on screen, which is the norm for a short.
 *  2. the configured LLM over the description, which for longer videos often
 *     holds the whole recipe.
 * Comes back with an `EmptyImport` verdict when both come up empty, having explained
 * why in `warnings`, so the caller knows whether anything actually read the video.
 */
export async function importYouTubeVideo(args: {
  videoId: string;
  finalUrl: string;
  html: string;
  meta: PageMeta;
  sourceName: string | null;
  warnings: string[];
}): Promise<ImportResult | EmptyImport> {
  const description = youtubeDescription(args.html) ?? args.meta.description;
  const common = { imageUrl: args.meta.imageUrl, sourceUrl: args.finalUrl, sourceName: args.sourceName };
  const { warnings } = args;
  /**
   * Set once a model has watched the video and come back with nothing. Only watching counts:
   * a description is not the video's content, and plenty of recipe videos have a boilerplate
   * one, so failing to find a recipe in it says nothing about the video itself.
   */
  let ruledOut = false;

  const watcher = getVideoExtractor();
  // The cook is told only that watching wasn't available; this is where the owner finds out why.
  if (!watcher) console.warn("YouTube import: nothing can watch the video. Set GEMINI_API_KEY (LLM_PROVIDER=none disables it too).");
  if (watcher) {
    let draft: RecipeDraft | null = null;
    try {
      draft = await watcher.extract({
        videoUrl: watchUrl(args.videoId),
        title: args.meta.title,
        description,
        durationSeconds: youtubeLengthSeconds(args.html),
      });
    } catch (err) {
      console.error("Video extraction failed", err);
      warnings.push(err instanceof VideoUnavailable ? err.message : "Couldn't watch the video all the way through.");
    }
    if (draft && draftHasContent(draft)) {
      warnings.unshift("An AI watched the video and listened to it to write this down. Double-check quantities and steps.");
      if (draft.steps.length === 0) warnings.push("No steps were found.");
      if (lacksAmounts(draft)) warnings.push("The video never gave amounts, so the ingredients have none - add them as you learn them.");
      return { ...common, draft, method: "video", warnings };
    }
    if (draft) {
      warnings.push("The AI watched the video but didn't find a recipe in it.");
      ruledOut = draftIsEmpty(draft);
    }
  }

  const extractor = getRecipeExtractor();
  const text = [args.meta.title, description].filter(Boolean).join("\n\n");
  if (extractor && text.length > 80) {
    try {
      const draft = await extractor.extract({ url: args.finalUrl, title: args.meta.title, description: null, text });
      if (draftHasContent(draft)) {
        warnings.unshift(
          watcher
            ? "An AI read the video's description text, not the video itself. Double-check quantities and steps."
            : "An AI read the video's description, not the video itself - watching the video wasn't available this time. Double-check quantities and steps.",
        );
        if (draft.steps.length === 0) warnings.push("No steps were found.");
        return { ...common, draft, method: "llm", warnings };
      }
    } catch (err) {
      console.error("LLM extraction failed", err);
    }
  }

  if (!watcher && !extractor) {
    console.warn("YouTube import: no LLM configured at all. Set GEMINI_API_KEY, ANTHROPIC_API_KEY, or the Anthropic federation IDs.");
  }
  warnings.push(
    watcher || extractor
      ? "Couldn't get a recipe out of that video, and its description doesn't hold one either."
      : "Couldn't read that video. Try pasting the description as text, or enter it manually.",
  );
  return ruledOut ? "no-recipe" : "unread";
}
