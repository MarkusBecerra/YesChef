import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { recipeDraftSchema, type RecipeDraft } from "../draft";
import { buildUserPrompt, EXTRACTION_SYSTEM_PROMPT, type ExtractInput, type RecipeExtractor } from "./provider";

const DEFAULT_MODEL = "claude-opus-5";

/** Claude with structured outputs: the response is validated against the draft schema by the SDK. */
export function createAnthropicExtractor(): RecipeExtractor {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  return {
    name: `anthropic:${model}`,
    async extract(input: ExtractInput): Promise<RecipeDraft> {
      const response = await client.messages.parse({
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
