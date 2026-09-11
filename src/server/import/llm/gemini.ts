import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { recipeDraftSchema, voiceDraftSchema, type RecipeDraft, type VoiceDraft } from "../draft";
import {
  buildSpeechPrompt,
  buildUserPrompt,
  buildVideoPrompt,
  EXTRACTION_SYSTEM_PROMPT,
  PHOTO_SYSTEM_PROMPT,
  PHOTO_USER_PROMPT,
  VIDEO_SYSTEM_PROMPT,
  type ExtractInput,
  type ImageInput,
  type ImageRecipeExtractor,
  type RecipeExtractor,
  TRANSCRIPTION_PROMPT,
  VideoUnavailable,
  VOICE_SYSTEM_PROMPT,
  type AudioTranscriber,
  type SpeechInput,
  type SpeechRecipeExtractor,
  type TranscribeInput,
  type VideoInput,
  type VideoRecipeExtractor,
} from "./provider";

const DEFAULT_MODEL = "gemini-3.6-flash";
/** Transcribing is dictation, not comprehension: the small model is enough and much faster. */
const DEFAULT_AUDIO_MODEL = "gemini-3.5-flash-lite";
/** A minute of speech is a few hundred kilobytes; this is a ceiling, not a target. */
const AUDIO_BUDGET_MS = 45_000;
/** Watching costs roughly a hundred tokens a second, so cap what we hand over. */
const MAX_VIDEO_SECONDS = 900;
/**
 * Which model watches. Measured on the same two videos: the lite model reads a 50-second
 * short in under two seconds but takes a minute and a half over a 14-minute one, and the
 * flash model is the other way round. Shorts are the reason this path exists, so split on
 * length rather than paying either penalty.
 */
const SHORT_VIDEO_MODEL = "gemini-3.5-flash-lite";
const LONG_VIDEO_MODEL = "gemini-3.6-flash";
const SHORT_VIDEO_SECONDS = 240;

function videoModel(durationSeconds: number | null): string {
  const override = process.env.LLM_VIDEO_MODEL?.trim();
  if (override) return override;
  return durationSeconds !== null && durationSeconds <= SHORT_VIDEO_SECONDS ? SHORT_VIDEO_MODEL : LONG_VIDEO_MODEL;
}
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

/** Gemini reading a photo of a recipe card or cookbook page. */
export function createGeminiImageExtractor(): ImageRecipeExtractor {
  const ai = client();
  const model = modelName();
  return {
    name: `gemini:${model}`,
    async extractFromImage({ bytes, mimeType }: ImageInput): Promise<RecipeDraft> {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } }, { text: PHOTO_USER_PROMPT }],
          },
        ],
        config: { systemInstruction: PHOTO_SYSTEM_PROMPT, ...responseConfig },
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
  return {
    name: "gemini-video",
    async extract(input: VideoInput): Promise<RecipeDraft> {
      const model = videoModel(input.durationSeconds);
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
        if (isQuota(err)) {
          console.warn("Video extraction hit the Gemini quota (429); add billing to the Gemini key to raise it", err);
          throw new VideoUnavailable("Couldn't watch the video just now - too many videos have been read recently. Try again later, or enter the recipe manually.");
        }
        if (!isTransient(err) || deadline - Date.now() < MIN_RETRY_MS) throw err;
        console.warn("Retrying video extraction", err);
        return parseDraft((await call()).text);
      }
    },
  };
}

/** Gemini over a spoken recipe, answering with the draft plus its follow-up questions. */
export function createGeminiSpeechExtractor(): SpeechRecipeExtractor {
  const ai = client();
  const model = modelName();
  return {
    name: `gemini:${model}`,
    async extractFromSpeech(input: SpeechInput): Promise<VoiceDraft> {
      const response = await ai.models.generateContent({
        model,
        contents: buildSpeechPrompt(input),
        config: {
          systemInstruction: VOICE_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(voiceDraftSchema),
          temperature: 0,
        },
      });
      if (!response.text) throw new Error("The AI returned an empty answer");
      return voiceDraftSchema.parse(JSON.parse(response.text));
    },
  };
}

/**
 * Speech to text for browsers that have none of their own (Firefox, and Safari in a
 * standalone PWA). Gemini-only, for the same reason as video: no Claude model takes audio.
 */
export function createGeminiTranscriber(): AudioTranscriber {
  const ai = client();
  const model = process.env.LLM_AUDIO_MODEL?.trim() || DEFAULT_AUDIO_MODEL;
  return {
    name: `gemini:${model}`,
    async transcribe({ bytes, mimeType }: TranscribeInput): Promise<string> {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } },
              { text: TRANSCRIPTION_PROMPT },
            ],
          },
        ],
        config: { temperature: 0, abortSignal: AbortSignal.timeout(AUDIO_BUDGET_MS) },
      });
      return response.text?.trim() ?? "";
    },
  };
}
