import type { RecipeDraft } from "../draft";
import { resolveAnthropicAuth } from "./auth";

export type ExtractInput = {
  url: string;
  pageTitle: string | null;
  pageDescription: string | null;
  text: string;
};

export interface RecipeExtractor {
  readonly name: string;
  extract(input: ExtractInput): Promise<RecipeDraft>;
}

export const EXTRACTION_SYSTEM_PROMPT = `You turn the text of a web page into a recipe record.

Rules:
- Use only information present in the page text. Never invent ingredients, steps, or times.
- If the page contains no recipe, return title null with empty ingredients and steps.
- ingredients: one entry per ingredient, exactly as written, including quantity and unit (e.g. "2 cups all-purpose flour").
- steps: one entry per step, in order, without numbering.
- Times are whole minutes. Leave a time null when the page doesn't state it.
- servings is a whole number when stated; yieldText is for non-serving yields like "12 muffins".
- category: one of Breakfast, Lunch, Dinner, Dessert, Snack, Side, Drink, Sauce, Baking - or null.
- tags: 2 to 6 short lowercase tags (cuisine, meal type, diet, key technique).
- description: one sentence. notes: helpful tips from the page, or null.`;

export function buildUserPrompt(input: ExtractInput): string {
  return [
    `URL: ${input.url}`,
    input.pageTitle ? `Page title: ${input.pageTitle}` : null,
    input.pageDescription ? `Page description: ${input.pageDescription}` : null,
    "",
    "Page text:",
    input.text,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export type LlmProviderName = "anthropic" | "gemini";

/** Which provider is configured, if any. LLM_PROVIDER wins; otherwise infer from the credentials present. */
export function configuredProvider(): LlmProviderName | null {
  const explicit = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicit === "anthropic" || explicit === "gemini") return explicit;
  if (explicit === "none" || explicit === "off") return null;
  if (resolveAnthropicAuth()) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}
