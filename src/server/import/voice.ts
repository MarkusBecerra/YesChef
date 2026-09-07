import { draftHasContent, type ImportResult, type RecipeDraft, type VoiceDraft } from "./draft";
import { ImportError } from "./fetch-page";
import { getAudioTranscriber, getSpeechExtractor } from "./llm";
import type { FollowUpAnswer } from "./llm/provider";

/** Below this nobody described a recipe; it's a stray tap on the microphone. */
export const MIN_TRANSCRIPT_CHARS = 25;
/** Twenty minutes of fast talking, and far more than anybody dictates in one go. */
export const MAX_TRANSCRIPT_CHARS = 20_000;
export const MAX_ANSWER_CHARS = 500;

/** Roughly ten minutes of Opus at a sane bitrate; the request body is the real limit. */
export const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

/**
 * What a browser's MediaRecorder produces, plus the everyday file types. The container is
 * whatever the browser chose - Firefox lands on Ogg/Opus, Safari on MP4/AAC.
 */
export const AUDIO_MIME_TYPES = [
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/flac",
  "audio/aiff",
] as const;

/** `audio/webm;codecs=opus` -> `audio/webm`, and null for anything we won't send on. */
export function audioMimeType(raw: string | null | undefined): string | null {
  const base = raw?.split(";")[0].trim().toLowerCase();
  if (!base) return null;
  return (AUDIO_MIME_TYPES as readonly string[]).includes(base) ? base : null;
}

export type VoiceImport = {
  /** What the cook said - dictated by the browser, or transcribed from a recording. */
  transcript: string;
  /** Second pass: the draft from the first pass, so the model edits rather than restarts. */
  previous?: RecipeDraft | null;
  answers?: FollowUpAnswer[];
};

function cleanAnswers(answers: FollowUpAnswer[] | undefined): FollowUpAnswer[] {
  return (answers ?? [])
    .map((a) => ({ question: a.question.trim().slice(0, 300), answer: a.answer.trim().slice(0, MAX_ANSWER_CHARS) }))
    .filter((a) => a.question && a.answer)
    .slice(0, 5);
}

/**
 * Turn a recipe somebody spoke out loud into a draft to review - the path for the recipes
 * that only exist in a cook's head. Comes back with the model's own follow-up questions
 * when something a cook would need is missing; answering them re-runs this with the
 * answers, which is the second pass rather than a fresh start.
 */
export async function importRecipeFromSpeech({ transcript, previous, answers }: VoiceImport): Promise<ImportResult> {
  const body = transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS);
  if (body.length < MIN_TRANSCRIPT_CHARS) {
    throw new ImportError("That's too short to hold a recipe. Say the ingredients and how it's made.");
  }

  const extractor = getSpeechExtractor();
  if (!extractor) {
    throw new ImportError(
      "Writing up a spoken recipe needs an AI parser, and none is configured (set ANTHROPIC_API_KEY, the Anthropic federation IDs, or GEMINI_API_KEY).",
      503,
    );
  }

  const cleanedAnswers = cleanAnswers(answers);
  let draft: VoiceDraft;
  try {
    draft = await extractor.extractFromSpeech({
      transcript: body,
      previous: previous ?? null,
      answers: cleanedAnswers,
    });
  } catch (err) {
    console.error("LLM speech extraction failed", err);
    throw new ImportError("The AI couldn't write that up. Try again, or enter the recipe manually.", 502);
  }

  const { followUps, ...recipe } = draft;
  if (!draftHasContent(recipe)) {
    throw new ImportError(
      "The AI couldn't find a recipe in that. Try again with the name of the dish, what goes in it, and how it's made.",
      422,
    );
  }

  const warnings = [
    cleanedAnswers.length
      ? "Updated with your answers. Check the quantities and steps before saving."
      : "Written up by AI from what you said. Check the quantities and steps before saving.",
  ];
  if (recipe.steps.length === 0) warnings.push("No steps came through - you may have only listed the ingredients.");

  return {
    draft: recipe,
    imageUrl: null,
    sourceUrl: null,
    sourceName: null,
    method: "voice",
    warnings,
    followUps,
  };
}

/** Transcribe a recording. Only reachable when a transcriber is configured. */
export async function transcribeRecipeAudio(input: { bytes: Uint8Array; mimeType: string }): Promise<string> {
  const transcriber = getAudioTranscriber();
  if (!transcriber) {
    throw new ImportError(
      "This browser can't turn speech into text on its own, and the server has no transcriber configured (set GEMINI_API_KEY). Type what you were going to say instead.",
      503,
    );
  }

  let text: string;
  try {
    text = await transcriber.transcribe(input);
  } catch (err) {
    console.error("Transcription failed", err);
    throw new ImportError("Couldn't make out that recording. Try again somewhere quieter, or type it instead.", 502);
  }

  if (text.trim().length === 0) {
    throw new ImportError("That recording came through silent. Check the microphone and try again.", 422);
  }
  return text.trim().slice(0, MAX_TRANSCRIPT_CHARS);
}
