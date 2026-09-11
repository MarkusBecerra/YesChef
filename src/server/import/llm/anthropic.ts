import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { oidcFederationProvider } from "@anthropic-ai/sdk/lib/credentials/oidc-federation";
import { getVercelOidcToken } from "@vercel/oidc";
import { recipeDraftSchema, voiceDraftSchema, type RecipeDraft, type VoiceDraft } from "../draft";
import { resolveAnthropicAuth, type AnthropicAuth } from "./auth";
import {
  buildSpeechPrompt,
  buildUserPrompt,
  EXTRACTION_SYSTEM_PROMPT,
  PHOTO_SYSTEM_PROMPT,
  PHOTO_USER_PROMPT,
  VOICE_SYSTEM_PROMPT,
  type ExtractInput,
  type ImageInput,
  type ImageRecipeExtractor,
  type RecipeExtractor,
  type SpeechInput,
  type SpeechRecipeExtractor,
} from "./provider";

const DEFAULT_MODEL = "claude-opus-5";

function createClient(auth: AnthropicAuth): Anthropic {
  if (auth.mode === "api-key") return new Anthropic({ apiKey: auth.apiKey });
  return new Anthropic({
    credentials: oidcFederationProvider({
      // Called by the SDK at every exchange, always from inside a request, so on Vercel it
      // reads the function's identity token; locally it reads VERCEL_OIDC_TOKEN from the env.
      identityTokenProvider: () => getVercelOidcToken({ audience: auth.audience }),
      federationRuleId: auth.federationRuleId,
      organizationId: auth.organizationId,
      serviceAccountId: auth.serviceAccountId,
      workspaceId: auth.workspaceId,
      baseURL: process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com",
      fetch,
    }),
  });
}

// One client per process: the SDK caches the exchanged token and refreshes it before expiry.
let cached: { auth: AnthropicAuth; client: Anthropic } | undefined;

function getClient(): Anthropic {
  const auth = resolveAnthropicAuth();
  if (!auth) throw new Error("Claude is not configured: set ANTHROPIC_API_KEY or the federation IDs");
  if (!cached || JSON.stringify(cached.auth) !== JSON.stringify(auth)) cached = { auth, client: createClient(auth) };
  return cached.client;
}

/** Claude with structured outputs: the response is validated against the draft schema by the SDK. */
export function createAnthropicExtractor(): RecipeExtractor {
  const model = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  return {
    name: `anthropic:${model}`,
    async extract(input: ExtractInput): Promise<RecipeDraft> {
      const response = await getClient().messages.parse({
        model,
        max_tokens: 8000,
        output_config: { effort: "low", format: zodOutputFormat(recipeDraftSchema) },
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(input) }],
      });
      if (response.stop_reason === "refusal") throw new Error("The AI declined to process this page");
      if (!response.parsed_output) throw new Error("The AI returned an unreadable answer");
      return response.parsed_output;
    },
  };
}

/**
 * The same model over a spoken recipe. Worth a step more effort than a web page: the
 * transcript needs untangling, and working out what the cook *didn't* say is the whole
 * point of the follow-up questions.
 */
export function createAnthropicSpeechExtractor(): SpeechRecipeExtractor {
  const model = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  return {
    name: `anthropic:${model}`,
    async extractFromSpeech(input: SpeechInput): Promise<VoiceDraft> {
      const response = await getClient().messages.parse({
        model,
        max_tokens: 8000,
        output_config: { effort: "medium", format: zodOutputFormat(voiceDraftSchema) },
        system: VOICE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildSpeechPrompt(input) }],
      });
      if (response.stop_reason === "refusal") throw new Error("The AI declined to write this recipe up");
      if (!response.parsed_output) throw new Error("The AI returned an unreadable answer");
      return response.parsed_output;
    },
  };
}

/** The same model reading a photo of a recipe card or cookbook page. */
export function createAnthropicImageExtractor(): ImageRecipeExtractor {
  const model = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  return {
    name: `anthropic:${model}`,
    async extractFromImage({ bytes, mimeType }: ImageInput): Promise<RecipeDraft> {
      const response = await getClient().messages.parse({
        model,
        max_tokens: 8000,
        output_config: { effort: "low", format: zodOutputFormat(recipeDraftSchema) },
        system: PHOTO_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mimeType, data: Buffer.from(bytes).toString("base64") } },
              { type: "text", text: PHOTO_USER_PROMPT },
            ],
          },
        ],
      });
      if (response.stop_reason === "refusal") throw new Error("The AI declined to read this photo");
      if (!response.parsed_output) throw new Error("The AI returned an unreadable answer");
      return response.parsed_output;
    },
  };
}
