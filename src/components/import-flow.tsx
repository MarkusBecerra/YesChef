"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { RecipeForm } from "@/components/recipe-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";
import { valuesFromImport } from "@/lib/recipe-form-values";
import type { ImportResult } from "@/server/import/draft";

const METHOD_LABEL: Record<ImportResult["method"], string> = {
  jsonld: "structured recipe data",
  llm: "AI",
  metadata: "page details only",
};

export function ImportFlow({ existingTags, existingCategories }: { existingTags: string[]; existingCategories: string[] }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await api<ImportResult>("/api/v1/import", { method: "POST", body: JSON.stringify({ url }) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const host = (() => {
      try {
        return new URL(result.sourceUrl).hostname.replace(/^www\./, "");
      } catch {
        return result.sourceUrl;
      }
    })();
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
                <span className="font-semibold">Imported from {host}</span> via {METHOD_LABEL[result.method]}. Check it over, then save.
                {result.imageUrl && " The photo will be attached."}
              </p>
              {result.warnings.map((w) => (
                <p key={w} className="text-spice">
                  {w}
                </p>
              ))}
              <button type="button" onClick={() => setResult(null)} className="self-start text-accent underline-offset-4 hover:underline">
                Try a different link
              </button>
            </div>
          </div>
        }
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label="Recipe link" htmlFor="url" hint="Recipe blogs work best. Instagram and Pinterest are hit-or-miss because they hide content behind a login." error={error ?? undefined}>
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
      <Button type="submit" size="lg" disabled={busy || url.trim() === ""}>
        {busy ? "Reading the page…" : "Import"}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        Or{" "}
        <Link href="/recipes/new" className="font-medium text-accent underline-offset-4 hover:underline">
          enter it manually
        </Link>
        .
      </p>
    </form>
  );
}
