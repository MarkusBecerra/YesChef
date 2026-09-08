/**
 * Handing a microphone to whoever asked for it - or turning it off, if by the time it arrives
 * nobody wants it any more.
 *
 * `getUserMedia` resolves whenever the browser gets round to it: after the cook tapped stop,
 * after they tapped start again, after the page moved on. A guard read *before* that await
 * answers a question about a moment that has already passed, so every one of them belongs on
 * the far side of it. The rule is written down once, here, because getting it wrong costs a
 * microphone left open with nothing pointing at it and the browser's recording light still on
 * until the page unloads.
 */

/** Stop every track on a stream, if there is one. This is what puts the recording light out. */
export function stopStream(stream: MediaStream | null | undefined): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

export type MicStreamHandover = {
  /** Opens the microphone: the browser's `getUserMedia`, or a fake in a test. */
  open: () => Promise<MediaStream>;
  /**
   * Asked once the stream is in hand and never before: is the capture that asked for this
   * microphone still the one running? Answer it by identity rather than by truthiness - a
   * capture that ended and started again is a different capture, and this stream is not its.
   */
  stillWanted: () => boolean;
  /** Takes ownership of the stream, and with it the job of stopping it later. */
  adopt: (stream: MediaStream) => void;
};

/**
 * Open a microphone and either hand it over or stop it - never neither. A browser that
 * refuses is silent here: the caller decides whether an unavailable microphone is worth
 * telling the cook about.
 */
export async function openMicStream({ open, stillWanted, adopt }: MicStreamHandover): Promise<void> {
  let stream: MediaStream;
  try {
    stream = await open();
  } catch {
    return;
  }
  if (!stillWanted()) {
    stopStream(stream);
    return;
  }
  adopt(stream);
}
