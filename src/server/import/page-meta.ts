import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { clean } from "./draft";

export type PageMeta = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

export function extractPageMeta($: CheerioAPI, pageUrl: string): PageMeta {
  const meta = (sel: string) => clean($(sel).first().attr("content"));
  const abs = (u: string | null) => {
    if (!u) return null;
    try {
      return new URL(u, pageUrl).href;
    } catch {
      return null;
    }
  };
  return {
    title: meta('meta[property="og:title"]') ?? meta('meta[name="twitter:title"]') ?? clean($("title").first().text()),
    description: meta('meta[property="og:description"]') ?? meta('meta[name="description"]') ?? meta('meta[name="twitter:description"]'),
    imageUrl: abs(meta('meta[property="og:image"]') ?? meta('meta[name="twitter:image"]')),
    siteName: meta('meta[property="og:site_name"]'),
  };
}

const MAX_TEXT_CHARS = 40_000;

/**
 * Readable text for the LLM: strips chrome, keeps line breaks between blocks, and if the
 * page is huge, centres the window on the first "Ingredients" heading (recipe blogs bury
 * the card under a long story).
 */
export function extractReadableText($: CheerioAPI): string {
  // Work on a fresh parse so removing chrome here doesn't affect other extractors.
  const $c = cheerio.load($.html());
  $c("script, style, noscript, svg, iframe, nav, header, footer, aside, form, button, [aria-hidden='true']").remove();
  $c("br").replaceWith("\n");
  $c("p, li, h1, h2, h3, h4, h5, h6, div, section, article, tr, blockquote, dt, dd").each((_, el) => {
    $c(el).append("\n");
  });
  const container = ["article", "main", "[itemtype*='Recipe']", "body"].map((sel) => $c(sel).first()).find((n) => n.length && n.text().trim().length > 400);
  const raw = (container ?? $c("body")).text();
  let text = raw
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length > MAX_TEXT_CHARS) {
    const idx = text.search(/\bingredients\b/i);
    const start = idx > 1500 ? idx - 1500 : 0;
    text = text.slice(start, start + MAX_TEXT_CHARS);
  }
  return text;
}
