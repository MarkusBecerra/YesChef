import { describe, expect, it } from "vitest";
import { openMicStream, stopStream } from "./mic-stream";

/** A microphone that remembers whether anyone ever turned it off. */
function fakeStream() {
  const tracks = [{ stopped: false }, { stopped: false }];
  const stream = {
    getTracks: () => tracks.map((track) => ({ stop: () => (track.stopped = true) })),
  } as unknown as MediaStream;
  return {
    stream,
    get stopped() {
      return tracks.every((track) => track.stopped);
    },
  };
}

/** A promise whose answer the test controls, standing in for the browser's permission prompt. */
function permissionPrompt() {
  let grant: (stream: MediaStream) => void = () => {};
  let refuse: () => void = () => {};
  const answer = new Promise<MediaStream>((resolve, reject) => {
    grant = resolve;
    refuse = () => reject(new Error("NotAllowedError"));
  });
  return { answer, grant, refuse };
}

describe("opening a microphone", () => {
  it("hands the stream to the capture that asked for it", async () => {
    const mic = fakeStream();
    const adopted: MediaStream[] = [];

    await openMicStream({
      open: async () => mic.stream,
      stillWanted: () => true,
      adopt: (stream) => adopted.push(stream),
    });

    expect(adopted).toEqual([mic.stream]);
    expect(mic.stopped).toBe(false);
  });

  it("stops a stream nobody is waiting for any more", async () => {
    const mic = fakeStream();
    const adopted: MediaStream[] = [];

    await openMicStream({
      open: async () => mic.stream,
      stillWanted: () => false,
      adopt: (stream) => adopted.push(stream),
    });

    expect(adopted).toEqual([]);
    expect(mic.stopped).toBe(true);
  });

  it("says nothing when the browser refuses", async () => {
    const adopted: MediaStream[] = [];

    await expect(
      openMicStream({
        open: async () => {
          throw new Error("NotAllowedError");
        },
        stillWanted: () => true,
        adopt: (stream) => adopted.push(stream),
      }),
    ).resolves.toBeUndefined();

    expect(adopted).toEqual([]);
  });

  it("leaves nothing running when a stop and a second start beat the permission prompt", async () => {
    // Tap the button (the prompt opens and stays open), tap again to stop, tap a third time to
    // start - and only now does the browser answer both prompts. Two microphones arrive for a
    // single capture, and the one that lost has to be turned off rather than forgotten.
    const adopted: MediaStream[] = [];
    let capture: object | null = null;

    const openFor = (token: object, answer: Promise<MediaStream>) =>
      openMicStream({
        open: () => answer,
        stillWanted: () => capture === token && adopted.length === 0,
        adopt: (stream) => adopted.push(stream),
      });

    const first = fakeStream();
    const firstPrompt = permissionPrompt();
    const firstCapture = {};
    capture = firstCapture;
    const firstOpen = openFor(firstCapture, firstPrompt.answer);

    capture = null; // tapped stop
    const second = fakeStream();
    const secondPrompt = permissionPrompt();
    const secondCapture = {};
    capture = secondCapture; // tapped start again
    const secondOpen = openFor(secondCapture, secondPrompt.answer);

    firstPrompt.grant(first.stream);
    secondPrompt.grant(second.stream);
    await Promise.all([firstOpen, secondOpen]);

    expect(adopted).toEqual([second.stream]);
    expect(first.stopped).toBe(true);
    expect(second.stopped).toBe(false);
  });

  it("stops a stream that arrives after the page has moved on", async () => {
    const mic = fakeStream();
    const prompt = permissionPrompt();
    const adopted: MediaStream[] = [];
    let unmounted = false;

    const opening = openMicStream({
      open: () => prompt.answer,
      stillWanted: () => !unmounted,
      adopt: (stream) => adopted.push(stream),
    });

    unmounted = true;
    prompt.grant(mic.stream);
    await opening;

    expect(adopted).toEqual([]);
    expect(mic.stopped).toBe(true);
  });

  it("survives a refusal that lands after everything has been torn down", async () => {
    const prompt = permissionPrompt();
    const opening = openMicStream({
      open: () => prompt.answer,
      stillWanted: () => false,
      adopt: () => {
        throw new Error("nothing to adopt");
      },
    });

    prompt.refuse();
    await expect(opening).resolves.toBeUndefined();
  });

  it("turns off whatever it is given, including nothing at all", () => {
    const mic = fakeStream();
    stopStream(mic.stream);
    expect(mic.stopped).toBe(true);
    expect(() => stopStream(null)).not.toThrow();
    expect(() => stopStream(undefined)).not.toThrow();
  });
});
