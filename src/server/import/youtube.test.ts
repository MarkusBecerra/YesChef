import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DRAFT, type RecipeDraft } from "./draft";
import type { PageMeta } from "./page-meta";
import { importYouTubeVideo, watchUrl, youtubeDescription, youtubeVideoId } from "./youtube";

const watch = vi.fn<(input: unknown) => Promise<RecipeDraft>>();
const readText = vi.fn<(input: unknown) => Promise<RecipeDraft>>();
const getVideoExtractor = vi.fn<() => { name: string; extract: typeof watch } | null>();
const getRecipeExtractor = vi.fn<() => { name: string; extract: typeof readText } | null>();

vi.mock("./llm", () => ({
  getVideoExtractor: () => getVideoExtractor(),
  getRecipeExtractor: () => getRecipeExtractor(),
}));

describe("youtubeVideoId", () => {
  it("finds the id in every shape a share sheet produces", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=Y9LX8QylWwo",
      "https://www.youtube.com/watch?v=Y9LX8QylWwo&t=42s",
      "https://m.youtube.com/watch?v=Y9LX8QylWwo",
      "https://youtu.be/Y9LX8QylWwo?si=abc",
      "https://www.youtube.com/shorts/Y9LX8QylWwo",
      "https://youtube.com/live/Y9LX8QylWwo",
      "https://www.youtube-nocookie.com/embed/Y9LX8QylWwo",
    ]) {
      expect(youtubeVideoId(url), url).toBe("Y9LX8QylWwo");
    }
  });

  it("ignores anything that isn't a YouTube video", () => {
    for (const url of [
      "https://www.youtube.com/@somechef",
      "https://www.youtube.com/watch?v=tooshort",
      "https://notyoutube.com/watch?v=Y9LX8QylWwo",
      "https://smittenkitchen.com/2024/01/pad-thai",
      "not a url",
    ]) {
      expect(youtubeVideoId(url), url).toBeNull();
    }
  });

  it("canonicalises to a watch URL", () => {
    expect(watchUrl("Y9LX8QylWwo")).toBe("https://www.youtube.com/watch?v=Y9LX8QylWwo");
  });
});

describe("youtubeDescription", () => {
  it("reads the full description out of the inlined player payload", () => {
    const html = `<script>var ytInitialPlayerResponse = {"videoDetails":{"title":"Pad Thai","shortDescription":"Ingredients:\\n200g noodles\\n\\"the good\\" fish sauce","lengthSeconds":"58"}};</script>`;
    expect(youtubeDescription(html)).toBe('Ingredients:\n200g noodles\n"the good" fish sauce');
  });

  it("returns null when there is no payload or it is blank", () => {
    expect(youtubeDescription("<html></html>")).toBeNull();
    expect(youtubeDescription('{"shortDescription":"   "}')).toBeNull();
  });
});

const META: PageMeta = {
  title: "EASY Pad Thai Recipe",
  description: "See comments for recipe link",
  imageUrl: "https://i.ytimg.com/vi/Y9LX8QylWwo/maxresdefault.jpg",
  siteName: "YouTube",
};
const DRAFT: RecipeDraft = { ...EMPTY_DRAFT, title: "Pad Thai", ingredients: ["8 oz rice noodles"], steps: ["Soak the noodles."] };
const args = (html = "") => ({
  videoId: "Y9LX8QylWwo",
  finalUrl: "https://www.youtube.com/shorts/Y9LX8QylWwo",
  html,
  meta: META,
  sourceName: "YouTube",
  warnings: [] as string[],
});

beforeEach(() => {
  vi.clearAllMocks();
  watch.mockResolvedValue(DRAFT);
  readText.mockResolvedValue(DRAFT);
  getVideoExtractor.mockReturnValue({ name: "video", extract: watch });
  getRecipeExtractor.mockReturnValue({ name: "text", extract: readText });
});

describe("importYouTubeVideo", () => {
  it("watches the video first, keeping the thumbnail as the photo", async () => {
    const result = await importYouTubeVideo(args());
    expect(watch).toHaveBeenCalledWith({
      videoUrl: "https://www.youtube.com/watch?v=Y9LX8QylWwo",
      title: META.title,
      description: META.description,
    });
    expect(readText).not.toHaveBeenCalled();
    expect(result).toMatchObject({ method: "video", imageUrl: META.imageUrl, sourceName: "YouTube" });
    expect(result?.warnings[0]).toMatch(/watching the video/);
  });

  it("prefers the inlined description over the truncated meta one", async () => {
    await importYouTubeVideo(args('{"shortDescription":"Full recipe below: 200g noodles"}'));
    expect(watch).toHaveBeenCalledWith(expect.objectContaining({ description: "Full recipe below: 200g noodles" }));
  });

  it("falls back to the description when watching fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    watch.mockRejectedValue(new Error("timed out"));
    const html = '{"shortDescription":"INGREDIENTS\\n8 oz rice noodles\\n2 eggs\\n\\nMETHOD\\nSoak the noodles, then fry everything together in a hot wok."}';
    const result = await importYouTubeVideo(args(html));
    expect(readText).toHaveBeenCalled();
    expect(result?.method).toBe("llm");
    expect(result?.warnings.join(" ")).toMatch(/Couldn't watch the video/);
  });

  it("says what's missing when no Gemini key is configured", async () => {
    getVideoExtractor.mockReturnValue(null);
    const html = '{"shortDescription":"INGREDIENTS\\n8 oz rice noodles\\n2 eggs\\n\\nMETHOD\\nSoak the noodles, then fry everything in a hot wok."}';
    const result = await importYouTubeVideo(args(html));
    expect(result?.method).toBe("llm");
    expect(result?.warnings[0]).toMatch(/GEMINI_API_KEY/);
  });

  it("gives up rather than returning an empty draft", async () => {
    watch.mockResolvedValue(EMPTY_DRAFT);
    const call = args();
    expect(await importYouTubeVideo(call)).toBeNull();
    expect(call.warnings.join(" ")).toMatch(/didn't find a recipe/);
  });
});
