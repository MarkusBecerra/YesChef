"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { RecipeForm } from "@/components/recipe-form";
import { VoiceImport } from "@/components/voice-import";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { valuesFromImport } from "@/lib/recipe-form-values";
import type { ImportResult } from "@/server/import/draft";

const METHOD_LABEL: Record<ImportResult["method"], string> = {
  jsonld: "structured recipe data",
  llm: "AI",
  text: "AI",
  video: "AI, from the video itself",
  voice: "AI writing down what you said",
  metadata: "page details only",
};

type Mode = "link" | "voice" | "text";

const MODES: { id: Mode; label: string }[] = [
  { id: "link", label: "Link" },
  { id: "voice", label: "Speak it" },
  { id: "text", label: "Paste text" },
];

export function ImportFlow({ existingTags, existingCategories }: { existingTags: string[]; existingCategories: string[] }) {
  const [mode, setMode] = useState<Mode>("link");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [textSource, setTextSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const request =
      mode === "link"
        ? { path: "/api/v1/import", body: { url } }
        : { path: "/api/v1/import/text", body: { text, sourceUrl: textSource.trim() || undefined } };
    try {
      setResult(await api<ImportResult>(request.path, { method: "POST", body: JSON.stringify(request.body) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const from = result.sourceUrl
      ? (() => {
          try {
            return `from ${new URL(result.sourceUrl).hostname.replace(/^www\./, "")}`;
          } catch {
            return `from ${result.sourceUrl}`;
          }
        })()
      : result.method === "voice"
        ? "from what you said"
        : "from your text";
    return (
      <RecipeForm
        mode="create"
        initialValues={valuesFromImport(result)}
        existingTags={existingTags}
        existingCategories={existingCategories}
        photoSourceUrl={result.imageUrl}
        banner={
          <div className="flex gap-3 rounded-card border border-accent/40 bg-accent-soft p-3 text-sm">
            {result.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- remote preview from an arbitrary host; not optimised on purpose
              <img src={result.imageUrl} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
            )}
            <div className="flex flex-col gap-1">
              <p>
                <span className="font-semibold">Imported {from}</span> via {METHOD_LABEL[result.method]}. Check it over, then save.
                {result.imageUrl && " The photo will be attached."}
              </p>
              {result.warnings.map((w) => (
                <p key={w} className="text-spice">
                  {w}
                </p>
              ))}
              <button type="button" onClick={() => setResult(null)} className="self-start text-accent underline-offset-4 hover:underline">
                Start over
              </button>
            </div>
          </div>
        }
      />
    );
  }

  const empty = mode === "link" ? url.trim() === "" : text.trim() === "";

  const modePicker = (
    <div className="flex gap-2">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => {
            setMode(m.id);
            setError(null);
          }}
          aria-pressed={mode === m.id}
          className={cn(
            "inline-flex h-9 items-center rounded-full border px-4 text-sm transition",
            mode === m.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-paper-raised text-ink-muted hover:bg-line-soft",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );

  const manualLink = (
    <p className="text-center text-sm text-ink-muted">
      Or{" "}
      <Link href="/recipes/new" className="font-medium text-accent underline-offset-4 hover:underline">
        enter it manually
      </Link>
      .
    </p>
  );

  // Speaking is its own flow - it records, transcribes and asks its own questions before
  // there is anything to submit - so it doesn't live inside the link/text form.
  if (mode === "voice") {
    return (
      <div className="flex flex-col gap-5">
        {modePicker}
        <VoiceImport onResult={setResult} />
        {manualLink}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {modePicker}

      {mode === "link" ? (
        <Field
          label="Recipe link"
          htmlFor="url"
          hint="Recipe blogs and YouTube work best. Instagram and Pinterest hide their content behind a login - copy the caption and use Paste text."
          error={error ?? undefined}
        >
          <Input
            id="url"
            type="url"
            inputMode="url"
            autoFocus
            required
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
          />
        </Field>
      ) : (
        <>
          <Field label="Recipe text" htmlFor="text" hint="An Instagram caption, a message, a photo of a recipe card you've typed out - anything with the recipe in it." error={error ?? undefined}>
            <Textarea id="text" autoFocus required rows={10} className="min-h-56" placeholder="Paste the caption or post here…" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Field label="Where it came from" htmlFor="text-source" hint="Optional. The post's link, so the recipe remembers where you found it.">
            <Input
              id="text-source"
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={textSource}
              onChange={(e) => setTextSource(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
            />
          </Field>
        </>
      )}

      <Button type="submit" size="lg" disabled={busy || empty}>
        {busy ? (mode === "link" ? "Reading the page…" : "Reading your text…") : "Import"}
      </Button>
      {manualLink}
    </form>
  );
}
