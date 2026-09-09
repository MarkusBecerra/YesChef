import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DRAFT, type RecipeDraft } from "./draft";
import { VideoUnavailable } from "./llm/provider";
import type { PageMeta } from "./page-meta";
import { importYouTubeVideo, watchUrl, youtubeDescription, youtubeLengthSeconds, youtubeVideoId } from "./youtube";

const watch = vi.fn<(input: unknown) => Promise<RecipeDraft>>();
const readText = vi.fn<(input: unknown) => Promise<RecipeDraft>>();
const getVideoExtractor = vi.fn<() => { name: string; extract: typeof watch } | null>();
const getRecipeExtractor = vi.fn<() => { name: string; extract: typeof readText } | null>();

vi.mock("./llm", () => ({
  getVideoExtractor: () => getVideoExtractor(),
  getRecipeExtractor: () => getRecipeExtractor(),
}));

const DESCRIPTION_HTML =
  '{"shortDescription":"INGREDIENTS\\n8 oz rice noodles\\n2 eggs\\n\\nMETHOD\\nSoak the noodles, then fry everything together in a hot wok."}';

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

  it("reads the runtime, which decides which model watches", () => {
    expect(youtubeLengthSeconds('{"lengthSeconds":"822"}')).toBe(822);
    expect(youtubeLengthSeconds('{"lengthSeconds":"0"}')).toBeNull();
    expect(youtubeLengthSeconds("<html></html>")).toBeNull();
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
      durationSeconds: null,
    });
    expect(readText).not.toHaveBeenCalled();
    expect(result).toMatchObject({ method: "video", imageUrl: META.imageUrl, sourceName: "YouTube" });
    expect(result?.warnings[0]).toMatch(/An AI watched the video/);
  });

  it("prefers the inlined description over the truncated meta one, and passes the runtime along", async () => {
    await importYouTubeVideo(args('{"shortDescription":"Full recipe below: 200g noodles","lengthSeconds":"58"}'));
    expect(watch).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Full recipe below: 200g noodles", durationSeconds: 58 }),
    );
  });

  it("falls back to the description when watching fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    watch.mockRejectedValue(new Error("timed out"));
    const result = await importYouTubeVideo(args(DESCRIPTION_HTML));
    expect(readText).toHaveBeenCalled();
    expect(result?.method).toBe("llm");
    expect(result?.warnings.join(" ")).toMatch(/Couldn't watch the video/);
  });

  it("passes a provider's own explanation through as the warning", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    watch.mockRejectedValue(new VideoUnavailable("Gemini's quota is used up for now."));
    const result = await importYouTubeVideo(args(DESCRIPTION_HTML));
    expect(result?.method).toBe("llm");
    expect(result?.warnings).toContain("Gemini's quota is used up for now.");
  });

  it("keeps the missing key out of the cook's warning, but logs it for the owner", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getVideoExtractor.mockReturnValue(null);
    const result = await importYouTubeVideo(args(DESCRIPTION_HTML));
    expect(result?.method).toBe("llm");
    expect(result?.warnings[0]).toMatch(/watching the video wasn't available/);
    expect(result?.warnings.join(" ")).not.toMatch(/GEMINI_API_KEY/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("GEMINI_API_KEY"));
  });

  it("gives up rather than returning an empty draft", async () => {
    watch.mockResolvedValue(EMPTY_DRAFT);
    const call = args();
    expect(await importYouTubeVideo(call)).toBeNull();
    expect(call.warnings.join(" ")).toMatch(/didn't find a recipe/);
  });
});
