import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DRAFT, type VoiceDraft } from "./draft";
import { ImportError } from "./fetch-page";
import { audioMimeType, importRecipeFromSpeech, transcribeRecipeAudio } from "./voice";

const stub = vi.hoisted(() => ({
  extractFromSpeech: vi.fn(),
  transcribe: vi.fn(),
  hasExtractor: true,
  hasTranscriber: true,
}));

vi.mock("./llm", () => ({
  getSpeechExtractor: () => (stub.hasExtractor ? { name: "test", extractFromSpeech: stub.extractFromSpeech } : null),
  getAudioTranscriber: () => (stub.hasTranscriber ? { name: "test", transcribe: stub.transcribe } : null),
}));

const SPOKEN =
  "So this is my mum's arroz con pollo. You need a whole chicken cut up, two cups of rice, an onion, and saffron.";

const draft = (overrides: Partial<VoiceDraft> = {}): VoiceDraft => ({
  ...EMPTY_DRAFT,
  title: "Arroz con pollo",
  ingredients: ["1 whole chicken, cut up", "2 cups rice", "1 onion", "A pinch of saffron"],
  steps: ["Brown the chicken.", "Add the rice and stock, simmer."],
  followUps: [],
  ...overrides,
});

describe("voice import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stub.hasExtractor = true;
    stub.hasTranscriber = true;
  });

  it("turns what the cook said into a draft, keeping the questions separate", async () => {
    stub.extractFromSpeech.mockResolvedValue(
      draft({ followUps: [{ key: "servings", question: "How many does it feed?" }] }),
    );

    const result = await importRecipeFromSpeech({ transcript: SPOKEN });
    expect(result.method).toBe("voice");
    expect(result.draft.title).toBe("Arroz con pollo");
    expect("followUps" in result.draft).toBe(false); // the draft stays the shape the form takes
    expect(result.followUps).toEqual([{ key: "servings", question: "How many does it feed?" }]);
    expect(result.sourceUrl).toBeNull();
    expect(result.imageUrl).toBeNull();
    expect(result.warnings[0]).toMatch(/from what you said/i);
  });

  it("warns when only the ingredients came through", async () => {
    stub.extractFromSpeech.mockResolvedValue(draft({ steps: [] }));
    const result = await importRecipeFromSpeech({ transcript: SPOKEN });
    expect(result.warnings.some((w) => /no steps/i.test(w))).toBe(true);
  });

  it("turns a stray tap on the microphone away without calling the model", async () => {
    await expect(importRecipeFromSpeech({ transcript: "um" })).rejects.toBeInstanceOf(ImportError);
    expect(stub.extractFromSpeech).not.toHaveBeenCalled();
  });

  it("says so when there is no recipe in what was said", async () => {
    stub.extractFromSpeech.mockResolvedValue(draft({ title: null, ingredients: [], steps: [] }));
    await expect(importRecipeFromSpeech({ transcript: SPOKEN })).rejects.toMatchObject({ status: 422 });
  });

  it("reports a model failure as a bad gateway rather than a crash", async () => {
    stub.extractFromSpeech.mockRejectedValue(new Error("boom"));
    await expect(importRecipeFromSpeech({ transcript: SPOKEN })).rejects.toMatchObject({ status: 502 });
  });

  it("explains itself when no AI parser is configured", async () => {
    stub.hasExtractor = false;
    await expect(importRecipeFromSpeech({ transcript: SPOKEN })).rejects.toMatchObject({ status: 503 });
  });

  it("hands the second pass the earlier draft and only the answers that were given", async () => {
    stub.extractFromSpeech.mockResolvedValue(draft({ servings: 4 }));
    const previous = draft();
    const result = await importRecipeFromSpeech({
      transcript: SPOKEN,
      previous,
      answers: [
        { question: "How many does it feed?", answer: "  Four  " },
        { question: "What oven temperature?", answer: "   " },
        { question: "", answer: "ignored" },
      ],
    });

    expect(stub.extractFromSpeech).toHaveBeenCalledWith({
      transcript: SPOKEN,
      previous,
      answers: [{ question: "How many does it feed?", answer: "Four" }],
    });
    expect(result.draft.servings).toBe(4);
    expect(result.warnings[0]).toMatch(/updated with your answers/i);
  });

  it("transcribes a recording, and refuses a silent one", async () => {
    stub.transcribe.mockResolvedValue("  Right, so, arroz con pollo.  ");
    expect(await transcribeRecipeAudio({ bytes: new Uint8Array([1, 2]), mimeType: "audio/ogg" })).toBe(
      "Right, so, arroz con pollo.",
    );

    stub.transcribe.mockResolvedValue("   ");
    await expect(transcribeRecipeAudio({ bytes: new Uint8Array([1]), mimeType: "audio/ogg" })).rejects.toMatchObject({
      status: 422,
    });

    stub.hasTranscriber = false;
    await expect(transcribeRecipeAudio({ bytes: new Uint8Array([1]), mimeType: "audio/ogg" })).rejects.toMatchObject({
      status: 503,
    });
  });

  it("reads the container out of whatever the browser labelled the recording", () => {
    expect(audioMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(audioMimeType("AUDIO/OGG")).toBe("audio/ogg");
    expect(audioMimeType("audio/mp4")).toBe("audio/mp4");
    expect(audioMimeType("video/mp4")).toBeNull();
    expect(audioMimeType("")).toBeNull();
    expect(audioMimeType(null)).toBeNull();
  });
});
