import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { recipeDraftSchema, type RecipeDraft } from "../draft";
import {
  buildUserPrompt,
  buildVideoPrompt,
  EXTRACTION_SYSTEM_PROMPT,
  VIDEO_SYSTEM_PROMPT,
  type ExtractInput,
  type RecipeExtractor,
  VideoUnavailable,
  type VideoInput,
  type VideoRecipeExtractor,
} from "./provider";

const DEFAULT_MODEL = "gemini-3.6-flash";
/** Watching costs roughly a hundred tokens a second, so cap what we hand over. */
const MAX_VIDEO_SECONDS = 900;
/** Total wall clock for watching, leaving the route room to fall back to the description. */
const VIDEO_BUDGET_MS = 40_000;
/** A second attempt is only worth starting with this much of the budget left. */
const MIN_RETRY_MS = 15_000;

/** The free tier answers a busy moment with 503; that is worth one more try straight away. */
function isTransient(err: unknown): boolean {
  const status = (err as { status?: unknown }).status;
  return status === 500 || status === 503;
}

/**
 * 429 is the free tier's daily allowance for the model, not a blip - it comes with a retry
 * delay measured in seconds to hours, so say so instead of burning another request on it.
 */
function isQuota(err: unknown): boolean {
  return (err as { status?: unknown }).status === 429;
}

const responseConfig = {
  responseMimeType: "application/json",
  responseJsonSchema: z.toJSONSchema(recipeDraftSchema),
  temperature: 0,
};

function parseDraft(text: string | undefined): RecipeDraft {
  if (!text) throw new Error("The AI returned an empty answer");
  return recipeDraftSchema.parse(JSON.parse(text));
}

function client(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function modelName(): string {
  return process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
}

/** Gemini with a JSON response schema derived from the same Zod draft schema. */
export function createGeminiExtractor(): RecipeExtractor {
  const ai = client();
  const model = modelName();
  return {
    name: `gemini:${model}`,
    async extract(input: ExtractInput): Promise<RecipeDraft> {
      const response = await ai.models.generateContent({
        model,
        contents: buildUserPrompt(input),
        config: { systemInstruction: EXTRACTION_SYSTEM_PROMPT, ...responseConfig },
      });
      return parseDraft(response.text);
    },
  };
}

/**
 * Gemini watching a public video URL, audio included. This is what gets a recipe
 * out of a short whose caption says nothing; no Claude model can take video.
 */
export function createGeminiVideoExtractor(): VideoRecipeExtractor {
  const ai = client();
  const model = process.env.LLM_VIDEO_MODEL?.trim() || DEFAULT_MODEL;
  return {
    name: `gemini-video:${model}`,
    async extract(input: VideoInput): Promise<RecipeDraft> {
      const deadline = Date.now() + VIDEO_BUDGET_MS;
      const call = () =>
        ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                { fileData: { fileUri: input.videoUrl }, videoMetadata: { endOffset: `${MAX_VIDEO_SECONDS}s` } },
                { text: buildVideoPrompt(input) },
              ],
            },
          ],
          config: {
            systemInstruction: VIDEO_SYSTEM_PROMPT,
            ...responseConfig,
            abortSignal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
          },
        });

      try {
        return parseDraft((await call()).text);
      } catch (err) {
        if (isQuota(err)) throw new VideoUnavailable("Gemini's quota for watching videos is used up for now - try again later, or add billing to the Gemini key.");
        if (!isTransient(err) || deadline - Date.now() < MIN_RETRY_MS) throw err;
        console.warn("Retrying video extraction", err);
        return parseDraft((await call()).text);
      }
    },
  };
}
