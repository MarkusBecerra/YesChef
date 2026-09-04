import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { recipeDraftSchema, type RecipeDraft } from "../draft";
import { buildUserPrompt, EXTRACTION_SYSTEM_PROMPT, type ExtractInput, type RecipeExtractor } from "./provider";

const DEFAULT_MODEL = "gemini-2.5-flash";

/** Gemini with a JSON response schema derived from the same Zod draft schema. */
export function createGeminiExtractor(): RecipeExtractor {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  return {
    name: `gemini:${model}`,
    async extract(input: ExtractInput): Promise<RecipeDraft> {
      const response = await ai.models.generateContent({
        model,
        contents: buildUserPrompt(input),
        config: {
          systemInstruction: EXTRACTION_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(recipeDraftSchema),
          temperature: 0,
        },
      });
      const text = response.text;
      if (!text) throw new Error("The AI returned an empty answer");
      return recipeDraftSchema.parse(JSON.parse(text));
    },
  };
}
