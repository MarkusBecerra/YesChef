import type { RecipeDraft, VoiceDraft } from "../draft";
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

export type VideoInput = {
  /** A public video URL the model can watch for itself. */
  videoUrl: string;
  title: string | null;
  description: string | null;
  /** Runtime, when the host told us: it decides which model is worth pointing at the video. */
  durationSeconds: number | null;
};

export interface VideoRecipeExtractor {
  readonly name: string;
  extract(input: VideoInput): Promise<RecipeDraft>;
}

/** A video the provider wouldn't read, for a reason the cook should hear verbatim. */
export class VideoUnavailable extends Error {}

/** How the draft's fields are filled in, shared by every extractor. */
const DRAFT_FIELD_RULES = `- ingredients: one entry per ingredient, including quantity and unit (e.g. "2 cups all-purpose flour").
- steps: one entry per step, in order, without numbering. A method run together as prose becomes one step per action.
- Times are whole minutes. Leave a time null when it isn't stated.
- servings is a whole number when stated; yieldText is for non-serving yields like "12 muffins".
- category: one of Breakfast, Lunch, Dinner, Dessert, Snack, Side, Drink, Sauce, Baking - or null.
- tags: 2 to 6 short lowercase tags (cuisine, meal type, diet, key technique).
- description: one sentence. notes: helpful tips, or null.
- Ignore anything that isn't the recipe: hashtags, follower counts, comments, "link in bio", subscribe pleas.`;

export const EXTRACTION_SYSTEM_PROMPT = `You turn text into a recipe record. The text is whatever the cook had to hand: a web page, a social media caption, a message from a friend, a typed-out recipe card.

Rules:
- Use only information present in the text. Never invent ingredients, steps, or times.
- If the text contains no recipe, return title null with empty ingredients and steps.
${DRAFT_FIELD_RULES}`;

export const VIDEO_SYSTEM_PROMPT = `You watch a cooking video and turn it into a recipe record.

Rules:
- Use what the video shows and says, plus its title and description. Never invent an ingredient, step or time that isn't there.
- Quantities are spoken aloud or shown on screen, often in an ingredient list at the start or end; read them off and keep them with the ingredient. Only leave a quantity out when the video genuinely never gives one.
- If the video isn't a recipe, return title null with empty ingredients and steps.
${DRAFT_FIELD_RULES}`;

/**
 * Speech is the messiest input we take: it rambles, doubles back, and the phone's
 * transcriber mangles kitchen words. It is also the only one where the recipe lives in
 * somebody's head rather than on a page, so the model is allowed to tidy the wording - and
 * is told to ask, rather than guess, when a quantity or a time never got said.
 */
export const VOICE_SYSTEM_PROMPT = `You turn a cook talking out loud into a recipe record. The text is a speech-to-text transcript of somebody describing a recipe they already know by heart - usually one from family or a friend that has never been written down.

Rules:
- Only the recipe the cook described. Never invent an ingredient, a quantity, a time or a step they didn't give.
- Speech-to-text mangles cooking words: fix the obvious ones from context ("two cups of flower" -> "2 cups of flour", "sat and pepper" -> "salt and pepper", "sue vide" -> "sous vide"). Never "fix" a word into an ingredient the cook never mentioned.
- Write it as a recipe, not as a transcript: drop filler ("um", "so yeah", "I guess"), repetition and asides, and put the steps in cooking order even when the cook doubled back. "You just chuck the onions in till they go soft" becomes "Cook the onions until soft".
- If they said where it came from - a person, a place, a restaurant - keep that in notes.
- title: what they called it; if they never named it, name it plainly after the dish.
- followUps: what you would have to ask before anyone could cook this. Ask about a missing quantity for a main ingredient, a missing oven temperature, a missing cook time, or missing servings - the things whose absence would actually stop a cook. One short conversational question each ("How much chicken goes in?"), at most five, fewest first. Never ask about something they already said, and never ask for something optional. When the recipe can be cooked as it stands, return an empty list.
- If the transcript isn't a recipe at all, return title null with empty ingredients and steps and no followUps.
${DRAFT_FIELD_RULES}`;

export type FollowUpAnswer = { question: string; answer: string };

export type SpeechInput = {
  /** What the cook said, as text - from the browser's dictation or a transcription model. */
  transcript: string;
  /** A second pass: the draft written from the first pass, and the answers to its questions. */
  previous?: RecipeDraft | null;
  answers?: FollowUpAnswer[];
};

export interface SpeechRecipeExtractor {
  readonly name: string;
  extractFromSpeech(input: SpeechInput): Promise<VoiceDraft>;
}

/** The formats both vision models read. The browser re-encodes to JPEG first, so HEIC never gets here. */
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export type ImageInput = { bytes: Uint8Array; mimeType: ImageMimeType };

/** Reads a written recipe out of a photo: a card, a cookbook page, a clipping. */
export interface ImageRecipeExtractor {
  readonly name: string;
  extractFromImage(input: ImageInput): Promise<RecipeDraft>;
}

/**
 * A photo is a page the model has to read rather than text it is handed, so the rules are
 * about legibility: keep what can be read, mark what can't, and never fill a gap by guessing.
 */
export const PHOTO_SYSTEM_PROMPT = `You read a photo of a written recipe and turn it into a recipe record. The photo is whatever the cook had to hand: a handwritten recipe card, a cookbook or magazine page, a printed clipping, a screenshot of a recipe.

Rules:
- Use only what is written in the photo. Never invent an ingredient, a quantity, a time or a step that isn't there.
- Handwriting and old print are hard to read. Keep every word you can make out; where a word is genuinely illegible, write [?] in its place rather than guessing. Never guess a quantity.
- If the photo holds more than one recipe, write up the most complete one and name the others in notes.
- If there is no written recipe in the photo - a plate of food, a shopping list, something else entirely - return title null with empty ingredients and steps.
${DRAFT_FIELD_RULES}`;

export const PHOTO_USER_PROMPT = "Read the recipe in this photo and write it down.";

export type TranscribeInput = { bytes: Uint8Array; mimeType: string };

/** Turns a recording into text, for browsers with no dictation of their own. */
export interface AudioTranscriber {
  readonly name: string;
  transcribe(input: TranscribeInput): Promise<string>;
}

export const TRANSCRIPTION_PROMPT = `Transcribe this recording of somebody describing a recipe.

Write only what is said, verbatim, as plain sentences with ordinary punctuation. Keep every ingredient, quantity, time and temperature exactly as spoken. Don't summarise it, don't turn it into a recipe, don't add anything that isn't said. If the recording has no speech in it, return an empty string.`;

export function buildSpeechPrompt(input: SpeechInput): string {
  const lines = ["The cook said:", input.transcript];
  if (input.previous) {
    lines.push(
      "",
      "This is the recipe you wrote from that, as JSON:",
      JSON.stringify(input.previous),
    );
  }
  if (input.answers?.length) {
    lines.push("", "You asked for what was missing, and the cook answered:");
    for (const { question, answer } of input.answers) lines.push(`Q: ${question}`, `A: ${answer}`);
    lines.push(
      "",
      "Write the whole recipe record again with those answers worked in. Keep everything that was already right. Only ask a follow-up that is still unanswered and still matters.",
    );
  }
  return lines.join("\n");
}

export function buildVideoPrompt(input: VideoInput): string {
  return [
    input.title ? `Video title: ${input.title}` : null,
    input.description ? `Video description:\n${input.description}` : null,
    "",
    "Watch the video and write down the recipe it makes.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

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
