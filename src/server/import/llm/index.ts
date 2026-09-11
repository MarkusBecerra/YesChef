import { createAnthropicExtractor, createAnthropicImageExtractor, createAnthropicSpeechExtractor } from "./anthropic";
import {
  createGeminiExtractor,
  createGeminiImageExtractor,
  createGeminiSpeechExtractor,
  createGeminiTranscriber,
  createGeminiVideoExtractor,
} from "./gemini";
import {
  configuredProvider,
  llmDisabled,
  type AudioTranscriber,
  type ImageRecipeExtractor,
  type RecipeExtractor,
  type SpeechRecipeExtractor,
  type VideoRecipeExtractor,
} from "./provider";

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

/** The extractor that reads a photo of a recipe. Same provider as the text one: both take images. */
export function getImageExtractor(): ImageRecipeExtractor | null {
  switch (configuredProvider()) {
    case "anthropic":
      return createAnthropicImageExtractor();
    case "gemini":
      return createGeminiImageExtractor();
    default:
      return null;
  }
}

/** The extractor that turns a spoken recipe into a draft. Same provider as the text one. */
export function getSpeechExtractor(): SpeechRecipeExtractor | null {
  switch (configuredProvider()) {
    case "anthropic":
      return createAnthropicSpeechExtractor();
    case "gemini":
      return createGeminiSpeechExtractor();
    default:
      return null;
  }
}

/**
 * Turns a recording into text, or null when nothing can. Gemini-only, like video: no Claude
 * model takes audio. Browsers with their own dictation never come through here.
 */
export function getAudioTranscriber(): AudioTranscriber | null {
  if (llmDisabled() || !process.env.GEMINI_API_KEY?.trim()) return null;
  return createGeminiTranscriber();
}
