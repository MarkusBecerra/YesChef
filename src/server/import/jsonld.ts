import type { CheerioAPI } from "cheerio";
import { clean, EMPTY_DRAFT, type RecipeDraft } from "./draft";

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** ISO 8601 duration ("PT1H30M", "PT45M", "P0DT0H20M") -> minutes. */
export function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(value.trim());
  if (!m) return null;
  const [, d, h, min, s] = m;
  const total = (Number(d ?? 0) * 24 * 60) + Number(h ?? 0) * 60 + Number(min ?? 0) + Number(s ?? 0) / 60;
  return Number.isFinite(total) && (d || h || min || s) ? Math.round(total) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " "));
}

function textOf(v: unknown): string | null {
  if (typeof v === "string") return clean(stripTags(v));
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return textOf(v[0]);
  if (isObj(v)) return textOf(v.name ?? v.text ?? v["@value"]);
  return null;
}

function typesOf(node: Json): string[] {
  const t = node["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
}

/** Walk any JSON-LD shape (single object, array, @graph, nested mainEntity) for a Recipe node. */
function findRecipeNode(value: unknown, depth = 0): Json | null {
  if (depth > 6) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isObj(value)) return null;
  if (typesOf(value).some((t) => t === "recipe" || t.endsWith("/recipe"))) return value;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "hasPart"]) {
    if (key in value) {
      const found = findRecipeNode(value[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** recipeInstructions can be a string, a list of strings, HowToSteps, or HowToSections containing steps. */
function flattenInstructions(value: unknown, out: string[] = []): string[] {
  if (value == null) return out;
  if (typeof value === "string") {
    for (const part of value.split(/\r?\n+/)) {
      const t = clean(stripTags(part));
      if (t) out.push(t);
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) flattenInstructions(v, out);
    return out;
  }
  if (isObj(value)) {
    const types = typesOf(value);
    if (types.includes("howtosection")) {
      flattenInstructions(value.itemListElement, out);
      return out;
    }
    const t = textOf(value.text ?? value.name ?? value.description);
    if (t) out.push(t);
    return out;
  }
  return out;
}

function imageOf(value: unknown): string | null {
  if (typeof value === "string") return value.startsWith("http") ? value : null;
  if (Array.isArray(value)) return imageOf(value[0]);
  if (isObj(value)) return imageOf(value.url ?? value.contentUrl ?? value["@id"]);
  return null;
}

function yieldOf(value: unknown): { servings: number | null; yieldText: string | null } {
  const text = textOf(value);
  if (!text) return { servings: null, yieldText: null };
  const n = /(\d+)/.exec(text);
  const servings = n ? Number(n[1]) : null;
  const looksLikeServings = /^\s*\d+\s*(servings?|people|portions?)?\s*$/i.test(text);
  return { servings: servings && servings > 0 && servings < 1000 ? servings : null, yieldText: looksLikeServings ? null : text };
}

function listOf(value: unknown): string[] {
  if (typeof value === "string") return value.split(/,|\n/).map((s) => clean(s)).filter((s): s is string => Boolean(s));
  if (Array.isArray(value)) return value.map((v) => textOf(v)).filter((s): s is string => Boolean(s));
  return [];
}

/**
 * Blog keyword lists are SEO noise ("how to make pancakes", "flipping"). Keep short,
 * tag-like entries only: at most two words, at most 20 characters, first six.
 */
export function cleanTags(raw: string[]): string[] {
  const out: string[] = [];
  for (const t of raw) {
    const tag = t.toLowerCase().replace(/\s+/g, " ").trim();
    if (!tag || tag.length > 20 || tag.split(" ").length > 2 || out.includes(tag)) continue;
    out.push(tag);
    if (out.length === 6) break;
  }
  return out;
}

/**
 * Structured data is copied as written, so a page in another language stays in that
 * language. Name it in a warning; null for English, or a tag the runtime can't read.
 */
export function nonEnglishWarning(tag: string | null): string | null {
  if (!tag) return null;
  const canonical = tag.trim().replace(/_/g, "-");
  if (/^en(?:-|$)/i.test(canonical)) return null;
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" }).of(canonical);
  } catch {
    return null;
  }
  if (!name) return null;
  return `The recipe is in ${name}; it was imported as written.`;
}

export type JsonLdRecipe = { draft: RecipeDraft; imageUrl: string | null; author: string | null; language: string | null };

/** Parse every <script type="application/ld+json"> on the page and map the first Recipe found. */
export function extractJsonLdRecipe($: CheerioAPI): JsonLdRecipe | null {
  const scripts = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).text())
    .get();
  for (const raw of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const node = findRecipeNode(parsed);
    if (!node) continue;

    const ingredients = listOf(node.recipeIngredient ?? node.ingredients);
    const steps = flattenInstructions(node.recipeInstructions);
    const { servings, yieldText } = yieldOf(node.recipeYield);
    const tags = cleanTags([...listOf(node.recipeCuisine), ...listOf(node.keywords)]);
    // recipeCategory may be an array or a comma-joined string; keep the first.
    const category = listOf(node.recipeCategory)[0] ?? null;

    const draft: RecipeDraft = {
      ...EMPTY_DRAFT,
      title: textOf(node.name),
      description: clean(textOf(node.description)),
      ingredients,
      steps,
      prepMinutes: parseIsoDuration(node.prepTime),
      cookMinutes: parseIsoDuration(node.cookTime),
      totalMinutes: parseIsoDuration(node.totalTime),
      servings,
      yieldText,
      category: category ? category.slice(0, 60) : null,
      tags: Array.from(new Set(tags)),
    };
    return { draft, imageUrl: imageOf(node.image), author: textOf(node.author), language: textOf(node.inLanguage) };
  }
  return null;
}
