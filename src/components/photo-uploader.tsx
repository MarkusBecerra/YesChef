"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { compressImage } from "@/lib/image";

/** Add / replace / remove the recipe photo. Compresses in the browser before uploading. */
export function PhotoUploader({ recipeId, hasPhoto, className }: { recipeId: number; hasPhoto: boolean; className?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "removing">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setState("uploading");
    setError(null);
    try {
      const { blob, contentType } = await compressImage(file);
      const body = new FormData();
      body.append("file", new File([blob], "photo", { type: contentType }));
      await api(`/api/v1/recipes/${recipeId}/photo`, { method: "POST", body });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setState("idle");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!window.confirm("Remove this photo?")) return;
    setState("removing");
    setError(null);
    try {
      await api(`/api/v1/recipes/${recipeId}/photo`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove photo");
    } finally {
      setState("idle");
    }
  }

  const busy = state !== "idle";
  const chip =
    "inline-flex h-8 items-center gap-1.5 rounded-full border border-white/20 bg-black/55 px-3 text-xs font-medium text-white backdrop-blur transition hover:bg-black/70 disabled:opacity-60";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0])}
        disabled={busy}
      />
      <button type="button" className={chip} onClick={() => inputRef.current?.click()} disabled={busy}>
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" strokeLinejoin="round" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
        {state === "uploading" ? "Uploading…" : hasPhoto ? "Change photo" : "Add photo"}
      </button>
      {hasPhoto && (
        <button type="button" className={chip} onClick={remove} disabled={busy}>
          {state === "removing" ? "Removing…" : "Remove"}
        </button>
      )}
      {error && <span className="rounded-full bg-danger-soft px-2.5 py-1 text-xs text-danger">{error}</span>}
    </div>
  );
}
