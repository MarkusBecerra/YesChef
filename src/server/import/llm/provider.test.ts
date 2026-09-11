import { describe, expect, it } from "vitest";
import { EXTRACTION_SYSTEM_PROMPT, VIDEO_SYSTEM_PROMPT, VOICE_SYSTEM_PROMPT } from "./provider";

describe("import prompts", () => {
  // Non-English sources came back in their own language until the prompts said otherwise;
  // this pins the rule into every extractor so a new prompt can't quietly drop it.
  it.each([
    ["text and link", EXTRACTION_SYSTEM_PROMPT],
    ["video", VIDEO_SYSTEM_PROMPT],
    ["voice", VOICE_SYSTEM_PROMPT],
  ])("the %s prompt asks for the recipe in English, whatever the source language", (_, prompt) => {
    expect(prompt).toMatch(/in English, whatever language the source is in/);
  });

  it("asks the model to translate unit names but never convert between measurement systems", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/translate unit names/i);
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/never convert/i);
  });
});
