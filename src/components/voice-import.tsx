"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { ImportResult } from "@/server/import/draft";

/**
 * Speak a recipe you already know and let the app write it down.
 *
 * Two ways in, decided by what the browser can do. Where dictation exists (Chrome, Edge,
 * Safari) the browser hands us text as it goes and no audio reaches our server - the browser
 * may still send it to its vendor's speech service, which is the deal the platform's own
 * dictation button makes too. Everywhere else the app records audio and posts it to be
 * transcribed. Either way the cook sees the words before anything is sent to be turned into
 * a recipe, and can fix whatever the microphone misheard.
 */

/* ---------- browser dictation (SpeechRecognition), typed to what we actually use ---------- */

type SpeechAlternative = { transcript: string };
type SpeechResult = { isFinal: boolean; readonly [index: number]: SpeechAlternative };
type SpeechResultList = { length: number; readonly [index: number]: SpeechResult };
type SpeechResultEvent = { resultIndex: number; results: SpeechResultList };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Ogg and MP4 first: Gemini reads them, and they are what the browsers without dictation produce. */
const RECORDING_TYPES = ["audio/ogg;codecs=opus", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/wav"];

function pickRecordingType(): string | undefined {
  return RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

/** Mirrors MAX_AUDIO_BYTES on the server, which sits under Vercel's request-body cap. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function extensionFor(mimeType: string): string {
  const base = mimeType.split(";")[0];
  return { "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/webm": "webm", "audio/wav": "wav" }[base] ?? "bin";
}

/** Feature detection has to happen on the client, and never inside an effect. */
const noSubscribe = () => () => {};
const serverFalse = () => false;

function joinSpeech(previous: string, addition: string): string {
  const next = addition.trim();
  if (!next) return previous;
  if (!previous.trim()) return next;
  return /[.!?]$/.test(previous.trim()) ? `${previous.trim()} ${next}` : `${previous.trim()}. ${next}`;
}

const MIC_ERRORS: Record<string, string> = {
  "not-allowed": "YesChef needs permission to use the microphone. Allow it in your browser and try again.",
  "service-not-allowed": "Your browser blocked the microphone. Allow it and try again.",
  "audio-capture": "No microphone found.",
  "no-speech": "Didn't catch anything - try again a bit closer to the microphone.",
  network: "The dictation service couldn't be reached. Type it out instead.",
};

export function VoiceImport({ onResult }: { onResult: (result: ImportResult) => void }) {
  const canDictate = useSyncExternalStore(noSubscribe, () => speechRecognitionCtor() !== null, serverFalse);
  const canRecord = useSyncExternalStore(
    noSubscribe,
    () => typeof MediaRecorder !== "undefined" && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices),
    serverFalse,
  );

  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ImportResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  /** Set the moment a start is requested, before any await, so a double tap can't open two mics. */
  const startingRef = useRef(false);
  const unmountedRef = useRef(false);

  const [starting, setStarting] = useState(false);
  const capturing = listening || starting;

  /**
   * Hand the microphone back when this component goes away - switching to the "Link" tab or
   * navigating off the page unmounts it, and without this the browser keeps recording.
   * Cleanup only: no state is set here, which is what the React Compiler rules require.
   */
  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        // Drop the handlers first: a recording nobody is waiting for shouldn't upload itself.
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.stop();
      }
      recorderRef.current = null;
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      streamRef.current = null;
    };
  }, []);

  /* ---------- dictation ---------- */

  function startDictation() {
    const Recognition = speechRecognitionCtor();
    if (!Recognition) return;
    setError(null);
    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let settled = "";
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) settled += result[0].transcript;
        else live += result[0].transcript;
      }
      if (settled) setTranscript((prev) => joinSpeech(prev, settled));
      setInterim(live);
    };
    recognition.onerror = (event) => {
      // "aborted" is what we get from our own stop(); it isn't worth showing.
      if (event.error !== "aborted") setError(MIC_ERRORS[event.error] ?? "The microphone stopped working.");
      setListening(false);
    };
    recognition.onend = () => {
      setInterim("");
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  /* ---------- recording, for browsers with no dictation ---------- */

  async function startRecording() {
    // The permission prompt can sit here for seconds; a second tap must not open a second mic.
    if (startingRef.current || recorderRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(MIC_ERRORS["not-allowed"]);
      return;
    } finally {
      startingRef.current = false;
      setStarting(false);
    }

    // Permission can land after the cook has already navigated away.
    if (unmountedRef.current) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    const mimeType = pickRecordingType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      for (const track of stream.getTracks()) track.stop();
      setError("This browser wouldn't start a recording. Type the recipe out instead.");
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
      const type = recorder.mimeType || mimeType || "audio/webm";
      void transcribe(new Blob(chunksRef.current, { type }), type);
    };
    recorder.start();
    recorderRef.current = recorder;
    setListening(true);
  }

  async function transcribe(blob: Blob, mimeType: string) {
    if (blob.size === 0) {
      setError("That recording came through empty.");
      return;
    }
    if (blob.size > MAX_UPLOAD_BYTES) {
      setError("That recording is too long to send. Keep it to a couple of minutes, or type it out instead.");
      return;
    }
    setTranscribing(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("audio", blob, `recipe.${extensionFor(mimeType)}`);
      const { transcript: text } = await api<{ transcript: string }>("/api/v1/import/voice/audio", {
        method: "POST",
        body: form,
      });
      setTranscript((prev) => joinSpeech(prev, text));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't transcribe that recording");
    } finally {
      setTranscribing(false);
    }
  }

  function start() {
    if (capturing) return;
    if (canDictate) startDictation();
    else void startRecording();
  }

  function stop() {
    setListening(false);
    setInterim("");
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
  }

  /* ---------- turning it into a recipe ---------- */

  async function write() {
    // What the box shows is transcript + interim; send that, not just the settled half, or
    // the sentence the cook was still saying when they tapped disappears without a trace.
    const spoken = joinSpeech(transcript, interim).trim();
    stop();
    setTranscript(spoken);
    setBusy(true);
    setError(null);
    try {
      const result = await api<ImportResult>("/api/v1/import/voice", {
        method: "POST",
        body: JSON.stringify({ transcript: spoken }),
      });
      if (result.followUps?.length) setPending(result);
      else onResult(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not write that up");
    } finally {
      setBusy(false);
    }
  }

  async function fillGaps() {
    if (!pending?.followUps) return;
    const answered = pending.followUps
      .map((f) => ({ question: f.question, answer: (answers[f.key] ?? "").trim() }))
      .filter((a) => a.answer !== "");
    if (answered.length === 0) {
      onResult(pending);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await api<ImportResult>("/api/v1/import/voice", {
        method: "POST",
        body: JSON.stringify({ transcript, previous: pending.draft, answers: answered }),
      });
      // Anything still unanswered rides along as a note on the form rather than a second round.
      const skipped = pending.followUps.filter((f) => !(answers[f.key] ?? "").trim());
      onResult({
        ...result,
        warnings: [...result.warnings, ...skipped.map((f) => `Still worth adding: ${f.question}`)],
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not fill those in");
    } finally {
      setBusy(false);
    }
  }

  const errorBanner = error && (
    <p role="alert" className="rounded-card border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
      {error}
    </p>
  );

  /* ---------- the model's questions ---------- */

  if (pending?.followUps?.length) {
    return (
      <div className="flex flex-col gap-5">
        <div className="rounded-card border border-accent/40 bg-accent-soft p-3 text-sm">
          <p className="font-semibold">Got it: {pending.draft.title}.</p>
          <p className="mt-1">
            {pending.draft.ingredients.length} ingredients, {pending.draft.steps.length} steps. A few things you didn&apos;t
            mention - answer what you know and skip the rest.
          </p>
        </div>

        {errorBanner}

        {pending.followUps.map((followUp) => (
          <Field key={followUp.key} label={followUp.question} htmlFor={`followup-${followUp.key}`}>
            <Input
              id={`followup-${followUp.key}`}
              value={answers[followUp.key] ?? ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [followUp.key]: e.target.value }))}
              placeholder="Say it however you'd say it out loud"
              autoComplete="off"
            />
          </Field>
        ))}

        <div className="flex flex-col gap-2">
          <Button type="button" size="lg" onClick={fillGaps} disabled={busy}>
            {busy ? "Filling them in…" : "Fill in the gaps"}
          </Button>
          <Button type="button" variant="secondary" size="lg" onClick={() => onResult(pending)} disabled={busy}>
            Skip - I&apos;ll finish it myself
          </Button>
        </div>
      </div>
    );
  }

  /* ---------- recording / dictating ---------- */

  const ready = joinSpeech(transcript, interim).trim().length > 20;
  // Dictation can be written up mid-flow (the text is already here); a recording cannot -
  // its audio hasn't been transcribed yet, and sending now would silently drop the segment.
  const canWrite = ready && !busy && !transcribing && !(capturing && !canDictate);

  return (
    <div className="flex flex-col gap-5">
      {errorBanner}

      <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-paper-raised p-6">
        <button
          type="button"
          onClick={listening ? stop : start}
          disabled={starting || transcribing || busy || (!canDictate && !canRecord)}
          aria-label={capturing ? "Stop" : "Start talking"}
          className={cn(
            "inline-flex size-20 items-center justify-center rounded-full transition disabled:opacity-50",
            capturing ? "bg-danger-soft text-danger ring-4 ring-danger/30" : "bg-accent text-accent-ink hover:brightness-110",
          )}
        >
          {capturing ? (
            <svg viewBox="0 0 24 24" className="size-8" fill="currentColor" aria-hidden>
              <rect x="7" y="7" width="10" height="10" rx="2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-9" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" strokeLinejoin="round" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
            </svg>
          )}
        </button>

        <p className="text-center text-sm text-ink-muted">
          {!canDictate && !canRecord
            ? "This browser won't let the app listen. Type the recipe below instead."
            : transcribing
              ? "Writing down what you said…"
              : capturing
                ? canDictate
                  ? "Listening. Say the name of the dish, what goes in it, and how you make it."
                  : "Recording. Tap the square when you're done."
                : transcript
                  ? "Tap to add more, or write it up below."
                  : "Tap and describe the recipe the way you'd tell a friend."}
        </p>
        {!canDictate && canRecord && !capturing && !transcript && (
          <p className="text-center text-xs text-ink-faint">Your recording is sent to the server to be turned into text.</p>
        )}
      </div>

      <Field
        label="What you said"
        htmlFor="voice-transcript"
        hint="Fix anything the microphone misheard - the AI works from this text."
      >
        <Textarea
          id="voice-transcript"
          rows={8}
          className="min-h-44"
          value={interim ? `${transcript}${transcript ? " " : ""}${interim}` : transcript}
          onChange={(e) => {
            setInterim("");
            setTranscript(e.target.value);
          }}
          placeholder="It's my mum's arroz con pollo. You need a whole chicken, cut up, two cups of rice…"
        />
      </Field>

      <Button type="button" size="lg" onClick={write} disabled={!canWrite}>
        {busy ? "Writing the recipe…" : "Write the recipe"}
      </Button>
    </div>
  );
}
