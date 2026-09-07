import type { RecipeDraft } from "../draft";
import { resolveAnthropicAuth } from "./auth";

export type ExtractInput = {
  /** Where the text came from, when we know: a page URL, or null for text the user pasted. */
  url: string | null;
  title: string | null;
  description: string | null;
  text: string;
};

export interface RecipeExtractor {
  readonly name: string;
  extract(input: ExtractInput): Promise<RecipeDraft>;
}

export const EXTRACTION_SYSTEM_PROMPT = `You turn text into a recipe record. The text is whatever the cook had to hand: a web page, a social media caption, a message from a friend, a typed-out recipe card.

Rules:
- Use only information present in the text. Never invent ingredients, steps, or times.
- If the text contains no recipe, return title null with empty ingredients and steps.
- ingredients: one entry per ingredient, exactly as written, including quantity and unit (e.g. "2 cups all-purpose flour").
- steps: one entry per step, in order, without numbering. A caption that runs the method together as prose becomes one step per action.
- Times are whole minutes. Leave a time null when the text doesn't state it.
- servings is a whole number when stated; yieldText is for non-serving yields like "12 muffins".
- category: one of Breakfast, Lunch, Dinner, Dessert, Snack, Side, Drink, Sauce, Baking - or null.
- tags: 2 to 6 short lowercase tags (cuisine, meal type, diet, key technique).
- description: one sentence. notes: helpful tips from the text, or null.
- Ignore anything that isn't the recipe: hashtags, follower counts, comments, "link in bio", subscribe pleas.`;

export function buildUserPrompt(input: ExtractInput): string {
  return [
    input.url ? `Source: ${input.url}` : null,
    input.title ? `Title: ${input.title}` : null,
    input.description ? `Summary: ${input.description}` : null,
    "",
    "Text:",
    input.text,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export type LlmProviderName = "anthropic" | "gemini";

/** Which provider is configured, if any. LLM_PROVIDER wins; otherwise infer from the credentials present. */
export function configuredProvider(): LlmProviderName | null {
  if (llmDisabled()) return null;
  const explicit = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicit === "anthropic" || explicit === "gemini") return explicit;
  if (resolveAnthropicAuth()) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

/** LLM_PROVIDER=none turns every AI path off, whatever keys happen to be present. */
export function llmDisabled(): boolean {
  const explicit = process.env.LLM_PROVIDER?.trim().toLowerCase();
  return explicit === "none" || explicit === "off";
}
