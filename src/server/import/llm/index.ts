import { createAnthropicExtractor } from "./anthropic";
import { createGeminiExtractor } from "./gemini";
import { configuredProvider, type RecipeExtractor } from "./provider";

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
