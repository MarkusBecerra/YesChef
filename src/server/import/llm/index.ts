import { createAnthropicExtractor } from "./anthropic";
import { createGeminiExtractor, createGeminiVideoExtractor } from "./gemini";
import { configuredProvider, llmDisabled, type RecipeExtractor, type VideoRecipeExtractor } from "./provider";

export { configuredProvider } from "./provider";

/** The configured extractor, or null when no provider/key is set up. */
export function getRecipeExtractor(): RecipeExtractor | null {
  switch (configuredProvider()) {
    case "anthropic":
      return createAnthropicExtractor();
    case "gemini":
      return createGeminiExtractor();
    default:
      return null;
  }
}

/**
 * The extractor that watches a video, or null. Always Gemini, whatever LLM_PROVIDER
 * says, because Claude's API doesn't take video: a Claude app can still read shorts
 * as long as a Gemini key is present alongside.
 */
export function getVideoExtractor(): VideoRecipeExtractor | null {
  if (llmDisabled() || !process.env.GEMINI_API_KEY?.trim()) return null;
  return createGeminiVideoExtractor();
}
