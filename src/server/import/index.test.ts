import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DRAFT, type RecipeDraft } from "./draft";
import { ImportError } from "./fetch-page";
import { importRecipeFromUrl } from "./index";

const fetchHtml = vi.fn<(raw: string) => Promise<{ html: string; finalUrl: string }>>();
const readText = vi.fn<(input: unknown) => Promise<RecipeDraft>>();
const watch = vi.fn<(input: unknown) => Promise<RecipeDraft>>();
const getRecipeExtractor = vi.fn<() => { name: string; extract: typeof readText } | null>();
const getVideoExtractor = vi.fn<() => { name: string; extract: typeof watch } | null>();

vi.mock("./fetch-page", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./fetch-page")>()),
  fetchHtml: (raw: string) => fetchHtml(raw),
}));

vi.mock("./llm", () => ({
  getRecipeExtractor: () => getRecipeExtractor(),
  getVideoExtractor: () => getVideoExtractor(),
  getSpeechExtractor: () => null,
  getAudioTranscriber: () => null,
}));

/** A page that says plenty about itself and holds plenty of text - but no recipe. */
const VLOG_PAGE = `<!doctype html><html><head>
<meta property="og:title" content="I moved to Lisbon and everything changed">
<meta property="og:description" content="Vlog 47. Thanks to today's sponsor - use code CHEF for 20% off.">
<meta property="og:image" content="https://img.example/lisbon.jpg">
</head><body><article><p>${"Some rambling about the move, the flat and the weather. ".repeat(20)}</p></article></body></html>`;

const SHORT_PAGE = `<!doctype html><html><head>
<meta property="og:title" content="Login • Instagram">
<meta property="og:description" content="See photos and videos from around the world.">
</head><body><p>Log in to continue.</p></body></html>`;

const YOUTUBE_PAGE = `<!doctype html><html><head>
<meta property="og:title" content="my cat sits in the sink again #shorts">
<meta property="og:description" content="Subscribe for more. Follow me everywhere else too.">
<meta property="og:image" content="https://i.ytimg.com/vi/Y9LX8QylWwo/maxresdefault.jpg">
<meta property="og:site_name" content="YouTube">
</head><body></body></html>`;

const page = (html: string, finalUrl: string) => fetchHtml.mockResolvedValue({ html, finalUrl });

beforeEach(() => {
  vi.clearAllMocks();
  readText.mockResolvedValue({ ...EMPTY_DRAFT });
  watch.mockResolvedValue({ ...EMPTY_DRAFT });
  getRecipeExtractor.mockReturnValue({ name: "text", extract: readText });
  getVideoExtractor.mockReturnValue({ name: "video", extract: watch });
});

describe("importRecipeFromUrl when there is no recipe to find", () => {
  it("leaves the form blank rather than filling it with the page's own title and blurb", async () => {
    page(VLOG_PAGE, "https://example.com/vlog-47");
    const result = await importRecipeFromUrl("https://example.com/vlog-47");

    expect(result.method).toBe("none");
    expect(result.draft.title).toBeNull();
    expect(result.draft.description).toBeNull();
    expect(result.draft).toEqual(EMPTY_DRAFT);
    // The photo is page furniture too, so it doesn't get attached either.
    expect(result.imageUrl).toBeNull();
    // Where it came from is still worth keeping: the cook may type the recipe in themselves.
    expect(result.sourceUrl).toBe("https://example.com/vlog-47");
    expect(result.warnings.join(" ")).toMatch(/couldn't find a recipe/i);
  });

  it("does the same for a video an AI watched all the way through", async () => {
    page(YOUTUBE_PAGE, "https://www.youtube.com/shorts/Y9LX8QylWwo");
    const result = await importRecipeFromUrl("https://www.youtube.com/shorts/Y9LX8QylWwo");

    expect(watch).toHaveBeenCalled();
    expect(result.method).toBe("none");
    expect(result.draft.title).toBeNull();
    expect(result.draft.description).toBeNull();
    expect(result.imageUrl).toBeNull();
    expect(result.sourceName).toBe("YouTube");
  });

  it("still seeds the form from page details when nothing could read the page", async () => {
    getRecipeExtractor.mockReturnValue(null);
    page(VLOG_PAGE, "https://example.com/vlog-47");
    const result = await importRecipeFromUrl("https://example.com/vlog-47");

    expect(result.method).toBe("metadata");
    expect(result.draft.title).toBe("I moved to Lisbon and everything changed");
    expect(result.imageUrl).toBe("https://img.example/lisbon.jpg");
  });

  it("seeds it the same way when the page is behind a login and has nothing to read", async () => {
    page(SHORT_PAGE, "https://www.instagram.com/p/abc");
    const result = await importRecipeFromUrl("https://www.instagram.com/p/abc");

    expect(readText).not.toHaveBeenCalled();
    expect(result.method).toBe("metadata");
    expect(result.draft.title).toBe("Login • Instagram");
    expect(result.warnings.join(" ")).toMatch(/needs a login/);
  });

  it("gives up outright when nothing read the page and it has no title either", async () => {
    getRecipeExtractor.mockReturnValue(null);
    page("<!doctype html><html><head></head><body><p>hi</p></body></html>", "https://example.com/x");
    await expect(importRecipeFromUrl("https://example.com/x")).rejects.toThrow(ImportError);
  });
});

describe("importRecipeFromUrl when there is one", () => {
  const RECIPE_PAGE = `<!doctype html><html><head><script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Recipe","name":"Shakshuka","description":"Eggs in tomato.",
   "recipeIngredient":["4 eggs"],"recipeInstructions":[{"@type":"HowToStep","text":"Crack in eggs."}]}
  </script></head><body></body></html>`;

  it("prefers structured data and never reaches the blank form", async () => {
    page(RECIPE_PAGE, "https://example.com/shakshuka");
    const result = await importRecipeFromUrl("https://example.com/shakshuka");

    expect(result.method).toBe("jsonld");
    expect(result.draft.title).toBe("Shakshuka");
    expect(readText).not.toHaveBeenCalled();
  });

  it("keeps what the AI found in the page text", async () => {
    readText.mockResolvedValue({ ...EMPTY_DRAFT, title: "Shakshuka", ingredients: ["4 eggs"], steps: ["Crack in eggs."] });
    page(VLOG_PAGE, "https://example.com/vlog-47");
    const result = await importRecipeFromUrl("https://example.com/vlog-47");

    expect(result.method).toBe("llm");
    expect(result.draft.title).toBe("Shakshuka");
    expect(result.imageUrl).toBe("https://img.example/lisbon.jpg");
  });
});
