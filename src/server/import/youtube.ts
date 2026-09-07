import { draftHasContent, type ImportResult, type RecipeDraft } from "./draft";
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

/**
 * YouTube (Shorts included), best first:
 *  1. Gemini watches the video - the only thing that works when the recipe is
 *     spoken or on screen, which is the norm for a short.
 *  2. the configured LLM over the description, which for longer videos often
 *     holds the whole recipe.
 * Returns null when both come up empty, having explained why in `warnings`, so
 * the caller can fall back to page metadata.
 */
/** Plenty of shorts show ingredients with no quantities at all; say so rather than inventing them. */
function lacksAmounts(draft: RecipeDraft): boolean {
  return draft.ingredients.length >= 3 && draft.ingredients.filter((i) => /\d/.test(i)).length * 2 < draft.ingredients.length;
}

export async function importYouTubeVideo(args: {
  videoId: string;
  finalUrl: string;
  html: string;
  meta: PageMeta;
  sourceName: string | null;
  warnings: string[];
}): Promise<ImportResult | null> {
  const description = youtubeDescription(args.html) ?? args.meta.description;
  const common = { imageUrl: args.meta.imageUrl, sourceUrl: args.finalUrl, sourceName: args.sourceName };
  const { warnings } = args;

  const watcher = getVideoExtractor();
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
      warnings.unshift("Read by AI watching the video. Double-check quantities and steps.");
      if (draft.steps.length === 0) warnings.push("No steps were found.");
      if (lacksAmounts(draft)) warnings.push("The video never gave amounts, so the ingredients have none - add them as you learn them.");
      return { ...common, draft, method: "video", warnings };
    }
    if (draft) warnings.push("The AI watched the video but didn't find a recipe in it.");
  }

  const extractor = getRecipeExtractor();
  const text = [args.meta.title, description].filter(Boolean).join("\n\n");
  if (extractor && text.length > 80) {
    try {
      const draft = await extractor.extract({ url: args.finalUrl, title: args.meta.title, description: null, text });
      if (draftHasContent(draft)) {
        warnings.unshift(
          watcher
            ? "Read by AI from the video description. Double-check quantities and steps."
            : "Read by AI from the video description - watching the video itself needs GEMINI_API_KEY.",
        );
        if (draft.steps.length === 0) warnings.push("No steps were found.");
        return { ...common, draft, method: "llm", warnings };
      }
    } catch (err) {
      console.error("LLM extraction failed", err);
    }
  }

  warnings.push(
    watcher || extractor
      ? "Couldn't get a recipe out of that video, and its description doesn't hold one either."
      : "Reading a video needs an AI parser, and none is configured (GEMINI_API_KEY lets the app watch it).",
  );
  return null;
}
