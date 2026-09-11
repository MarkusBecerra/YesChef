import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DRAFT, type RecipeDraft } from "./draft";
import { PHOTO_SYSTEM_PROMPT } from "./llm/provider";
import { imageMimeType, importRecipeFromPhoto } from "./photo";

const extractFromImage = vi.fn<(input: unknown) => Promise<RecipeDraft>>();
const getImageExtractor = vi.fn<() => { name: string; extractFromImage: typeof extractFromImage } | null>();

vi.mock("./llm", () => ({ getImageExtractor: () => getImageExtractor() }));

const PHOTO = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), mimeType: "image/jpeg" as const };

const DRAFT: RecipeDraft = {
  ...EMPTY_DRAFT,
  title: "Nana's Shortbread",
  ingredients: ["250 g butter", "125 g caster sugar"],
  steps: ["Cream the butter and sugar.", "Bake 20 minutes."],
};

beforeEach(() => {
  extractFromImage.mockReset();
  getImageExtractor.mockReset();
  extractFromImage.mockResolvedValue(DRAFT);
  getImageExtractor.mockReturnValue({ name: "test", extractFromImage });
});

describe("imageMimeType", () => {
  it("accepts the formats every vision model reads, ignoring case and parameters", () => {
    expect(imageMimeType("image/jpeg")).toBe("image/jpeg");
    expect(imageMimeType("IMAGE/PNG")).toBe("image/png");
    expect(imageMimeType("image/webp; charset=binary")).toBe("image/webp");
    expect(imageMimeType("image/gif")).toBe("image/gif");
  });

  it("refuses formats the models don't take, and blanks", () => {
    expect(imageMimeType("image/heic")).toBeNull();
    expect(imageMimeType("application/pdf")).toBeNull();
    expect(imageMimeType("")).toBeNull();
    expect(imageMimeType(undefined)).toBeNull();
  });
});

describe("importRecipeFromPhoto", () => {
  it("hands the photo to the extractor and marks the result as a photo import", async () => {
    const result = await importRecipeFromPhoto(PHOTO);
    expect(extractFromImage).toHaveBeenCalledWith(PHOTO);
    expect(result.method).toBe("photo");
    expect(result.draft.title).toBe("Nana's Shortbread");
    expect(result.sourceUrl).toBeNull();
    expect(result.sourceName).toBeNull();
    expect(result.imageUrl).toBeNull();
    expect(result.warnings[0]).toMatch(/Read by AI from your photo/);
  });

  it("points out words the model couldn't read", async () => {
    extractFromImage.mockResolvedValue({ ...DRAFT, ingredients: ["250 g butter", "125 g [?] sugar"] });
    const result = await importRecipeFromPhoto(PHOTO);
    expect(result.warnings.join(" ")).toMatch(/\[\?\]/);
  });

  it("flags an unreadable word wherever it landed", async () => {
    extractFromImage.mockResolvedValue({ ...DRAFT, yieldText: "makes [?] biscuits" });
    const result = await importRecipeFromPhoto(PHOTO);
    expect(result.warnings.join(" ")).toMatch(/\[\?\]/);
  });

  it("warns when only one half of the recipe came back", async () => {
    extractFromImage.mockResolvedValue({ ...DRAFT, steps: [] });
    expect((await importRecipeFromPhoto(PHOTO)).warnings.join(" ")).toMatch(/No steps/);
    extractFromImage.mockResolvedValue({ ...DRAFT, ingredients: [] });
    expect((await importRecipeFromPhoto(PHOTO)).warnings.join(" ")).toMatch(/No ingredients/);
  });

  it("keeps a recipe the model forgot to name, and says so", async () => {
    extractFromImage.mockResolvedValue({ ...DRAFT, title: null });
    const result = await importRecipeFromPhoto(PHOTO);
    expect(result.draft.ingredients).toEqual(DRAFT.ingredients);
    expect(result.warnings.join(" ")).toMatch(/name/i);
  });

  it("explains itself when no AI parser is configured", async () => {
    getImageExtractor.mockReturnValue(null);
    await expect(importRecipeFromPhoto(PHOTO)).rejects.toMatchObject({ status: 503 });
    expect(extractFromImage).not.toHaveBeenCalled();
  });

  it("turns a photo with no recipe in it into a 422 rather than a blank form", async () => {
    extractFromImage.mockResolvedValue(EMPTY_DRAFT);
    await expect(importRecipeFromPhoto(PHOTO)).rejects.toMatchObject({ status: 422 });
  });

  it("turns a provider failure into a 502 that doesn't blame the photo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    extractFromImage.mockRejectedValue(new Error("boom"));
    await expect(importRecipeFromPhoto(PHOTO)).rejects.toMatchObject({ status: 502, message: expect.not.stringMatching(/in frame/) });
  });
});

describe("PHOTO_SYSTEM_PROMPT", () => {
  it("tells the model to name an unnamed recipe and to keep amounts as written", () => {
    expect(PHOTO_SYSTEM_PROMPT).toMatch(/name it plainly after the dish/);
    expect(PHOTO_SYSTEM_PROMPT).toMatch(/exactly as written/);
  });
});
