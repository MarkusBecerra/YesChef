import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DRAFT, type RecipeDraft } from "./draft";
import { ImportError } from "./fetch-page";
import { importRecipeFromText } from "./text";

const extract = vi.fn<(input: unknown) => Promise<RecipeDraft>>();
const getRecipeExtractor = vi.fn<() => { name: string; extract: typeof extract } | null>();

vi.mock("./llm", () => ({ getRecipeExtractor: () => getRecipeExtractor() }));

const CAPTION = `PAD THAI 🍜 the one I make every week.
Sauce: 3 tbsp tamarind, 2 tbsp fish sauce, 3 tbsp palm sugar.
Soak 8oz rice noodles, then stir fry with 2 eggs and a cup of bean sprouts. #padthai`;

const DRAFT: RecipeDraft = {
  ...EMPTY_DRAFT,
  title: "Pad Thai",
  ingredients: ["8 oz rice noodles", "2 eggs"],
  steps: ["Soak the noodles.", "Stir fry."],
};

beforeEach(() => {
  extract.mockReset();
  getRecipeExtractor.mockReset();
  extract.mockResolvedValue(DRAFT);
  getRecipeExtractor.mockReturnValue({ name: "test", extract });
});

describe("importRecipeFromText", () => {
  it("hands the pasted text to the extractor and marks the result as text", async () => {
    const result = await importRecipeFromText({ text: CAPTION });
    expect(extract).toHaveBeenCalledWith({ url: null, title: null, description: null, text: CAPTION });
    expect(result.method).toBe("text");
    expect(result.draft.title).toBe("Pad Thai");
    expect(result.sourceUrl).toBeNull();
    expect(result.sourceName).toBeNull();
    expect(result.imageUrl).toBeNull();
    expect(result.warnings[0]).toMatch(/Parsed by AI/);
  });

  it("keeps an optional source link and names the host", async () => {
    const result = await importRecipeFromText({ text: CAPTION, sourceUrl: " https://www.instagram.com/reel/abc/ " });
    expect(result.sourceUrl).toBe("https://www.instagram.com/reel/abc/");
    expect(result.sourceName).toBe("instagram.com");
  });

  it("rejects a source link that isn't a public http(s) address", async () => {
    await expect(importRecipeFromText({ text: CAPTION, sourceUrl: "http://localhost/x" })).rejects.toThrow(ImportError);
  });

  it("rejects text too short to hold a recipe", async () => {
    await expect(importRecipeFromText({ text: "pad thai" })).rejects.toThrow(/too short/i);
    expect(extract).not.toHaveBeenCalled();
  });

  it("warns when only ingredients came back", async () => {
    extract.mockResolvedValue({ ...DRAFT, steps: [] });
    const result = await importRecipeFromText({ text: CAPTION });
    expect(result.warnings.join(" ")).toMatch(/No steps/);
  });

  it("explains itself when no AI parser is configured", async () => {
    getRecipeExtractor.mockReturnValue(null);
    await expect(importRecipeFromText({ text: CAPTION })).rejects.toMatchObject({ status: 503 });
  });

  it("turns an empty extraction into a 422 rather than a blank form", async () => {
    extract.mockResolvedValue(EMPTY_DRAFT);
    await expect(importRecipeFromText({ text: CAPTION })).rejects.toMatchObject({ status: 422 });
  });

  it("turns a provider failure into a 502", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    extract.mockRejectedValue(new Error("boom"));
    await expect(importRecipeFromText({ text: CAPTION })).rejects.toMatchObject({ status: 502 });
  });
});
